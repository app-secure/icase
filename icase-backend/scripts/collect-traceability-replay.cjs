// Lectura de la base sintética de repetición; no carga .env ni modifica proyectos.
const fs = require('node:fs');
const path = require('node:path');
const mongoose = require('mongoose');
const Traceability = require('../src/infrastructure/services/MockupTraceabilityService');
(async () => {
  const variant = process.argv.includes('--v2') ? '-v2' : '';
  const directory = path.resolve(__dirname, '../verification-results/traceability-real-replay' + variant);
  try {
    await mongoose.connect('mongodb://127.0.0.1:27028/icase_traceability_replay_20261101' + (variant ? '_v2' : ''));
    const db = mongoose.connection.db;
    const project = await db.collection('proyectos').findOne({}, { sort: { createdAt: -1 } });
    if (!project) throw new Error('No existe el proyecto sintético de repetición');
    const filter = { proyecto_id: project._id };
    const requirements = await db.collection('requerimientos').find(filter).toArray();
    const diagrams = await db.collection('diagramas').find(filter).toArray();
    const design = await db.collection('disenos').findOne(filter);
    const jobs = await db.collection('trabajogeneracions').find(filter).project({ tipo: 1, tipo_diagrama: 1, estado: 1, mensaje: 1, error: 1, progreso: 1 }).toArray();
    const service = new Traceability();
    const manifest = service.buildManifest(design?.manifiesto_navegacion || [], requirements);
    const mockups = service.enrichAll(design?.mockups || [], manifest, requirements);
    const audit = service.validate({ manifest, mockups, requirements, requireComplete: true });
    const evidence = { fecha: new Date().toISOString(), proyecto: { id: project._id, nombre: project.nombre, estado_fase: project.estado_fase }, requisitos: requirements, diagramas: diagrams, diseno: design, trabajos: jobs, auditoria_actual: audit };
    fs.writeFileSync(path.join(directory, 'artefactos.json'), JSON.stringify(evidence, null, 2));
    console.log(JSON.stringify({ requisitos: requirements.length, diagramas: diagrams.length, aprobados: diagrams.filter(d => d.aprobado).length, pantallas: manifest.length, mockups: mockups.length, valido: audit.valido, errores: audit.errores, advertencias: audit.advertencias, trabajos: jobs.map(j => ({ tipo: j.tipo, diagrama: j.tipo_diagrama, estado: j.estado })) }));
  } finally { await mongoose.disconnect(); }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
