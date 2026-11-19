// Auditoría de solo lectura de los mockups de un proyecto real: no usa IA ni modifica la base de datos.
// Uso: node scripts/audit-mockups-proyecto.cjs [proyectoId]   (sin id: el diseño con mockups modificado más recientemente)
require('dotenv').config();
const mongoose = require('mongoose');
const Diseno = require('../src/infrastructure/database/schemas/DisenoSchema');
const Requerimiento = require('../src/infrastructure/database/schemas/RequerimientoSchema');
const Traceability = require('../src/infrastructure/services/MockupTraceabilityService');
const MockupLayoutLinter = require('../src/infrastructure/services/MockupLayoutLinter');

(async () => {
  await mongoose.connect(process.env.MONGO_URI);
  const filtro = process.argv[2] ? { proyecto_id: process.argv[2] } : { 'mockups.0': { $exists: true } };
  const diseno = await Diseno.findOne(filtro).sort({ updatedAt: -1 }).lean();
  if (!diseno) { console.error('No hay diseño con mockups para ese proyecto.'); process.exit(1); }
  const requisitos = await Requerimiento.find({ proyecto_id: diseno.proyecto_id }).lean();
  const service = new Traceability();
  const manifest = diseno.manifiesto_navegacion || [];
  const mockups = service.enrichAll(diseno.mockups || [], manifest, requisitos);
  const audit = service.validate({ manifest, mockups, requirements: requisitos, requireComplete: true });
  const linter = new MockupLayoutLinter();

  const porCodigo = {};
  const filas = mockups.map((mockup) => {
    const screen = manifest.find((item) => [item.slug, item.pantalla_id].includes(mockup.nombre_pantalla)) || mockup;
    const avisos = linter.analizar(mockup.preview_code, { screen });
    for (const aviso of avisos) (porCodigo[aviso.codigo] ||= []).push(mockup.nombre_pantalla);
    const enlaces = mockup.enlaces || [];
    return {
      pantalla: mockup.nombre_pantalla, plataforma: mockup.plataforma, calidad: mockup.estado_calidad,
      rf: (mockup.rf_trazabilidad || []).join(','), enlaces_invalidos: enlaces.filter((item) => item.estado === 'invalido').length,
      errores: (mockup.errores_validacion || []).length, avisos_diseno: avisos.map((item) => item.codigo).join(',')
    };
  });
  const cuenta = (campo, valor) => filas.filter((fila) => fila[campo] === valor).length;
  console.log(`Proyecto ${diseno.proyecto_id} · ${mockups.length} mockups · ${manifest.length} pantallas en el árbol`);
  console.log(`Calidad: ${cuenta('calidad', 'valido')} válidos, ${cuenta('calidad', 'advertencia')} con advertencias, ${cuenta('calidad', 'invalido')} inválidos`);
  console.log(`Trazabilidad: válida=${audit.valido} · errores=${audit.errores.length} · advertencias=${audit.advertencias.length}`);
  console.log('Cobertura:', JSON.stringify(audit.metricas));
  console.log('\nAvisos de diseño por tipo:');
  for (const [codigo, pantallas] of Object.entries(porCodigo)) console.log(`  ${codigo} (${pantallas.length}): ${pantallas.join(', ')}`);
  console.log('\nPantallas con problemas:');
  console.table(filas.filter((fila) => fila.calidad === 'invalido' || fila.errores || fila.enlaces_invalidos || fila.avisos_diseno));
  if (audit.errores.length) { console.log('\nErrores de trazabilidad:'); audit.errores.forEach((item) => console.log('  -', item)); }
  if (audit.advertencias.length) { console.log('\nAdvertencias de trazabilidad:'); audit.advertencias.slice(0, 25).forEach((item) => console.log('  -', item)); }
  await mongoose.disconnect();
})().catch((error) => { console.error(error); process.exit(1); });
