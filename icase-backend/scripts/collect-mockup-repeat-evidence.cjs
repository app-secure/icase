// Lectura exclusiva del fixture local. No carga .env ni modifica MongoDB.
const fs = require('node:fs');
const path = require('node:path');
const mongoose = require('mongoose');
(async () => {
  try {
    await mongoose.connect('mongodb://127.0.0.1:27028/icase_real_ui');
    const db = mongoose.connection.db;
    const previous = require('../verification-results/real-ui/artefactos.json');
    const projectId = new mongoose.Types.ObjectId(previous.proyecto.id);
    const design = await db.collection('disenos').findOne({ proyecto_id: projectId });
    const jobs = await db.collection('trabajogeneracions').find({ proyecto_id: projectId, tipo: 'mockups' }).sort({ createdAt: 1 }).toArray();
    const stats = jobs.map(job => ({ id: job._id, estado: job.estado, creadas: job.total_generados, inicio: job.createdAt, fin: job.updatedAt, reparaciones: (job.advertencias || []).filter(a => /reparación aislada/.test(a)), advertencias: job.advertencias }));
    const mockups = design.mockups.map(m => ({ nombre: m.nombre_visible, version: m.version, estado: m.estado_calidad, errores: m.errores_validacion, ajustes: m.ajustes_sanitizacion }));
    const directory = path.resolve(__dirname, '../verification-results/mockups-html-v2');
    fs.writeFileSync(path.join(directory, 'calidad-persistida.json'), JSON.stringify({ aprobado: design.aprobado, trabajos: stats, mockups }, null, 2));
    fs.writeFileSync(path.join(directory, 'mockups-html.json'), JSON.stringify(design.mockups, null, 2));
    const text = [
      '# Repetición de mockups con corrección HTML — 1 de noviembre de 2026', '',
      'Se utilizó el contexto anterior de seis diagramas aprobados, sin editar requisitos, diagramas ni HTML. Se renovó únicamente la contraseña de la cuenta sintética para entrar por la interfaz tras reiniciar el servidor. No se modificaron cuentas reales.', '',
      `Resultado persistido: ${mockups.length} pantallas, ${mockups.filter(m => m.estado === 'valido').length} válidas, ${mockups.filter(m => m.estado === 'invalido').length} inválidas. Aprobación HTTP 200 y acceso a planificación de código.`, '',
      `Reparaciones automáticas aisladas: ${stats[0]?.reparaciones.length} en el ensayo anterior; ${stats.at(-1)?.reparaciones.length} en la repetición. No hubo regeneraciones manuales entre el envío del lote y su aprobación.`, '',
      '## Causa y alcance', '',
      'Las tres pantallas antes rechazadas tenían prefijos <<!DOCTYPE y/o un > final adicional; no les faltaba el cierre HTML. La normalización limitada conserva contenido y seguridad. Se verificaron también los tres HTML anteriores sin consumir IA: todos pasan al normalizar su contorno.', '',
      'La nueva generación usó Gemini real. Una respuesta aún requirió reparación automática por estructura/JSON inválido; no se garantiza que toda respuesta bruta del modelo sea válida.', '',
      'El recorrido nuevo desde cero se bloqueó antes, en casos de uso, por falta de cobertura de RF-08 incluso tras reparación. Este resultado es independiente del HTML y no se corrigió para forzar el avance.', '',
      'Pruebas locales: 563 correctas y una omitida. No se afirma que ZIP, despliegue o calidad semántica completa del restaurante estén certificados.', '',
      'Capturas, report.json, calidad-persistida.json y mockups-html.json contienen las evidencias. login.private.json es privado y no debe compartirse ni versionarse.', ''
    ];
    fs.writeFileSync(path.join(directory, 'resultado.md'), text.join('\n'));
    console.log(JSON.stringify({ pantallas: mockups.length, validas: mockups.filter(m => m.estado === 'valido').length, invalidas: mockups.filter(m => m.estado === 'invalido').length, reparaciones: stats.map(s => s.reparaciones.length) }));
  } finally { await mongoose.disconnect(); }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
