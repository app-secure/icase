const { DiagramWorkflowService } = require('../../core/services/DiagramWorkflowService');
const { normalizeDiagramType, isValidDiagramType } = require('../../core/constants/DiagramTypes');

class ProyectoController {
  constructor({
    crearProyectoUseCase,
    procesarConIAUseCase,
    aprobarFaseUseCase,
    proyectoRepository,
    requerimientoRepository,
    diagramaRepository,
    fuenteRepository,
    casoDeUsoRepository,
    disenoRepository,
    markdownCompilerService,
    trabajoGeneracionRepository
  }) {
    this.crearProyectoUseCase = crearProyectoUseCase;
    this.procesarConIAUseCase = procesarConIAUseCase;
    this.aprobarFaseUseCase = aprobarFaseUseCase;
    this.proyectoRepository = proyectoRepository;
    this.requerimientoRepository = requerimientoRepository;
    this.diagramaRepository = diagramaRepository;
    this.fuenteRepository = fuenteRepository;
    this.casoDeUsoRepository = casoDeUsoRepository;
    this.disenoRepository = disenoRepository;
    this.markdownCompilerService = markdownCompilerService;
    this.trabajoGeneracionRepository = trabajoGeneracionRepository;
    this.diagramWorkflowService = new DiagramWorkflowService();
  }

