const { normalizeDiagramType } = require('../../core/constants/DiagramTypes');
const { pick, DIAGRAM_EDITABLE } = require('../../infrastructure/security/sanitize');

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
      const tipo = normalizeDiagramType(diagrama.tipo);
      const versionesDelTipo = [...documentos, diagrama]
        .filter((item, index, collection) =>
          normalizeDiagramType(item.tipo) === tipo &&
          collection.findIndex((candidate) => candidate.id === item.id) === index
        )
        .sort((a, b) => {
          const diferenciaVersion = Number(b.version || 1) - Number(a.version || 1);
          if (diferenciaVersion) return diferenciaVersion;
          return new Date(b.updatedAt || b.createdAt || 0) - new Date(a.updatedAt || a.createdAt || 0);
        });

      // El id que llega desde la interfaz puede pertenecer a una generación anterior.
      // La versión vigente es siempre la mayor del mismo tipo dentro del proyecto.
      const actual = versionesDelTipo[0] || diagrama;
      const crearSnapshot = (item, sourceId = null) => ({
        version: Number(item.version || 1),
        titulo: item.titulo || '',
        descripcion: item.descripcion || '',
        codigo_mermaid: item.codigo_mermaid || '',
        codigo_plantuml: item.codigo_plantuml || '',
        estado_calidad: item.estado_calidad || 'advertencia',
        guardado_en: item.guardado_en || item.updatedAt || item.createdAt || null,
        sourceId
      });

      const entradas = versionesDelTipo.flatMap((documento) => [
        crearSnapshot(documento, documento.id),
        ...(documento.historial_versiones || []).map((snapshot) => crearSnapshot(snapshot, documento.id))
      ]);
      const porVersion = new Map();
      for (const entrada of entradas) {
        const existente = porVersion.get(entrada.version);
        if (!existente || new Date(entrada.guardado_en || 0) > new Date(existente.guardado_en || 0)) {
          porVersion.set(entrada.version, entrada);
        }
      }
      const firmaContenido = (item) => JSON.stringify([
        item.titulo || '',
        item.descripcion || '',
        item.codigo_mermaid || '',
        item.codigo_plantuml || ''
      ]);
      const contenidosVistos = new Set([firmaContenido(actual)]);
      const historial = [...porVersion.values()]
        .filter((item) => Number(item.version) < Number(actual.version || 1))
        .sort((a, b) => Number(b.version) - Number(a.version))
        .filter((item) => {
          const firma = firmaContenido(item);
          if (contenidosVistos.has(firma)) return false;
          contenidosVistos.add(firma);
          return true;
        });
      res.json({
        actual: {
          id: actual.id,
          version: Number(actual.version || 1),
          titulo: actual.titulo,
          estado: actual.estado,
          updatedAt: actual.updatedAt
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
      // Solo contenido: la aprobación, la versión y el proyecto los gestiona el flujo, no el cliente.
      const datos = pick(req.body, DIAGRAM_EDITABLE);
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
      const { codigo_plantuml, codigo_mermaid, tipo, rnfList, trazabilidad_rnf } = req.body;
      const codigo = codigo_plantuml || codigo_mermaid;
      const resultado = this.plantumlValidatorService
        ? this.plantumlValidatorService.validar(codigo, { tipo, rnfList, trazabilidad_rnf })
        : { valido: true };
      res.json(resultado);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  }
}

module.exports = DiagramaController;
