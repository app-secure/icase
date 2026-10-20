const express = require('express');
const { authMiddleware } = require('../infrastructure/middlewares/authMiddleware');

function buildCodificacionRoutes(controller) {
  const router = express.Router();
  // Las decisiones de stack, arquitectura y estructura son aprobaciones
  // auditables; este módulo nunca admite acceso anónimo.
  router.use(authMiddleware);
  router.get('/:id/codificacion', (req, res) => controller.obtenerPlan(req, res));
  router.post('/:id/codificacion/etapas/:etapa/sugerencia', (req, res) => controller.sugerirEtapa(req, res));
  router.put('/:id/codificacion/etapas/:etapa', (req, res) => controller.proponerEtapa(req, res));
  router.post('/:id/codificacion/etapas/:etapa/revision', (req, res) => controller.revisarEtapa(req, res));
  router.post('/:id/codificacion/backend/generar', (req, res) => controller.generarBackend(req, res));
  router.post('/:id/codificacion/backend/:artefactoId/revision', (req, res) => controller.revisarBackend(req, res));
  router.post('/:id/codificacion/frontend/generar', (req, res) => controller.generarFrontend(req, res));
  router.post('/:id/codificacion/frontend/:artefactoId/revision', (req, res) => controller.revisarFrontend(req, res));
  router.post('/:id/codificacion/pruebas/generar', (req, res) => controller.generarPruebas(req, res));
  router.post('/:id/codificacion/pruebas/:artefactoId/revision', (req, res) => controller.revisarPruebas(req, res));
  router.post('/:id/codificacion/infraestructura/generar', (req, res) => controller.generarInfraestructura(req, res));
  router.post('/:id/codificacion/infraestructura/:artefactoId/revision', (req, res) => controller.revisarInfraestructura(req, res));
  router.post('/:id/codificacion/ci-cd/generar', (req, res) => controller.generarPipeline(req, res));
  router.post('/:id/codificacion/ci-cd/:artefactoId/revision', (req, res) => controller.revisarPipeline(req, res));
  router.post('/:id/codificacion/paquete/generar', (req, res) => controller.generarPaquete(req, res));
  router.post('/:id/codificacion/paquete/:artefactoId/revision', (req, res) => controller.revisarPaquete(req, res));
  router.get('/:id/codificacion/paquete/:artefactoId/descargar', (req, res) => controller.descargarPaquete(req, res));
  router.get('/:id/artefactos', (req, res) => controller.listarArtefactos(req, res));
  router.post('/:id/artefactos/:artefactoId/verificar', (req, res) => controller.verificarArtefacto(req, res));
  router.put('/:id/artefactos/:artefactoId/archivos', (req, res) => controller.actualizarArchivo(req, res));
  return router;
}

module.exports = buildCodificacionRoutes;