  async crear(req, res) {
    try {
      const { nombre, descripcion, insumo_bruto, parametros } = req.body;
      const usuario_id = req.usuario?.id || req.body.usuario_id || null;
      const proyecto = await this.crearProyectoUseCase.ejecutar({
        usuario_id,
        nombre: nombre || 'Proyecto sin nombre',
        descripcion: descripcion || '',
        insumo_bruto: insumo_bruto || '',
        parametros
      });
      res.status(201).json(proyecto);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  }

  async listar(req, res) {
    try {
      const filtro = {};
      if (req.usuario?.id) {
        filtro.usuario_id = req.usuario.id;
      }
      const proyectos = await this.proyectoRepository.listar(filtro);
      // Asociar fuentes, requerimientos y diagramas a cada proyecto para persistencia completa
      const proyectosCompletos = await Promise.all(
        proyectos.map(async (p) => {
          const [fuentes, requerimientos, diagramas] = await Promise.all([
            this.fuenteRepository ? this.fuenteRepository.listarPorProyecto(p.id) : [],
            this.requerimientoRepository ? this.requerimientoRepository.listarPorProyecto(p.id) : [],
            this.diagramaRepository ? this.diagramaRepository.listarPorProyecto(p.id) : []
          ]);
          const requirementsApproved = ['analisis_aprobado', 'diseno_pendiente', 'diagramas_aprobados', 'mockups_pendientes', 'mockups_aprobados', 'diseno_aprobado', 'finalizado']
            .includes(p.estado_fase);
          return {
            ...p,
            fuentes,
            requerimientos,
            diagramas,
            flujoDiagramas: this.diagramWorkflowService.build({ requirementsApproved, diagrams })
          };
        })
      );
      res.json(proyectosCompletos);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }

  async actualizar(req, res) {
    try {
      const { id } = req.params;
      const data = req.body;
      const actualizado = await this.proyectoRepository.actualizar(id, data);
      if (!actualizado) {
        return res.status(404).json({ error: 'Proyecto no encontrado para actualizar' });
      }
      res.json(actualizado);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  }

  async obtenerPorId(req, res) {
    try {
      const { id } = req.params;
      const proyecto = await this.proyectoRepository.obtenerPorId(id);
      if (!proyecto) {
        return res.status(404).json({ error: 'Proyecto no encontrado' });
      }

      const [requerimientos, diagramas, fuentes, casosDeUso, diseno] = await Promise.all([
        this.requerimientoRepository.listarPorProyecto(id),
        this.diagramaRepository.listarPorProyecto(id),
        this.fuenteRepository ? this.fuenteRepository.listarPorProyecto(id) : [],
        this.casoDeUsoRepository ? this.casoDeUsoRepository.listarPorProyecto(id) : [],
        this.disenoRepository ? this.disenoRepository.obtenerPorProyecto(id) : null
      ]);

      res.json({
        ...proyecto,
        requerimientos,
        diagramas,
        fuentes,
        casosDeUso,
        diseno,
        flujoDiagramas: this.diagramWorkflowService.build({
          requirementsApproved: ['analisis_aprobado', 'diseno_pendiente', 'diagramas_aprobados', 'mockups_pendientes', 'mockups_aprobados', 'diseno_aprobado', 'finalizado']
            .includes(proyecto.estado_fase),
          diagrams: diagramas
        })
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }

  async eliminar(req, res) {
    try {
      const { id } = req.params;
      await this.proyectoRepository.eliminar(id);
      res.json({ success: true, message: 'Proyecto eliminado con éxito' });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }

  async obtenerModelosIA(req, res) {
    try {
      if (this.procesarConIAUseCase && typeof this.procesarConIAUseCase.obtenerModelosDisponibles === 'function') {
        const info = await this.procesarConIAUseCase.obtenerModelosDisponibles();
        return res.json(info);
      }
      res.json({ provider_defecto: 'auto', proveedores: [] });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }

  async procesarConIA(req, res) {
    try {
      const { id } = req.params;
      const { insumo_adicional, insumo_bruto, provider, modelo, proveedor, specificModel, objetivo, tipo_diagrama } = req.body;
      const resultado = await this.procesarConIAUseCase.ejecutar({
        proyectoId: id,
        insumoBrutoInput: insumo_bruto,
        insumoAdicional: insumo_adicional,
        provider: provider || modelo || proveedor || 'auto',
        specificModel,
        objetivo: objetivo || 'completo',
        tipoDiagrama: tipo_diagrama
      });
      res.json(resultado);
    } catch (err) {
      console.error('[ProyectoController] Error en procesarConIA:', err);
      res.status(400).json({ error: err.message });
    }
  }

  async aprobarFase(req, res) {
    try {
      const { id } = req.params;
      const { fase, aprobar_todos, tipo_diagrama, decision, observaciones } = req.body;
      const resultado = await this.aprobarFaseUseCase.ejecutar({
        proyectoId: id,
        fase,
        aprobarTodosLosElementos: Boolean(aprobar_todos),
        tipoDiagrama: tipo_diagrama,
        aprobadoPor: req.usuario?.id || req.usuario?.email || null,
        decision: decision || 'aprobar',
        observaciones: observaciones || ''
      });
      res.json(resultado);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  }

  async iniciarTrabajoDiagrama(req, res) {
    try {
      const tipoDiagrama = normalizeDiagramType(req.body.tipo_diagrama);
      if (!isValidDiagramType(tipoDiagrama)) {
        return res.status(400).json({ error: 'tipo_diagrama no es válido' });
      }
      const payload = {
        proyectoId: req.params.id,
        tipoDiagrama,
        insumoBruto: req.body.insumo_bruto || '',
        insumoAdicional: req.body.insumo_adicional || '',
        provider: req.body.provider || req.body.modelo || req.body.proveedor || 'auto',
        specificModel: req.body.specificModel || null
      };
      const resultado = await this.trabajoGeneracionRepository.crearORecuperarActivoDiagrama(payload);
      if (resultado.creado) void this._ejecutarTrabajoDiagrama(resultado.trabajo.id, payload);
      res.status(resultado.creado ? 202 : 200).json({
        trabajo: resultado.trabajo,
        reutilizado: !resultado.creado,
        reanudado: Boolean(resultado.reanudado)
      });
    } catch (err) {
      console.error('[ProyectoController] Error iniciando trabajo de diagrama:', err);
      res.status(400).json({ error: err.message });
    }
  }

  async _respuestaTrabajoDiagrama(trabajo) {
    const response = { trabajo };
    if (trabajo?.estado !== 'completado') return response;
    const [proyecto, requerimientos, diagramas] = await Promise.all([
      this.proyectoRepository.obtenerPorId(trabajo.proyecto_id),
      this.requerimientoRepository.listarPorProyecto(trabajo.proyecto_id),
      this.diagramaRepository.listarPorProyecto(trabajo.proyecto_id)
    ]);
    response.resultado = {
      ...(proyecto || {}),
      proyecto_id: trabajo.proyecto_id,
      requerimientos,
      diagramas,
      flujoDiagramas: this.diagramWorkflowService.build({ requirementsApproved: true, diagrams }),
      cache_hit: Boolean(trabajo.cache_hit)
    };
    return response;
  }

  async obtenerTrabajoDiagrama(req, res) {
    try {
      const trabajo = await this.trabajoGeneracionRepository.obtenerPorId(req.params.trabajoId);
      if (!trabajo || trabajo.tipo !== 'diagrama') return res.status(404).json({ error: 'Trabajo no encontrado' });
      res.json(await this._respuestaTrabajoDiagrama(trabajo));
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }

  async obtenerUltimoTrabajoDiagrama(req, res) {
    try {
      const tipo = req.query.tipo_diagrama ? normalizeDiagramType(req.query.tipo_diagrama) : null;
      const trabajo = await this.trabajoGeneracionRepository.obtenerUltimoDiagramaPorProyecto(req.params.id, tipo);
      if (!trabajo) return res.json({ trabajo: null });
      res.json(await this._respuestaTrabajoDiagrama(trabajo));
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }

  async _ejecutarTrabajoDiagrama(trabajoId, payload) {
    const heartbeat = setInterval(() => {
      this.trabajoGeneracionRepository.actualizar(trabajoId, {
        estado: 'procesando', mensaje: 'La IA continúa generando el diagrama'
      }).catch(() => {});
    }, 30000);
    heartbeat.unref?.();
    try {
      await this.trabajoGeneracionRepository.actualizar(trabajoId, {
        estado: 'procesando', progreso: 10, mensaje: 'Generando diagrama con IA'
      });
      const resultado = await this.procesarConIAUseCase.ejecutar({
        proyectoId: payload.proyectoId,
        insumoBrutoInput: payload.insumoBruto,
        insumoAdicional: payload.insumoAdicional,
        provider: payload.provider,
        specificModel: payload.specificModel,
        objetivo: 'diagramas',
        tipoDiagrama: payload.tipoDiagrama
      });
      await this.trabajoGeneracionRepository.actualizar(trabajoId, {
        estado: 'completado', progreso: 100, mensaje: 'Diagrama generado correctamente',
        proveedor_usado: resultado?.proveedorUsado || resultado?.proveedor_usado || null,
        total_generados: 1, cache_hit: Boolean(resultado?.cache_hit), error: null
      }, true);
    } catch (err) {
      console.error(`[ProyectoController] Trabajo de diagrama ${trabajoId} falló:`, err);
      await this.trabajoGeneracionRepository.actualizar(trabajoId, {
        estado: 'fallido', progreso: 100, mensaje: 'La generación del diagrama falló', error: err.message
      }, true);
    } finally {
      clearInterval(heartbeat);
    }
  }

  async reanudarTrabajosDiagrama() {
    const trabajos = await this.trabajoGeneracionRepository.reclamarDiagramasExpirados();
    for (const trabajo of trabajos) {
      const payload = await this.trabajoGeneracionRepository.obtenerPayloadDiagrama(trabajo.id);
      if (payload) void this._ejecutarTrabajoDiagrama(trabajo.id, payload);
    }
    return trabajos.length;
  }

  async obtenerFlujoDiagramas(req, res) {
    try {
      const { id } = req.params;
      const proyecto = await this.proyectoRepository.obtenerPorId(id);
      if (!proyecto) return res.status(404).json({ error: 'Proyecto no encontrado' });
      const diagramas = await this.diagramaRepository.listarPorProyecto(id);
      const requirementsApproved = ['analisis_aprobado', 'diseno_pendiente', 'diagramas_aprobados', 'mockups_pendientes', 'mockups_aprobados', 'diseno_aprobado', 'finalizado']
        .includes(proyecto.estado_fase);
      res.json(this.diagramWorkflowService.build({ requirementsApproved, diagrams }));
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }

  async exportarMarkdown(req, res) {
    try {
      const { id } = req.params;
      const proyecto = await this.proyectoRepository.obtenerPorId(id);
      if (!proyecto) {
        return res.status(404).json({ error: 'Proyecto no encontrado' });
      }

      const [requerimientos, diagramas, fuentes, casosDeUso, diseno] = await Promise.all([
        this.requerimientoRepository.listarPorProyecto(id),
        this.diagramaRepository.listarPorProyecto(id),
        this.fuenteRepository ? this.fuenteRepository.listarPorProyecto(id) : [],
        this.casoDeUsoRepository ? this.casoDeUsoRepository.listarPorProyecto(id) : [],
        this.disenoRepository ? this.disenoRepository.obtenerPorProyecto(id) : null
      ]);

      const markdown = this.markdownCompilerService.compilar({
        proyecto,
        fuentes,
        requerimientos,
        casosDeUso,
        diseno,
        diagramas
      });

      const safeName = (proyecto.nombre || 'proyecto')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-zA-Z0-9_-]/g, '_');

      res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${safeName}_especificacion.md"`);
      res.send(markdown);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }

  async documentoConsolidado(req, res) {
    try {
      const { id } = req.params;
      const proyecto = await this.proyectoRepository.obtenerPorId(id);
      if (!proyecto) {
        return res.status(404).json({ error: 'Proyecto no encontrado' });
      }

      const estadosConDocumento = new Set(['mockups_aprobados', 'diseno_aprobado', 'finalizado']);
      if (proyecto.estado_fase && !estadosConDocumento.has(proyecto.estado_fase)) {
        return res.status(409).json({
          error: 'Debes aprobar los mockups antes de generar el documento consolidado.'
        });
      }

      const [requerimientos, diagramas, fuentes, casosDeUso, diseno] = await Promise.all([
        this.requerimientoRepository.listarPorProyecto(id),
        this.diagramaRepository.listarPorProyecto(id),
        this.fuenteRepository ? this.fuenteRepository.listarPorProyecto(id) : [],
        this.casoDeUsoRepository ? this.casoDeUsoRepository.listarPorProyecto(id) : [],
        this.disenoRepository ? this.disenoRepository.obtenerPorProyecto(id) : null
      ]);

      const markdown = this.markdownCompilerService.compilar({
        proyecto,
        fuentes,
        requerimientos,
        casosDeUso,
        diseno,
        diagramas
      });

      res.json({
        proyecto,
        fuentes,
        requerimientos,
        casosDeUso,
        diseno,
        diagramas,
        markdown
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }
}

module.exports = ProyectoController;
