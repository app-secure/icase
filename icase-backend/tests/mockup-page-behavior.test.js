/** @jest-environment node */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const { buildSync } = require('esbuild');
const React = require('react');
const { createRoot } = require('react-dom/client');
const Frontend = require('../src/infrastructure/services/GenericFrontendGenerator');

const html = `<!DOCTYPE html><html><body><main>
  <form><input name="buscar"><button type="button" data-accion="RF-03.consultar">Buscar</button></form>
  <form><input name="sala"><input name="capacidad" type="number">
    <button type="button" data-accion="RF-03.crear">Crear</button>
    <button type="button" data-accion="RF-03.editar">Guardar cambios</button>
    <button type="button" data-accion="RF-03.eliminar">Eliminar</button>
  </form></main></body></html>`;

let dom; let directory; let Page; let fetchMock; let root; let container;
const text = () => container.textContent;
const button = (label) => Array.from(container.querySelectorAll('button')).find((item) => item.textContent.trim() === label);
const input = (name) => container.querySelector(`[name="${name}"]`);
const click = async (element) => { await React.act(async () => { element.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true })); }); };
const respond = (body, ok = true) => Promise.resolve({ ok, status: ok ? 200 : 400, json: async () => body });

beforeAll(() => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'mockup-page-'));
  const files = new Frontend().generate({
    proyecto: { nombre: 'Salas' },
    screens: [{ nombre: 'Reservas', slug: 'reservas', rf_trazabilidad: ['RF-03'], mockup: { preview_code: html } }],
    decisiones: {}, requerimientos: [{ identificador: 'RF-03', tipo: 'RF', aprobado: true, nombre: 'Reservar sala' }]
  });
  for (const file of files) {
    const target = path.join(directory, file.ruta);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, file.contenido);
  }
  const bundle = buildSync({
    entryPoints: [path.join(directory, 'frontend/src/pages/reservas.jsx')], bundle: true, write: false, format: 'cjs', platform: 'node',
    external: ['react', 'react-dom', 'react-dom/client', 'react-router-dom'], loader: { '.js': 'jsx', '.jsx': 'jsx', '.css': 'empty' }, logLevel: 'silent'
  }).outputFiles[0].text;
  const module = { exports: {} };
  new Function('module', 'exports', 'require', bundle)(module, module.exports, require);
  Page = module.exports.default;
});

afterAll(() => fs.rmSync(directory, { recursive: true, force: true }));

beforeEach(async () => {
  dom = new JSDOM('<!DOCTYPE html><div id="app"></div>', { pretendToBeVisual: true });
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, navigator: dom.window.navigator, IS_REACT_ACT_ENVIRONMENT: true });
  fetchMock = jest.fn(() => respond({}));
  globalThis.fetch = fetchMock;
  globalThis.confirm = jest.fn(() => true);
  container = dom.window.document.getElementById('app');
  root = createRoot(container);
  await React.act(async () => { root.render(React.createElement(Page)); });
});

afterEach(async () => {
  await React.act(async () => { root.unmount(); });
  for (const key of ['window', 'document', 'navigator', 'fetch', 'confirm', 'IS_REACT_ACT_ENVIRONMENT']) delete globalThis[key];
});

describe('la página generada del mockup ejecutándose con React', () => {
  test('el botón Crear envía los campos escritos y muestra el resultado en la pantalla', async () => {
    input('sala').value = 'Sala A';
    input('capacidad').value = '12';
    await click(button('Crear'));
    expect(fetchMock).toHaveBeenCalledWith('/api/operations/rf-03', expect.objectContaining({ method: 'POST', body: JSON.stringify({ sala: 'Sala A', capacidad: 12 }) }));
    expect(container.querySelector('[data-icase-result]').textContent).toContain('Registro creado');
  });

  test('un error del backend se muestra como alerta', async () => {
    fetchMock.mockImplementation(() => respond({ message: 'Sala requerida' }, false));
    await click(button('Crear'));
    const alert = container.querySelector('[role="alert"]');
    expect(alert.textContent).toContain('Sala requerida');
  });

  test('consultar lista registros reales, seleccionar rellena el formulario y editar y eliminar actúan sobre ese registro', async () => {
    fetchMock.mockImplementation((url) => respond(url.includes('?') ? { data: [{ id: '9', data: { sala: 'Sala 9', capacidad: 5 } }] } : {}));
    await click(button('Buscar'));
    expect(fetchMock).toHaveBeenCalledWith('/api/operations/rf-03?limit=20', expect.objectContaining({ headers: expect.any(Object) }));
    expect(container.querySelector('[data-icase-result]').textContent).toContain('1 registro');
    expect(text()).toContain('Sala 9');

    await click(button('Seleccionar'));
    expect(input('sala').value).toBe('Sala 9');
    expect(input('capacidad').value).toBe('5');
    expect(text()).toContain('Seleccionado');

    input('sala').value = 'Sala 9 B';
    await click(button('Guardar cambios'));
    expect(fetchMock).toHaveBeenCalledWith('/api/operations/rf-03/9', expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ sala: 'Sala 9 B', capacidad: 5 }) }));

    await click(button('Eliminar'));
    expect(globalThis.confirm.mock.calls[0][0]).toContain('Sala 9');
    expect(fetchMock).toHaveBeenCalledWith('/api/operations/rf-03/9', expect.objectContaining({ method: 'DELETE' }));
    expect(container.querySelector('[data-icase-result]').textContent).toContain('Registro eliminado');
    expect(text()).not.toContain('Seleccionado:');
  });

  test('sin registro seleccionado Eliminar y Guardar cambios solo avisan y no llaman a la API', async () => {
    await click(button('Eliminar'));
    await click(button('Guardar cambios'));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(container.querySelector('[data-icase-result]').textContent).toContain('Selecciona');
  });

  test('si el usuario no confirma la eliminación no se llama a la API', async () => {
    fetchMock.mockImplementation((url) => respond(url.includes('?') ? { data: [{ id: '9', data: { sala: 'Sala 9' } }] } : {}));
    await click(button('Buscar'));
    await click(button('Seleccionar'));
    globalThis.confirm = jest.fn(() => false);
    const before = fetchMock.mock.calls.length;
    await click(button('Eliminar'));
    expect(fetchMock.mock.calls.length).toBe(before);
  });
});
