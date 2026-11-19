const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { transformSync } = require('esbuild');
const { JSDOM } = require('jsdom');
const React = require('react');
const { act } = React;

let dom; let ScreenWireframe; let helpers; let root;
beforeAll(() => {
  dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost' });
  global.window = dom.window; global.document = dom.window.document; global.navigator = dom.window.navigator;
  global.IS_REACT_ACT_ENVIRONMENT = true;
  const sandbox = { module: { exports: {} }, exports: {}, require: (id) => (id === 'react' ? React : require(id)) };
  sandbox.exports = sandbox.module.exports;
  vm.runInNewContext(transformSync(fs.readFileSync(path.resolve(__dirname, '../../icase-frontend/src/components/ScreenWireframe.jsx'), 'utf8'), { loader: 'jsx', format: 'cjs' }).code, sandbox);
  ScreenWireframe = sandbox.module.exports.default;
  helpers = sandbox.module.exports;
});
beforeEach(() => { root = require('react-dom/client').createRoot(document.getElementById('root')); });
afterEach(async () => { await act(async () => root.unmount()); });
const render = async (screen) => act(async () => root.render(React.createElement(ScreenWireframe, { screen })));
const text = () => document.body.textContent;

test('una tabla muestra encabezados legibles, filas de ejemplo y el botón «Editar» por fila', async () => {
  await render({ nombre: 'Gestión de usuarios', plataforma: 'web', componentes: [
    { tipo: 'tabla', operacion: 'listarUsuarios', campos: ['correo', 'rol'], campos_meta: {}, filtros: [], botones: [{ etiqueta: 'Editar', por_fila: true }, { etiqueta: 'Nuevo usuario', por_fila: false }] }
  ] });
  expect(document.querySelectorAll('thead th').length).toBe(3);
  expect(text()).toContain('Correo electrónico');
  expect(document.querySelectorAll('tbody tr').length).toBe(3);
  expect(text()).toContain('usuario1@ejemplo.com');
  expect(text()).toContain('Nuevo usuario');
  expect(text()).toContain('Esquema ilustrativo');
});

test('un formulario usa el control que corresponde a cada tipo y deja todo inactivo', async () => {
  await render({ nombre: 'Pedido', plataforma: 'móvil', componentes: [{
    tipo: 'formulario', operacion: 'crearPedido', campos: ['fechaHora', 'mesa_id', 'estado', 'activo', 'total', 'passwordHash'],
    campos_meta: { fechaHora: { type: 'string', format: 'date-time' }, mesa_id: { type: 'string', entidad: 'Mesa' }, estado: { type: 'string', enum: ['PENDIENTE', 'SERVIDO'] }, activo: { type: 'boolean' }, total: { type: 'number' } },
    filtros: [], botones: [{ etiqueta: 'Registrar pedido', por_fila: false }]
  }] });
  expect(document.querySelector('input[type="datetime-local"]')).toBeTruthy();
  expect(document.querySelector('input[type="checkbox"]')).toBeTruthy();
  expect(document.querySelector('input[type="number"]')).toBeTruthy();
  expect(document.querySelector('input[type="password"]')).toBeTruthy();
  const selects = [...document.querySelectorAll('select')].map((s) => s.textContent);
  expect(selects[0]).toContain('Seleccionar mesa');
  expect(selects[1]).toContain('PENDIENTE');
  expect([...document.querySelectorAll('input,select')].every((el) => el.disabled)).toBe(true);
  expect(text()).toContain('Registrar pedido');
  expect(document.querySelector('[aria-label="Cómo se verá Pedido"]').className).toContain('max-w-[340px]');
});

test('las tarjetas de una consulta con filtro muestran el campo de búsqueda; sin campos avisan', async () => {
  await render({ nombre: 'Validar QR', plataforma: 'web', componentes: [{ tipo: 'tarjetas', operacion: 'validarReservaQr', campos: [], campos_meta: {}, filtros: ['codigoQr'], botones: [{ etiqueta: 'Validar QR', por_fila: false }] }] });
  expect(text()).toContain('Código QR');
  expect(text()).toContain('no tienen campos que mostrar');
});

test('los valores de ejemplo respetan el tipo', () => {
  expect(helpers.sampleValue('precio', { type: 'number' }, 1)).toBe('18.50');
  expect(helpers.sampleValue('estado', { enum: ['A', 'B'] }, 1)).toBe('B');
  expect(helpers.sampleValue('activa', { type: 'boolean' }, 0)).toBe('Sí');
  expect(helpers.sampleValue('mesa_id', { entidad: 'Mesa' }, 0)).toBe('Mesa 1');
  expect(helpers.fieldLabel('cliente_id')).toBe('Cliente');
  expect(helpers.fieldLabel('descripcion')).toBe('Descripción');
});
