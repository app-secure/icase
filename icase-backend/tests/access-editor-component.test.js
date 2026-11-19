const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { transformSync } = require('esbuild');
const { JSDOM } = require('jsdom');
const React = require('react');
const { act } = React;

let dom; let AccessEditor; let root; let onChange;
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
  AccessEditor = sandbox.module.exports.AccessEditor;
});
beforeEach(() => { root = require('react-dom/client').createRoot(document.getElementById('root')); onChange = jest.fn(); });
afterEach(async () => { await act(async () => root.unmount()); });

const value = {
  autenticacion: { metodo: 'jwt', expiracion: '8h' },
  roles: [{ id: 'cliente', nombre: 'Cliente', incluir: true, autoregistro: false }, { id: 'cocinero', nombre: 'Cocinero', incluir: true, autoregistro: false }],
  operaciones: [
    { id: 'RF-01', nombre: 'Visualización del menú digital', metodos: ['GET'] },
    { id: 'RF-02', nombre: 'Reserva de mesa o silla', metodos: ['GET', 'POST'] },
    { id: 'RF-10', nombre: 'Autenticación de usuarios', tipo: 'acceso', metodos: [] }
  ],
  permisos: [
    { operacion: 'RF-01', rol: 'cliente', metodos: ['GET'], alcance: 'todos' },
    { operacion: 'RF-02', rol: 'cliente', metodos: ['GET', 'POST'], alcance: 'propios' }
  ]
};
const render = async () => act(async () => root.render(React.createElement(AccessEditor, { value, onChange, disabled: false })));
const group = (label) => document.querySelector(`[aria-label="${label}"]`);

test('cada operación ofrece solo los permisos que usa: una consulta no muestra Crear, Editar ni Eliminar', async () => {
  await render();
  const verOnly = [...group('RF-01 para Cliente').querySelectorAll('button')].map((b) => b.textContent);
  expect(verOnly).toEqual(['Ver']);
  const reserva = [...group('RF-02 para Cliente').querySelectorAll('button')].map((b) => b.textContent);
  expect(reserva).toEqual(['Ver', 'Crear']);
});

test('explica qué hace cada operación, muestra al administrador y no pide permisos para el inicio de sesión', async () => {
  await render();
  const text = document.body.textContent;
  expect(text).toContain('Solo consulta');
  expect(text).toContain('Consulta y registra');
  expect(text).toContain('Administrador');
  expect(text).toContain('Todo, siempre');
  expect(text).toContain('Inicio de sesión: lo resuelve la aplicación');
  expect(group('RF-10 para Cliente')).toBeNull();
});

test('activar un permiso disponible sigue funcionando', async () => {
  await render();
  const crear = [...group('RF-02 para Cocinero').querySelectorAll('button')].find((b) => b.textContent === 'Crear');
  await act(async () => crear.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })));
  const permisos = onChange.mock.calls.at(-1)[0].permisos;
  expect(permisos.find((item) => item.operacion === 'RF-02' && item.rol === 'cocinero').metodos).toEqual(['POST']);
});
