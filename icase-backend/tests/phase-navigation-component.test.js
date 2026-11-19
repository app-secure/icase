const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { transformSync } = require('esbuild');
const { JSDOM } = require('jsdom');
const React = require('react');
const { act } = React;

let dom, root, PhaseNav, phasesOf, FolderExplorer, buildTree;
const dir = path.resolve(__dirname, '../../icase-frontend/src/components');

beforeAll(() => {
  dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost' });
  global.window = dom.window; global.document = dom.window.document; global.navigator = dom.window.navigator;
  global.IS_REACT_ACT_ENVIRONMENT = true;
  const icon = () => null;
  const load = (filename) => {
    const sandbox = { module: { exports: {} }, require: (id) => (id === 'lucide-react' ? new Proxy({}, { get: () => icon }) : require(id)) };
    vm.runInNewContext(transformSync(fs.readFileSync(path.join(dir, filename), 'utf8'), { loader: 'jsx', format: 'cjs' }).code, sandbox);
    return sandbox.module.exports;
  };
  ({ default: PhaseNav, phasesOf } = load('PhaseNav.jsx'));
  ({ default: FolderExplorer, buildTree } = load('FolderExplorer.jsx'));
});
afterEach(async () => { if (root) await act(async () => root.unmount()); root = null; });
afterAll(() => { dom.window.close(); delete global.window; delete global.document; delete global.navigator; delete global.IS_REACT_ACT_ENVIRONMENT; });

const render = async (element) => {
  root = require('react-dom/client').createRoot(document.getElementById('root'));
  await act(async () => root.render(element));
};
const click = async (element) => act(async () => { element.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })); });
const buttons = () => [...document.querySelectorAll('nav[aria-label="Fases del proyecto"] button')];

describe('navegación entre fases', () => {
  const project = (extra = {}) => ({ currentPhase: 2, isAnalysisApproved: true, isDiagramsApproved: false, isMockupsApproved: false, ...extra });

  test('habilita cada fase según lo aprobado y explica por qué una está bloqueada', () => {
    const phases = phasesOf(project());
    expect(phases.map((item) => [item.label, item.unlocked])).toEqual([['Análisis', true], ['Modelamiento', true], ['Codificación', false], ['Documento', false]]);
    expect(phases[2].lockedReason).toMatch(/mockups/);
    expect(phasesOf({ currentPhase: 0 }).map((item) => item.unlocked)).toEqual([true, false, false, false]);
    expect(phasesOf(project({ isDiagramsApproved: true, isMockupsApproved: true })).every((item) => item.unlocked)).toBe(true);
  });

  test('permite ir directo a una fase habilitada y no a una bloqueada', async () => {
    const onSelect = jest.fn();
    await render(React.createElement(PhaseNav, { project: project(), onSelect }));
    const [analysis, design, coding, document_] = buttons();
    expect(design.getAttribute('aria-current')).toBe('step');
    expect(coding.disabled).toBe(true);
    expect(coding.title).toMatch(/Aprueba los diagramas/);
    expect(document_.disabled).toBe(true);
    await click(analysis);
    expect(onSelect).toHaveBeenCalledWith(1);
    await click(coding);
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  test('con el diseño aprobado se puede ir a Codificación y a Documento', async () => {
    const onSelect = jest.fn();
    await render(React.createElement(PhaseNav, { project: project({ isDiagramsApproved: true, isMockupsApproved: true, currentPhase: 3 }), onSelect }));
    const [, , coding, doc] = buttons();
    expect(coding.getAttribute('aria-current')).toBe('step');
    await click(doc);
    expect(onSelect).toHaveBeenCalledWith(4);
  });

  test('los paneles de solo consulta están separados de las fases y no cambian de fase', async () => {
    const onSelect = jest.fn(); const onToggleRequirements = jest.fn(); const onToggleSources = jest.fn();
    await render(React.createElement(PhaseNav, { project: project(), onSelect, onToggleRequirements, onToggleSources, requirementsAvailable: true, sourcesAvailable: false }));
    const group = document.querySelector('[role="group"][aria-label="Solo consulta"]');
    expect(group).not.toBeNull();
    expect(document.querySelector('nav[aria-label="Fases del proyecto"]').contains(group)).toBe(false);
    const requirements = [...group.querySelectorAll('button')].find((item) => /Requisitos/.test(item.textContent));
    expect([...group.querySelectorAll('button')].some((item) => /Insumos/.test(item.textContent))).toBe(false);
    await click(requirements);
    expect(onToggleRequirements).toHaveBeenCalled();
    expect(onSelect).not.toHaveBeenCalled();
  });

  test('deshabilitada (procesando) ninguna fase es clicable', async () => {
    await render(React.createElement(PhaseNav, { project: project({ isDiagramsApproved: true, isMockupsApproved: true }), disabled: true, onSelect: jest.fn() }));
    expect(buttons().every((item) => item.disabled)).toBe(true);
  });
});

describe('explorador de carpetas', () => {
  const tree = 'backend/package.json\nbackend/src/main.ts\nbackend/src/actions/actions.js\nfrontend/src/App.jsx\nfrontend/src/pages/mesas.jsx\ntests/e2e/navigation.spec.js';

  test('arma el árbol con carpetas anidadas', () => {
    const root = buildTree(tree.split('\n'));
    expect([...root.folders.keys()]).toEqual(['backend', 'frontend', 'tests']);
    expect([...root.folders.get('backend').folders.keys()]).toEqual(['src']);
    expect(root.folders.get('backend').files).toEqual(['package.json']);
  });

  test('muestra el total, las carpetas con su número de archivos y las plega', async () => {
    await render(React.createElement(FolderExplorer, { tree }));
    expect(document.querySelector('[role="status"]').textContent).toBe('6 archivos en 8 carpetas');
    const summaries = [...document.querySelectorAll('summary')].map((item) => item.textContent.trim());
    expect(summaries).toEqual(expect.arrayContaining(['backend3', 'frontend2', 'tests1']));
    expect(document.querySelector('details[open]')).not.toBeNull(); // el primer nivel viene abierto
    expect(document.querySelector('[data-path="backend/package.json"]')).not.toBeNull();
  });

  test('filtra por nombre y abre las carpetas que coinciden', async () => {
    await render(React.createElement(FolderExplorer, { tree }));
    const input = document.querySelector('input[aria-label="Filtrar archivos"]');
    await act(async () => {
      Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value').set.call(input, 'actions');
      input.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    });
    expect(document.querySelector('[role="status"]').textContent).toContain('1 coinciden');
    expect(document.querySelectorAll('[data-path]')).toHaveLength(1);
    expect(document.querySelector('[data-path="backend/src/actions/actions.js"]')).not.toBeNull();
    expect([...document.querySelectorAll('details')].every((item) => item.open)).toBe(true);
  });

  test('sin estructura lo explica y un filtro sin coincidencias también', async () => {
    await render(React.createElement(FolderExplorer, { tree: '' }));
    expect(document.body.textContent).toContain('Todavía no hay estructura');
  });
});
