const express = require('express');
const { authMiddleware } = require('../infrastructure/middlewares/authMiddleware');

function buildRequerimientoRoutes(requerimientoController, access) {
  const router = express.Router();

  router.use(authMiddleware);
  router.param('id', access.requerimiento);
  router.param('proyectoId', access.proyecto);

  router.put('/:id', (req, res) => requerimientoController.actualizar(req, res));
  router.put('/proyecto/:proyectoId', (req, res) => requerimientoController.sincronizarProyecto(req, res));
  router.post('/', access.proyectoEnCuerpo('proyecto_id'), (req, res) => requerimientoController.crearManual(req, res));

  return router;
}

module.exports = buildRequerimientoRoutes;
