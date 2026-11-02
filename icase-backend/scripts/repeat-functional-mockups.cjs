// Fixture y navegador independientes. Nunca modifica la base del recorrido anterior.
const fs = require('node:fs');
const path = require('node:path');
const directory = path.resolve(__dirname, '../verification-results/mockups-functional-repeat');
const database = 'icase_mockup_criteria_repeat_20261101';
(async () => {
  if (process.argv.includes('--collect')) {
    const mongoose = require('mongoose');
    const Traceability = require('../src/infrastructure/services/MockupTraceabilityService');
    try {
      await mongoose.connect('mongodb://127.0.0.1:27028/' + database);
      const db = mongoose.connection.db;
      const project = await db.collection('proyectos').findOne({});
      const filter = { proyecto_id: project._id };
      const after = { proyecto: project, requisitos: await db.collection('requerimientos').find(filter).toArray(), diagramas: await db.collection('diagramas').find(filter).toArray(), diseno: await db.collection('disenos').findOne(filter) };
      const before = JSON.parse(fs.readFileSync(path.join(directory, 'antes.json')));
      const service = new Traceability();
      const inspect = state => {
        const manifest = service.buildManifest(state.diseno.manifiesto_navegacion, state.requisitos);
        return service.validate({ manifest, mockups: service.enrichAll(state.diseno.mockups, manifest, state.requisitos), requirements: state.requisitos, requireComplete: true });
      };
      const ordered = (items, fields) => JSON.stringify(items.map(item => Object.fromEntries(fields.map(field => [field, item[field]]))).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))));
      const audit = inspect(after), previous = inspect(before);
      const jobs = await db.collection('trabajogeneracions').find(filter).project({ tipo: 1, estado: 1, mensaje: 1, error: 1, total_generados: 1 }).toArray();
      const report = {
        fecha: new Date().toISOString(), pantallas: after.diseno.mockups.length,
        requisitosIntactos: ordered(before.requisitos, ['identificador', 'nombre', 'descripcion', 'aprobado']) === ordered(after.requisitos, ['identificador', 'nombre', 'descripcion', 'aprobado']),
        diagramasIntactos: ordered(before.diagramas, ['tipo', 'version', 'codigo_plantuml', 'aprobado']) === ordered(after.diagramas, ['tipo', 'version', 'codigo_plantuml', 'aprobado']),
        htmlCambiados: after.diseno.mockups.filter(m => m.preview_code !== before.diseno.mockups.find(b => b.nombre_pantalla === m.nombre_pantalla)?.preview_code).length,
        antes: previous, despues: audit,
        trabajos: jobs,
        calidad: after.diseno.mockups.map(m => ({ pantalla: m.nombre_pantalla, calidad: m.estado_calidad, errores: m.errores_validacion || [] })),
        limites: 'Una regeneración real de mockups sobre requisitos y diagramas ya aprobados, sin editar HTML. No es un recorrido nuevo de requisitos, código, ZIP o despliegue.'
      };
      fs.writeFileSync(path.join(directory, 'despues.json'), JSON.stringify(after, null, 2));
      fs.writeFileSync(path.join(directory, 'comparacion.json'), JSON.stringify(report, null, 2));
      console.log(JSON.stringify({ pantallas: report.pantallas, requisitosIntactos: report.requisitosIntactos, diagramasIntactos: report.diagramasIntactos, htmlCambiados: report.htmlCambiados, antes: { criterios: previous.metricas.criterios_ui_evaluados, conEvidencia: previous.metricas.criterios_ui_con_evidencia }, despues: { valido: audit.valido, criterios: audit.metricas.criterios_ui_evaluados, conEvidencia: audit.metricas.criterios_ui_con_evidencia, errores: audit.errores, advertencias: audit.advertencias } }));
    } finally { await mongoose.disconnect(); }
    return;
  }
  if (process.argv.includes('--prepare')) {
    const mongoose = require('mongoose');
    try {
      await mongoose.connect('mongodb://127.0.0.1:27028/icase_traceability_replay_20261101_v2');
      const source = mongoose.connection.db;
      const target = mongoose.connection.getClient().db(database);
      if ((await target.listCollections().toArray()).length) throw new Error('La base de repetición ya existe; no se sobrescribe');
      const project = await source.collection('proyectos').findOne({});
      const user = await source.collection('usuarios').findOne({ _id: project.usuario_id });
      if (!user?.correo.endsWith('@example.test')) throw new Error('Solo se admite el fixture sintético');
      fs.mkdirSync(directory, { recursive: true });
      const password = require('node:crypto').randomUUID();
      user.password = await require('bcryptjs').hash(password, 10);
      await target.collection('usuarios').insertOne(user);
      await target.collection('proyectos').insertOne(project);
      const before = { proyecto: project, requisitos: [], diagramas: [], diseno: null };
      for (const collection of ['requerimientos', 'diagramas', 'disenos']) {
        const docs = await source.collection(collection).find({ proyecto_id: project._id }).toArray();
        if (docs.length) await target.collection(collection).insertMany(docs);
        if (collection === 'requerimientos') before.requisitos = docs;
        if (collection === 'diagramas') before.diagramas = docs;
        if (collection === 'disenos') before.diseno = docs[0];
      }
      fs.writeFileSync(path.join(directory, 'antes.json'), JSON.stringify(before, null, 2));
      fs.writeFileSync(path.join(directory, 'login.private.json'), JSON.stringify({ correo: user.correo, password, proyecto: project.nombre }));
      console.log('Copia sintética aislada preparada; origen sin cambios.');
    } finally { await mongoose.disconnect(); }
    return;
  }
  const { chromium } = require('/app/tests/node_modules/@playwright/test');
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  const root = '/evidence';
  const report = { inicio: new Date().toISOString(), alcance: 'Regeneración única de todas las pantallas con criterios UI nuevos y los mismos requisitos/diagramas. Sin correcciones manuales.', pasos: [] };
  const capture = async name => {
    report.pasos.push({ nombre: name, fecha: new Date().toISOString() });
    fs.writeFileSync(root + '/report.json', JSON.stringify(report, null, 2));
    fs.writeFileSync(root + '/pantalla.txt', await page.locator('body').innerText());
    await page.screenshot({ path: root + '/' + name + '.png', fullPage: true });
    console.log('[UI] ' + name);
  };
  try {
    await page.route(/^http:\/\/localhost:(5000|18080)\//, async route => {
      const url = new URL(route.request().url()); url.hostname = 'host.docker.internal'; url.port = url.port === '5000' ? '18101' : '18102';
      try { await route.fulfill({ response: await route.fetch({ url: url.toString(), timeout: 600000 }) }); }
      catch { await route.abort().catch(() => {}); }
    });
    page.on('dialog', dialog => dialog.accept());
    const login = JSON.parse(fs.readFileSync(root + '/login.private.json'));
    await page.goto('http://localhost:18080/');
    await page.getByPlaceholder('Correo electrónico').fill(login.correo);
    await page.getByPlaceholder('Contraseña', { exact: true }).fill(login.password);
    await page.locator('button[type=submit]').click();
    await page.getByText(login.proyecto, { exact: true }).first().click({ timeout: 30000 });
    const back = page.getByRole('button', { name: /Diagramas y mockups/ });
    await back.or(page.getByRole('button', { name: 'Mockups', exact: true })).first().waitFor({ timeout: 30000 });
    if (await back.isVisible()) await back.click();
    await page.getByRole('button', { name: 'Mockups', exact: true }).click();
    if (process.argv.includes('--review')) {
      await page.waitForFunction(() => document.body.innerText.includes('criterios UI específicos con evidencia'), {}, { timeout: 30000 });
      await page.waitForTimeout(1000);
      const approve = page.getByRole('button', { name: 'Aprobar Mockups y Pasar a Documento', exact: true });
      report.aprobacionHabilitada = await approve.isEnabled();
      report.estado = report.aprobacionHabilitada ? 'disponible_para_revision' : 'bloqueado_por_controles';
      report.alcance = 'Revisión del resultado de la regeneración ya completada; no se invoca nuevamente a IA ni se aprueba.';
      await capture('revision-final');
      return;
    }
    const checkboxes = page.locator('input[type=checkbox]');
    report.pantallas = await checkboxes.count();
    if (!report.pantallas) throw new Error('No se encontraron pantallas');
    // El catálogo inicializa todas las pantallas seleccionadas. Esperar a que
    // termine evita invertir esa selección por una carrera con la carga.
    await page.waitForFunction(() => {
      const boxes = [...document.querySelectorAll('input[type=checkbox]')];
      return boxes.length > 0 && boxes.every(box => box.checked);
    });
    await capture('pantallas-seleccionadas');
    const [response] = await Promise.all([
      page.waitForResponse(r => r.request().method() === 'POST' && /mockups.*trabajos/.test(r.url())),
      page.getByRole('button', { name: /^Generar seleccionadas/ }).click()
    ]);
    report.inicioTrabajo = { status: response.status(), resultado: await response.json() };
    await page.waitForFunction(() => /Generación (seleccionada )?completada/.test(document.body.innerText), {}, { timeout: 600000 });
    await capture('mockups-regenerados');
    const approve = page.getByRole('button', { name: 'Aprobar Mockups y Pasar a Documento', exact: true });
    report.aprobacionHabilitada = await approve.isEnabled();
    if (report.aprobacionHabilitada) {
      const [approval] = await Promise.all([
        page.waitForResponse(r => r.request().method() === 'POST' && /aprobar-fase/.test(r.url())), approve.click()
      ]);
      report.aprobacion = { status: approval.status(), resultado: await approval.json() };
      if (approval.ok()) await page.getByText(/Decisiones técnicas de/).waitFor({ timeout: 30000 });
    }
    report.estado = report.aprobacion?.status === 200 ? 'aprobado' : 'requiere_revision';
    await capture(report.estado);
  } catch (error) {
    report.estado = 'error'; report.error = error.message;
    await capture('error').catch(() => {});
    console.error(error.message);
    process.exitCode = 1;
  } finally {
    report.fin = new Date().toISOString();
    fs.writeFileSync(root + '/report.json', JSON.stringify(report, null, 2));
    await page.unrouteAll({ behavior: 'ignoreErrors' }); await browser.close();
  }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
