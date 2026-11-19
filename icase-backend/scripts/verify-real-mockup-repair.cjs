const fs = require('node:fs');
const path = require('node:path');
(async () => {
  const directory = path.resolve(__dirname, '../verification-results/mockup-repair-real');
  if (process.argv.includes('--snapshot') || process.argv.includes('--collect')) {
    const mongoose = require('mongoose');
    try {
      await mongoose.connect('mongodb://127.0.0.1:27028/icase_mockup_criteria_repeat_20261101');
      const db = mongoose.connection.db;
      const project = await db.collection('proyectos').findOne({});
      const filter = { proyecto_id: project._id };
      const data = { proyecto: project, requisitos: await db.collection('requerimientos').find(filter).toArray(), diseno: await db.collection('disenos').findOne(filter), trabajos: await db.collection('trabajogeneracions').find(filter).toArray() };
      fs.mkdirSync(directory, { recursive: true });
      const name = process.argv.includes('--snapshot') ? 'antes.json' : 'despues.json';
      if (name === 'antes.json' && fs.existsSync(path.join(directory, name))) throw new Error('Ya existe evidencia previa; no se sobrescribe');
      fs.writeFileSync(path.join(directory, name), JSON.stringify(data, null, 2));
      if (name === 'despues.json') {
        const before = JSON.parse(fs.readFileSync(path.join(directory, 'antes.json')));
        const changed = data.diseno.mockups.filter(m => {
          const previous = before.diseno.mockups.find(p => p.nombre_pantalla === m.nombre_pantalla);
          return m.preview_code !== previous?.preview_code || m.version !== previous?.version;
        }).map(m => m.nombre_pantalla);
        const latest = [...data.trabajos].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0];
        const comparison = { fecha: new Date().toISOString(), pantallas: data.diseno.mockups.length, modificadas: changed, conservadas: data.diseno.mockups.length - changed.length, trabajo: { estado: latest.estado, soloReparar: latest.solo_reparar, aplicadas: latest.total_generados, advertencias: latest.advertencias }, faseAntes: before.proyecto.estado_fase, faseDespues: data.proyecto.estado_fase };
        fs.writeFileSync(path.join(directory, 'comparacion.json'), JSON.stringify(comparison, null, 2));
        console.log(JSON.stringify(comparison));
      }
      console.log('Evidencia ' + name + ' conservada.');
    } finally { await mongoose.disconnect(); }
    return;
  }
  const { chromium } = require('/app/tests/node_modules/@playwright/test');
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  const report = { inicio: new Date().toISOString(), accion: 'Reparar pendientes por UI, una sola ejecución' };
  try {
    await page.route(/^http:\/\/localhost:(5000|18080)\//, async route => {
      const url = new URL(route.request().url()); url.hostname = 'host.docker.internal'; url.port = url.port === '5000' ? '18201' : '18202';
      try { await route.fulfill({ response: await route.fetch({ url: url.toString(), timeout: 600000 }) }); }
      catch { await route.abort().catch(() => {}); }
    });
    const login = JSON.parse(fs.readFileSync('/baseline/login.private.json'));
    await page.goto('http://localhost:18080/');
    await page.getByPlaceholder('Correo electrónico').fill(login.correo);
    await page.getByPlaceholder('Contraseña', { exact: true }).fill(login.password);
    await page.locator('button[type=submit]').click();
    await page.getByText(login.proyecto, { exact: true }).first().click({ timeout: 30000 });
    const back = page.getByRole('button', { name: /Diagramas y mockups/ });
    await back.or(page.getByRole('button', { name: 'Mockups', exact: true })).first().waitFor();
    if (await back.isVisible()) await back.click();
    await page.getByRole('button', { name: 'Mockups', exact: true }).click();
    const [response] = await Promise.all([
      page.waitForResponse(r => r.request().method() === 'POST' && /mockups.*trabajos/.test(r.url())),
      page.getByRole('button', { name: 'Reparar pendientes', exact: true }).click()
    ]);
    const started = await response.json();
    report.http = response.status();
    if (!response.ok()) throw new Error('No se pudo iniciar la reparación');
    report.trabajoId = started.trabajo.id;
    fs.writeFileSync('/evidence/report.json', JSON.stringify(report, null, 2));
    for (let i = 0; i < 180; i++) {
      const job = await page.evaluate(async id => {
        const response = await fetch('http://localhost:5000/mockups/trabajos/' + id, { headers: { Authorization: 'Bearer ' + localStorage.getItem('icase_token') } });
        if (!response.ok) throw new Error('No se pudo consultar el trabajo');
        const data = await response.json(); return data.trabajo;
      }, report.trabajoId);
      report.trabajo = job;
      if (['completado', 'fallido'].includes(job.estado)) break;
      await page.waitForTimeout(2000);
    }
    await page.screenshot({ path: '/evidence/reparacion.png', fullPage: true });
    fs.writeFileSync('/evidence/pantalla.txt', await page.locator('body').innerText());
    if (report.trabajo?.estado !== 'completado') throw new Error(report.trabajo?.error || 'La reparación no terminó');
    console.log(JSON.stringify({ estado: report.trabajo.estado, aplicadas: report.trabajo.total_generados, advertencias: report.trabajo.advertencias }));
  } catch (error) { report.error = error.message; console.error(error.message); process.exitCode = 1; }
  finally {
    report.fin = new Date().toISOString(); fs.writeFileSync('/evidence/report.json', JSON.stringify(report, null, 2));
    await page.unrouteAll({ behavior: 'ignoreErrors' }); await browser.close();
  }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
