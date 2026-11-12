// Navegador real contra componente productivo + API productiva + repositorios en memoria.
// No llama a IA ni usa MongoDB. Requiere Playwright y Chromium previamente instalados.
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { build } = require('esbuild');
require('./lib/playwright-runtime.cjs').configureBrowserCache();
const { startPlatform, ids, token } = require('../tests/helpers/platform-fixture');
const root = path.resolve(__dirname, '../verification-results/requirements-browser', new Date().toISOString().replace(/[:.]/g, '-'));
fs.mkdirSync(root, { recursive: true });
const report = { inicio: new Date().toISOString(), alcance: 'RequirementsView y RequirementReviewPanel productivos con API real y datos sintéticos en memoria. Sin IA, MongoDB, diagramas, ZIP ni despliegue.', pruebas: [] };
let platform, server, browser, page;
const save = () => fs.writeFileSync(path.join(root, 'resultado.json'), JSON.stringify(report, null, 2));
(async () => {
  let chromium;
  try { ({ chromium } = require(process.env.REQUIREMENTS_PLAYWRIGHT_MODULE || '@playwright/test')); }
  catch { report.estado = 'bloqueado_entorno'; report.motivo = 'Falta Playwright: ejecuta npm ci y npm run test:browser:install. No se ejecutaron acciones de navegador.'; process.exitCode = 2; return; }
  browser = await chromium.launch({ headless: true, timeout: 20000 });
  console.log('[Prueba navegador] Chromium iniciado');
  platform = await startPlatform();
  const project = platform.data.proyecto[0];
  project.insumo_bruto = 'Consultar expedientes. Autorizar solicitudes.';
  project.auditoria_requisitos = { version: 2, inventario: [{ id: 'N-1', tipo: 'RF', objetivo_id: 'O-1', necesidad: 'Consultar expedientes', estado: 'confirmado', evidencia: 'Consultar expedientes.' }], necesidades_pendientes: [{ id: 'N-2', estado_validacion: 'pendiente', motivo: 'evidencia_incorrecta', elemento: { id: 'N-2', tipo: 'RF', objetivo_id: 'O-2', necesidad: 'Autorizar solicitudes', estado: 'confirmado', evidencia: 'Cita incorrecta' } }] };
  const req = { ...platform.data.requerimiento[0], tipo: 'RF', identificador: 'RF-1', nombre: 'Consulta', descripcion: 'Consultar expedientes', necesidades_origen: ['N-1'], criterios_aceptacion: [{ descripcion: 'Consulta visible', necesidades_origen: ['N-1'] }] };
  Object.assign(platform.data.requerimiento[0], req);
  const frontendModules = path.resolve(__dirname, '../../icase-frontend/node_modules');
  // CSS compilado de la aplicación: sin él una captura no acredita su presentación.
  const assets = path.resolve(__dirname, '../../icase-frontend/dist/assets');
  const cssFiles = fs.readdirSync(assets).filter(name => name.endsWith('.css'));
  if (!cssFiles.length) throw new Error('Compila primero el frontend con npm run build para revisar sus estilos reales.');
  const css = cssFiles.map(name => fs.readFileSync(path.join(assets, name), 'utf8')).join('\n');
  const bundle = await build({ entryPoints: [path.join(__dirname, 'fixtures/requirements-review-browser.jsx')], bundle: true, write: false, format: 'iife', platform: 'browser', define: { 'process.env.NODE_ENV': '"production"' }, absWorkingDir: path.resolve(__dirname, '../../icase-frontend'), nodePaths: [frontendModules],
    // El entrypoint vive en backend, pero los componentes usan React del frontend.
    // Una sola instancia evita el dispatcher nulo por versiones duplicadas.
    alias: { react: path.join(frontendModules, 'react'), 'react-dom': path.join(frontendModules, 'react-dom') }
  });
  server = http.createServer(async (request, response) => {
    if (request.url === '/bundle.js') { response.setHeader('Content-Type', 'application/javascript'); return response.end(bundle.outputFiles[0].contents); }
    if (request.url === '/app.css') { response.setHeader('Content-Type', 'text/css'); return response.end(css); }
    if (request.url === '/fixture') { response.setHeader('Content-Type', 'application/json'); return response.end(JSON.stringify({ id: ids.projectA, syntheticToken: token(ids.userA), audit: project.auditoria_requisitos, requirements: { functional: [{ id: 'RF-1', name: req.nombre, description: req.descripcion, actors: ['Operador'], priority: 'Alta', origin: 'explicito', needIds: req.necesidades_origen, acceptanceCriteria: req.criterios_aceptacion }], nonFunctional: [] } })); }
    if (request.url.startsWith('/proyectos/')) {
      const chunks = []; for await (const chunk of request) chunks.push(chunk);
      const result = await fetch(platform.base + request.url, { method: request.method, headers: { 'Content-Type': 'application/json', Authorization: request.headers.authorization || '' }, body: Buffer.concat(chunks) });
      response.statusCode = result.status; response.setHeader('Content-Type', 'application/json'); return response.end(await result.text());
    }
    response.setHeader('Content-Type', 'text/html'); response.end('<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/app.css"><title>Prueba aislada de revisión</title></head><body><div id="root"></div><script src="/bundle.js"></script></body></html>');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.setDefaultTimeout(15000); page.setDefaultNavigationTimeout(20000);
  report.errores_javascript = [];
  const errors = report.errores_javascript; page.on('pageerror', error => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  console.log('[Prueba navegador] Interfaz cargada');
  await page.getByRole('button', { name: 'Reanudar pendientes' }).waitFor();
  await page.getByText('Trabajo interrumpido de prueba', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Reanudar pendientes' }).click();
  await page.getByText('Reanudación solicitada de prueba', { exact: true }).waitFor();
  report.pruebas.push({ nombre: 'Estado interrumpido y reanudación explícita (componente productivo, callback simulado)', estado: 'correcto' });
  await page.getByRole('button', { name: 'Comprobar versión guardada' }).click();
  await page.getByText('Revisión guardada. El control de calidad se recalculó.', { exact: true }).waitFor();
  report.pruebas.push({ nombre: 'Validación desde botón productivo', estado: 'correcto' });
  const diagnostics = page.getByRole('region', { name: 'Resumen de validación de requisitos' });
  await diagnostics.getByText('Estado de las comprobaciones', { exact: true }).waitFor();
  await diagnostics.getByText(/con errores que impiden aprobar/).waitFor();
  await diagnostics.getByText(/Advertencias de calidad/).click();
  await diagnostics.getByText(/Decisiones pendientes/).click();
  report.pruebas.push({ nombre: 'Diagnósticos separados y secciones colapsables', estado: 'correcto' });
  await diagnostics.scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(root, 'diagnosticos-desktop.png') });
  await page.setViewportSize({ width: 390, height: 844 });
  await diagnostics.scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(root, 'diagnosticos-mobile.png') });
  const overflows = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
  report.pruebas.push({ nombre: 'Sin desbordamiento horizontal en viewport móvil', estado: overflows ? 'fallido' : 'correcto' });
  if (overflows) report.elementos_desbordados = await page.evaluate(() => [...document.querySelectorAll('body *')]
    .filter(el => { const rect = el.getBoundingClientRect(); return rect.width && rect.right > innerWidth + 1; })
    .slice(0, 15).map(el => ({ etiqueta: el.tagName, clases: el.className, ancho: Math.round(el.getBoundingClientRect().width) })));
  await page.setViewportSize({ width: 1440, height: 1000 });
  save(); console.log('[Prueba navegador] Validación comprobada');
  await page.getByText('Actores del sistema (1)', { exact: true }).click();
  await page.locator('summary').filter({ hasText: /^Añadir actor$/ }).click();
  await page.getByLabel('Nombre del nuevo actor', { exact: true }).fill('Supervisor');
  await page.getByLabel('Responsabilidad del nuevo actor', { exact: true }).fill('Supervisa las consultas');
  await page.getByLabel('Justificación del nuevo actor', { exact: true }).fill('Actor añadido manualmente para probar el catálogo');
  await page.getByRole('button', { name: 'Añadir actor pendiente' }).click();
  await page.getByText('Supervisor · pendiente', { exact: true }).waitFor();
  const actor = page.locator('article').filter({ has: page.getByText('Supervisor · pendiente', { exact: true }) });
  await actor.getByRole('button', { name: 'Revisar actor' }).click();
  await actor.getByLabel('Justificación de la decisión', { exact: true }).fill('Confirmación manual de prueba');
  await actor.getByRole('button', { name: 'Confirmar actor actual' }).click();
  await page.getByText('Supervisor · confirmado', { exact: true }).waitFor();
  await page.getByText(/Actores del sistema \(/).scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(root, 'actores-desktop.png'), fullPage: true });
  await page.reload();
  await page.getByText('Actores del sistema (1)', { exact: true }).click();
  await page.getByText('Supervisor · confirmado', { exact: true }).waitFor();
  report.pruebas.push({ nombre: 'Añadir y confirmar actor desde interfaz; persistencia al recargar', estado: 'correcto' });
  await page.getByRole('button', { name: 'Aprobar y pasar a Modelado' }).click();
  await page.getByText(/No se puede aprobar el análisis/).first().waitFor();
  report.pruebas.push({ nombre: 'La aprobación no omite una necesidad pendiente', estado: 'correcto' });
  await page.getByRole('button', { name: 'Corregir fragmentos' }).click();
  await page.getByLabel('Fragmento literal').fill('Autorizar solicitudes.');
  await page.getByLabel('Justificación técnica', { exact: false }).fill('Se sustituyó la cita por el fragmento del insumo sintético.');
  report.pruebas.push({ nombre: 'Justificación accesible por su etiqueta', estado: 'correcto' });
  await page.getByRole('button', { name: 'Guardar decisión' }).click();
  await page.getByText(/Estado: corregida/).waitFor();
  report.pruebas.push({ nombre: 'Corrección puntual de cita con formulario', estado: 'correcto' });
  await page.reload(); await page.getByText(/Estado: corregida/).waitFor();
  report.pruebas.push({ nombre: 'Recargar conserva la resolución y la función sigue sin cobertura', estado: 'correcto' });
  if (!project.auditoria_requisitos.control_aprobacion.bloqueado) throw new Error('Se habilitó aprobación sin cubrir la función.');
  if (errors.length) throw new Error('Errores JavaScript en navegador');
  await page.screenshot({ path: path.join(root, 'revision.png'), fullPage: true });
  await page.goto(`http://127.0.0.1:${server.address().port}/?sidebar=1`);
  const sidebar = page.getByRole('complementary', { name: 'Referencia de requisitos aprobados' });
  await sidebar.getByText(/Actores del sistema \(/).click();
  await sidebar.getByText('Supervisor · confirmado', { exact: true }).waitFor();
  if (await sidebar.getByRole('button', { name: 'Revisar actor' }).count()) throw new Error('El sidebar aprobado permite editar actores');
  await page.screenshot({ path: path.join(root, 'actores-sidebar.png') });
  await page.getByRole('button', { name: 'Ocultar requisitos aprobados' }).click();
  await page.getByRole('button', { name: 'Mostrar requisitos aprobados' }).click();
  await sidebar.waitFor();
  report.pruebas.push({ nombre: 'Actores en sidebar derecho de solo lectura, ocultar y mostrar', estado: 'correcto' });
  report.estado = report.pruebas.some(test => test.estado === 'fallido') ? 'fallido' : 'correcto';
  if (report.estado === 'fallido') process.exitCode = 1;
})().catch(async error => {
  report.estado = /Executable doesn't exist|browserType.launch.*ENOENT|playwright install/i.test(error.message) ? 'bloqueado_entorno' : 'fallido';
  report.error = String(error.message).replace(/https?:\/\/\S+/g, '[URL]');
  if (page) { await page.screenshot({ path: path.join(root, 'fallo.png'), fullPage: true, timeout: 5000 }).catch(() => {}); report.pantalla = await page.locator('body').innerText({ timeout: 5000 }).catch(() => 'No disponible'); }
  process.exitCode = report.estado === 'bloqueado_entorno' ? 2 : 1;
}).finally(async () => {
  await browser?.close(); if (server) await new Promise(resolve => server.close(resolve)); await platform?.close();
  report.fin = new Date().toISOString(); save(); console.log(`[Prueba navegador] ${report.estado}; ${root}`);
});
