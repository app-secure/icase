const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { transformSync } = require('esbuild');
const { JSDOM } = require('jsdom');
const React = require('react');
const { act } = React;
let root, dom, Component, onChange;
beforeAll(() => {
  dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost' });
  global.window = dom.window; global.document = dom.window.document; global.navigator = dom.window.navigator;
  global.IS_REACT_ACT_ENVIRONMENT = true;
  const sandbox = { module: { exports: {} }, require: id => id === 'lucide-react' ? { Search: () => null, X: () => null } : require(id) };
  vm.runInNewContext(transformSync(fs.readFileSync(path.resolve(__dirname, '../../icase-frontend/src/components/ActorAutocomplete.jsx'), 'utf8'), { loader: 'jsx', format: 'cjs' }).code, sandbox);
  Component = sandbox.module.exports.default;
});
beforeEach(() => { root = require('react-dom/client').createRoot(document.getElementById('root')); onChange = jest.fn(); });
afterEach(async () => { await act(async () => root.unmount()); });
const actors = [{ nombre: 'Administrador', alias: ['Gerente'] }, { nombre: 'Técnico', estado: 'pendiente' }, { nombre: 'Descartado', estado: 'rechazado' }];
async function render(value = []) { await act(async () => root.render(React.createElement(Component, { value, onChange, actors }))); }
async function click(el) { await act(async () => el.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }))); }
async function type(value) {
  const input = document.querySelector('input');
  await act(async () => { Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value').set.call(input, value); input.dispatchEvent(new dom.window.Event('input', { bubbles: true })); });
}
test('busca por alias y guarda el nombre canónico sin crear actores', async () => {
  await render(); await type('gerente');
  const options = [...document.querySelectorAll('[role="option"]')];
  expect(options.map(o => o.textContent)).toEqual(['Administrador']);
  await click(options[0]);
  expect(onChange.mock.calls[0][0]).toEqual(['Administrador']);
});
test('permite varios actores sin duplicados y conserva selecciones antiguas al quitarlas', async () => {
  await render(['Administrador', 'Actor heredado']);
  await click(document.querySelector('input'));
  expect(document.querySelectorAll('[role="option"]')).toHaveLength(1);
  expect(document.querySelector('[role="option"]').textContent).toContain('Técnico');
  await click(document.querySelector('[aria-label="Quitar actor Administrador"]'));
  expect(onChange.mock.calls[0][0]).toEqual(['Actor heredado']);
});
test('busca sin acentos, selecciona con teclado y no agrega texto no registrado', async () => {
  await render(); await type('tecnico');
  const input = document.querySelector('input');
  await act(async () => input.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true })));
  await act(async () => input.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true })));
  expect(onChange.mock.calls[0][0]).toEqual(['Técnico']);
  onChange.mockClear(); await type('No existe');
  await act(async () => input.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true })));
  expect(onChange).not.toHaveBeenCalled();
  expect(document.body.textContent).toContain('No hay actores que coincidan');
});
