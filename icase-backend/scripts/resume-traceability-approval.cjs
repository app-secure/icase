const fs = require('node:fs');
const path = require('node:path');
(async () => {
  if (process.argv.includes('--prepare')) {
    const mongoose = require('mongoose');
    try {
      await mongoose.connect('mongodb://127.0.0.1:27028/icase_traceability_replay_20261101_v2');
      const db = mongoose.connection.db;
      const project = await db.collection('proyectos').findOne({});
      const user = await db.collection('usuarios').findOne({ _id: project.usuario_id });
      if (!user?.correo.endsWith('@example.test')) throw new Error('La cuenta no es sintética');
      const password = require('node:crypto').randomUUID();
      await db.collection('usuarios').updateOne({ _id: user._id }, { $set: { password: await require('bcryptjs').hash(password, 10) } });
      fs.writeFileSync(path.resolve(__dirname, '../verification-results/traceability-real-replay-v2/login.private.json'), JSON.stringify({ correo: user.correo, password, proyecto: project.nombre }));
      console.log('Acceso sintético renovado; HTML y artefactos intactos.');
    } finally { await mongoose.disconnect(); }
    return;
  }
  const { chromium } = require('/app/tests/node_modules/@playwright/test');
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  try {
    await page.route(/^http:\/\/localhost:(5000|18080)\//, async route => {
      const url = new URL(route.request().url()); url.hostname = 'host.docker.internal'; url.port = url.port === '5000' ? '18094' : '18092';
      try { await route.fulfill({ response: await route.fetch({ url: url.toString(), timeout: 600000 }) }); }
      catch { await route.abort().catch(() => {}); }
    });
    const credentials = JSON.parse(fs.readFileSync('/evidence/login.private.json'));
    await page.goto('http://localhost:18080/');
    await page.getByPlaceholder('Correo electrónico').fill(credentials.correo);
    await page.getByPlaceholder('Contraseña', { exact: true }).fill(credentials.password);
    await page.locator('button[type=submit]').click();
    await page.getByText(credentials.proyecto, { exact: true }).first().click({ timeout: 30000 });
    if (process.env.VERIFY_APPROVED_ONLY === '1') {
      await page.getByText(/Decisiones técnicas de/).waitFor({ timeout: 30000 });
      await page.screenshot({ path: '/evidence/planificacion-confirmada.png', fullPage: true });
      console.log('Proyecto aprobado: planificación de código confirmada sin reaprobación.');
      return;
    }
    await page.getByRole('button', { name: 'Mockups', exact: true }).click();
    const button = page.getByRole('button', { name: 'Aprobar Mockups y Pasar a Documento', exact: true });
    await button.waitFor();
    await page.screenshot({ path: '/evidence/antes-aprobar-corregido.png', fullPage: true });
    const [response] = await Promise.all([
      page.waitForResponse(r => r.request().method() === 'POST' && /aprobar/.test(r.url()), { timeout: 30000 }), button.click()
    ]);
    const result = { fecha: new Date().toISOString(), status: response.status(), respuesta: await response.json(), htmlSinRegenerar: true };
    fs.writeFileSync('/evidence/aprobacion-corregida.json', JSON.stringify(result, null, 2));
    if (!response.ok()) throw new Error('Aprobación HTTP ' + response.status());
    await page.getByText(/Decisiones técnicas de/).waitFor({ timeout: 30000 });
    await page.screenshot({ path: '/evidence/aprobacion-corregida.png', fullPage: true });
    console.log('Aprobación real HTTP ' + response.status() + '; planificación de código visible.');
  } catch (error) {
    await page.screenshot({ path: '/evidence/continuacion-error.png', fullPage: true });
    fs.writeFileSync('/evidence/continuacion-error.txt', await page.locator('body').innerText());
    throw error;
  } finally { await page.unrouteAll({ behavior: 'ignoreErrors' }); await browser.close(); }
})().catch(e => { console.error(e.message); process.exitCode = 1; });
