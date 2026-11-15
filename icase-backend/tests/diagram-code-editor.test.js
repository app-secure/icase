const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { transformSync } = require('esbuild');
const { JSDOM } = require('jsdom');
const React = require('react');
const { act } = React;
let root, dom, Editor, onChange;
const code = '@startuml\nactor Cliente\nCliente --> UC1\n@enduml';
beforeAll(() => {
  dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost' });
  global.window = dom.window; global.document = dom.window.document; global.navigator = dom.window.navigator;
  global.IS_REACT_ACT_ENVIRONMENT = true;
  const sandbox = { window: dom.window, module: { exports: {} }, require: id => id === 'lucide-react' ? Object.fromEntries(['Search', 'ChevronUp', 'ChevronDown', 'X'].map(name => [name, () => null])) : require(id) };
  vm.runInNewContext(transformSync(fs.readFileSync(path.resolve(__dirname, '../../icase-frontend/src/components/DiagramCodeEditor.jsx'), 'utf8'), { loader: 'jsx', format: 'cjs' }).code, sandbox);
  Editor = sandbox.module.exports.default;
});
beforeEach(async () => {
  root = require('react-dom/client').createRoot(document.getElementById('root'));
  onChange = jest.fn();
  await act(async () => root.render(React.createElement(Editor, { value: code, onChange })));
});
afterEach(async () => { await act(async () => root.unmount()); });
async function search(value) {
  const input = document.querySelector('input');
  await act(async () => {
    Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value').set.call(input, value);
    input.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  });
}
async function click(label) {
  await act(async () => document.querySelector(`[aria-label="${label}"]`).dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })));
}
test('busca sin distinguir mayúsculas y recorre las coincidencias sin modificar código', async () => {
  await search('cliente');
  expect(document.querySelector('[role="status"]').textContent).toBe('1/2');
  await click('Coincidencia siguiente');
  const textarea = document.querySelector('textarea');
  expect(document.querySelector('[role="status"]').textContent).toBe('2/2');
  expect(textarea.selectionStart).toBe(code.lastIndexOf('Cliente'));
  await click('Coincidencia siguiente');
  expect(textarea.selectionStart).toBe(code.indexOf('Cliente'));
  expect(textarea.value).toBe(code);
  expect(onChange).not.toHaveBeenCalled();
});
test('la búsqueda literal informa ausencia y se puede limpiar', async () => {
  await search('.*');
  expect(document.querySelector('[role="status"]').textContent).toBe('Sin resultados');
  expect(document.querySelector('[aria-label="Coincidencia siguiente"]').disabled).toBe(true);
  await click('Limpiar búsqueda');
  expect(document.querySelector('input').value).toBe('');
});
test('Enter avanza y Mayús Enter retrocede', async () => {
  await search('Cliente');
  const input = document.querySelector('input');
  await act(async () => input.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true })));
  expect(document.querySelector('[role="status"]').textContent).toBe('2/2');
  await act(async () => input.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Enter', shiftKey: true, bubbles: true })));
  expect(document.querySelector('[role="status"]').textContent).toBe('1/2');
});
