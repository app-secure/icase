const { normalizeDiagramType } = require('../constants/DiagramTypes');

class RestaurarVersionDiagrama {
  constructor({ diagramaRepository, actualizarDiagramaManualUseCase }) {
    this.diagramaRepository = diagramaRepository;
    this.actualizarDiagramaManualUseCase = actualizarDiagramaManualUseCase;
  }

  async ejecutar({ id, version }) {
    const diagrama = await this.diagramaRepository.obtenerPorId(id);
    if (!diagrama) throw new Error(`Diagrama con ID ${id} no encontrado.`);
    const versionObjetivo = Number(version);
    let snapshot = (diagrama.historial_versiones || [])
      .find((item) => Number(item.version) === versionObjetivo);
    if (!snapshot && diagrama.proyecto_id) {
      const versiones = await this.diagramaRepository.listarPorProyecto(diagrama.proyecto_id);
      const documento = versiones.find((item) =>
        item.id !== diagrama.id &&
        normalizeDiagramType(item.tipo) === normalizeDiagramType(diagrama.tipo) &&
        Number(item.version || 1) === versionObjetivo
      );
      if (documento) {
        snapshot = {
          version: Number(documento.version || 1),
          titulo: documento.titulo,
          descripcion: documento.descripcion,
          codigo_mermaid: documento.codigo_mermaid,
          codigo_plantuml: documento.codigo_plantuml,
          estado_calidad: documento.estado_calidad,
          guardado_en: documento.updatedAt || documento.createdAt
        };
      }
    }
    if (!snapshot) throw new Error(`No existe la versión ${versionObjetivo} en el historial de este diagrama.`);

    return this.actualizarDiagramaManualUseCase.ejecutar({
      id,
      datos: {
        titulo: snapshot.titulo,
        descripcion: snapshot.descripcion,
        codigo_mermaid: snapshot.codigo_mermaid,
        codigo_plantuml: snapshot.codigo_plantuml,
        restaurada_desde_version: versionObjetivo
      }
    });
  }
}

module.exports = RestaurarVersionDiagrama;
