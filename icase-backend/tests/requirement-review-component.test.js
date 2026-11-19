// Componente React real en JSDOM: NO equivale a navegador ni prueba visual.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { JSDOM } = require('jsdom');
const { transformSync } = require('esbuild');
const React = require('react');
const { act } = React;
let dom, root, Component;
beforeAll(() => {
  dom = new JSDOM('<!doctype html><div id="root"></div>', { url: 'http://localhost' });
  global.window = dom.window; global.document = dom.window.document; global.navigator = dom.window.navigator;
  global.IS_REACT_ACT_ENVIRONMENT = true;
  const filename = path.resolve(__dirname, '../../icase-frontend/src/components/RequirementReviewPanel.jsx');
  const MockIcon = () => null;
  const customRequire = (id) => {
    if (id === 'lucide-react') {
      return { __esModule: true, X: MockIcon, Check: MockIcon, FileText: MockIcon, ArrowRight: MockIcon, default: MockIcon };
    }
    if (id === './BrainGearsIcon') {
      return { __esModule: true, default: MockIcon };
    }
    return require(id);
  };
  const sandbox = { module: { exports: {} }, exports: {}, require: customRequire };
  vm.runInNewContext(transformSync(fs.readFileSync(filename, 'utf8'), { loader: 'jsx', format: 'cjs' }).code, sandbox);
  Component = sandbox.module.exports.default;
});
afterEach(async () => { if (root) await act(async () => root.unmount()); root = null; });
afterAll(() => { dom.window.close(); delete global.window; delete global.document; delete global.navigator; delete global.IS_REACT_ACT_ENVIRONMENT; });
const audit = { inventario: [], necesidades_pendientes: [{ id: 'N-2', estado_validacion: 'pendiente', elemento: { tipo: 'RF', necesidad: 'Autorizar solicitudes', evidencia: 'Cita incorrecta' } }] };
async function render(props) {
  root = require('react-dom/client').createRoot(document.getElementById('root'));
  await act(async () => root.render(React.createElement(Component, { audit, ...props })));
}
const click = async text => { const button = [...document.querySelectorAll('button')].find(item => item.textContent.includes(text)); expect(button).toBeDefined(); await act(async () => button.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }))); };

test('recalcular invoca la acción actual y muestra confirmación', async () => {
  const onReview = jest.fn().mockResolvedValue({});
  await render({ onReview });
  await click('Comprobar versión guardada');
  expect(onReview).toHaveBeenCalledWith({ accion: 'validar' });
  expect(document.body.textContent).toContain('Revisión guardada');
});
test('abre formulario de fragmentos sin resolver ni descartar automáticamente', async () => {
  const onReview = jest.fn();
  await render({ onReview });
  await click('Corregir fragmentos');
  expect(document.querySelector('textarea').value).toBe('Cita incorrecta');
  await click('Añadir fragmento');
  expect(document.querySelectorAll('textarea')).toHaveLength(4);
  expect(onReview).not.toHaveBeenCalled();
  await click('Cancelar');
  expect(document.querySelector('form')).toBeNull();
});
test('un fallo de guardado conserva la incidencia y muestra la causa', async () => {
  await render({ onReview: jest.fn().mockRejectedValue(new Error('Sesión caducada')) });
  await click('Comprobar versión guardada');
  expect(document.body.textContent).toContain('Sesión caducada');
  expect(document.body.textContent).toContain('Autorizar solicitudes');
});
test('lectura permite comprobar pero no modificar ni descartar', async () => {
  await render({ onReview: jest.fn(), readOnly: true });
  expect(document.body.textContent).toContain('Comprobar versión guardada');
  expect(document.body.textContent).not.toContain('Corregir fragmentos');
});
