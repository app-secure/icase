const express = require('express');

function buildProyectoRoutes(proyectoController) {
  const router = express.Router();

  router.post('/', (req, res) => proyectoController.crear(req, res));
  router.get('/', (req, res) => proyectoController.listar(req, res));
  router.get('/:id', (req, res) => proyectoController.obtenerPorId(req, res));
  router.delete('/:id', (req, res) => proyectoController.eliminar(req, res));
  router.post('/:id/procesar-ia', (req, res) => proyectoController.procesarConIA(req, res));
  router.post('/:id/aprobar-fase', (req, res) => proyectoController.aprobarFase(req, res));
  router.get('/:id/exportar-markdown', (req, res) => proyectoController.exportarMarkdown(req, res));
  router.get('/:id/documento-consolidado', (req, res) => proyectoController.documentoConsolidado(req, res));

  return router;
}

module.exports = buildProyectoRoutes;
