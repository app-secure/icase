// Reaplica, sin IA, la estructura común y las validaciones a los mockups ya guardados de un proyecto.
// Uso: node scripts/recomponer-mockups.cjs <proyectoId>            (simulación: solo muestra qué cambiaría)
//      node scripts/recomponer-mockups.cjs <proyectoId> --aplicar   (guarda; antes copia los mockups actuales a .icase-runs/backups-mockups/)
require('dotenv').config();
const fs = require('node:fs');
const path = require('node:path');
const mongoose = require('mongoose');
const GenerarMockups = require('../src/core/use-cases/GenerarMockups');
const MongoProyectoRepository = require('../src/interface-adapters/repositories/MongoProyectoRepository');
const MongoRequerimientoRepository = require('../src/interface-adapters/repositories/MongoRequerimientoRepository');
const MongoDiagramaRepository = require('../src/interface-adapters/repositories/MongoDiagramaRepository');
const MongoDisenoRepository = require('../src/interface-adapters/repositories/MongoDisenoRepository');

(async () => {
  const proyectoId = process.argv[2];
  const aplicar = process.argv.includes('--aplicar');
  if (!proyectoId) { console.error('Indica el id del proyecto.'); process.exit(1); }
  await mongoose.connect(process.env.MONGO_URI);
  const casoUso = new GenerarMockups({
    proyectoRepository: new MongoProyectoRepository(), requerimientoRepository: new MongoRequerimientoRepository(),
    diagramaRepository: new MongoDiagramaRepository(), disenoRepository: new MongoDisenoRepository()
  });

  const { mockups, antes } = await casoUso.recomponerExistentes(proyectoId, { guardar: false });
  const calidad = (lista) => lista.reduce((cuenta, item) => ({ ...cuenta, [item.estado_calidad]: (cuenta[item.estado_calidad] || 0) + 1 }), {});
  const cambios = mockups.map((despues, index) => ({
    pantalla: despues.nombre_pantalla,
    html: antes[index].preview_code === despues.preview_code ? '=' : 'cambia',
    calidad: `${antes[index].estado_calidad} → ${despues.estado_calidad}`,
    enlaces_invalidos: `${(antes[index].enlaces || []).filter((e) => e.estado === 'invalido').length} → ${(despues.enlaces || []).filter((e) => e.estado === 'invalido').length}`,
    acciones_conectadas: (despues.ajustes_sanitizacion || []).filter((a) => a.startsWith('Acción conectada')).length
  }));
  console.table(cambios);
  console.log('Calidad antes:', JSON.stringify(calidad(antes)), '· después:', JSON.stringify(calidad(mockups)));

  if (!aplicar) { console.log('\nSimulación: no se guardó nada. Añade --aplicar para guardar.'); await mongoose.disconnect(); return; }
  const carpeta = path.resolve(__dirname, '../.icase-runs/backups-mockups');
  fs.mkdirSync(carpeta, { recursive: true });
  const copia = path.join(carpeta, `${proyectoId}-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  fs.writeFileSync(copia, JSON.stringify(antes));
  await casoUso.recomponerExistentes(proyectoId, { guardar: true });
  console.log(`\nGuardado. Copia de los mockups anteriores: ${copia}`);
  await mongoose.disconnect();
})().catch((error) => { console.error(error); process.exit(1); });
