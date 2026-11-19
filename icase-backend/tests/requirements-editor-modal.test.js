// Component interaction in JSDOM; native dialog behavior is shared with AnalysisModal.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { transformSync } = require('esbuild');
const { JSDOM } = require('jsdom');
const React = require('react');
const { act } = React;
let dom, root, View;
const icon = () => null;
beforeAll(() => {
  dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost' });
  global.window = dom.window; global.document = dom.window.document; global.navigator = dom.window.navigator;
  global.IS_REACT_ACT_ENVIRONMENT = true;
  const load = filename => {
    const sandbox = { module: { exports: {} }, require: id => {
      if (id.endsWith('.css')) return {};
      if (id === 'lucide-react') return new Proxy({}, { get: () => icon });
      if (id === './Toast') return { ToastContainer: () => null, useToasts: () => ({ toasts: [], addToast: () => {}, removeToast: () => {} }) };
      if (id === './AnalysisModal') return { __esModule: true, default: ({ open, title, onClose, children, footer }) => open ? React.createElement('div', { role: 'dialog' }, React.createElement('h2', null, title), children, React.createElement('footer', null, footer), React.createElement('button', { onClick: onClose }, 'Cerrar formulario')) : null };
      if (id === './ActorAutocomplete') return load('ActorAutocomplete.jsx');
      if (id.startsWith('./')) return { __esModule: true, default: () => null };
      return require(id);
    } };
    vm.runInNewContext(transformSync(fs.readFileSync(path.resolve(__dirname, '../../icase-frontend/src/components', filename), 'utf8'), { loader: 'jsx', format: 'cjs' }).code, sandbox);
    return sandbox.module.exports;
  };
  View = load('RequirementsView.jsx').default;
});
beforeEach(() => { root = require('react-dom/client').createRoot(document.getElementById('root')); });
afterEach(async () => { await act(async () => root.unmount()); });
const requirements = { functional: [{ id: 'RF-01', name: 'Consultar catálogo', description: 'El sistema mostrará el catálogo.', actors: ['Cliente'], priority: 'Alta' }], nonFunctional: [] };
async function render(props = {}) { await act(async () => root.render(React.createElement(View, { requirements, audit: { actores: [{ nombre: 'Cliente' }], referencia_analisis_inicial: { version: 43 } }, ...props }))); }
async function click(button) { await act(async () => button.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }))); }
const button = text => [...document.querySelectorAll('button')].find(b => b.textContent === text);

test('encabezado fase 3 y edición en modal sin sustituir la tarjeta ni guardar al cancelar', async () => {
  const update = jest.fn(); await render({ onUpdateRequirements: update });
  expect(document.body.textContent).toContain('FASE 3 · REQUISITOS');
  expect(document.querySelector('[role="dialog"]')).toBeNull();
  await click(document.querySelector('[title="Editar este requisito"]'));
  expect(document.querySelector('[role="dialog"] input')).not.toBeNull();
  expect(document.querySelector('#requisito-RF-01').textContent).toContain('Consultar catálogo');
  expect(document.querySelector('[role="dialog"] footer').textContent).toContain('Guardar requisito');
  await click(button('Cancelar'));
  expect(document.querySelector('[role="dialog"]')).toBeNull();
  expect(update).not.toHaveBeenCalled();
});

test('crear abre modal y una validación fallida solo aparece dentro del formulario', async () => {
  await render(); await click(button('Añadir RF')); await click(button('Guardar requisito'));
  const modal = document.querySelector('[role="dialog"]');
  expect(modal.textContent).toContain('Añadir requisito funcional');
  expect(modal.querySelector('[role="alert"]').textContent).toContain('obligatorios');
  expect(document.querySelectorAll('[role="alert"]')).toHaveLength(1);
});

test('un fallo de persistencia no cierra el formulario ni pierde la edición', async () => {
  await render({ onUpdateRequirements: jest.fn().mockRejectedValue(new Error('No se pudo guardar')) });
  await click(document.querySelector('[title="Editar este requisito"]')); await click(button('Guardar requisito'));
  expect(document.querySelector('[role="dialog"] [role="alert"]').textContent).toContain('No se pudo guardar');
  expect([...document.querySelectorAll('[role="dialog"] input')].some(input => input.value === 'Consultar catálogo')).toBe(true);
});
