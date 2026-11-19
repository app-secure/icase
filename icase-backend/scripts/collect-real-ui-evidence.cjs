// Solo lectura de la base aislada usada por real-ui-flow.cjs. No carga .env.
const fs = require('node:fs');
const path = require('node:path');
const mongoose = require('mongoose');
const directory = path.resolve(__dirname, '../verification-results/real-ui');
(async () => {
  try {
    await mongoose.connect('mongodb://127.0.0.1:27028/icase_real_ui');
    const db = mongoose.connection.db;
    const reportPath = path.join(directory, 'report.json');
    const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
    const projectId = report.respuestasFallidas.map(r => /\/proyectos\/([a-f0-9]{24})\//.exec(r.url)?.[1]).find(Boolean);
    if (!projectId) throw new Error('El informe no identifica el proyecto de prueba bloqueado.');
    const project = await db.collection('proyectos').findOne({ _id: new mongoose.Types.ObjectId(projectId) });
    if (!project) throw new Error('No se encontró el proyecto aislado de esta prueba.');
    const filter = { proyecto_id: project._id };
    const requirements = await db.collection('requerimientos').find(filter).toArray();
    const diagrams = await db.collection('diagramas').find(filter).toArray();
    const design = await db.collection('disenos').findOne(filter);
    const jobs = await db.collection('trabajogeneracions').find(filter).project({ tipo: 1, estado: 1, mensaje: 1, error: 1, progreso: 1 }).toArray();
    const mockups = (design?.mockups || []).map(m => ({ nombre: m.nombre_visible || m.nombre_pantalla, estado: m.estado_calidad, errores: m.errores_validacion || [], advertencias: m.advertencias_validacion || [] }));
    const evidence = { proyecto: { id: project._id, nombre: project.nombre, estado_fase: project.estado_fase }, requisitos: requirements, diagramas: diagrams, mockups, trazabilidad: design?.trazabilidad_mockups, trabajos: jobs };
    fs.writeFileSync(path.join(directory, 'artefactos.json'), JSON.stringify(evidence, null, 2));
    fs.writeFileSync(path.join(directory, 'mockups-html.json'), JSON.stringify(design?.mockups || [], null, 2));
    report.pasos = report.pasos.filter(p => p.paso !== 'documento'); // Clic no equivale a transición exitosa.
    report.estado = 'bloqueado_por_calidad_mockups';
    report.error = report.respuestasFallidas.find(r => r.status === 400)?.cuerpo || report.error;
    report.resumen = { requisitos: requirements.length, diagramas_aprobados: diagrams.filter(d => d.aprobado || d.estado === 'aprobado').length, mockups: mockups.length, invalidos: mockups.filter(m => m.estado === 'invalido').length, codigo: 'no alcanzado', zip: 'no alcanzado', arranque: 'no alcanzado' };
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    const lines = [
      '# Prueba real de interfaz — 1 de noviembre de 2026', '',
      'Escenario: restaurante. Gemini real, primeras propuestas sin ediciones manuales. Chromium automatizado en Docker; base icase_real_ui aislada, no se utilizaron proyectos existentes.', '',
      `Requisitos: ${requirements.length}. Diagramas aprobados: ${report.resumen.diagramas_aprobados}/6. Mockups: ${mockups.length}; inválidos: ${report.resumen.invalidos}.`, '',
      '## Bloqueo observado', '',
      'El backend rechazó correctamente la aprobación de mockups con HTTP 400. No se corrigieron ni regeneraron los inválidos. Codificación, ZIP, descarga y arranque NO quedaron validados por este recorrido.', '',
      ...mockups.filter(m => m.estado === 'invalido').flatMap(m => [`### ${m.nombre}`, '', ...m.errores.map(e => '- ' + e), '']),
      '## Otros hallazgos', '',
      '- La arquitectura de software y las clases de diseño necesitaron la reparación automática controlada incorporada al producto; no fueron correcciones manuales.',
      '- Algunos RF agrupan objetivos independientes: mesas y pedidos; reportes y modificación de precios; cobros y validación de planes. Requieren revisar la atomicidad.',
      '- El nombre del proyecto cambió durante el modelado de Digitalización de Operaciones de Restaurante a GourmetFlow, sin solicitud del usuario.',
      '- El botón de aprobación de mockups anuncia Documento, pero su manejador dirige a planificación de código. No se llegó a ejecutar esa transición porque la calidad la bloqueó.', '',
      '## Evidencias y límites', '',
      'Capturas PNG por paso, bloqueo.png, pantalla-final.txt, report.json y artefactos.json en esta carpeta. browser-state.private.json contiene sesión temporal: no compartir ni versionar.',
      'Los ajustes del automatizador (selección secuencial, espera de trabajos) no alteraron artefactos ni omitieron controles. Un clic inicial prematuro en aprobación fue rechazado y no se cuenta como aprobación exitosa.',
      'Esta prueba mide el flujo y sus controles; no certifica conformidad normativa, exactitud semántica completa ni fidelidad visual del PDF. No se descargó un ZIP ni se arrancó la aplicación generada.', ''
    ];
    fs.writeFileSync(path.join(directory, 'resultado.md'), lines.join('\n'));
    console.log(JSON.stringify({ ...report.resumen, invalidos_detalle: mockups.filter(m => m.estado === 'invalido') }, null, 2));
  } finally { await mongoose.disconnect(); }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
