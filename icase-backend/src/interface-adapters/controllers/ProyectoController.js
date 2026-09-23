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
    markdownCompilerService
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
          return { ...p, fuentes, requerimientos, diagramas };
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
        diseno
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

  async procesarConIA(req, res) {
    try {
      const { id } = req.params;
      const { insumo_adicional, insumo_bruto } = req.body;
      const resultado = await this.procesarConIAUseCase.ejecutar({
        proyectoId: id,
        insumoBrutoInput: insumo_bruto,
        insumoAdicional: insumo_adicional
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
      const { fase, aprobar_todos } = req.body;
      const resultado = await this.aprobarFaseUseCase.ejecutar({
        proyectoId: id,
        fase,
        aprobarTodosLosElementos: Boolean(aprobar_todos)
      });
      res.json(resultado);
    } catch (err) {
      res.status(400).json({ error: err.message });
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
