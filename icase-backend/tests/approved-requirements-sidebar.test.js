const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { transformSync } = require('esbuild');
const { JSDOM } = require('jsdom');
const React = require('react');
const { act } = React;
let dom, root, Sidebar, Panel;
beforeAll(() => {
  dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost' });
  global.window = dom.window; global.document = dom.window.document; global.navigator = dom.window.navigator;
  global.IS_REACT_ACT_ENVIRONMENT = true;
  const source = fs.readFileSync(path.resolve(__dirname, '../../icase-frontend/src/components/ApprovedRequirementsSidebar.jsx'), 'utf8');
  const icon = () => null;
  const sandbox = { module: { exports: {} }, require: id => id === 'lucide-react' ? { PanelLeftClose: icon, PanelRightClose: icon, PanelLeft: icon, PanelRight: icon } : require(id) };
  vm.runInNewContext(transformSync(source, { loader: 'jsx', format: 'cjs' }).code, sandbox);
  Sidebar = sandbox.module.exports.default;
  Panel = sandbox.module.exports.RequirementsReferencePanel;
});
afterEach(async () => { if (root) await act(async () => root.unmount()); root = null; });
afterAll(() => { dom.window.close(); delete global.window; delete global.document; delete global.navigator; delete global.IS_REACT_ACT_ENVIRONMENT; });
async function render(props = {}) {
  root = require('react-dom/client').createRoot(document.getElementById('root'));
  await act(async () => root.render(React.createElement(Sidebar, props)));
}
test('separa RF/RNF y conserva descripción, criterios, métricas y evidencia', async () => {
  await render({ requirements: {
    functional: [{ id: 'RF-01', name: 'Registrar solicitud', description: 'Guardar solicitud', actors: ['Operador'], precondition: 'Sesión válida', acceptanceCriteria: [{ descripcion: 'Solicitud registrada' }], evidences: [{ texto: 'Necesitamos solicitudes', fuente: 'entrevista.txt' }] }],
    nonFunctional: [{ id: 'RNF-01', category: 'Rendimiento', description: 'Respuesta rápida', metric: '< 2 segundos' }]
  } });
  const text = document.body.textContent;
  for (const value of ['Requisitos funcionales', 'Requisitos no funcionales', 'Registrar solicitud', 'Solicitud registrada', 'entrevista.txt', '< 2 segundos']) expect(text).toContain(value);
  expect(document.querySelectorAll('input,textarea,select')).toHaveLength(0);
});
test('presenta contexto clasificado y secciones colapsables sin acciones de generación', async () => {
  await render({ audit: { reglas_negocio: [{ id: 'N-1', necesidad: 'Solo el responsable aprueba', estado: 'confirmado' }], restricciones_tecnicas: [{ necesidad: 'PostgreSQL' }], decisiones: [{ necesidad: 'Aplicación web' }], contexto: ['Centro de atención'], preguntas_pendientes: [{ necesidad: '¿Cuál es el horario?' }] } });
  expect(document.querySelectorAll('aside > div details.group\\/section')).toHaveLength(7);
  for (const value of ['PostgreSQL', 'Centro de atención', '¿Cuál es el horario?', 'Solo el responsable aprueba']) expect(document.body.textContent).toContain(value);
  expect(document.querySelectorAll('button')).toHaveLength(1);
});
test('permite ocultar el panel sin mutaciones de requisitos', async () => {
  const onHide = jest.fn();
  await render({ onHide });
  await act(async () => document.querySelector('button').click());
  expect(onHide).toHaveBeenCalledTimes(1);
});
test('admite proyectos sin análisis clasificado', async () => {
  await render({ requirements: null, audit: null });
  expect(document.body.textContent).toContain('0 requisitos');
  expect(document.body.textContent).toContain('Sin información registrada');
});

test.each(['left', 'right'])('ocultar y reabrir desde el borde %s mantiene un control disponible', async side => {
  function Harness() {
    const [open, setOpen] = React.useState(true);
    return React.createElement(Panel, { open, side, onToggle: () => setOpen(value => !value) });
  }
  root = require('react-dom/client').createRoot(document.getElementById('root'));
  await act(async () => root.render(React.createElement(Harness)));
  expect(document.querySelector('aside').dataset.side).toBe(side);
  await act(async () => document.querySelector('[aria-label="Ocultar requisitos aprobados"]').click());
  expect(document.querySelector('aside')).toBeNull();
  const reopen = document.querySelector('[aria-label="Mostrar requisitos aprobados"]');
  expect(reopen).not.toBeNull();
  if (side === 'right') expect(reopen.parentNode.className).toContain('order-last');
  await act(async () => reopen.click());
  expect(document.querySelector('aside').dataset.side).toBe(side);
});
