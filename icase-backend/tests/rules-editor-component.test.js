const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { transformSync } = require('esbuild');
const { JSDOM } = require('jsdom');
const React = require('react');
const { act } = React;

let dom; let RulesEditor; let root; let onChange;
beforeAll(() => {
  dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost' });
  global.window = dom.window; global.document = dom.window.document; global.navigator = dom.window.navigator;
  global.IS_REACT_ACT_ENVIRONMENT = true;
  const icon = () => null;
  // El editor solo necesita React e iconos; el resto del módulo (servicios, vistas) se sustituye por vacíos.
  const stub = new Proxy({}, { get: (_t, key) => (key === '__esModule' ? false : () => null) });
  const requireStub = (id) => (id === 'react' ? React : /lucide-react/.test(id) ? new Proxy({}, { get: () => icon }) : stub);
  const source = fs.readFileSync(path.resolve(__dirname, '../../icase-frontend/src/components/CodePlanningView.jsx'), 'utf8');
  const sandbox = { module: { exports: {} }, exports: {}, require: requireStub, console, window: dom.window, document: dom.window.document };
  sandbox.exports = sandbox.module.exports;
  vm.runInNewContext(transformSync(source, { loader: 'jsx', format: 'cjs' }).code, sandbox);
  RulesEditor = sandbox.module.exports.RulesEditor;
});
beforeEach(() => { root = require('react-dom/client').createRoot(document.getElementById('root')); onChange = jest.fn(); });
afterEach(async () => { await act(async () => root.unmount()); });

const dom_rule = (entidad, campo, extra = {}) => ({ id: `DOM-${entidad.toLowerCase()}-${campo}`, tipo: 'requerido', entidad, campo, rf: ['RF-10', 'RF-14'], origen: 'inferido', estado_decision: 'pendiente', mensaje: `${campo} es obligatorio.`, justificacion: 'En el diagrama de clases este dato no es opcional, por eso el sistema lo pide siempre.', ...extra });
const value = { reglas: [dom_rule('Usuario', 'correo'), dom_rule('Usuario', 'passwordHash'), dom_rule('Usuario', 'rol'), dom_rule('Cliente', 'nombre', { estado_decision: 'confirmado' })] };
const render = async (v = value) => act(async () => root.render(React.createElement(RulesEditor, { value: v, onChange, disabled: false })));
const click = async (el) => act(async () => el.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })));
const text = () => document.body.textContent;

test('muestra nombres legibles y agrupa por entidad, sin identificadores técnicos a la vista', async () => {
  await render();
  expect(text()).toContain('Usuario');
  expect(text()).toContain('Cliente');
  expect(text()).toContain('Contraseña es obligatorio');
  expect(text()).toContain('Correo electrónico es obligatorio');
  expect(text()).not.toContain('passwordHash es obligatorio');
  expect(text()).not.toContain('DOM-usuario');
  expect(text()).toContain('Sugerida por el sistema');
  expect(text()).toContain('3 por decidir');
});

test('confirma todas las pendientes de una vez y de un grupo', async () => {
  await render();
  await click([...document.querySelectorAll('button')].find((b) => /Confirmar las 3 pendientes/.test(b.textContent)));
  const reglas = onChange.mock.calls.at(-1)[0].reglas;
  expect(reglas.every((r) => r.estado_decision === 'confirmado')).toBe(true);
  await render();
  await click([...document.querySelectorAll('summary button')].find((b) => /Confirmar las de Usuario/.test(b.textContent)));
  expect(onChange.mock.calls.at(-1)[0].reglas.filter((r) => r.entidad === 'Usuario').every((r) => r.estado_decision === 'confirmado')).toBe(true);
});

test('decide una regla y filtra por estado', async () => {
  await render();
  await click(document.querySelector('[aria-label="Rechazar"]'));
  expect(onChange.mock.calls.at(-1)[0].reglas[0].estado_decision).toBe('rechazado');
  await click([...document.querySelectorAll('button')].find((b) => /^Confirmadas/.test(b.textContent)));
  expect(text()).toContain('Cliente');
  expect(text()).not.toContain('Correo electrónico es obligatorio');
});

test('el mensaje que verá el usuario se edita dentro del detalle', async () => {
  await render();
  const input = document.querySelector('input');
  await act(async () => { Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value').set.call(input, 'Indica tu correo.'); input.dispatchEvent(new dom.window.Event('input', { bubbles: true })); });
  expect(onChange.mock.calls.at(-1)[0].reglas[0].mensaje).toBe('Indica tu correo.');
});
