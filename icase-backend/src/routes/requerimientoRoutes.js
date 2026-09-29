const express = require('express');

function buildRequerimientoRoutes(requerimientoController) {
  const router = express.Router();

  router.put('/:id', (req, res) => requerimientoController.actualizar(req, res));
  router.put('/proyecto/:proyectoId', (req, res) => requerimientoController.sincronizarProyecto(req, res));
  router.post('/', (req, res) => requerimientoController.crearManual(req, res));

  return router;
}

module.exports = buildRequerimientoRoutes;
