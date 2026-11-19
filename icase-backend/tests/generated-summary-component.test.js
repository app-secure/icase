const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { transformSync } = require('esbuild');
const { JSDOM } = require('jsdom');
const React = require('react');
const { act } = React;

let dom; let GeneratedSummary; let root;
beforeAll(() => {
  dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost' });
  global.window = dom.window; global.document = dom.window.document; global.navigator = dom.window.navigator;
  global.IS_REACT_ACT_ENVIRONMENT = true;
  const icons = new Proxy({}, { get: () => () => null });
  const sandbox = { module: { exports: {} }, exports: {}, require: (id) => (id === 'react' ? React : id === 'lucide-react' ? icons : require(id)) };
  sandbox.exports = sandbox.module.exports;
  vm.runInNewContext(transformSync(fs.readFileSync(path.resolve(__dirname, '../../icase-frontend/src/components/GeneratedSummary.jsx'), 'utf8'), { loader: 'jsx', format: 'cjs' }).code, sandbox);
  GeneratedSummary = sandbox.module.exports.default;
});
beforeEach(() => { root = require('react-dom/client').createRoot(document.getElementById('root')); });
afterEach(async () => { await act(async () => root.unmount()); });
const render = async (artifacts) => act(async () => root.render(React.createElement(GeneratedSummary, { artifacts })));

test('no muestra nada si todavía no se generó ninguna pieza', async () => {
  await render({});
  expect(document.body.textContent).toBe('');
});

test('resume versión, archivos, aprobación y verificación de cada pieza', async () => {
  await render({
    backend: { version: 2, archivos: new Array(120).fill({}), aprobado: true, estado: 'aprobado', verificacion: { estado: 'aprobada' } },
    frontend: { version: 1, archivos: new Array(40).fill({}), aprobado: false, estado: 'en_revision', verificacion: { estado: 'fallida' } },
    tests: { version: 1, archivos: [], aprobado: false, estado: 'en_revision', pendiente_reverificacion: true }
  });
  const text = document.body.textContent;
  expect(text).toContain('1 de 6 piezas aprobadas');
  expect(text).toContain('v2 · 120 archivos');
  expect(text).toContain('Verificación: aprobada');
  expect(text).toContain('Verificación: fallida');
  expect(text).toContain('Corrección por verificar');
  expect(text).toContain('Sin generar');
});
