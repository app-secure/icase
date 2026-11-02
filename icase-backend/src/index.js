require('dotenv').config();
const mongoose = require('mongoose');
const createApp = require('./app');
const { UploadCleanupService } = require('./infrastructure/services/UploadCleanupService');

const PORT = process.env.PORT || 5000;
const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/icase_db';

async function start() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log(`[MongoDB] Conectado exitosamente a ${MONGO_URI}`);

    const { app, estandarRepo, fuenteRepo, reanudarTrabajosDiagrama } = createApp();
    let cleanupTimer;
    if (process.env.UPLOAD_CLEANUP_ENABLED === 'true') {
      const cleanup = new UploadCleanupService({ repository: fuenteRepo, dryRun: process.env.UPLOAD_CLEANUP_DRY_RUN !== 'false' });
      const sweep = () => cleanup.run().then((result) => console.log('[Uploads cleanup]', result))
        .catch(() => console.error('[Uploads cleanup] Limpieza omitida: no se pudo verificar el inventario o directorio.'));
      await sweep();
      cleanupTimer = setInterval(sweep, 3600000);
      cleanupTimer.unref?.();
    }

    // Sincronizar reglas del sistema: ISO/IEC/IEEE 29148:2018 y trazabilidad.
    await estandarRepo.sembrarSiVacio();

    await reanudarTrabajosDiagrama();
    const recoveryTimer = setInterval(() => {
      reanudarTrabajosDiagrama().catch(err => console.error('[Jobs] Error recuperando diagramas:', err.message));
    }, 30000);
    recoveryTimer.unref?.();

    const server = app.listen(PORT, () => {
      console.log(`[Backend I-CASE] Servidor escuchando en http://localhost:${PORT}`);
    });
    server.once('close', () => { clearInterval(recoveryTimer); if (cleanupTimer) clearInterval(cleanupTimer); });

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
