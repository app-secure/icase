// Asigna un dueño a los proyectos creados antes de exigir sesión (no tienen usuario_id y ya no son accesibles).
//
//   node scripts/asignar-proyectos-huerfanos.js <correo>              muestra qué proyectos se asignarían
//   node scripts/asignar-proyectos-huerfanos.js <correo> --confirmar  los asigna
require('dotenv').config();
const mongoose = require('mongoose');
const Proyecto = require('../src/infrastructure/database/schemas/ProyectoSchema');
const Usuario = require('../src/infrastructure/database/schemas/UsuarioSchema');

async function main() {
  const [correo, ...flags] = process.argv.slice(2);
  if (!correo) {
    console.error('Uso: node scripts/asignar-proyectos-huerfanos.js <correo> [--confirmar]');
    process.exit(1);
  }
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/icase_db');
  try {
    const usuario = await Usuario.findOne({ correo: correo.toLowerCase().trim() });
    if (!usuario) throw new Error(`No existe un usuario con el correo ${correo}.`);
    const filtro = { $or: [{ usuario_id: null }, { usuario_id: { $exists: false } }] };
    const proyectos = await Proyecto.find(filtro).select('nombre estado_fase createdAt').lean();
    if (!proyectos.length) {
      console.log('No hay proyectos sin dueño.');
      return;
    }
    for (const proyecto of proyectos) console.log(`- ${proyecto._id}  ${proyecto.nombre}  (${proyecto.estado_fase})`);
    if (!flags.includes('--confirmar')) {
      console.log(`\n${proyectos.length} proyecto(s) sin dueño. Añade --confirmar para asignarlos a ${usuario.correo}.`);
      return;
    }
    const resultado = await Proyecto.updateMany(filtro, { $set: { usuario_id: usuario._id } });
    console.log(`\nAsignados ${resultado.modifiedCount} proyecto(s) a ${usuario.correo}.`);
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((error) => { console.error(error.message); process.exit(1); });
