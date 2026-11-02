const fs = require('node:fs');
const { chromium } = require('/app/tests/node_modules/@playwright/test');
(async () => {
  const output = process.env.PDF_EVIDENCE_NAME || 'documento-corregido';
  if (!/^[a-z0-9-]+$/.test(output)) throw new Error('Nombre de evidencia inválido');
  const login = JSON.parse(fs.readFileSync('/evidence/login.private.json', 'utf8'));
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, acceptDownloads: true });
  if (process.env.BLOCK_DIAGRAM_IMAGES === '1') {
    await page.route(/https?:\/\/[^/]*plantuml[^/]*\//i, route => route.abort());
  }
  await page.route(/^http:\/\/localhost:(5000|18080)\//, async route => {
    const url = new URL(route.request().url()); url.hostname = 'host.docker.internal'; url.port = url.port === '5000' ? '18091' : '18092';
    try { await route.fulfill({ response: await route.fetch({ url: url.toString(), timeout: 600000 }) }); } catch { await route.abort().catch(() => {}); }
  });
  try {
    await page.goto('http://localhost:18080/');
    await page.getByPlaceholder('Correo electrónico').fill(login.correo);
    await page.getByPlaceholder('Contraseña', { exact: true }).fill(login.password);
    await page.locator('button[type=submit]').click();
    await page.getByText(login.proyecto, { exact: true }).first().click({ timeout: 30000 });
    await page.waitForTimeout(2500);
    const preview = page.getByRole('button', { name: 'Previsualizar documento en PDF', exact: true });
    let requested = false;
    for (let i = 0; i < 60 && !(await preview.isVisible()); i++) {
      const openDocument = page.getByRole('button', { name: 'Ver documento actual', exact: true });
      if (await openDocument.isVisible()) await openDocument.click();
      else if (!requested && await page.getByRole('button', { name: 'Mockups', exact: true }).isVisible()) {
        await page.getByRole('button', { name: 'Mockups', exact: true }).click();
        await page.getByRole('button', { name: 'Aprobar Mockups y Pasar a Documento', exact: true }).click(); requested = true;
      }
      await page.waitForTimeout(500);
    }
    await preview.waitFor({ timeout: 10000 });
    await page.getByText('8.3 Diagrama de Clases de Diseño', { exact: true }).waitFor();
    await preview.click();
    const downloadButton = page.getByRole('button', { name: 'Descargar PDF', exact: true });
    await downloadButton.waitFor({ timeout: 240000 });
    const pending = page.waitForEvent('download'); await downloadButton.click();
    await (await pending).saveAs('/evidence/' + output + '.pdf');
    await page.screenshot({ path: '/evidence/' + output + '.png' });
    console.log('PDF corregido descargado por interfaz');
  } catch (error) {
    await page.screenshot({ path: '/evidence/pdf-error.png' });
    fs.writeFileSync('/evidence/pdf-error.txt', await page.locator('body').innerText());
    throw error;
  } finally { await browser.close(); }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
