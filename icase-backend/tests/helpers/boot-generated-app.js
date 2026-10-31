// Genera un backend Express, lo escribe en un directorio temporal con el almacén en memoria y lo levanta por HTTP real.
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const BackendScaffoldGenerator = require('../../src/infrastructure/services/BackendScaffoldGenerator');

const ENV = { JWT_SECRET: 'secreto-de-pruebas-0123456789', ADMIN_EMAIL: 'admin@example.test', ADMIN_PASSWORD: 'Admin-Passw0rd', NODE_ENV: 'test' };

function useEnvironment() {
  const saved = {};
  beforeEach(() => { for (const key of Object.keys(ENV)) saved[key] = process.env[key]; Object.assign(process.env, ENV); });
  afterEach(() => { for (const key of Object.keys(ENV)) { if (saved[key] === undefined) delete process.env[key]; else process.env[key] = saved[key]; } });
}

async function boot({ decisiones, requerimientos, plantuml, cleanups, mutate = (file) => file.contenido }) {
  const generated = await new BackendScaffoldGenerator().generar({
    proyecto: { nombre: 'Demo' },
    insumos: { decisiones: { stack_tecnologico: { backend: 'Express', base_datos: 'PostgreSQL' }, ...decisiones }, requerimientos, diagramaDominio: plantuml ? { codigo_plantuml: plantuml } : null },
    versionesOrigen: {}
  });
  const dir = fs.mkdtempSync(path.join(__dirname, '..', '.generated-'));
  cleanups.push(async () => fs.rmSync(dir, { recursive: true, force: true }));
  for (const file of generated.archivos.filter((item) => item.ruta.startsWith('backend/src/'))) {
    const destination = path.join(dir, file.ruta.replace('backend/src/', ''));
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.writeFileSync(destination, mutate(file));
  }
  fs.copyFileSync(path.join(__dirname, 'memory-record-store.js'), path.join(dir, 'record.store.js'));
  const app = require(path.join(dir, 'app.js'));
  await app.locals.init();
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  cleanups.push(() => new Promise((resolve) => server.close(resolve)));
  const file = (ruta) => generated.archivos.find((item) => item.ruta === ruta)?.contenido;
  return {
    app, base: `http://127.0.0.1:${server.address().port}`, files: generated.archivos, file,
    manifest: JSON.parse(file('backend/icase.manifest.json')), openapi: JSON.parse(file('backend/openapi.json'))
  };
}

module.exports = { boot, useEnvironment, ENV };
