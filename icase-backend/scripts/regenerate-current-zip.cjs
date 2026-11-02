const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../verification-results/zip-current');
const database = 'icase_zip_current_20261101';
(async () => {
  if (process.argv.includes('--prepare')) {
    const mongoose = require('mongoose');
    try {
      await mongoose.connect('mongodb://127.0.0.1:27028/icase_real_ui');
      const source = mongoose.connection.db, target = mongoose.connection.getClient().db(database);
      if ((await target.listCollections().toArray()).length) throw new Error('La base destino ya existe; no se sobrescribe');
      const project = await source.collection('proyectos').findOne({ _id: new mongoose.Types.ObjectId('6ae792bfbf0175908a2ca7e4') });
      if (!project) throw new Error('No existe el fixture aprobado');
      const user = await source.collection('usuarios').findOne({ _id: project.usuario_id });
      if (!user?.correo.endsWith('@example.test')) throw new Error('La cuenta no es sintética');
      const approved = await source.collection('artefactogenerados').find({ proyecto_id: project._id, aprobado: true }).project({ tipo: 1, version: 1, estado: 1 }).toArray();
      if (approved.length !== 6) throw new Error('El fixture no tiene los seis artefactos previamente aprobados');
      fs.mkdirSync(root, { recursive: true });
      const password = require('node:crypto').randomUUID();
      user.password = await require('bcryptjs').hash(password, 10);
      await target.collection('usuarios').insertOne(user);
      await target.collection('proyectos').insertOne(project);
      for (const name of ['requerimientos', 'diagramas', 'disenos', 'plancodificacions']) {
        const docs = await source.collection(name).find({ proyecto_id: project._id }).toArray();
        if (docs.length) await target.collection(name).insertMany(docs);
      }
      fs.writeFileSync(path.join(root, 'fixture.json'), JSON.stringify({ proyecto: String(project._id), nombre: project.nombre, artefactosPreviosAprobados: approved, artefactosCopiados: 0, base: database, limites: 'Decisiones/diseño aprobados conservados; artefactos de código nuevos. Se conserva el alcance parcial previamente aprobado.' }, null, 2));
      fs.writeFileSync(path.join(root, 'login.private.json'), JSON.stringify({ correo: user.correo, password, proyecto: String(project._id) }));
      console.log('Fixture aislado preparado sin copiar código ni verificaciones anteriores.');
    } finally { await mongoose.disconnect(); }
    return;
  }
  const login = JSON.parse(fs.readFileSync(path.join(root, 'login.private.json')));
  const base = 'http://localhost:18301';
  let token;
  async function api(route, method = 'GET', body) {
    const response = await fetch(base + route, { method, headers: { ...(token ? { Authorization: 'Bearer ' + token } : {}), 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(1200000) });
    const data = await response.json();
    if (!response.ok) throw new Error(`${method} ${route}: HTTP ${response.status}: ${JSON.stringify(data).slice(0, 1600)}`);
    return data;
  }
  token = (await api('/auth/login', 'POST', { correo: login.correo, password: login.password })).token;
  if (!token) throw new Error('No se obtuvo sesión');
  const downloadOnly = process.argv.includes('--download-only');
  const report = downloadOnly ? JSON.parse(fs.readFileSync(path.join(root, 'report.json'))) : { inicio: new Date().toISOString(), estado: 'en_ejecucion', origen: 'Generadores actuales por HTTP autenticado; sin código ni verificaciones heredadas', etapas: [] };
  if (downloadOnly) {
    report.incidenciaAutomatizador = report.error; delete report.error;
    if (report.etapas.length !== 6 || report.etapas.some(stage => !stage.aprobado)) throw new Error('No están aprobados los seis artefactos de esta ejecución');
  }
  const save = () => fs.writeFileSync(path.join(root, 'report.json'), JSON.stringify(report, null, 2));
  const projectPath = '/proyectos/' + login.proyecto;
  try {
    if (downloadOnly) {
      const artifact = report.etapas.find(stage => stage.etapa === 'paquete');
      const response = await fetch(base + projectPath + '/codificacion/paquete/' + artifact.artefacto + '/descargar', { headers: { Authorization: 'Bearer ' + token }, signal: AbortSignal.timeout(120000) });
      if (!response.ok) throw new Error('Descarga HTTP ' + response.status);
      fs.writeFileSync(path.join(root, 'entrega.zip'), Buffer.from(await response.arrayBuffer()));
      report.descarga = { status: response.status, origen: 'Endpoint autenticado normal; repetición solo de la descarga' };
    }
    for (const stage of downloadOnly ? [] : ['backend', 'frontend', 'pruebas', 'infraestructura', 'ci-cd', 'paquete']) {
      console.log('[Generar] ' + stage);
      const generated = await api(projectPath + '/codificacion/' + stage + '/generar', 'POST', {});
      if (generated.reutilizado) throw new Error(stage + ': no se permite acreditar una generación reutilizada');
      const artifact = generated.artefacto;
      const step = { etapa: stage, artefacto: artifact.id, version: artifact.version, archivos: artifact.archivos?.length };
      report.etapas.push(step); save();
      const start = await api(projectPath + '/artefactos/' + artifact.id + '/verificar-async', 'POST', {});
      for (let i = 0; i < 900; i++) {
        const state = await api(projectPath + '/artefactos/' + artifact.id + '/verificar-trabajo/' + start.trabajo.id);
        if (['completado', 'fallido'].includes(state.trabajo.estado)) {
          step.verificacion = state.verificacion;
          step.error = state.trabajo.error;
          break;
        }
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
      save();
      const status = step.verificacion?.estado;
      const structural = ['infraestructura', 'ci-cd'].includes(stage) && status === 'apta_estructuralmente';
      if (status !== 'apta' && !structural) throw new Error(stage + ': verificación no apta: ' + (step.error || JSON.stringify(step.verificacion?.errores || status)));
      await api(projectPath + '/codificacion/' + stage + '/' + artifact.id + '/revision', 'POST', { decision: 'aprobar', observaciones: 'Prueba aislada: aprobada tras nueva verificación del artefacto actual.' });
      step.aprobado = true; save(); console.log('[Aprobado] ' + stage);
      if (stage === 'paquete') {
        const response = await fetch(base + projectPath + '/codificacion/paquete/' + artifact.id + '/descargar', { headers: { Authorization: 'Bearer ' + token }, signal: AbortSignal.timeout(120000) });
        if (!response.ok) throw new Error('Descarga HTTP ' + response.status);
        fs.writeFileSync(path.join(root, 'entrega.zip'), Buffer.from(await response.arrayBuffer()));
        report.descarga = { status: response.status, origen: 'Endpoint autenticado normal de descarga; no se reconstruye desde MongoDB' };
      }
    }
    report.estado = 'zip_descargado';
  } catch (error) { report.estado = 'bloqueado'; report.error = error.message; process.exitCode = 1; }
  finally { report.fin = new Date().toISOString(); save(); console.log(JSON.stringify({ estado: report.estado, etapas: report.etapas.map(s => ({ etapa: s.etapa, verificacion: s.verificacion?.estado, aprobado: s.aprobado })), error: report.error })); }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
