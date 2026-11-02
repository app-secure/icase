const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const esbuild = require('esbuild');
const { JSDOM } = require('jsdom');
const React = require('react');
const { act } = React;
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost' });
const oldWindow = global.window, oldDocument = global.document, oldAct = global.IS_REACT_ACT_ENVIRONMENT;
global.window = dom.window; global.document = dom.window.document; global.IS_REACT_ACT_ENVIRONMENT = true;
const { createRoot } = require('react-dom/client');
const template = fs.readFileSync(path.join(__dirname, '../src/infrastructure/templates/frontend/AssociationsPanel.jsx'), 'utf8');
const code = esbuild.transformSync(template, { loader: 'jsx', format: 'cjs' }).code;
let session;
const sandbox = { module: { exports: {} }, URLSearchParams, require: (name) => name === 'react' ? React : { useSession: () => session } };
vm.runInNewContext(code, sandbox);
const Panel = sandbox.module.exports.default;

describe('panel N:M generado (React y DOM simulado)', () => {
  let root, container, relation;
  const button = (text) => [...container.querySelectorAll('button')].find((item) => item.textContent === text);
  const select = async (label, value) => act(async () => {
    const input = container.querySelector(`select[aria-label="${label}"]`);
    input.value = value; input.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
  });
  beforeEach(() => {
    relation = { table: 'rel_matriculas', entities: ['Alumno', 'Curso'], label: 'Matrículas', endpoints_generated: true, operations: [['rf-01'], ['rf-02']] };
    session = { can: () => true, user: null, api: jest.fn(async (url, options = {}) => {
      if (url === '/api/contract') return { associations: [relation] };
      if (url.startsWith('/api/operations/')) return { data: [{ id: '1', data: { nombre: 'Primero' } }, { id: '2', data: { nombre: 'Segundo' } }, { id: '3', data: { nombre: 'Tercero' } }], pagination: { total_pages: 2 } };
      if (options.method) return { associated: options.method === 'POST' };
      return { data: [{ source_id: '1', target_id: url.includes('after_target_id') ? '3' : '2' }], has_more: !url.includes('after_target_id') };
    }) };
    container = document.createElement('div'); document.body.append(container); root = createRoot(container);
  });
  afterEach(async () => { await act(async () => root.unmount()); container.remove(); });
  afterAll(() => { dom.window.close(); global.window = oldWindow; global.document = oldDocument; global.IS_REACT_ACT_ENVIRONMENT = oldAct; });
  const render = () => act(async () => root.render(React.createElement(Panel, { capability: 'rf-01' })));

  test('selecciona extremos, asocia y desasocia sin borrar registros', async () => {
    await render();
    expect(button('Asociar').disabled).toBe(true);
    await select('Seleccionar Origen: Alumno', '1');
    await select('Seleccionar Destino: Curso', '3');
    await act(async () => button('Asociar').click());
    expect(session.api).toHaveBeenCalledWith('/api/associations/rel_matriculas', { method: 'POST', body: JSON.stringify({ source_id: '1', target_id: '3' }) });
    expect(container.textContent).toContain('Vínculo guardado');
    await act(async () => button('Desasociar #2').click());
    expect(session.api).toHaveBeenCalledWith('/api/associations/rel_matriculas', { method: 'DELETE', body: JSON.stringify({ source_id: '1', target_id: '2' }) });
    expect(container.textContent).toContain('Los registros se conservaron');
    expect(session.api.mock.calls.some(([url, options]) => url.startsWith('/api/operations/') && options?.method === 'DELETE')).toBe(false);
  });
  test('continúa la lista mediante cursor, sin limitarse a los primeros vínculos', async () => {
    await render(); await select('Seleccionar Origen: Alumno', '1');
    await act(async () => button('Cargar más vínculos').click());
    expect(session.api.mock.calls.some(([url]) => url.includes('after_target_id=2'))).toBe(true);
  });
  test('lector no ve acciones de escritura', async () => {
    session.can = (_key, method) => method === 'GET';
    await render(); await select('Seleccionar Origen: Alumno', '1');
    expect(button('Asociar')).toBeUndefined();
    expect(button('Desasociar #2')).toBeUndefined();
  });
  test('sin permiso en ambos extremos no consulta registros ni vínculos', async () => {
    session.can = (key) => key === 'rf-01'; await render();
    expect(container.textContent).toContain('Sin permiso');
    expect(session.api).toHaveBeenCalledTimes(1);
  });
  test('stack no soportado informa la limitación sin enviar operaciones', async () => {
    relation.endpoints_generated = false; await render();
    expect(container.textContent).toContain('aún no está disponible');
    expect(session.api).toHaveBeenCalledTimes(1);
  });
  test('explica el requisito transaccional de Mongo sin prometer alta disponibilidad', async () => {
    relation.requires_replica_set = true; await render();
    expect(container.textContent).toContain('replica set transaccional');
    expect(container.textContent).toContain('no proporciona alta disponibilidad');
  });
  test('muestra un fallo del contrato en lugar de ocultarlo', async () => {
    session.api.mockRejectedValue(new Error('Sesión caducada')); await render();
    expect(container.querySelector('[role="alert"]').textContent).toContain('Sesión caducada');
  });
  test('un rechazo del backend se muestra y vuelve a habilitar los controles', async () => {
    const original = session.api.getMockImplementation();
    session.api.mockImplementation(async (url, options = {}) => {
      if (options.method === 'POST') throw new Error('Se requieren permisos sobre ambos extremos');
      return original(url, options);
    });
    await render(); await select('Seleccionar Origen: Alumno', '1'); await select('Seleccionar Destino: Curso', '2');
    await act(async () => button('Asociar').click());
    expect(container.querySelector('[role="alert"]').textContent).toContain('ambos extremos');
    expect(button('Asociar').disabled).toBe(false);
  });
  test.each([true, false])('el generador conecta paneles y exporta JSX válido (formularios tipados=%s)', (typed) => {
    const Generator = require('../src/infrastructure/services/GenericFrontendGenerator');
    const files = new Generator().generate({ proyecto: { nombre: 'Biblioteca' }, screens: [{ slug: 'libros', rf_trazabilidad: ['RF-01'] }], decisiones: { modulos: { modo: 'personalizado', modulos: [{ id: 'formularios_tipados', activo: typed }] } } });
    const screen = files.find((file) => file.ruta === 'frontend/src/OperationScreen.jsx');
    expect(screen.contenido).toContain('<AssociationsPanel');
    expect(files.find((file) => file.ruta === 'frontend/src/AssociationsPanel.jsx').contenido).toBe(template);
    for (const file of files.filter((item) => /frontend\/src\/.*\.jsx?$/.test(item.ruta))) {
      expect(() => esbuild.transformSync(file.contenido, { loader: 'jsx', format: 'esm' })).not.toThrow();
    }
  });
});
