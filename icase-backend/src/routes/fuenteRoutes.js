const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const uploadDir = path.join(__dirname, '../../uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    let safeName = 'archivo';
    try {
      safeName = Buffer.from(file.originalname, 'latin1').toString('utf8');
    } catch (e) {
      safeName = file.originalname;
    }
    const ext = path.extname(safeName) || '';
    const base = path.basename(safeName, ext).replace(/[^a-zA-Z0-9_\-\.]/g, '_');
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, `${uniqueSuffix}-${base}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 } // 50 MB
});

function buildFuenteRoutes(fuenteController) {
  const router = express.Router();

  router.post('/proyectos/:proyectoId/fuentes', upload.single('archivo'), (req, res) =>
    fuenteController.subirYTranscribir(req, res)
  );
  router.get('/proyectos/:proyectoId/fuentes', (req, res) =>
    fuenteController.listar(req, res)
  );
  router.delete('/fuentes/:id', (req, res) =>
    fuenteController.eliminar(req, res)
  );
  router.delete('/proyectos/:proyectoId/fuentes/:fuenteIdOrName', (req, res) =>
    fuenteController.eliminarFuenteDeProyecto(req, res)
  );

  return router;
}

module.exports = buildFuenteRoutes;
