const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { fork } = require('node:child_process');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '../verification-results/extended');
fs.mkdirSync(root, { recursive: true });
const dbName = 'icase_resilience_' + Date.now();
const uri = 'mongodb://127.0.0.1:27028/' + dbName;
const secret = crypto.randomBytes(40).toString('hex');
const report = { inicio: new Date().toISOString(), base: dbName, alcance: 'HTTP real + MongoDB real; fallos IA/Docker inyectados solo en el proceso de prueba', pruebas: [] };
let worker, base;
async function start(mode = 'fast') {
  worker = fork(path.join(__dirname, 'extended-test-worker.cjs'), [], { env: { ...process.env, MONGO_URI: uri, JWT_SECRET: secret, NODE_ENV: 'test', AUTH_REGISTRATION_ENABLED: 'true', GENERATION_JOB_LEASE_MS: '1500', TEST_AI_MODE: mode }, stdio: ['ignore', 'ignore', 'ignore', 'ipc'] });
  const message = await new Promise((resolve, reject) => { const timer = setTimeout(() => reject(new Error('Inicio sin respuesta')), 20000); worker.once('message', data => { clearTimeout(timer); resolve(data); }); });
  if (message.error) throw new Error(message.error); base = 'http://127.0.0.1:' + message.port;
}
async function stop() { if (worker && worker.exitCode === null) { const ended = new Promise(resolve => worker.once('exit', resolve)); worker.kill(); await ended; } }
async function hit(method, route, token, body) {
  const r = await fetch(base + route, { method, headers: { ...(token ? { Authorization: 'Bearer ' + token } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(20000) });
  return { status: r.status, data: await r.json() };
}
async function check(name, run) { try { report.pruebas.push({ nombre: name, estado: 'correcto', detalle: await run() }); } catch (e) { report.pruebas.push({ nombre: name, estado: 'fallido', error: e.message }); } fs.writeFileSync(path.join(root, 'resilience.json'), JSON.stringify(report, null, 2)); console.log(report.pruebas.at(-1).estado + ': ' + name); }
async function waitJob(id, token) {
  for (let i = 0; i < 60; i++) { const r = await hit('GET', '/proyectos/trabajos-diagramas/' + id, token); if (['completado', 'fallido'].includes(r.data.trabajo?.estado)) return r.data.trabajo; await new Promise(r => setTimeout(r, 250)); }
  throw new Error('El trabajo no alcanzó estado terminal');
}
(async () => {
  try {
    await mongoose.connect(uri); await start(); const db = mongoose.connection.db;
    async function user(label) { const r = await hit('POST', '/auth/registro', null, { nombre: label, apellido: 'Prueba', correo: label + '@example.test', celular: '0999999999', password: 'Prueba-' + crypto.randomUUID() }); assert.equal(r.status, 201); return r.data; }
    const a = await user('alfa'); const b = await user('beta');
    const projectA = (await hit('POST', '/proyectos', a.token, { nombre: 'Biblioteca aislada' })).data;
    const projectB = (await hit('POST', '/proyectos', b.token, { nombre: 'Clínica aislada' })).data;
    const idA = projectA.id || projectA.proyecto?.id; const idB = projectB.id || projectB.proyecto?.id;
    assert(idA && idB, 'La API no devolvió los proyectos');
    const Project = require('../src/infrastructure/database/schemas/ProyectoSchema');
    const Diagram = require('../src/infrastructure/database/schemas/DiagramaSchema');
    const Requirement = require('../src/infrastructure/database/schemas/RequerimientoSchema');
    const Artifact = require('../src/infrastructure/database/schemas/ArtefactoGeneradoSchema');
    const Job = require('../src/infrastructure/database/schemas/TrabajoGeneracionSchema');
    const code = '@startuml\nclass Libro {\n+titulo: String\n}\nclass Socio {\n+nombre: String\n}\nclass Prestamo {\n+fecha: String\n}\nSocio "1" -- "*" Prestamo\nPrestamo "*" -- "1" Libro\n@enduml';
    const diagram = await Diagram.create({ proyecto_id: idA, tipo: 'clases_dominio', titulo: 'Libros', codigo_plantuml: code, codigo_mermaid: code, version: 1, aprobado: true, estado: 'aprobado' });
    const child = await Diagram.create({ proyecto_id: idA, tipo: 'clases_diseno', titulo: 'Diseño', codigo_plantuml: code, version: 1, aprobado: true, estado: 'aprobado' });
    await Requirement.create({ proyecto_id: idA, identificador: 'RF-01', tipo: 'RF', nombre: 'Registrar libros', descripcion: 'El sistema DEBE registrar libros.', actores: ['Bibliotecario'], aprobado: true });
    await Project.updateOne({ _id: idA }, { $set: { estado_fase: 'analisis_aprobado' } });
    const source = await db.collection('fuentes').insertOne({ proyecto_id: new mongoose.Types.ObjectId(idA), nombre_archivo: 'privado.txt', texto_transcrito: 'Contenido privado de Alfa', tipo: 'texto' });
    const fixture = require('../verification-results/real-ui-code/artefactos-generados.json').find(a => a.tipo === 'codigo_frontend');
    const artifact = await Artifact.create({ proyecto_id: idA, tipo: 'codigo_frontend', version: 1, huella_entrada: 'prueba', archivos: fixture.archivos, estado: 'en_revision' });
    const verifiedPackage = await mongoose.connection.getClient().db('icase_real_ui').collection('artefactogenerados').findOne({ tipo: 'paquete_entrega', estado: 'aprobado' });
    assert(verifiedPackage, 'Falta el paquete real verificado del ensayo de ZIP');
    const packageFixture = await Artifact.create({ proyecto_id: idA, tipo: 'paquete_entrega', version: 1, huella_entrada: 'fixture-zip-verificado', archivos: verifiedPackage.archivos, verificacion: verifiedPackage.verificacion, estado: 'aprobado', aprobado: true });
    const job = await Job.create({ proyecto_id: idA, tipo: 'diagrama', ejecutor_id: 'fixture', estado: 'completado' });
    await check('Guardar cambios, evitar duplicados y conservar historial', async () => {
      const changed = code.replace('+titulo: String', '+titulo: String\n+autor: String');
      const r = await hit('PUT', '/diagramas/' + diagram.id, a.token, { codigo_plantuml: changed, codigo_mermaid: changed }); assert.equal(r.status, 200, JSON.stringify(r.data));
      let saved = await Diagram.findById(diagram.id).lean(); assert.equal(saved.version, 2); assert.equal(saved.historial_versiones[0].codigo_plantuml, code); assert.equal(saved.aprobado, false);
      await hit('PUT', '/diagramas/' + diagram.id, a.token, { codigo_plantuml: changed, codigo_mermaid: changed }); saved = await Diagram.findById(diagram.id).lean(); assert.equal(saved.version, 2); assert.equal(saved.historial_versiones.length, 1);
      assert.equal((await Diagram.findById(child.id).lean()).estado, 'desactualizado');
      for (let i = 0; i < 3; i++) { const r = await hit('POST', '/diagramas/' + diagram.id + '/restaurar', a.token, { version: 1 }); assert.equal(r.status, 200); }
      saved = await Diagram.findById(diagram.id).lean(); assert.equal(saved.version, 2); assert.equal(saved.codigo_plantuml, changed);
      await hit('PUT', '/diagramas/' + diagram.id, a.token, { codigo_plantuml: code, codigo_mermaid: code, restaurada_desde_version: 1 });
      saved = await Diagram.findById(diagram.id).lean(); assert.equal(saved.version, 3); assert(saved.historial_versiones.some(v => v.codigo_plantuml === changed));
      return { versionFinal: saved.version, restauracionesSinGuardar: 3 };
    });
    await check('Accesos cruzados: proyectos, fuentes, diagramas, trabajos, artefactos y ZIP', async () => {
      const ownerPaths = ['/proyectos/' + idA, '/diagramas/' + diagram.id + '/versiones', '/proyectos/' + idA + '/fuentes', '/proyectos/trabajos-diagramas/' + job.id, '/proyectos/' + idA + '/artefactos'];
      for (const route of ownerPaths) assert.equal((await hit('GET', route, a.token)).status, 200, 'Control positivo: ' + route);
      const zipPath = '/proyectos/' + idA + '/codificacion/paquete/' + packageFixture.id + '/descargar';
      const ownZip = await fetch(base + zipPath, { headers: { Authorization: 'Bearer ' + a.token } });
      assert.equal(ownZip.status, 200); assert.equal(Buffer.from(await ownZip.arrayBuffer()).subarray(0, 2).toString(), 'PK');
      const attempts = [['GET', '/proyectos/' + idA], ['PUT', '/proyectos/' + idA, { nombre: 'Intrusión' }], ['DELETE', '/proyectos/' + idA], ['GET', '/diagramas/' + diagram.id + '/versiones'], ['POST', '/diagramas/' + diagram.id + '/restaurar', { version: 1 }], ['DELETE', '/fuentes/' + source.insertedId], ['GET', '/proyectos/' + idA + '/fuentes'], ['GET', '/proyectos/trabajos-diagramas/' + job.id], ['GET', '/proyectos/' + idA + '/artefactos'], ['GET', zipPath], ['POST', '/proyectos/' + idB + '/artefactos/' + artifact.id + '/verificar-async', {}]];
      const results = []; for (const [method, route, body] of attempts) { const r = await hit(method, route, b.token, body); assert.equal(r.status, 404, method + ' ' + route); results.push({ method, route, status: r.status }); }
      assert(await Project.findById(idA)); assert.equal(await db.collection('fuentes').countDocuments({ _id: source.insertedId }), 1);
      return results;
    });
    await check('JWT caducado y logout revocado bloquean solicitudes', async () => {
      const expired = jwt.sign({ id: a.usuario.id }, secret, { expiresIn: -1, jwtid: crypto.randomUUID() });
      assert.equal((await hit('GET', '/proyectos', expired)).status, 401);
      assert.equal((await hit('POST', '/auth/logout', b.token)).status, 200);
      assert.equal((await hit('GET', '/proyectos', b.token)).status, 401);
    });
    await check('Reinicio real durante trabajo activo y recuperación persistente', async () => {
      await stop(); await start('slow');
      const r = await hit('POST', '/proyectos/' + idA + '/trabajos-diagramas', a.token, { tipo_diagrama: 'casos_de_uso', insumo_bruto: 'Registrar libros', provider: 'auto' }); assert.equal(r.status, 202);
      const id = r.data.trabajo.id;
      await stop(); await new Promise(r => setTimeout(r, 1800)); await start('fast');
      const result = await waitJob(id, a.token); assert.equal(result.estado, 'completado', result.error);
      assert.equal(await Job.countDocuments({ _id: id }), 1);
      assert.equal(await Diagram.countDocuments({ proyecto_id: idA, tipo: 'casos_de_uso' }), 1);
      return { estado: result.estado, trabajoOriginalConservado: true };
    });
    await check('Fallo IA no destruye requisitos aprobados', async () => {
      await stop(); await start('fail'); const before = await Requirement.find({ proyecto_id: idA }).lean();
      const r = await hit('POST', '/proyectos/' + idA + '/procesar-ia', a.token, { insumo_bruto: 'Registrar libros', objetivo: 'requisitos' }); assert(r.status >= 400);
      const after = await Requirement.find({ proyecto_id: idA }).lean(); assert.equal(JSON.stringify(after), JSON.stringify(before)); return { status: r.status, conservados: after.length };
    });
    await check('Fallo Docker deja resultado fallido, no apto', async () => {
      const r = await hit('POST', '/proyectos/' + idA + '/artefactos/' + artifact.id + '/verificar', a.token, {});
      const data = await Artifact.findById(artifact.id).lean(); assert.equal(data.verificacion.estado, 'fallida'); assert.equal(data.aprobado, false); return { status: r.status, estado: data.verificacion.estado };
    });
    let interruptedVerification;
    await check('Una verificación larga activa renueva su concesión', async () => {
      await stop(); await start('docker-slow');
      const r = await hit('POST', '/proyectos/' + idA + '/artefactos/' + artifact.id + '/verificar-async', a.token, {});
      assert.equal(r.status, 202);
      await new Promise(resolve => setTimeout(resolve, 2300));
      const running = await Job.findById(r.data.trabajo.id).lean(); assert.equal(running.estado, 'procesando');
      assert(running.lease_expires_at > new Date(), 'La concesión activa no se renovó');
      for (let i = 0; i < 110; i++) { const saved = await Job.findById(r.data.trabajo.id).lean(); if (saved.estado === 'completado') break; await new Promise(resolve => setTimeout(resolve, 100)); }
      assert.equal((await Job.findById(r.data.trabajo.id).lean()).estado, 'completado');
    });
    await check('Una verificación interrumpida alcanza estado terminal tras reiniciar', async () => {
      await stop(); await start('docker-slow');
      const r = await hit('POST', '/proyectos/' + idA + '/artefactos/' + artifact.id + '/verificar-async', a.token, {});
      assert.equal(r.status, 202); interruptedVerification = r.data.trabajo.id;
      await new Promise(resolve => setTimeout(resolve, 300));
      await stop(); await new Promise(resolve => setTimeout(resolve, 1800)); await start('fast');
      await new Promise(resolve => setTimeout(resolve, 2000));
      const saved = await Job.findById(interruptedVerification).lean();
      assert(['completado', 'fallido'].includes(saved.estado), 'La verificación sigue ' + saved.estado + ' con la concesión expirada; no se recupera ni informa interrupción al consultar.');
    });
    await check('Reintento explícito libera una verificación abandonada', async () => {
      assert(interruptedVerification);
      const r = await hit('POST', '/proyectos/' + idA + '/artefactos/' + artifact.id + '/verificar-async', a.token, {}); assert.equal(r.status, 202);
      assert.notEqual(r.data.trabajo.id, interruptedVerification);
      for (let i = 0; i < 20; i++) { const saved = await Job.findById(r.data.trabajo.id).lean(); if (saved.estado === 'completado') break; await new Promise(resolve => setTimeout(resolve, 100)); }
      assert.equal((await Job.findById(interruptedVerification).lean()).estado, 'fallido');
      assert.equal((await Job.findById(r.data.trabajo.id).lean()).estado, 'completado');
    });
    await check('Ediciones concurrentes no pierden cambios silenciosamente', async () => {
      const concurrent = await Diagram.create({ proyecto_id: idA, tipo: 'clases_dominio', titulo: 'Concurrencia', codigo_plantuml: code, codigo_mermaid: code, version: 1 });
      const first = code.replace('+titulo: String', '+titulo: String\n+isbn: String');
      const second = code.replace('+titulo: String', '+titulo: String\n+editorial: String');
      const results = await Promise.all([first, second].map(value => hit('PUT', '/diagramas/' + concurrent.id, a.token, { codigo_plantuml: value, codigo_mermaid: value })));
      const saved = await Diagram.findById(concurrent.id).lean();
      const contents = [saved.codigo_plantuml, ...saved.historial_versiones.map(v => v.codigo_plantuml)];
      if (results.every(r => r.status === 200)) assert(contents.includes(first) && contents.includes(second), 'Dos guardados respondieron 200, pero no se conservaron ambos contenidos en actual/historial.');
      else assert(results.some(r => r.status === 409), 'La edición concurrente no se resolvió ni notificó conflicto.');
      return { statuses: results.map(r => r.status), version: saved.version };
    });
    await check('Un propietario no puede mover un diagrama al proyecto de otro usuario', async () => {
      const target = await Diagram.create({ proyecto_id: idA, tipo: 'clases_dominio', titulo: 'Prueba de reasignación', codigo_plantuml: code, version: 1 });
      try {
        const result = await hit('PUT', '/diagramas/' + target.id, a.token, { proyecto_id: idB });
        const saved = await Diagram.findById(target.id).lean();
        assert.equal(String(saved.proyecto_id), idA, 'Se permitió reasignar el diagrama al proyecto ajeno con HTTP ' + result.status);
      } finally { await Diagram.updateOne({ _id: target.id }, { $set: { proyecto_id: idA } }); }
    });
  } finally {
    await stop(); await mongoose.disconnect(); report.fin = new Date().toISOString(); report.correctas = report.pruebas.filter(t => t.estado === 'correcto').length; report.fallidas = report.pruebas.filter(t => t.estado === 'fallido').length;
    fs.writeFileSync(path.join(root, 'resilience.json'), JSON.stringify(report, null, 2));
  }
})().catch(error => { report.errorFatal = error.message; fs.writeFileSync(path.join(root, 'resilience.json'), JSON.stringify(report, null, 2)); console.error(error.message); process.exitCode = 1; });
