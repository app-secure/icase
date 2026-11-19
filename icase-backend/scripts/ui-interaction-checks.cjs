// Chromium real: montar este archivo en /checks.cjs y evidencias en /evidence.
const fs = require('node:fs');
const assert = require('node:assert/strict');
const { chromium } = require('/app/tests/node_modules/@playwright/test');
const credentials = JSON.parse(fs.readFileSync('/evidence/login.private.json'));
const report = { inicio: new Date().toISOString(), alcance: 'Interacción sobre el fixture aprobado, sin corregir ni regenerar artefactos', pruebas: [], erroresJS: [], llamadasGeneracion: [] };
const save = () => fs.writeFileSync('/evidence/report.json', JSON.stringify(report, null, 2));
(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1600, height: 1000 }, acceptDownloads: true });
  const page = await context.newPage();
  page.setDefaultTimeout(20000);
  await context.route(/^http:\/\/localhost:(5000|18080)\//, async route => {
    try { await route.fulfill({ response: await route.fetch({ url: route.request().url().replace('localhost', 'host.docker.internal'), timeout: 600000 }) }); }
    catch { await route.abort().catch(() => {}); } // Una navegación puede cancelar recursos de la página anterior.
  });
  page.on('pageerror', error => report.erroresJS.push(error.message));
  page.on('request', request => {
    if (request.method() === 'POST' && /\/procesar-ia|\/trabajos-diagramas|\/generar/.test(request.url())) report.llamadasGeneracion.push(request.url());
  });
  async function check(name, run) {
    try { const result = await run(); report.pruebas.push({ nombre: name, estado: 'correcto', detalle: result }); }
    catch (error) { report.pruebas.push({ nombre: name, estado: 'fallido', error: error.message }); }
    await page.screenshot({ path: '/evidence/' + String(report.pruebas.length).padStart(2, '0') + '.png', fullPage: true }).catch(() => {});
    save(); console.log('[UI] ' + report.pruebas.at(-1).estado + ': ' + name);
  }
  async function openProject() {
    const back = page.getByTitle(/^Volver a (lista de )?proyectos$/);
    if (await back.isVisible()) await back.click();
    else await page.goto('http://localhost:18080/');
    await page.getByText(credentials.proyecto, { exact: true }).first().click();
    await page.waitForTimeout(2500);
  }
  async function modeling() {
    await openProject();
    const back = page.getByRole('button', { name: '← Diagramas y mockups', exact: true });
    if (await back.isVisible()) await back.click();
    await page.getByRole('button', { name: 'Casos de Uso', exact: true }).waitFor();
  }
  async function coding() {
    await modeling();
    await page.getByRole('button', { name: 'Mockups', exact: true }).click();
    await page.getByRole('button', { name: 'Aprobar Mockups y Pasar a Documento', exact: true }).click();
    await page.getByRole('button', { name: 'Ver documento actual', exact: true }).waitFor();
  }
  async function snapshot() {
    return page.evaluate(async name => {
      const r = await fetch('http://localhost:5000/proyectos', { headers: { Authorization: 'Bearer ' + localStorage.getItem('icase_token') } });
      if (!r.ok) throw new Error('No se pudo leer el estado base');
      const p = (await r.json()).find(p => p.nombre === name);
      return JSON.stringify({ requisitos: p.requerimientos.map(r => [r.id, r.descripcion, r.aprobado]), diagramas: p.diagramas.map(d => [d.id, d.tipo, d.version, d.estado, d.codigo_plantuml]), mockups: p.diseno.mockups.map(m => [m.nombre_pantalla, m.version, m.preview_code]) });
    }, credentials.proyecto);
  }
  let initial;
  try {
    await check('Inicio de sesión por formulario', async () => {
      await page.goto('http://localhost:18080/');
      await page.getByPlaceholder('Correo electrónico').fill(credentials.correo);
      await page.getByPlaceholder('Contraseña', { exact: true }).fill(credentials.password);
      await page.locator('button[type=submit]').click();
      await page.getByText(credentials.proyecto, { exact: true }).first().waitFor();
      initial = await snapshot();
    });
    await check('Sidebar de requisitos sin subir ni reprocesar fuentes', async () => {
      await modeling();
      assert(await page.getByText('Requisitos aprobados', { exact: true }).isVisible());
      assert.equal(await page.getByRole('button', { name: /^(Reprocesar|Subir Insumos)$/ }).count(), 0);
    });
    for (const label of ['Casos de Uso', 'Clases de Dominio', 'Arquitectura de Software', 'Arquitectura del Sistema', 'Clases de Diseño', 'Árbol de Navegación']) {
      await check('Pestaña, código y gráfico: ' + label, async () => {
        await page.getByRole('button', { name: label, exact: true }).click();
        await page.getByRole('button', { name: 'Código', exact: true }).click();
        assert.match(await page.locator('textarea').first().inputValue(), /@start(?:uml|wbs)/);
        await page.getByRole('button', { name: 'Historial', exact: true }).click();
        assert(await page.getByText(/Versión actual:/).isVisible());
        await page.getByRole('button', { name: 'Gráfico', exact: true }).click();
        await page.waitForFunction(() => Array.from(document.querySelectorAll('svg')).some(svg => svg.querySelector('text') && svg.getBoundingClientRect().width > 100) || Array.from(document.images).some(i => /Diagrama|Clases|Arquitectura|Árbol/i.test(i.alt) && i.complete && i.naturalWidth > 0), {}, { timeout: 30000 });
        if (await page.getByTitle('Acercar (+15%)').isVisible()) {
          await page.getByTitle('Acercar (+15%)').click();
          await page.getByTitle('Restablecer tamaño real (100%)').click();
        }
      });
    }
    await check('Volver a requisitos sin regeneración ni pérdida de versiones', async () => {
      await page.getByRole('button', { name: /Volver a Requerimientos/ }).click();
      await page.getByRole('heading', { name: 'Especificación de Requerimientos del Sistema', exact: true }).waitFor();
      assert.equal(await snapshot(), initial);
      assert.equal(report.llamadasGeneracion.length, 0);
    });
    await check('Mockup: vista, código y descarga HTML', async () => {
      await modeling();
      await page.getByRole('button', { name: 'Mockups', exact: true }).click();
      const frame = page.frameLocator('iframe').first();
      await frame.locator('body').waitFor();
      assert((await frame.locator('body').innerText()).trim().length > 20);
      await page.getByRole('button', { name: 'Código', exact: true }).click();
      assert.match(await page.locator('textarea').first().inputValue(), /^<!doctype html/i);
      await page.getByRole('button', { name: 'Diseño', exact: true }).click();
      await page.getByRole('button', { name: 'Detalles', exact: true }).click();
      const download = page.waitForEvent('download');
      await page.getByTitle('Descargar HTML', { exact: true }).click();
      const file = await download; await file.saveAs('/evidence/mockup.html');
      const html = fs.readFileSync('/evidence/mockup.html', 'utf8');
      assert.match(html, /<\/html>\s*$/i); assert(!html.startsWith('<<'));
      return { archivo: file.suggestedFilename(), bytes: Buffer.byteLength(html) };
    });
    await check('Aprobación y navegación a codificación con decisiones persistidas', async () => {
      await coding();
      assert(await page.getByRole('button', { name: 'Ver documento actual', exact: true }).isVisible());
      assert((await page.locator('body').innerText()).includes('aprobadas'));
    });
    await check('Descarga ZIP bloqueada sin confirmar entrega parcial', async () => {
      const response = page.waitForResponse(r => r.url().includes('/paquete/generar') && r.request().method() === 'POST');
      await page.getByRole('button', { name: 'Generar paquete final', exact: true }).click();
      const r = await response; const data = await r.json();
      assert(!r.ok()); assert.match(data.error, /Confirma la entrega parcial/);
      assert.equal(await page.getByRole('button', { name: 'Descargar ZIP', exact: true }).count(), 0);
      return { status: r.status(), motivo: data.error, descargaPositiva: 'No comprobada: cobertura no confirmada' };
    });
    await check('Documento y descarga PDF real', async () => {
      await page.getByRole('button', { name: 'Ver documento actual', exact: true }).click();
      await page.getByRole('button', { name: 'Previsualizar documento en PDF', exact: true }).click();
      const button = page.getByRole('button', { name: 'Descargar PDF', exact: true });
      await button.waitFor({ timeout: 240000 });
      const download = page.waitForEvent('download'); await button.click();
      const file = await download; await file.saveAs('/evidence/documento.pdf');
      const bytes = fs.readFileSync('/evidence/documento.pdf');
      assert.equal(bytes.subarray(0, 5).toString(), '%PDF-'); assert(bytes.length > 1000);
      await page.getByTitle('Cerrar visor PDF', { exact: true }).click();
      return { archivo: file.suggestedFilename(), bytes: bytes.length };
    });
    await check('Persistencia tras recarga, sin regeneración involuntaria', async () => {
      await page.reload(); await page.waitForTimeout(2500);
      assert.equal(await snapshot(), initial);
      assert.equal(report.llamadasGeneracion.filter(url => !url.includes('/paquete/generar')).length, 0);
    });
  } finally {
    report.fin = new Date().toISOString();
    report.correctas = report.pruebas.filter(t => t.estado === 'correcto').length;
    report.fallidas = report.pruebas.filter(t => t.estado === 'fallido').length;
    report.noCubierto = ['Descarga ZIP positiva y arranque: requiere confirmar alcance parcial o implementar faltantes', 'Restauración de versiones históricas: no se crean ediciones artificiales', 'Conformidad semántica completa y todas las resoluciones de pantalla'];
    save(); await context.close(); await browser.close();
  }
})().catch(error => { report.errorFatal = error.message; save(); console.error(error.message); process.exitCode = 1; });
