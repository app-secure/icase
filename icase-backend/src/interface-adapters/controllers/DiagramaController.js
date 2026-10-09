const { normalizeDiagramType } = require('../../core/constants/DiagramTypes');

class DiagramaController {
  constructor({
    actualizarDiagramaManualUseCase,
    restaurarVersionDiagramaUseCase,
    plantumlValidatorService,
    diagramaRepository
  }) {
    this.actualizarDiagramaManualUseCase = actualizarDiagramaManualUseCase;
    this.restaurarVersionDiagramaUseCase = restaurarVersionDiagramaUseCase;
    this.plantumlValidatorService = plantumlValidatorService;
    this.diagramaRepository = diagramaRepository;
  }

  async listarVersiones(req, res) {
    try {
      const diagrama = await this.diagramaRepository.obtenerPorId(req.params.id);
      if (!diagrama) return res.status(404).json({ error: 'Diagrama no encontrado' });
      const documentos = diagrama.proyecto_id
        ? await this.diagramaRepository.listarPorProyecto(diagrama.proyecto_id)
        : [];
      const versionesGeneradas = documentos
        .filter((item) => item.id !== diagrama.id && normalizeDiagramType(item.tipo) === normalizeDiagramType(diagrama.tipo))
        .map((item) => ({
          version: Number(item.version || 1),
          titulo: item.titulo,
          descripcion: item.descripcion,
          codigo_mermaid: item.codigo_mermaid,
          codigo_plantuml: item.codigo_plantuml,
          estado_calidad: item.estado_calidad,
          guardado_en: item.updatedAt || item.createdAt
        }));
      const unicas = new Map();
      for (const item of [...versionesGeneradas, ...(diagrama.historial_versiones || [])]) {
        unicas.set(Number(item.version), item);
      }
      const historial = [...unicas.values()].sort((a, b) => Number(b.version) - Number(a.version));
      res.json({
        actual: {
          version: Number(diagrama.version || 1),
          titulo: diagrama.titulo,
          estado: diagrama.estado,
          updatedAt: diagrama.updatedAt
        },
        historial
      });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  }

  async restaurarVersion(req, res) {
    try {
      const restaurado = await this.restaurarVersionDiagramaUseCase.ejecutar({
        id: req.params.id,
        version: req.body.version
      });
      res.json(restaurado);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  }

  async actualizar(req, res) {
    try {
      const { id } = req.params;
      const datos = req.body;
      const actualizado = await this.actualizarDiagramaManualUseCase.ejecutar({
        id,
        datos
      });
      res.json(actualizado);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  }

  async validarSintaxis(req, res) {
    try {
      const { codigo_plantuml, codigo_mermaid, tipo } = req.body;
      const codigo = codigo_plantuml || codigo_mermaid;
      const resultado = this.plantumlValidatorService
        ? this.plantumlValidatorService.validar(codigo, tipo)
        : { valido: true };
      res.json(resultado);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  }
}

module.exports = DiagramaController;
