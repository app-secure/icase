class CodificacionController {
  constructor({ gestionarPlanCodificacion, gestionarArtefactosCodigo, artefactoRepository, zipArchiveService, trabajoGeneracionRepository = null }) {
    this.gestionarPlanCodificacion = gestionarPlanCodificacion;
    this.artefactoRepository = artefactoRepository;
    this.gestionarArtefactosCodigo = gestionarArtefactosCodigo;
    this.zipArchiveService = zipArchiveService;
    this.trabajoGeneracionRepository = trabajoGeneracionRepository;
  }

  async obtenerPlan(req, res) {
    try {
      res.json(await this.gestionarPlanCodificacion.obtener(req.params.id));
    } catch (error) {
      res.status(this._status(error)).json({ error: error.message });
    }
  }

  async proponerEtapa(req, res) {
    try {
      const plan = await this.gestionarPlanCodificacion.proponer({
        proyectoId: req.params.id,
        etapa: req.params.etapa,
        propuesta: req.body.propuesta,
        observaciones: req.body.observaciones
      });
      res.json(plan);
    } catch (error) {
      res.status(this._status(error)).json({ error: error.message });
    }
  }

  async sugerirEtapa(req, res) {
    try {
      res.json(await this.gestionarPlanCodificacion.sugerir({
        proyectoId: req.params.id,
        etapa: req.params.etapa
      }));
    } catch (error) {
      res.status(this._status(error)).json({ error: error.message });
    }
  }

  async revisarEtapa(req, res) {
    try {
      const plan = await this.gestionarPlanCodificacion.revisar({
        proyectoId: req.params.id,
        etapa: req.params.etapa,
        decision: req.body.decision,
        observaciones: req.body.observaciones,
        aprobadoPor: req.usuario?.id || null
      });
      res.json(plan);
    } catch (error) {
      res.status(this._status(error)).json({ error: error.message });
    }
  }

  async ejecutarModoUnClic(req, res) {
    try {
      const resultado = await this.gestionarPlanCodificacion.ejecutarModoUnClic({
        proyectoId: req.params.id,
        aprobadoPor: req.usuario?.id || null
      });
      res.json(resultado);
    } catch (error) {
      res.status(this._status(error)).json({ error: error.message });
    }
  }

  async listarArtefactos(req, res) {
    try {
      res.json(await this.artefactoRepository.listarPorProyecto(req.params.id, req.query.tipo || null));
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  }

  async verificarArtefacto(req, res) {
    try {
      res.json(await this.gestionarArtefactosCodigo.verificarArtefacto(req.params.id, req.params.artefactoId));
    } catch (error) {
      res.status(this._status(error)).json({ error: error.message });
    }
  }

  async iniciarVerificacionAsync(req, res) {
    try {
      if (!this.trabajoGeneracionRepository) {
        throw new Error('Repositorio de trabajos de generación no configurado.');
      }
      const proyectoId = req.params.id;
      const artefactoId = req.params.artefactoId;
      const resultado = await this.trabajoGeneracionRepository.crearORecuperarActivoVerificacion({
        proyectoId,
        artefactoId
      });

      if (resultado.creado) {
        this._ejecutarVerificacion(resultado.trabajo.id, proyectoId, artefactoId);
      }

      res.status(resultado.creado ? 202 : 200).json({
        trabajo: resultado.trabajo,
        reutilizado: !resultado.creado
      });
    } catch (error) {
      res.status(this._status(error)).json({ error: error.message });
    }
  }

  async obtenerTrabajoVerificacion(req, res) {
    try {
      if (!this.trabajoGeneracionRepository) {
        throw new Error('Repositorio de trabajos de generación no configurado.');
      }
      const trabajo = await this.trabajoGeneracionRepository.obtenerPorId(req.params.trabajoId);
      if (!trabajo) return res.status(404).json({ error: 'Trabajo de verificación no encontrado.' });
      res.json({ trabajo, verificacion: trabajo.resultado_verificacion || null });
    } catch (error) {
      res.status(this._status(error)).json({ error: error.message });
    }
  }

  async obtenerUltimoTrabajoVerificacion(req, res) {
    try {
      if (!this.trabajoGeneracionRepository) {
        throw new Error('Repositorio de trabajos de generación no configurado.');
      }
      const trabajo = await this.trabajoGeneracionRepository.obtenerUltimaVerificacionPorArtefacto(
        req.params.id,
        req.params.artefactoId
      );
      res.json({ trabajo, verificacion: trabajo?.resultado_verificacion || null });
    } catch (error) {
      res.status(this._status(error)).json({ error: error.message });
    }
  }

  async _ejecutarVerificacion(trabajoId, proyectoId, artefactoId) {
    try {
      await this.trabajoGeneracionRepository.actualizar(trabajoId, {
        estado: 'procesando',
        progreso: 20,
        mensaje: 'Iniciando verificación en contenedor Docker aislado'
      });
      const verificacion = await this.gestionarArtefactosCodigo.verificarArtefacto(proyectoId, artefactoId);
      await this.trabajoGeneracionRepository.actualizar(trabajoId, {
        estado: 'completado',
        progreso: 100,
        mensaje: verificacion.estado === 'apta' ? 'Verificación completada exitosamente' : 'Verificación completada con observaciones',
        resultado_verificacion: verificacion,
        error: null
      }, true);
    } catch (err) {
      await this.trabajoGeneracionRepository.actualizar(trabajoId, {
        estado: 'fallido',
        progreso: 100,
        mensaje: 'La verificación falló',
        error: err.message
      }, true);
    }
  }

  async actualizarArchivo(req, res) {
    try {
      res.json(await this.gestionarArtefactosCodigo.actualizarArchivo({
        proyectoId: req.params.id, artefactoId: req.params.artefactoId,
        ruta: req.body.ruta, contenido: req.body.contenido
      }));
    } catch (error) {
      res.status(this._status(error)).json({ error: error.message });
    }
  }

  async informeGeneracion(req, res) {
    try {
      res.json(await this.gestionarArtefactosCodigo.informeGeneracion(req.params.id));
    } catch (error) {
      res.status(this._status(error)).json({ error: error.message });
    }
  }

  async generarBackend(req, res) {
    try {
      res.status(201).json(await this.gestionarArtefactosCodigo.generarBackend(req.params.id));
    } catch (error) {
      res.status(this._status(error)).json({ error: error.message });
    }
  }

  async revisarBackend(req, res) {
    try {
      res.json(await this.gestionarArtefactosCodigo.revisarBackend({
        proyectoId: req.params.id,
        artefactoId: req.params.artefactoId,
        decision: req.body.decision,
        observaciones: req.body.observaciones
      }));
    } catch (error) {
      res.status(this._status(error)).json({ error: error.message });
    }
  }

  async generarFrontend(req, res) {
    try {
      res.status(201).json(await this.gestionarArtefactosCodigo.generarFrontend(req.params.id));
    } catch (error) {
      res.status(this._status(error)).json({ error: error.message });
    }
  }

  async revisarFrontend(req, res) {
    try {
      res.json(await this.gestionarArtefactosCodigo.revisarFrontend({
        proyectoId: req.params.id, artefactoId: req.params.artefactoId,
        decision: req.body.decision, observaciones: req.body.observaciones
      }));
    } catch (error) {
      res.status(this._status(error)).json({ error: error.message });
    }
  }

  async generarPruebas(req, res) {
    try { res.status(201).json(await this.gestionarArtefactosCodigo.generarPruebas(req.params.id)); }
    catch (error) { res.status(this._status(error)).json({ error: error.message }); }
  }

  async revisarPruebas(req, res) {
    try {
      res.json(await this.gestionarArtefactosCodigo.revisarPruebas({
        proyectoId: req.params.id, artefactoId: req.params.artefactoId,
        decision: req.body.decision, observaciones: req.body.observaciones
      }));
    } catch (error) { res.status(this._status(error)).json({ error: error.message }); }
  }

  async generarInfraestructura(req, res) {
    try { res.status(201).json(await this.gestionarArtefactosCodigo.generarInfraestructura(req.params.id)); }
    catch (error) { res.status(this._status(error)).json({ error: error.message }); }
  }

  async revisarInfraestructura(req, res) {
    try {
      res.json(await this.gestionarArtefactosCodigo.revisarInfraestructura({
        proyectoId: req.params.id, artefactoId: req.params.artefactoId,
        decision: req.body.decision, observaciones: req.body.observaciones
      }));
    } catch (error) { res.status(this._status(error)).json({ error: error.message }); }
  }

  async generarPipeline(req, res) {
    try { res.status(201).json(await this.gestionarArtefactosCodigo.generarPipeline(req.params.id)); }
    catch (error) { res.status(this._status(error)).json({ error: error.message }); }
  }

  async revisarPipeline(req, res) {
    try {
      res.json(await this.gestionarArtefactosCodigo.revisarPipeline({
        proyectoId: req.params.id, artefactoId: req.params.artefactoId,
        decision: req.body.decision, observaciones: req.body.observaciones
      }));
    } catch (error) { res.status(this._status(error)).json({ error: error.message }); }
  }

  async generarPaquete(req, res) {
    try { res.status(201).json(await this.gestionarArtefactosCodigo.generarPaquete(req.params.id)); }
    catch (error) { res.status(this._status(error)).json({ error: error.message }); }
  }

  async revisarPaquete(req, res) {
    try {
      res.json(await this.gestionarArtefactosCodigo.revisarPaquete({
        proyectoId: req.params.id, artefactoId: req.params.artefactoId,
        decision: req.body.decision, observaciones: req.body.observaciones
      }));
    } catch (error) { res.status(this._status(error)).json({ error: error.message }); }
  }

  async descargarPaquete(req, res) {
    try {
      const artefacto = await this.artefactoRepository.obtenerPorId(req.params.artefactoId);
      if (!artefacto || String(artefacto.proyecto_id) !== String(req.params.id) || artefacto.tipo !== 'paquete_entrega') throw new Error('Paquete de entrega no encontrado para este proyecto.');
      if (!artefacto.aprobado || artefacto.estado !== 'aprobado') throw new Error('El paquete debe aprobarse antes de descargarlo.');
      this.gestionarArtefactosCodigo.asegurarPaqueteEjecutable(artefacto);
      const zip = this.zipArchiveService.crear(artefacto.archivos || []);
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', `attachment; filename="icase-entrega-v${artefacto.version}.zip"`);
      res.setHeader('Content-Length', zip.length);
      res.send(zip);
    } catch (error) { res.status(this._status(error)).json({ error: error.message }); }
  }

  _status(error) {
    return /no encontrado/i.test(error.message) ? 404 : 400;
  }
}

module.exports = CodificacionController;
