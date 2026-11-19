/** @jest-environment node */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const { buildSync } = require('esbuild');
const React = require('react');
const { createRoot } = require('react-dom/client');
const Frontend = require('../src/infrastructure/services/GenericFrontendGenerator');
const { boot, useEnvironment } = require('./helpers/boot-generated-app');

// La página diseñada (el mockup convertido) ejecutándose con React contra el backend generado real, con almacén en memoria.
const PLANTUML = '@startuml\nclass Sala {\n+String id\n+String nombre\n+int capacidad\n}\n@enduml';
const requerimientos = [{ identificador: 'RF-03', tipo: 'RF', aprobado: true, nombre: 'Reservar sala', descripcion: 'Registrar salas' }];
const html = `<!DOCTYPE html><html><body><main>
  <form><input name="buscar"><button type="button" data-accion="RF-03.consultar">Buscar</button></form>
  <form><input name="nombre"><input name="capacidad" type="number">
    <button type="button" data-accion="RF-03.crear">Crear sala</button>
    <button type="button" data-accion="RF-03.editar">Guardar cambios</button>
    <button type="button" data-accion="RF-03.eliminar">Eliminar</button>
    <button type="button">Exportar</button>
  </form></main></body></html>`;

const cleanups = [];
useEnvironment();

let Page; let directory; let backend; let dom; let container; let root; let realFetch;
const button = (label) => Array.from(container.querySelectorAll('button')).find((item) => item.textContent.trim() === label);
const input = (name) => container.querySelector(`[name="${name}"]`);
const banner = () => container.querySelector('[data-icase-result]');
const click = async (element) => { await React.act(async () => { element.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true })); }); };
// Las acciones hacen HTTP real: se espera a que el resultado aparezca en pantalla.
const until = async (predicate, label) => {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    if (predicate()) return;
    await React.act(async () => { await new Promise((resolve) => setTimeout(resolve, 25)); });
  }
  throw new Error('No apareció en pantalla: ' + label);
};
const clickUntilText = async (element, text) => { await click(element); await until(() => banner() && banner().textContent.includes(text), text); };
const records = async () => { const response = await realFetch(`${backend.base}/api/operations/rf-03`); const body = await response.json(); return Array.isArray(body) ? body : body.data; };

beforeAll(() => {
  realFetch = globalThis.fetch;
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'designed-ui-'));
  const files = new Frontend().generate({
    proyecto: { nombre: 'Salas' }, decisiones: {}, requerimientos,
    screens: [{ nombre: 'Salas', slug: 'salas', ruta: '/salas', rf_trazabilidad: ['RF-03'], mockup: { preview_code: html } }]
  });
  for (const file of files) {
    const target = path.join(directory, file.ruta);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, file.contenido);
  }
  const bundle = buildSync({
    entryPoints: [path.join(directory, 'frontend/src/pages/salas.jsx')], bundle: true, write: false, format: 'cjs', platform: 'node',
    external: ['react', 'react-dom', 'react-dom/client', 'react-router-dom'], loader: { '.js': 'jsx', '.jsx': 'jsx', '.css': 'empty' }, logLevel: 'silent'
  }).outputFiles[0].text;
  const module = { exports: {} };
  new Function('module', 'exports', 'require', bundle)(module, module.exports, require);
  Page = module.exports.default;
});

afterAll(() => fs.rmSync(directory, { recursive: true, force: true }));

beforeEach(async () => {
  backend = await boot({ decisiones: {}, requerimientos, plantuml: PLANTUML, cleanups });
  dom = new JSDOM('<!DOCTYPE html><div id="app"></div>', { pretendToBeVisual: true });
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, navigator: dom.window.navigator, IS_REACT_ACT_ENVIRONMENT: true });
  // La página llama a rutas relativas (/api/...): se dirigen al backend real.
  globalThis.fetch = (url, options) => realFetch(String(url).startsWith('/') ? backend.base + url : url, options);
  globalThis.confirm = () => true;
  container = dom.window.document.getElementById('app');
  root = createRoot(container);
  await React.act(async () => { root.render(React.createElement(Page)); });
});

afterEach(async () => {
  await React.act(async () => { root.unmount(); });
  for (const key of ['window', 'document', 'navigator', 'confirm', 'IS_REACT_ACT_ENVIRONMENT']) delete globalThis[key];
  globalThis.fetch = realFetch;
  while (cleanups.length) await cleanups.pop()();
});

describe('la interfaz diseñada contra el backend generado real', () => {
  test('crear desde el mockup persiste el registro en el backend', async () => {
    input('nombre').value = 'Sala Aurora';
    input('capacidad').value = '12';
    await clickUntilText(button('Crear sala'), 'Registro creado');
    const stored = await records();
    expect(stored).toHaveLength(1);
    expect(stored[0].data).toEqual(expect.objectContaining({ nombre: 'Sala Aurora', capacidad: 12 }));
  });

  test('consultar lista lo persistido, seleccionar rellena el formulario y editar y eliminar actúan sobre ese registro', async () => {
    input('nombre').value = 'Sala Boreal';
    input('capacidad').value = '8';
    await clickUntilText(button('Crear sala'), 'Registro creado');

    await clickUntilText(button('Buscar'), '1 registro');
    expect(container.textContent).toContain('Sala Boreal');

    await click(button('Seleccionar'));
    expect(input('nombre').value).toBe('Sala Boreal');
    expect(input('capacidad').value).toBe('8');

    input('nombre').value = 'Sala Boreal 2';
    await clickUntilText(button('Guardar cambios'), 'Registro actualizado');
    expect((await records())[0].data.nombre).toBe('Sala Boreal 2');

    await clickUntilText(button('Eliminar'), 'Registro eliminado');
    expect(await records()).toHaveLength(0);
  });

  test('un registro que el backend rechaza se muestra como alerta y no se persiste', async () => {
    input('nombre').value = 'Sala sin aforo';
    input('capacidad').setAttribute('type', 'text');
    input('capacidad').value = 'no-es-un-numero';
    await click(button('Crear sala'));
    await until(() => container.querySelector('[role="alert"]'), 'la alerta');
    expect(await records()).toHaveLength(0);
  });

  test('el control sin enlace no llama al backend', async () => {
    await click(button('Exportar'));
    await React.act(async () => { await new Promise((resolve) => setTimeout(resolve, 150)); });
    expect(banner()).toBeNull();
    expect(await records()).toHaveLength(0);
  });
});
