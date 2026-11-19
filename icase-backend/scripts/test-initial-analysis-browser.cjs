// UI productiva y API productiva; datos sintéticos en memoria. --real consume Gemini.
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { build } = require('esbuild');
require('./lib/playwright-runtime.cjs').configureBrowserCache();
const real = process.argv.includes('--real');
if (real) require('dotenv').config({ path: path.resolve(__dirname, '../.env'), quiet: true });
const { startInitialPlatform, analysis } = require('../tests/helpers/initial-analysis-fixture');
const { token, ids } = require('../tests/helpers/platform-fixture');
const AI = require('../src/infrastructure/services/ModelosIaService');
const output = path.resolve(__dirname, '../verification-results/initial-analysis-browser', new Date().toISOString().replace(/[:.]/g, '-'));
fs.mkdirSync(output, { recursive: true });
const report = { inicio: new Date().toISOString(), ia_real: real, alcance: 'ProjectWorkspace, análisis inicial y API productivos; persistencia en memoria, sin base activa.', pruebas: [] };
let platform, browser, server, page, realAi;
const original = AI.prototype.procesar;
(async () => {
  let ai;
  if (real) {
    const Budget = require('../src/infrastructure/services/AiRequestBudget');
    const Router = require('../src/infrastructure/services/RequirementProviderRouter');
    const rows = new Map(), env = { ...process.env, REQUIREMENTS_RESILIENT_ENABLED: 'true' };
    ai = new AI({ env, requirementsRouter: new Router({ env, budget: new Budget(), stateRepository: { get: async id => rows.get(id), put: async (id, value) => rows.set(id, value), remove: async id => rows.delete(id) } }) });
    realAi = ai;
  }
  report.llamadas = { extraccion: 0, redaccion: 0, correccion: 0 };
  AI.prototype.procesar = async function(payload) {
    const category = payload.initialAnalysisTask || (payload.initialAnalysisOnly ? payload.initialAnalysisInstruction ? 'correccion' : 'extraccion' : 'redaccion');
    report.llamadas[category] = (report.llamadas[category] || 0) + 1;
    const result = real ? await original.call(ai, { ...payload, provider: 'gemini' }) : payload.initialAnalysisTask === 'analisis_respuesta' ? { elementos: [{ tipo: 'decision', necesidad: payload.answerText, evidencia: payload.answerText, estado: 'confirmado' }], respuesta_hash: require('../src/infrastructure/services/RequirementExecutionContext').hash(payload.answerText), pregunta_id: payload.questionId } : payload.initialAnalysisTask === 'revision_calidad' ? { ...payload.initialAnalysisPrevious, revision_inventario: { estado: 'completa', hallazgos: [] } } : payload.initialAnalysisOnly ? analysis() : {
      nombre_proyecto: 'Prueba inicial', diagramas: [], requerimientos: payload.approvedInitialAnalysis.inventario.filter(n => ['RF', 'RNF'].includes(n.tipo)).map((n, i) => ({ tipo: n.tipo, identificador: `${n.tipo}-${String(i + 1).padStart(2, '0')}`, nombre: n.necesidad, descripcion: `El sistema DEBE permitir ${n.necesidad.toLowerCase()}.`, prioridad: 'Media', actores: ['Operador'], necesidades_origen: [n.id], evidencias: n.evidencias, metrica_medible: n.tipo === 'RNF' ? 'Por confirmar con el usuario' : '', criterios_aceptacion: [{ descripcion: 'Se muestra el resultado al operador.', necesidades_origen: [n.id] }] })),
      auditoria_requisitos: { inventario: payload.approvedInitialAnalysis.inventario, actores: payload.approvedInitialAnalysis.actores, referencia_analisis_inicial: payload.approvedInitialAnalysis.referencia, revision_semantica: { estado: 'completada', hallazgos: [] } }
    };
    fs.writeFileSync(path.join(output, payload.initialAnalysisOnly ? payload.initialAnalysisInstruction ? 'propuesta.json' : 'analisis.json' : 'requisitos.json'), JSON.stringify(result, null, 2));
    return result;
  };
  platform = await startInitialPlatform();
  const inputFile = process.argv.find(a => a.startsWith('--input-file='))?.slice(13);
  if (inputFile) { platform.data.fuente[0].texto_transcrito = fs.readFileSync(inputFile, 'utf8'); platform.data.fuente[0].nombre_archivo = path.basename(inputFile); }
  const caseId = process.argv.find(a => a.startsWith('--case='))?.slice(7);
  if (caseId) { const selected = require('../tests/fixtures/requirements-evaluation.json').find(f => f.id === caseId); if (!selected) throw new Error('Caso inexistente.'); platform.data.fuente[0].texto_transcrito = selected.input; platform.data.fuente[0].nombre_archivo = `${caseId}.txt`; }
  report.caso = caseId || (inputFile ? path.basename(inputFile) : 'consulta-sintetica');
  const frontend = path.resolve(__dirname, '../../icase-frontend');
  const bundle = await build({ entryPoints: [path.join(__dirname, 'fixtures/initial-analysis-browser.jsx')], bundle: true, write: false, format: 'iife', platform: 'browser', absWorkingDir: frontend, nodePaths: [path.join(frontend, 'node_modules')], alias: { react: path.join(frontend, 'node_modules/react'), 'react-dom': path.join(frontend, 'node_modules/react-dom') }, define: { 'process.env.NODE_ENV': '"production"', 'import.meta.env': JSON.stringify({ DEV: true }) } });
  const styles = fs.readdirSync(path.join(frontend, 'dist/assets')).filter(f => f.endsWith('.css')).map(f => fs.readFileSync(path.join(frontend, 'dist/assets', f), 'utf8')).join('\n');
  server = http.createServer(async (req, res) => {
    if (req.url === '/bundle.js') { res.setHeader('Content-Type', 'application/javascript'); return res.end(bundle.outputFiles[0].contents); }
    if (req.url === '/app.css') { res.setHeader('Content-Type', 'text/css'); return res.end(styles); }
    if (req.url === '/fixture') {
      const saved = platform.data.proyecto[0], requirements = platform.data.requerimiento.filter(r => r.proyecto_id === ids.projectA);
      res.setHeader('Content-Type', 'application/json'); return res.end(JSON.stringify({ token: token(ids.userA), project: { id: ids.projectA, backendId: ids.projectA, name: saved.nombre, analysisFlowVersion: 2, currentPhase: requirements.length ? 1 : 0, isProcessed: Boolean(requirements.length), isAnalysisApproved: false, requirementAudit: saved.auditoria_requisitos, sources: [ { id: ids.sourceA, name: platform.data.fuente[0].nombre_archivo, type: 'texto', contentSnippet: platform.data.fuente[0].texto_transcrito, uploaded: true } ], requirements: { functional: requirements.filter(r => r.tipo === 'RF').map(r => ({ id: r.identificador, name: r.nombre, description: r.descripcion, actors: r.actores })), nonFunctional: [] }, diagrams: {} } }));
    }
    if (req.url.startsWith('/icase-api/')) {
      const chunks = []; for await (const chunk of req) chunks.push(chunk);
      const r = await fetch(platform.base + req.url.slice('/icase-api'.length), { method: req.method, headers: { 'Content-Type': 'application/json', Authorization: req.headers.authorization || '' }, ...(req.method !== 'GET' ? { body: Buffer.concat(chunks) } : {}) });
      res.statusCode = r.status; res.setHeader('Content-Type', 'application/json'); return res.end(await r.text());
    }
    res.setHeader('Content-Type', 'text/html'); res.end('<!doctype html><html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/app.css"></head><body><div id="root"></div><script src="/bundle.js"></script></body></html>');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  browser = await require('@playwright/test').chromium.launch({ headless: true });
  page = await browser.newPage({ viewport: { width: 1440, height: 1000 } }); page.setDefaultTimeout(real ? 360000 : 25000);
  const waitHeading = async name => {
    const deadline = Date.now() + (real ? 330000 : 25000);
    while (Date.now() < deadline) {
      if (await page.getByRole('heading', { name, exact: true }).isVisible()) return;
      const job = await platform.jobs.requirementsLatest(ids.projectA);
      if (job && ['fallido', 'esperando_proveedor', 'interrumpido'].includes(job.estado)) throw new Error(`Trabajo ${job.operacion_requisitos}: ${job.estado}. ${job.mensaje}`);
      await new Promise(r => setTimeout(r, 250));
    }
    throw new Error(`No apareció la pantalla: ${name}`);
  };
  report.errores_js = []; page.on('pageerror', error => report.errores_js.push(error.message));
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page.getByRole('button', { name: /Generar|Procesar|Analizar/ }).last().click();
  await waitHeading('Comprender el proyecto antes de redactar requisitos');
  if (!real) {
    await page.locator('.initial-analysis').first().evaluate(element => { element.scrollTop = 280; });
    await page.getByRole('button', { name: 'Mostrar avance', exact: true }).waitFor();
    await page.waitForTimeout(260);
    await page.locator('.initial-analysis').first().evaluate(element => { element.scrollTop = 0; });
    await page.getByRole('button', { name: 'Mostrar avance', exact: true }).waitFor({ state: 'hidden' });
    report.pruebas.push('El seguimiento se oculta al bajar y reaparece al volver arriba.');
  }
  const initialState = await (await fetch(platform.base + `/proyectos/${ids.projectA}/analisis-inicial`, { headers: { Authorization: `Bearer ${token(ids.userA)}` } })).json();
  report.control_inicial = initialState.borrador?.contenido?.control_aprobacion;
  if (report.control_inicial?.bloqueado) throw new Error(`La primera propuesta requiere revisión: ${report.control_inicial.errores.join('; ')}`);
  if (platform.data.requerimiento.length) throw new Error('La extracción creó requisitos.');
  report.pruebas.push('Extracción desde fuentes abre el análisis inicial sin redactar requisitos.');
  if (!real) {
    await page.getByRole('button', { name: 'Añadir información', exact: true }).click();
    await page.getByRole('dialog', { name: 'Añadir información al proyecto', exact: true }).waitFor();
    if (await page.getByLabel('Corrección puntual con IA', { exact: true }).count()) throw new Error('El formulario de información mezcla acciones de IA.');
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Añadir necesidad', exact: true }).click();
    await page.getByRole('dialog').waitFor();
    await page.getByRole('button', { name: 'Cancelar', exact: true }).click();
    const contentWithQuestion = structuredClone(initialState.borrador.contenido);
    contentWithQuestion.inventario.push({ id: 'N-02', tipo: 'pregunta', necesidad: '¿Qué filtros deben ofrecerse?', estado: 'pendiente', evidencia: 'El operador consulta expedientes.' });
    contentWithQuestion.necesidades_pendientes = [{ id: 'N-04', estado_validacion: 'pendiente', elemento: { id: 'N-04', tipo: 'RF', objetivo_id: 'O-04', necesidad: 'Consultar información del expediente', estado: 'confirmado', evidencias: [{ texto: 'Cita por corregir', fuente: 'a.txt' }] } }];
    const addedQuestion = await fetch(platform.base + `/proyectos/${ids.projectA}/analisis-inicial`, { method: 'PATCH', headers: { Authorization: `Bearer ${token(ids.userA)}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ accion: 'guardar', version_esperada: initialState.borrador.id, contenido: contentWithQuestion, justificacion: 'Preparar prueba de respuesta explícita' }) });
    if (!addedQuestion.ok) throw new Error('No se pudo preparar la pregunta de prueba.');
    await page.reload();
    await page.getByRole('button', { name: 'Corregir N-04', exact: true }).click();
    await page.getByLabel('Cita literal', { exact: true }).fill('El operador consulta expedientes.');
    await page.getByLabel('Justificación de los cambios', { exact: true }).fill('Corregir la cita desde el diagnóstico');
    await page.getByRole('button', { name: 'Guardar elemento', exact: true }).click();
    await page.getByRole('dialog').waitFor({ state: 'hidden' });
    if (await page.getByRole('button', { name: 'Corregir N-04', exact: true }).count()) throw new Error('El diagnóstico corregido sigue pendiente.');
    report.pruebas.push('Diagnóstico abre la corrección del elemento pendiente y se resuelve tras validar su evidencia.');
    await page.locator('summary').filter({ hasText: 'Preguntas y aclaraciones' }).click();
    await page.getByRole('button', { name: 'Responder pregunta', exact: true }).click();
    const answerDialog = page.getByRole('dialog', { name: 'Responder pregunta N-02', exact: true });
    await answerDialog.getByLabel('Respuesta acordada', { exact: true }).fill('La consulta permite filtrar por estado del expediente.');
    await answerDialog.getByRole('button', { name: 'Proponer cómo incorporar la respuesta', exact: true }).click();
    await answerDialog.getByLabel('Contenido del elemento 1', { exact: true }).waitFor();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: path.join(output, 'respuesta-propuesta-mobile.png') });
    if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)) throw new Error('Desbordamiento horizontal en el modal de respuesta.');
    await page.keyboard.press('Tab');
    if (!await page.evaluate(() => Boolean(document.activeElement.closest('dialog')))) throw new Error('El foco salió del modal de respuesta.');
    await page.setViewportSize({ width: 1440, height: 1000 });
    await answerDialog.getByRole('checkbox', { name: /Confirmo que esta respuesta/ }).check();
    await answerDialog.getByRole('button', { name: 'Guardar respuesta y resolver duda', exact: true }).click();
    await answerDialog.waitFor({ state: 'hidden' });
    await page.getByText('Respondida', { exact: true }).waitFor();
    report.pruebas.push('Responder pregunta guarda el insumo explícito y su decisión vinculada sin llamadas de IA.');
    await page.getByRole('button', { name: 'Revisar calidad del análisis', exact: true }).click();
    await page.getByRole('button', { name: 'Aplicar propuesta a un nuevo borrador', exact: true }).waitFor();
    await page.getByRole('button', { name: 'Aplicar propuesta a un nuevo borrador', exact: true }).click();
    await page.getByRole('button', { name: 'Aplicar propuesta a un nuevo borrador', exact: true }).waitFor({ state: 'hidden' });
    report.pruebas.push('La revisión de calidad genera propuesta sin otra extracción y se aplica solo tras confirmación.');
    await page.getByRole('button', { name: 'Editar contexto y alcance', exact: true }).click();
    await page.getByRole('dialog', { name: 'Editar contexto, problema, objetivos y alcance', exact: true }).waitFor();
    await page.keyboard.press('Escape');
    await page.getByRole('dialog').waitFor({ state: 'hidden' });
    await page.locator('summary').filter({ hasText: 'Actores del sistema' }).click();
    await page.getByRole('button', { name: 'Revisar actor', exact: true }).first().click();
    await page.getByRole('dialog', { name: /Revisar actor:/ }).waitFor();
    await page.getByRole('button', { name: 'Cerrar formulario', exact: true }).click();
    await page.getByRole('dialog').waitFor({ state: 'hidden' });
    await page.locator('summary').filter({ hasText: 'Necesidades funcionales' }).click();
    await page.getByRole('button', { name: 'Separar otro resultado', exact: true }).first().click();
    await page.getByRole('region', { name: 'Separar resultado de N-01', exact: true }).waitFor();
    if (!await page.getByLabel('Contenido', { exact: true }).evaluate(el => el === document.activeElement && el.getBoundingClientRect().top >= 0 && el.getBoundingClientRect().top < innerHeight)) throw new Error('Separar no lleva al formulario visible.');
    await page.getByRole('button', { name: 'Cancelar', exact: true }).click();
    await page.getByRole('button', { name: 'Editar o reclasificar', exact: true }).first().click();
    if (!await page.getByLabel('Contenido', { exact: true }).evaluate(el => el === document.activeElement && el.getBoundingClientRect().top >= 0 && el.getBoundingClientRect().top < innerHeight)) throw new Error('Editar no lleva al formulario visible.');
    await page.getByLabel('Contenido', { exact: true }).fill('Consultar expedientes por el operador');
    await page.getByLabel('Justificación de los cambios', { exact: true }).fill('Aclarar quién consulta sin añadir obligaciones');
    await page.getByRole('button', { name: 'Guardar elemento', exact: true }).click();
    await page.getByRole('button', { name: 'Guardar elemento', exact: true }).waitFor({ state: 'hidden' });
    await page.getByText('Consultar expedientes por el operador', { exact: false }).first().waitFor();
    await page.getByRole('button', { name: 'Solicitar corrección con IA', exact: true }).click();
    await page.getByLabel('Corrección puntual con IA', { exact: true }).fill('Precisar el resultado de N-01 sin añadir funciones');
    await page.getByLabel(/IDs a corregir/).fill('N-01');
    await page.getByRole('button', { name: 'Solicitar propuesta sin aplicar', exact: true }).click();
    await page.getByText('Comparación de propuesta IA · requiere revisión humana', { exact: true }).waitFor();
    const unchanged = await platform.versions.get(platform.data.proyecto[0].analisis_inicial_borrador_id);
    if (unchanged.contenido.inventario[0].necesidad !== 'Consultar expedientes por el operador') throw new Error('La propuesta se aplicó sin confirmación.');
    await page.getByRole('button', { name: 'Aplicar propuesta a un nuevo borrador', exact: true }).click();
    await page.getByRole('button', { name: 'Aplicar propuesta a un nuevo borrador', exact: true }).waitFor({ state: 'hidden' });
    report.pruebas.push('Edición manual versionada y propuesta IA revisada antes de aplicar; los requisitos siguen sin generarse.');
  }
  await page.screenshot({ path: path.join(output, 'analisis-desktop.png'), fullPage: true });
  await page.reload(); await page.getByRole('heading', { name: 'Comprender el proyecto antes de redactar requisitos' }).waitFor();
  if (report.llamadas.extraccion !== 1) throw new Error('Recargar repitió la extracción.');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: path.join(output, 'analisis-mobile.png') });
  if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)) throw new Error('Desbordamiento horizontal móvil.');
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole('checkbox', { name: /Revisé las evidencias/ }).check();
  await page.getByRole('button', { name: 'Aprobar análisis y generar requisitos', exact: true }).click();
  await waitHeading('Especificación de Requerimientos del Sistema');
  if (report.llamadas.extraccion !== 1 || report.llamadas.redaccion !== 1) throw new Error('Se repitió extracción o redacción.');
  if (!platform.data.proyecto[0].analisis_inicial_aprobado_id) throw new Error('No persistió aprobación inicial.');
  report.pruebas.push('Aprobar genera requisitos desde la versión aprobada; una extracción y una redacción.');
  const total = JSON.stringify(report.llamadas);
  if (await page.getByRole('button', { name: 'Mostrar avance', exact: true }).isVisible()) await page.getByRole('button', { name: 'Mostrar avance', exact: true }).click();
  await page.getByRole('button', { name: 'Análisis inicial', exact: true }).click();
  await page.getByRole('heading', { name: 'Comprender el proyecto antes de redactar requisitos' }).waitFor();
  if (await page.getByRole('button', { name: 'Guardar elemento', exact: true }).count()) throw new Error('El análisis aprobado es editable.');
  await page.getByRole('navigation', { name: 'Subfases del análisis' }).getByRole('button', { name: 'Requisitos', exact: true }).click();
  if (JSON.stringify(report.llamadas) !== total) throw new Error('La navegación consumió IA.');
  report.pruebas.push('Navegación de consulta sin regenerar; análisis aprobado de solo lectura.');
  await page.screenshot({ path: path.join(output, 'requisitos.png'), fullPage: true });
  if (report.errores_js.length) throw new Error('Errores JavaScript.');
  report.estado = 'correcto';
  report.calidad_semantica = real ? 'Requiere revisión humana del análisis y los requisitos; el éxito de navegación no acredita exhaustividad.' : 'No evaluada: respuestas de IA simuladas.';
})().catch(async error => { report.estado = 'fallido'; report.error = String(error.message).replace(/https?:\/\/\S+/g, '[URL]'); if (page) { report.pantalla = await page.locator('body').innerText().catch(() => ''); await page.screenshot({ path: path.join(output, 'fallo.png') }).catch(() => {}); } process.exitCode = 1; }).finally(async () => {
  report.trabajos = platform?.jobs.rows.map(job => ({ operacion: job.operacion_requisitos, estado: job.estado, error: job.error, progreso: job.progreso_requisitos }));
  if (realAi) report.intentos_proveedor = realAi.requirementsRouter.trace;
  AI.prototype.procesar = original; await browser?.close(); if (server) await new Promise(r => server.close(r)); await platform?.close(); report.fin = new Date().toISOString(); fs.writeFileSync(path.join(output, 'resultado.json'), JSON.stringify(report, null, 2)); console.log(`[Análisis inicial UI] ${report.estado}: ${output}`);
});
