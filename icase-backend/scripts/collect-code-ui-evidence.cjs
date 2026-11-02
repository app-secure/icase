const fs = require('node:fs');
const path = require('node:path');
const mongoose = require('mongoose');
(async () => {
  try {
    await mongoose.connect('mongodb://127.0.0.1:27028/icase_real_ui');
    const db = mongoose.connection.db;
    const previous = require('../verification-results/real-ui/artefactos.json');
    const projectId = new mongoose.Types.ObjectId(previous.proyecto.id);
    const artifacts = await db.collection('artefactogenerados').find({ proyecto_id: projectId }).toArray();
    const directory = path.resolve(__dirname, '../verification-results/real-ui-code');
    fs.writeFileSync(path.join(directory, 'artefactos-generados.json'), JSON.stringify(artifacts, null, 2));
    const summary = artifacts.map(a => ({ tipo: a.tipo, estado: a.estado, verificacion: a.verificacion?.estado, nivel: a.verificacion?.nivel, pruebas: a.verificacion?.pruebas, errores: a.verificacion?.errores, cobertura: a.verificacion?.cobertura_funcional }));
    fs.writeFileSync(path.join(directory, 'verificaciones.json'), JSON.stringify(summary, null, 2));
    const report = JSON.parse(fs.readFileSync(path.join(directory, 'report.json'), 'utf8'));
    const text = ['# Continuación de codificación por interfaz — 1 de noviembre de 2026', '',
      'Fixture del restaurante: requisitos y seis diagramas del primer ensayo, mockups aprobados tras la corrección HTML. Primeras decisiones aceptadas mediante Modo de un clic; artefactos sin ediciones manuales.', '',
      `Estado del automatizador: ${report.estado || 'en ejecución'}.`, '',
      ...summary.map(a => `- ${a.tipo}: ${a.estado}; verificación ${a.verificacion || 'pendiente'} (${a.nivel || 'sin ejecución acreditada'}).`), '',
      report.error ? 'Bloqueo: ' + report.error : 'Consultar report.json para el último paso observado.', '',
      'La verificación técnica de CRUD, compilación y permisos no certifica los procesos no soportados (tiempo real, dispositivos, cálculos o reportes). Las declaraciones de cobertura funcional y sus bloqueos se conservan en verificaciones.json. No se omitieron compuertas ni se confirmó una entrega parcial para eludirlas.', '',
      'El bundle Android compilado no equivale a una prueba en dispositivo o simulador; un pipeline generado no acredita ejecución en GitHub Actions. No afirmar descarga o arranque del ZIP si no aparecen como completados en la evidencia.', ''];
    fs.writeFileSync(path.join(directory, 'resultado.md'), text.join('\n'));
    const fullPath = path.resolve(__dirname, '../verification-results/real-ui-html-v2/report.json');
    const full = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
    const failures = await db.collection('trabajogeneracions').find({ estado: 'fallido', createdAt: { $gte: new Date(full.inicio) }, tipo: 'diagrama' }).project({ proyecto_id: 1, estado: 1, error: 1, tipo_diagrama: 1 }).toArray();
    if (failures.length) {
      full.estado = 'bloqueado_por_diagrama'; full.fallos = failures; full.completado = false;
      fs.writeFileSync(fullPath, JSON.stringify(full, null, 2));
    }
    console.log(JSON.stringify(summary.map(({ tipo, estado, verificacion }) => ({ tipo, estado, verificacion }))));
  } finally { await mongoose.disconnect(); }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
