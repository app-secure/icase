const express = require('express');

function buildDiagramaRoutes(diagramaController) {
  const router = express.Router();

  router.put('/:id', (req, res) => diagramaController.actualizar(req, res));
  router.post('/validar-sintaxis', (req, res) => diagramaController.validarSintaxis(req, res));

  return router;
}

module.exports = buildDiagramaRoutes;
