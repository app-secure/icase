const express = require('express');
const multer = require('multer');
const crypto = require('node:crypto');
const { authMiddleware } = require('../infrastructure/middlewares/authMiddleware');
const { MAX_BYTES } = require('../infrastructure/services/ProjectTransferPackage');
function buildProjectTransferRoutes(service, access) {
  const router = express.Router();
  router.use(authMiddleware);
  router.param('id', access.proyecto);
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_BYTES, files: 1, fields: 4, fieldSize: 1024 } }).single('paquete');
  const file = (req, res, next) => upload(req, res, err => {
    if (err) return res.status(err.code === 'LIMIT_FILE_SIZE' ? 413 : 400).json({ error: 'No se pudo recibir el paquete. Máximo: 64 MB y un archivo.' });
    if (!req.file) return res.status(400).json({ error: 'Selecciona un archivo .icase.json.' });
    next();
  });
  const handle = fn => async (req, res) => {
    try { await fn(req, res); }
    catch (error) {
      if (!error.status) console.error('[Transferencia] Error de operación', error.name);
      res.status(error.status || 500).json({ error: error.expose ? error.message : 'No se pudo completar la transferencia del proyecto.' });
    }
  };
  router.get('/:id/transferencia/exportar', handle(async (req, res) => {
    const bundle = await service.export(req.params.id, req.usuario.id);
    res.set('Cache-Control', 'no-store').attachment(`proyecto-${req.params.id}.icase.json`).type('application/json').send(JSON.stringify(bundle));
  }));
  router.post('/transferencias/verificar', file, handle(async (req, res) => {
    const bundle = service.verify(req.file.buffer);
    const digest = crypto.createHash('sha256').update(req.file.buffer).digest('hex');
    res.set('Cache-Control', 'no-store').json({ nombre: bundle.data.proyecto[0].nombre, counts: bundle.manifest.counts,
      fecha: bundle.manifest.created_at, archivos: bundle.files.length, sha256: digest, import_id: crypto.randomUUID(),
      report_markdown: bundle.report_markdown, aprobaciones: {
        fase: bundle.data.proyecto[0].estado_fase,
        diagramas: bundle.data.diagramas.filter(d => d.aprobado).length,
        requisitos: bundle.data.requisitos.filter(r => r.aprobado).length
      } });
  }));
  router.post('/transferencias/importar', file, handle(async (req, res) => {
    if (req.body.confirmar !== 'true' || req.body.sha256 !== crypto.createHash('sha256').update(req.file.buffer).digest('hex')) return res.status(409).json({ error: 'Verifica el mismo paquete y confirma la creación de una copia antes de importar.' });
    if (!req.body.import_id) return res.status(400).json({ error: 'Verifica el paquete antes de importarlo.' });
    const result = await service.import(req.file.buffer, req.usuario.id, req.body.nombre, req.body.import_id);
    res.set('Cache-Control', 'no-store').status(201).json(result);
  }));
  return router;
}
module.exports = buildProjectTransferRoutes;
