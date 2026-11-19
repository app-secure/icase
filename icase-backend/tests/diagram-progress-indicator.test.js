const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { transformSync } = require('esbuild');
const { JSDOM } = require('jsdom');
const React = require('react');
const { act } = React;
let root, Component, dom;
beforeAll(() => {
  dom = new JSDOM('<button id="work">Canvas disponible</button><div id="root"></div>', { url: 'http://localhost' });
  global.window = dom.window; global.document = dom.window.document; global.navigator = dom.window.navigator;
  global.IS_REACT_ACT_ENVIRONMENT = true;
  const load = filename => {
    const sandbox = { module: { exports: {} }, require: id => id === './DiagramProgressIndicator' ? load('DiagramProgressIndicator.jsx') : id === './RequirementJobStatus' ? load('RequirementJobStatus.jsx') : id === 'lucide-react' ? { Loader2: () => null, Info: () => null, X: () => null } : require(id) };
    vm.runInNewContext(transformSync(fs.readFileSync(path.resolve(__dirname, '../../icase-frontend/src/components', filename), 'utf8'), { loader: 'jsx', format: 'cjs' }).code, sandbox);
    return sandbox.module.exports;
  };
  Component = load('DiagramProgressModal.jsx').default;
});
beforeEach(() => { root = require('react-dom/client').createRoot(document.getElementById('root')); });
afterEach(async () => { await act(async () => root.unmount()); });
async function click(el) { await act(async () => el.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }))); }
async function render(props = {}) { await act(async () => root.render(React.createElement(Component, { isOpen: true, diagramLabel: 'Clases', progress: 40, ...props }))); }
test('la generación no bloquea la página y expande el mismo indicador del análisis', async () => {
  const close = jest.fn(); await render({ onClose: close, correctionPrompt: 'Conservar entidades', job: { proveedor_usado: 'gemini', modelo: 'modelo-prueba' } });
  expect(document.querySelector('[role="dialog"], [aria-modal="true"]')).toBeNull();
  expect(document.querySelector('aside').className).not.toContain('inset-0');
  expect(document.querySelector('#work').disabled).toBe(false);
  await click(document.querySelector('[aria-label="Ver detalles del procesamiento con IA"]'));
  expect(document.body.textContent).toContain('Conservar entidades');
  expect(document.body.textContent).toContain('modelo-prueba');
  expect(document.querySelector('[role="progressbar"]').getAttribute('aria-valuenow')).toBe('40');
  await click(document.querySelector('[aria-label="Cerrar detalles"]'));
  expect(close).not.toHaveBeenCalled();
});
test('un fallo se muestra al expandir y se puede descartar sin regenerar', async () => {
  const close = jest.fn(); await render({ error: 'Proveedor no disponible', onClose: close });
  await click(document.querySelector('[aria-label="Ver detalles del procesamiento con IA"]'));
  expect(document.body.textContent).toContain('Proveedor no disponible');
  await click([...document.querySelectorAll('button')].find(b => b.textContent === 'Descartar aviso'));
  expect(close).toHaveBeenCalledTimes(1);
});
