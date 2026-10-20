const express = require('express');
const { authMiddleware } = require('../infrastructure/middlewares/authMiddleware');

function buildDiagramaRoutes(diagramaController, access) {
  const router = express.Router();

  router.use(authMiddleware);
  router.param('id', access.diagrama);

  router.put('/:id', (req, res) => diagramaController.actualizar(req, res));
  router.get('/:id/versiones', (req, res) => diagramaController.listarVersiones(req, res));
  router.post('/:id/restaurar', (req, res) => diagramaController.restaurarVersion(req, res));
  router.post('/validar-sintaxis', (req, res) => diagramaController.validarSintaxis(req, res));

  return router;
}

module.exports = buildDiagramaRoutes;
