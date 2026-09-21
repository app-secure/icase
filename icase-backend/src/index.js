require('dotenv').config();
const mongoose = require('mongoose');
const createApp = require('./app');

const PORT = process.env.PORT || 5000;
const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/icase_db';

async function start() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log(`[MongoDB] Conectado exitosamente a ${MONGO_URI}`);

    const { app, estandarRepo } = createApp();

    // Sembrar estándares obligatorios IEEE 830 y métricas cuantificables si no existen
    await estandarRepo.sembrarSiVacio();

    const server = app.listen(PORT, () => {
      console.log(`[Backend I-CASE] Servidor escuchando en http://localhost:${PORT}`);
    });

    return server;
  } catch (err) {
    console.error('[Backend I-CASE] Error al iniciar el servidor:', err);
    process.exit(1);
  }
}

if (require.main === module) {
  start();
}

module.exports = { start };
