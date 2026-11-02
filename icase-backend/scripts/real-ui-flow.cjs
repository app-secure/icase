// Ejecutar en la imagen de Playwright con /evidence montado; nunca imprime tokens.
const fs = require('node:fs');
const { chromium } = require('/app/tests/node_modules/@playwright/test');
const root = '/evidence';
const input = `Hola equipo, necesitamos digitalizar el restaurante. Actualmente tomamos pedidos en papel y cocina no se entera a tiempo cuando se agota un plato.
Queremos una aplicación móvil para clientes con menú digital, reserva de mesa o silla, compra de paquetes semanales prepagados y puntos por sus compras. Utilicen React Native para iOS y Android.
En las pantallas web, cocina debe ver pedidos en tiempo real y marcar platos agotados. Los meseros deben ver sus mesas asignadas, tomar pedidos y escanear el QR del cliente para validar su reserva. Caja debe cobrar en efectivo o transferencia y validar planes prepagados. El administrador debe consultar reportes de ventas y cambiar precios del menú.
Utilicen NestJS, PostgreSQL y Socket.IO. Las pantallas web deben usar React y Tailwind.`;
const mockupsOnly = process.argv.includes('--mockups');
const retryFirst = process.argv.includes('--retry-first');
const resume = process.argv.includes('--resume') || mockupsOnly || retryFirst;
const report = resume ? JSON.parse(fs.readFileSync(root + '/report.json', 'utf8')) : { inicio: new Date().toISOString(), escenario: 'Restaurante: primer intento, sin correcciones', pasos: [], erroresInterfaz: [], respuestasFallidas: [], completado: false };
if (resume) { report.incidenciaAutomatizacion = report.error; delete report.error; report.estado = 'en_ejecucion'; }
const save = () => fs.writeFileSync(root + '/report.json', JSON.stringify(report, null, 2));
(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1600, height: 1000 }, acceptDownloads: true, ...(resume ? { storageState: root + '/browser-state.private.json' } : {}) });
  const page = await context.newPage();
  await context.route(/^http:\/\/localhost:(5000|18080)\//, async route => {
    const url = new URL(route.request().url());
    url.hostname = 'host.docker.internal';
    url.port = url.port === '5000' ? (process.env.TEST_API_PORT || '5000') : (process.env.TEST_WEB_PORT || '18080');
    const response = await route.fetch({ url: url.toString(), timeout: 600000 });
    await route.fulfill({ response });
  });
  page.on('pageerror', error => report.erroresInterfaz.push(error.message));
  page.on('response', async response => {
    if (response.status() >= 400 && response.url().includes(':5000/')) report.respuestasFallidas.push({ url: response.url().replace(/\?.*/, ''), status: response.status(), cuerpo: (await response.text().catch(() => '')).slice(0, 1000) });
  });
  page.on('dialog', dialog => dialog.accept());
  const heartbeat = setInterval(() => page.locator('body').innerText().then(text => fs.writeFileSync(root + '/pantalla-actual.txt', text)).catch(() => {}), 5000);
  async function checkpoint(name) {
    await page.screenshot({ path: root + '/' + String(report.pasos.length).padStart(2, '0') + '-' + name + '.png', fullPage: true });
    report.pasos.push({ paso: name, fecha: new Date().toISOString() }); save(); console.log('[UI] ' + name);
  }
  try {
    await page.goto('http://localhost:18080/', { waitUntil: 'networkidle' });
    if (!resume) {
    await page.getByRole('button', { name: 'Regístrate gratis' }).click();
    await page.getByPlaceholder('Nombre', { exact: true }).fill('Prueba');
    await page.getByPlaceholder('Apellido', { exact: true }).fill('Automatizada');
    await page.getByPlaceholder('Número de celular').fill('0999999999');
    await page.getByPlaceholder('Correo electrónico').fill('prueba-' + Date.now() + '@example.test');
    await page.getByPlaceholder('Contraseña', { exact: true }).fill('PruebaLocal-' + require('node:crypto').randomUUID());
    await page.locator('button[type=submit]').click();
    await page.getByText('Crear Proyecto', { exact: true }).first().waitFor({ timeout: 30000 });
    await checkpoint('registro');
    await page.getByText('Crear Proyecto', { exact: true }).first().click();
    await page.locator('input[type=file]').first().setInputFiles({ name: 'entrevista-restaurante.txt', mimeType: 'text/plain', buffer: Buffer.from(input) });
    fs.writeFileSync(root + '/insumo.txt', input);
    const saveContext = page.getByRole('button', { name: 'Guardar contexto', exact: true });
    if (await saveContext.isVisible().catch(() => false)) await saveContext.click();
    await page.getByRole('button', { name: 'Procesar', exact: true }).waitFor({ timeout: 60000 });
    const providers = page.locator('select').filter({ has: page.locator('option[value=gemini]') });
    if (await providers.count()) await providers.first().selectOption('gemini');
    await checkpoint('fuente-cargada');
    await page.getByRole('button', { name: 'Procesar', exact: true }).click();
    await page.getByRole('button', { name: 'Aprobar y generar diagramas', exact: true }).waitFor({ timeout: 600000 });
    await checkpoint('requisitos-primer-intento');
    await page.getByRole('button', { name: 'Aprobar y generar diagramas', exact: true }).click();
    } else {
      await page.getByText('GourmetFlow', { exact: true }).first().click({ timeout: 30000 });
      if (!mockupsOnly && !retryFirst) await page.getByRole('button', { name: 'Clases de Dominio', exact: true }).click();
    }
    const labels = ['Casos de Uso', 'Clases de Dominio', 'Arquitectura de Software', 'Arquitectura del Sistema', 'Clases de Diseño', 'Árbol de Navegación'];
    for (let i = mockupsOnly ? labels.length : retryFirst ? 0 : resume ? 1 : 0; i < labels.length; i++) {
      const generate = page.getByRole('button', { name: 'Generar ' + labels[i], exact: true });
      if (i > 0 || retryFirst) await generate.click({ timeout: 60000 });
      const approve = page.getByRole('button', { name: 'Aprobar ' + labels[i], exact: true });
      await Promise.race([
        approve.waitFor({ timeout: 600000 }),
        page.getByText(/^La generación del diagrama falló/).waitFor({ timeout: 600000 })
          .then(() => { throw new Error('El producto informó fallo al generar ' + labels[i]); })
      ]);
      const label = await approve.innerText();
      await checkpoint('diagrama-' + i);
      report.pasos[report.pasos.length - 1].boton = label;
      await approve.click();
      await approve.waitFor({ state: 'hidden', timeout: 30000 });
    }
    await checkpoint('mockups');
    await page.getByRole('button', { name: 'Mockups', exact: true }).click();
    if (!mockupsOnly) {
      await page.getByRole('button', { name: 'Solo faltantes o inválidas', exact: true }).click();
      await checkpoint('mockups-seleccionados');
      await page.getByRole('button', { name: /^Generar seleccionadas/ }).click();
    }
    await page.getByRole('button', { name: /^Generar seleccionadas/ }).waitFor();
    await page.waitForFunction(() => !Array.from(document.querySelectorAll('span')).some(element => element.textContent.trim() === 'faltante'), { }, { timeout: 600000 });
    await checkpoint('mockups-generados');
    const approveMockups = page.getByRole('button', { name: 'Aprobar Mockups y Pasar a Documento', exact: true });
    if (process.env.STOP_AFTER_MOCKUPS === '1') {
      const [response] = await Promise.all([
        page.waitForResponse(r => r.request().method() === 'POST' && /aprobar/.test(r.url()), { timeout: 60000 }),
        approveMockups.click({ timeout: 60000 })
      ]);
      report.aprobacion_mockups = { status: response.status(), cuerpo: (await response.text()).slice(0, 12000) };
      report.estado = response.ok() ? 'mockups-aprobados' : 'mockups-rechazados';
      await checkpoint(report.estado);
      return;
    }
    await approveMockups.click({ timeout: 600000 });
    await page.getByRole('button', { name: 'Modo de un clic', exact: true }).waitFor({ timeout: 30000 });
    await checkpoint('planificacion-codigo');
    await page.getByRole('button', { name: 'Modo de un clic', exact: true }).click();
    const backend = page.getByRole('button', { name: 'Generar backend', exact: true });
    await backend.waitFor({ timeout: 180000 });
    await checkpoint('decisiones-primeras-propuestas');
    await backend.click();
    await page.getByRole('button', { name: 'Aprobar backend', exact: true }).waitFor({ timeout: 60000 });
    await checkpoint('backend-generado');
    await page.getByRole('button', { name: 'Verificar artefacto', exact: true }).first().click();
    await page.waitForFunction(() => Array.from(document.querySelectorAll('span')).some(el => /^Verificación aislada \(Docker\): (apta|fallida|error|no_apta|no_apto)/.test(el.textContent)), {}, { timeout: 900000 });
    await checkpoint('backend-verificado');
    const state = await page.locator('body').innerText();
    if (!state.includes('Verificación aislada (Docker): apta')) throw new Error('El backend no superó la verificación aislada; revisar pantalla-actual.txt y evidencia.');
    await page.getByRole('button', { name: 'Aprobar backend', exact: true }).click();
    report.estado = 'backend-aprobado-continuacion-pendiente';
  } catch (error) {
    report.estado = 'bloqueado'; report.error = error.message;
    await page.screenshot({ path: root + '/bloqueo.png', fullPage: true }).catch(() => {});
    console.log('[Bloqueo] ' + error.message.slice(0, 500));
  } finally {
    clearInterval(heartbeat);
    fs.writeFileSync(root + '/pantalla-final.txt', await page.locator('body').innerText().catch(() => ''));
    await context.storageState({ path: root + '/browser-state.private.json' });
    report.fin = new Date().toISOString(); save(); await browser.close();
  }
})();
