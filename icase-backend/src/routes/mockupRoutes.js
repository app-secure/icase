const express = require('express');

function buildMockupRoutes(mockupController) {
  const router = express.Router();

  router.post('/proyecto/:proyectoId/generar', (req, res) => mockupController.generar(req, res));
  router.post('/proyecto/:proyectoId/trabajos', (req, res) => mockupController.iniciarTrabajo(req, res));
  router.get('/proyecto/:proyectoId/trabajos/ultimo', (req, res) => mockupController.obtenerUltimoTrabajo(req, res));
  router.get('/trabajos/:trabajoId', (req, res) => mockupController.obtenerTrabajo(req, res));
  router.get('/proyecto/:proyectoId', (req, res) => mockupController.listar(req, res));
  router.post('/proyecto/:proyectoId/sugerir-paleta', (req, res) => mockupController.sugerirSistemaDiseno(req, res));
  router.put('/proyecto/:proyectoId/sistema-diseno', (req, res) => mockupController.actualizarSistemaDiseno(req, res));
  router.put('/proyecto/:proyectoId/:nombrePantalla', (req, res) => mockupController.actualizar(req, res));
  router.delete('/proyecto/:proyectoId/:nombrePantalla', (req, res) => mockupController.eliminar(req, res));

  return router;
}

module.exports = buildMockupRoutes;
