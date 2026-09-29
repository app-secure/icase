const express = require('express');

function buildMockupRoutes(mockupController) {
  const router = express.Router();

  router.post('/proyecto/:proyectoId/generar', (req, res) => mockupController.generar(req, res));
  router.get('/proyecto/:proyectoId', (req, res) => mockupController.listar(req, res));
  router.put('/proyecto/:proyectoId/:nombrePantalla', (req, res) => mockupController.actualizar(req, res));
  router.delete('/proyecto/:proyectoId/:nombrePantalla', (req, res) => mockupController.eliminar(req, res));

  return router;
}

module.exports = buildMockupRoutes;