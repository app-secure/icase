// Auditoría de documentación: fuente real en modo lectura o caso amplio de 48 pantallas.
const fs = require('node:fs/promises');
const path = require('node:path');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
process.env.PLAYWRIGHT_BROWSERS_PATH ||= path.resolve(__dirname, '../.icase-browsers');
const { chromium } = require('playwright');
const Generator = require('../src/infrastructure/services/ProjectDocumentationGenerator');
const Jobs = require('../src/infrastructure/services/DocumentationJobs');
const arg = name => { const index = process.argv.indexOf(name); return index < 0 ? null : process.argv[index + 1]; };
async function source() {
  const projectId = arg('--project');
  if (projectId) {
    require('dotenv').config({ quiet: true }); const mongoose = require('mongoose');
    await mongoose.connect(process.env.MONGODB_URI || process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/icase_db');
    const repo = name => new (require(`../src/interface-adapters/repositories/Mongo${name}Repository`))();
    try {
      const [proyecto, requerimientos, diagramas, plan, artefactos, diseno] = await Promise.all([
        repo('Proyecto').obtenerPorId(projectId), repo('Requerimiento').listarPorProyecto(projectId), repo('Diagrama').listarPorProyecto(projectId), repo('PlanCodificacion').obtenerPorProyecto(projectId), repo('ArtefactoGenerado').listarPorProyecto(projectId), repo('Diseno').obtenerPorProyecto(projectId)
      ]);
      if (!proyecto) throw new Error('Proyecto no encontrado.');
      return { proyecto, requerimientos, diagramas, plan, artefactos, diseno, opciones: { githubActions: true } };
    } finally { await mongoose.disconnect(); }
  }
  const roles = ['Cliente', 'Cocinero', 'Administrador'];
  const requerimientos = roles.map((rol, index) => ({ tipo: 'RF', identificador: `RF-0${index + 1}`, nombre: ['Reservar mesa', 'Preparar pedido', 'Gestionar usuarios'][index], descripcion: `Función aprobada para ${rol}.`, aprobado: true, actores: [rol], criterios_aceptacion: ['El resultado se muestra en la pantalla.'] }));
  return {
    proyecto: { nombre: 'Restaurante · auditoría de 48 pantallas', descripcion: 'Caso amplio de prueba, distinto de los proyectos del usuario.', estado_fase: 'mockups_aprobados' }, requerimientos,
    diseno: { mockups: Array.from({ length: 48 }, (_, index) => ({ pantalla_id: `pantalla-${index + 1}`, nombre_pantalla: `Pantalla ${index + 1}`, nombre_visible: `${roles[index % 3]} · Pantalla ${index + 1}`, modulo: ['Reservas', 'Cocina', 'Administración'][index % 3], roles: [roles[index % 3]], rf_trazabilidad: [`RF-0${index % 3 + 1}`], estado_calidad: 'valido', preview_code: `<main class="bg-white rounded-xl p-8 shadow-lg"><span class="text-purple-700 font-bold">${roles[index % 3]}</span><h1 class="text-3xl font-bold mt-4">Pantalla ${index + 1}</h1><p class="text-slate-600 my-4">Recorrido aprobado para ${roles[index % 3]}.</p><label>Descripción <input class="border rounded p-2" placeholder="Escribe los datos" /></label><button class="ml-4">Confirmar</button><table class="mt-8"><tr><th>Referencia</th><th>Estado</th></tr><tr><td>RF-0${index % 3 + 1}</td><td>Registrado</td></tr></table></main>` })) },
    diagramas: [{ tipo: 'arquitectura', version: 1, aprobado: true, codigo_mermaid: 'flowchart LR\n  Web --> API\n  API --> DB' }],
    artefactos: [{ tipo: 'codigo_backend', version: 1, aprobado: true, archivos: [
      { ruta: 'backend/README.md', contenido: '# Arranque del backend\n\n**Instala** las dependencias.\n\n```sh\nnpm install\n```\n' },
      { ruta: 'backend/package.json', contenido: JSON.stringify({ scripts: { start: 'node app.js', test: 'node --test' } }) },
      { ruta: 'ops/docker-compose.yml', contenido: 'services:\n  api:\n    ports: ["3000:3000"]\n    healthcheck:\n      test: [CMD, curl, http://localhost:3000/health]\n  database:\n    image: mongo:8\n' },
      { ruta: 'backend/openapi.json', contenido: JSON.stringify({ paths: { '/reservas': { get: { summary: 'Consultar reservas' } } }, components: { schemas: { Reserva: { properties: { fecha: { type: 'string' }, mesa: { type: 'string' } } } } } }) }
    ] }], opciones: { githubActions: true, licencia: 'MIT', titular: 'Equipo de pruebas' }
  };
}
async function main() {
  const output = path.resolve(arg('--output') || process.argv[2] || 'verification-results/documentation');
  await fs.mkdir(output, { recursive: true });
  const input = await source(), bundle = new Generator().generar(input);
  const jobs = new Jobs({ root: path.join(output, 'versiones') });
  const previous = process.argv.includes('--reuse') ? (await jobs.list('auditoria')).find(item => item.estado === 'lista') : null;
  const job = previous || await jobs.start('auditoria', bundle, { videos: process.argv.includes('--videos') }); await jobs.queue;
  const state = await jobs.status('auditoria', job.id); assert.equal(state.estado, 'lista', state.error);
  const base = jobs.dir('auditoria', job.id), packageRoot = path.join(base, 'package');
  assert.equal(state.capturas.length, bundle.pantallas.length);
  const manifest = JSON.parse(await fs.readFile(path.join(packageRoot, 'documentation/documentation-manifest.json'), 'utf8'));
  for (const entry of manifest.archivos) assert.equal(crypto.createHash('sha256').update(await fs.readFile(path.join(packageRoot, entry.ruta))).digest('hex'), entry.sha256, entry.ruta);
  const pdf = await fs.readFile(path.join(packageRoot, 'documentation/site/documentacion.pdf')); assert.equal(pdf.subarray(0, 4).toString(), '%PDF');
  await fs.copyFile(path.join(base, 'documentacion.zip'), path.join(output, 'documentacion.zip'));
  await fs.copyFile(path.join(packageRoot, 'documentation/site/documentacion.pdf'), path.join(output, 'manuales.pdf'));
  await fs.copyFile(path.join(packageRoot, 'informe-final.pdf'), path.join(output, 'informe-final.pdf'));
  const app = require('express')(); app.use(require('express').static(path.join(packageRoot, 'documentation/site')));
  const siteServer = app.listen(0, '127.0.0.1'); await new Promise(resolve => siteServer.once('listening', resolve));
  const browser = await chromium.launch({ channel: process.env.DOCUMENTATION_BROWSER_CHANNEL || 'chrome', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.goto(`http://127.0.0.1:${siteServer.address().port}/usuario.html`, { waitUntil: 'networkidle' });
    await page.screenshot({ path: path.join(output, 'manual-usuario.png'), fullPage: false });
    if (process.env.DOCS_TEST_URL) {
      await page.route('**/proyectos/docs-test/codificacion/documentacion/versiones**', async route => {
        const request = route.request(), url = new URL(request.url());
        if (url.pathname.endsWith('/archivo')) {
          const file = await jobs.file('auditoria', job.id, url.searchParams.get('ruta'));
          const ext = path.extname(file); const contentType = ({ '.html': 'text/html', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.webm': 'video/webm', '.pdf': 'application/pdf', '.zip': 'application/zip' })[ext] || 'text/plain';
          return route.fulfill({ body: await fs.readFile(file), contentType });
        }
        return route.fulfill({ json: request.method() === 'POST' || url.pathname.endsWith(job.id) ? state : [state] });
      });
      await page.goto(process.env.DOCS_TEST_URL);
      await page.evaluate(async () => {
        const React = (await import('/node_modules/.vite/deps/react.js')).default;
        const client = await import('/node_modules/.vite/deps/react-dom_client.js');
        const Panel = (await import('/src/components/ProjectDocumentationPanel.jsx')).default;
        const target = document.createElement('div'); target.style.cssText = 'padding:24px;max-width:1240px;margin:auto'; document.body.replaceChildren(target);
        (client.createRoot || client.default.createRoot)(target).render(React.createElement(Panel, { projectId: 'docs-test' }));
      });
      const frame = page.frameLocator('iframe[title="Manuales del proyecto generado"]');
      await frame.getByRole('heading', { name: 'Manual de usuario', exact: true }).waitFor();
      await frame.locator('img').evaluateAll(images => Promise.all(images.map(image => image.decode().catch(() => null))));
      await page.screenshot({ path: path.join(output, 'panel-documentacion.png'), fullPage: true });
      assert.equal(await frame.locator('img').evaluateAll(images => images.filter(image => !image.complete || image.naturalWidth === 0).length), 0);
      await page.screenshot({ path: path.join(output, 'panel-documentacion.png'), fullPage: true });
      const download = page.waitForEvent('download'); await page.getByRole('button', { name: 'Descargar PDF', exact: true }).click(); await (await download).saveAs(path.join(output, 'pdf-desde-interfaz.pdf'));
      await page.getByRole('button', { name: 'Guía de desarrollador', exact: true }).click();
      await frame.getByRole('heading', { name: 'Guía de desarrollador', exact: true }).waitFor();
      assert((await frame.locator('strong').count()) > 0);
      await page.screenshot({ path: path.join(output, 'markdown-renderizado.png'), fullPage: true });
      await page.setViewportSize({ width: 390, height: 844 });
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      await page.screenshot({ path: path.join(output, 'panel-movil.png'), fullPage: true });
    }
    assert.deepEqual(errors, []);
  } finally { await browser.close(); await new Promise(resolve => siteServer.close(resolve)); }
  const summary = { caso: arg('--project') || 'sintetico-48', proyecto: input.proyecto.nombre, pantallas: state.capturas.length, roles: state.flujos.length, videos: state.videos.length, archivos: manifest.archivos.length, advertencias: state.advertencias, estado: state.estado };
  await fs.writeFile(path.join(output, 'resultado.json'), JSON.stringify(summary, null, 2)); console.log(JSON.stringify(summary));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
