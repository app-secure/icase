const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { transformSync } = require('esbuild');
const { JSDOM } = require('jsdom');
const React = require('react');
const { act } = React;

let dom; let ModulesEditor; let root; let onChange;
beforeAll(() => {
  dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost' });
  global.window = dom.window; global.document = dom.window.document; global.navigator = dom.window.navigator;
  global.IS_REACT_ACT_ENVIRONMENT = true;
  const stub = new Proxy({}, { get: (_t, key) => (key === '__esModule' ? false : () => null) });
  const requireStub = (id) => (id === 'react' ? React : /lucide-react/.test(id) ? new Proxy({}, { get: () => () => null }) : stub);
  const source = fs.readFileSync(path.resolve(__dirname, '../../icase-frontend/src/components/CodePlanningView.jsx'), 'utf8');
  const sandbox = { module: { exports: {} }, exports: {}, require: requireStub, console, window: dom.window, document: dom.window.document };
  sandbox.exports = sandbox.module.exports;
  vm.runInNewContext(transformSync(source, { loader: 'jsx', format: 'cjs' }).code, sandbox);
  ModulesEditor = sandbox.module.exports.ModulesEditor;
});
beforeEach(() => { root = require('react-dom/client').createRoot(document.getElementById('root')); onChange = jest.fn(); });
afterEach(async () => { await act(async () => root.unmount()); });

const sugerencia = (id, etiqueta, evidencia) => ({ id, etiqueta, evidencia, alternativa: 'No soportado todavía.' });
const modules = {
  capacidades: [
    { id: 'dispositivos', etiqueta: 'Cámara, códigos QR y biometría', modulo: 'camara_qr' },
    { id: 'notificaciones', etiqueta: 'Correo, SMS y notificaciones', modulo: null }
  ],
  opcionales: [
    { id: 'camara_qr', etiqueta: 'Cámara y lector QR', descripcion: 'Escáner web.', porDefecto: false },
    { id: 'mapas', etiqueta: 'Mapas por coordenadas', descripcion: 'Leaflet.', porDefecto: false }
  ],
  incluidos: [],
  requisitos: [
    { identificador: 'RF-01', nombre: 'Visualización del menú digital', sugerencias: [] },
    { identificador: 'RF-02', nombre: 'Reserva de mesa o silla', sugerencias: [] },
    { identificador: 'RF-05', nombre: 'Validación de reserva mediante QR', sugerencias: [sugerencia('dispositivos', 'Cámara, códigos QR y biometría', 'descripción: «QR»')] },
    { identificador: 'RF-09', nombre: 'Avisos a clientes', sugerencias: [sugerencia('notificaciones', 'Correo, SMS y notificaciones', 'nombre: «avisos por correo»')] }
  ]
};
const render = async (value = { modo: 'automatico' }) => act(async () => root.render(React.createElement(ModulesEditor, { value, onChange, disabled: false, modules })));
const text = () => document.body.textContent;

test('ya no pregunta por cada requisito: solo muestra los que piden algo especial y agrupa el resto', async () => {
  await render();
  expect(text()).not.toContain('Confirmo esta declaración');
  expect(text()).not.toContain('(pendiente)');
  expect(text()).toContain('RF-05 · Validación de reserva mediante QR');
  expect(text()).toContain('RF-09 · Avisos a clientes');
  expect(text()).not.toContain('RF-01 · Visualización del menú digital — por revisar');
  expect(text()).toContain('2 requisitos son gestión de datos estándar: no necesitan decisión');
});

test('une requisitos y módulos: cada pedido dice qué módulo lo cubre y permite activarlo', async () => {
  await render();
  const activar = [...document.querySelectorAll('button')].find((b) => /Activar «Cámara y lector QR»/.test(b.textContent));
  expect(activar).toBeTruthy();
  expect(text()).toContain('Lo piden: RF-05');
  expect(text()).toContain('El generador aún no lo hace: quedará como pendiente en el informe');
  await act(async () => activar.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })));
  const enviado = onChange.mock.calls.at(-1)[0];
  expect(enviado.modo).toBe('personalizado');
  expect(enviado.modulos.find((item) => item.id === 'camara_qr').activo).toBe(true);
  expect(enviado.modulos.find((item) => item.id === 'mapas').activo).toBe(false);
});

test('con el módulo activo el pedido figura como cubierto', async () => {
  await render({ modo: 'personalizado', modulos: [{ id: 'camara_qr', activo: true }, { id: 'mapas', activo: false }] });
  expect(text()).toContain('Lo cubre «Cámara y lector QR»');
  expect(text()).not.toContain('Activar «Cámara y lector QR»');
});

test('la modalidad de entrega queda en opciones avanzadas', async () => {
  await render();
  const avanzadas = [...document.querySelectorAll('details')].find((d) => /Opciones avanzadas de la entrega/.test(d.textContent));
  expect(avanzadas).toBeTruthy();
  expect(avanzadas.textContent).toContain('Modalidad');
});
