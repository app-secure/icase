// Host: node scripts/repeat-mockups-ui.cjs --prepare
// Chromium: node /repeat.cjs (imagen Playwright con /evidence montado).
const fs = require('node:fs');
const path = require('node:path');
if (process.argv.includes('--prepare')) {
  (async () => {
    const mongoose = require('mongoose');
    try {
      await mongoose.connect('mongodb://127.0.0.1:27028/icase_real_ui');
      const db = mongoose.connection.db;
      const previous = require('../verification-results/real-ui/artefactos.json');
      const project = await db.collection('proyectos').findOne({ _id: new mongoose.Types.ObjectId(previous.proyecto.id) });
      if (!project) throw new Error('No existe el fixture de prueba previo');
      const user = await db.collection('usuarios').findOne({ _id: project.usuario_id });
      if (!user?.correo.endsWith('@example.test')) throw new Error('Solo se permite la cuenta sintética de prueba');
      const password = require('node:crypto').randomUUID();
      await db.collection('usuarios').updateOne({ _id: user._id }, { $set: { password: await require('bcryptjs').hash(password, 10) } });
      const directory = path.resolve(__dirname, '../verification-results/mockups-html-v2');
      fs.mkdirSync(directory, { recursive: true });
      fs.writeFileSync(path.join(directory, 'login.private.json'), JSON.stringify({ correo: user.correo, password, proyecto: project.nombre }));
      console.log('Fixture preparado: solo se renovó el acceso de la cuenta sintética; artefactos sin modificar.');
    } finally { await mongoose.disconnect(); }
  })().catch(error => { console.error(error.message); process.exitCode = 1; });
} else {
  (async () => {
    const { chromium } = require('/app/tests/node_modules/@playwright/test');
    const credentials = JSON.parse(fs.readFileSync('/evidence/login.private.json'));
    const resumeCode = process.argv.includes('--resume-code');
    const existingBackend = process.argv.includes('--existing-backend');
    const report = resumeCode ? JSON.parse(fs.readFileSync('/evidence/report.json', 'utf8')) : { inicio: new Date().toISOString(), alcance: 'Repetición de las 12 pantallas sobre los seis diagramas previamente aprobados. Sin correcciones manuales de HTML.', pasos: [] };
    if (resumeCode) { report.incidenciaAutomatizacion = report.error; delete report.error; report.estado = 'en_ejecucion'; }
    const browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
    await page.route(/^http:\/\/localhost:(5000|18080)\//, async route => route.fulfill({ response: await route.fetch({ url: route.request().url().replace('localhost', 'host.docker.internal'), timeout: 600000 }) }));
    async function capture(name) {
      await page.screenshot({ path: '/evidence/' + name + '.png', fullPage: true });
      fs.writeFileSync('/evidence/pantalla-final.txt', await page.locator('body').innerText());
      report.pasos.push(name); fs.writeFileSync('/evidence/report.json', JSON.stringify(report, null, 2)); console.log('[UI] ' + name);
    }
    try {
      await page.goto('http://localhost:18080/');
      await page.getByPlaceholder('Correo electrónico').fill(credentials.correo);
      await page.getByPlaceholder('Contraseña', { exact: true }).fill(credentials.password);
      await page.locator('button[type=submit]').click();
      await page.getByText(credentials.proyecto, { exact: true }).first().click({ timeout: 30000 });
      if (!process.argv.includes('--code')) {
      await page.getByRole('button', { name: 'Mockups', exact: true }).click();
      const boxes = page.locator('input[type=checkbox]');
      const count = await boxes.count(); report.pantallas = count;
      if (!count) throw new Error('No hay pantallas en el árbol');
      for (let i = 0; i < count; i++) await boxes.nth(i).check();
      await capture('pantallas-seleccionadas');
      const response = page.waitForResponse(r => r.request().method() === 'POST' && /mockups/.test(r.url()), { timeout: 60000 });
      await page.getByRole('button', { name: /^Generar seleccionadas/ }).click();
      await response;
      // Esperar el trabajo persistente, no confundir los mockups anteriores con los nuevos.
      await page.waitForFunction(() => document.body.innerText.includes('Generación seleccionada completada') || document.body.innerText.includes('Generación completada'), {}, { timeout: 600000 });
      await capture('mockups-regenerados');
      const approveResponse = page.waitForResponse(r => r.request().method() === 'POST' && r.url().includes('/aprobar-fase'), { timeout: 30000 });
      await page.getByRole('button', { name: 'Aprobar Mockups y Pasar a Documento', exact: true }).click();
      const approval = await approveResponse; report.aprobacion = { status: approval.status(), cuerpo: await approval.json() };
      if (!approval.ok()) throw new Error('Aprobación rechazada: ' + JSON.stringify(report.aprobacion.cuerpo));
      await page.getByRole('button', { name: 'Modo de un clic', exact: true }).waitFor({ timeout: 30000 });
      await capture('planificacion-codigo'); report.estado = 'mockups_aprobados';
      } else {
        report.alcance = 'Continuación del fixture aprobado: primeras decisiones, generación y verificación por interfaz, sin editar artefactos.';
        page.on('dialog', dialog => dialog.accept());
        await page.waitForTimeout(3000);
        const approveMockups = page.getByRole('button', { name: 'Aprobar Mockups y Pasar a Documento', exact: true });
        if (await approveMockups.isVisible()) await approveMockups.click();
        await capture('entrada-codificacion');
        if (!resumeCode && !existingBackend) {
        if (process.argv.includes('--partial')) {
          await page.getByText('Módulos', { exact: true }).click();
          await page.getByLabel('Reconozco que la entrega puede tener funciones pendientes; revisaré su informe antes de aprobarla.').check();
          const save = page.getByRole('button', { name: /^(Guardar propuesta|Guardar nueva versión)$/ });
          await save.click();
          const approve = page.getByRole('button', { name: 'Aprobar decisión', exact: true });
          await approve.waitFor(); await approve.click();
          await approve.waitFor({ state: 'hidden' });
          await capture('entrega-parcial-confirmada');
        } else {
        await page.getByRole('button', { name: 'Modo de un clic', exact: true }).click({ timeout: 120000 });
        await page.getByRole('button', { name: 'Generar backend', exact: true }).waitFor({ timeout: 180000 });
        await capture('decisiones-aprobadas');
        }
        }
        for (const [generate, label] of [['Generar backend', 'backend'], ['Generar frontend', 'frontend'], ['Generar pruebas', 'pruebas'], ['Generar infraestructura', 'infraestructura'], ['Generar pipeline', 'pipeline'], ['Generar paquete final', 'entrega']]) {
          if (resumeCode && ['backend', 'frontend', 'pruebas'].includes(label)) continue;
          if (!(resumeCode && label === 'infraestructura') && !(existingBackend && label === 'backend')) {
          const generationResponse = page.waitForResponse(r => r.request().method() === 'POST' && /\/codificacion\/.*\/generar/.test(r.url()), { timeout: 120000 });
          await page.getByRole('button', { name: new RegExp('^(?:' + generate + '|' + generate.replace(/^Generar/, 'Regenerar') + ')$') }).click({ timeout: 60000 });
          const generation = await generationResponse;
          if (!generation.ok()) throw new Error(label + ': generación rechazada ' + await generation.text());
          }
          const approve = page.getByRole('button', { name: 'Aprobar ' + label, exact: true });
          await approve.waitFor({ timeout: 120000 });
          await capture(label + '-generado');
          const card = approve.locator('..').locator('..');
          let verification;
          if (!(resumeCode && label === 'infraestructura')) {
            const completion = page.waitForResponse(async response => {
              if (!/\/verificar-trabajo\/[a-f0-9]{24}$/.test(response.url()) || !response.ok()) return false;
              const data = await response.json();
              return ['completado', 'fallido'].includes(data.trabajo?.estado);
            }, { timeout: 900000 });
            await card.getByRole('button', { name: 'Verificar artefacto', exact: true }).click();
            const completed = await (await completion).json();
            verification = completed.verificacion?.estado;
            if (!verification) throw new Error(label + ': ' + (completed.trabajo?.error || 'Sin resultado de verificación'));
          } else verification = 'apta_estructuralmente';
          await capture(label + '-verificado');
          const structural = ['infraestructura', 'pipeline'].includes(label) && verification === 'apta_estructuralmente';
          if (verification !== 'apta' && !structural) throw new Error(label + ': ' + verification);
          const approvalResponse = page.waitForResponse(r => r.request().method() === 'POST' && /revision/.test(r.url()), { timeout: 30000 });
          await approve.click();
          const result = await approvalResponse;
          if (!result.ok()) throw new Error(label + ': aprobación rechazada ' + await result.text());
        }
        const download = page.waitForEvent('download');
        await page.getByRole('button', { name: 'Descargar ZIP', exact: true }).click();
        await (await download).saveAs('/evidence/entrega.zip');
        report.estado = 'zip-descargado'; await capture('zip-descargado');
      }
    } catch (error) { report.estado = 'bloqueado'; report.error = error.message; await capture('bloqueo'); }
    finally { report.fin = new Date().toISOString(); fs.writeFileSync('/evidence/report.json', JSON.stringify(report, null, 2)); await browser.close(); }
  })().catch(error => { console.error(error.message); process.exitCode = 1; });
}
