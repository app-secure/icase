const express = require('express');
const { authMiddleware } = require('../infrastructure/middlewares/authMiddleware');

function buildProyectoRoutes(proyectoController, access) {
  const router = express.Router();

  // Sesión obligatoria; cada :id es un proyecto que debe pertenecer al usuario.
  router.use(authMiddleware);
  router.param('id', access.proyecto);
  router.param('trabajoId', access.trabajo);
  const requirementsJob = action => async (req, res) => {
    const service = proyectoController.requirementJobs;
    if (!service) return res.status(503).json({ error: 'El flujo resiliente de requisitos no está habilitado.', codigo: 'REQUIREMENTS_FEATURE_DISABLED' });
    try { return await action(service, req, res); }
    catch (err) { return res.status(err.status || 500).json({ error: err.status && err.status < 500 ? err.message : 'No se pudo procesar el trabajo de requisitos.', codigo: err.code || 'REQUIREMENTS_JOB_ERROR' }); }
  };
  router.get('/trabajos-requisitos/:trabajoId', requirementsJob(async (jobs, req, res) => res.json(jobs.public(await jobs.get(req.params.trabajoId, req.usuario.id)))));
  router.post('/trabajos-requisitos/:trabajoId/reanudar', requirementsJob(async (jobs, req, res) => res.status(202).json(await jobs.resume(req.params.trabajoId, req.usuario.id))));

  router.post('/', (req, res) => proyectoController.crear(req, res));
  router.get('/', (req, res) => proyectoController.listar(req, res));
  router.get('/modelos-ia', (req, res) => proyectoController.obtenerModelosIA(req, res));
  router.get('/trabajos-diagramas/:trabajoId', (req, res) => proyectoController.obtenerTrabajoDiagrama(req, res));
  router.get('/:id', (req, res) => proyectoController.obtenerPorId(req, res));
  router.put('/:id', (req, res) => proyectoController.actualizar(req, res));
  router.delete('/:id', (req, res) => proyectoController.eliminar(req, res));
  router.post('/:id/procesar-ia', (req, res) => proyectoController.procesarConIA(req, res));
  router.post('/:id/trabajos-requisitos', requirementsJob(async (jobs, req, res) => res.status(202).json(await jobs.start(req.params.id, req.usuario.id, req.body))));
  router.get('/:id/analisis-inicial', requirementsJob(async (jobs, req, res) => {
    const state = await jobs.initialAnalysis.get(req.params.id, req.usuario.id);
    if (req.query.version) {
      if (!/^[a-f\d]{24}$/i.test(String(req.query.version))) return res.status(404).json({ error: 'Versión no encontrada.' });
      const row = await jobs.initialAnalysis.versions.get(req.query.version);
      if (!row || String(row.proyecto_id) !== req.params.id) return res.status(404).json({ error: 'Versión no encontrada.' });
      state.version_consultada = row;
    }
    res.json(state);
  }));
  router.patch('/:id/analisis-inicial', requirementsJob(async (jobs, req, res) => res.json({ analisis_inicial: await jobs.initialAnalysis.edit(req.params.id, req.usuario.id, req.body) })));
  router.post('/:id/analisis-inicial/reabrir', requirementsJob(async (jobs, req, res) => res.json({ analisis_inicial: await jobs.initialAnalysis.reopen(req.params.id, req.usuario.id, req.body) })));
  router.post('/:id/analisis-inicial/aprobar', requirementsJob(async (jobs, req, res) => {
    const approved = await jobs.initialAnalysis.approve(req.params.id, req.usuario.id, req.body);
    const state = await jobs.initialAnalysis.get(req.params.id, req.usuario.id);
    if (state.impacto.requisitos_existentes) return res.json({ aprobado: approved, trabajo: null, generacion_pendiente: true, mensaje: 'Se conservaron los requisitos existentes. Revisa el impacto y confirma una actualización puntual.' });
    try {
      const existing = await jobs.jobs.requirementsLatest(req.params.id, 'redaccion_requisitos');
      const job = existing?.entrada_requisitos?.payload?.analisisId === approved.id && existing.estado === 'completado'
        ? jobs.public(await jobs.get(existing.id, req.usuario.id))
        : await jobs.start(req.params.id, req.usuario.id, { operacion: 'redaccion_requisitos', analisis_id: approved.id, provider: req.body.provider, specificModel: req.body.specificModel });
      return res.status(202).json({ aprobado: approved, trabajo: job });
    } catch (error) {
      return res.json({ aprobado: approved, trabajo: null, generacion_pendiente: true, mensaje: 'Análisis aprobado; generación pendiente. Reintenta sin volver a extraer.' });
    }
  }));
  router.get('/:id/trabajos-requisitos/ultimo', requirementsJob(async (jobs, req, res) => {
    await jobs.jobs.requirementsRecover();
    const job = await jobs.jobs.requirementsLatest(req.params.id, req.query.operacion || null);
    res.json(job ? jobs.public(await jobs.get(job.id, req.usuario.id)) : null);
  }));
  router.post('/:id/trabajos-diagramas', (req, res) => proyectoController.iniciarTrabajoDiagrama(req, res));
  router.get('/:id/trabajos-diagramas/ultimo', (req, res) => proyectoController.obtenerUltimoTrabajoDiagrama(req, res));
  router.post('/:id/aprobar-fase', (req, res) => proyectoController.aprobarFase(req, res));
  router.post('/:id/necesidades/:necesidadId/resolver', (req, res) => proyectoController.resolverNecesidad(req, res));
  router.post('/:id/revision-requisitos', (req, res) => proyectoController.revisarRequisitos(req, res));
  router.get('/:id/flujo-diagramas', (req, res) => proyectoController.obtenerFlujoDiagramas(req, res));
  router.get('/:id/exportar-markdown', (req, res) => proyectoController.exportarMarkdown(req, res));
  router.get('/:id/documento-consolidado', (req, res) => proyectoController.documentoConsolidado(req, res));

  return router;
}

module.exports = buildProyectoRoutes;
