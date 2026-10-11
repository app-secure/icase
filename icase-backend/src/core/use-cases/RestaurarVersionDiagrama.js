const { normalizeDiagramType } = require('../constants/DiagramTypes');

class RestaurarVersionDiagrama {
  constructor({ diagramaRepository }) {
    this.diagramaRepository = diagramaRepository;
  }

  async ejecutar({ id, version }) {
    const diagrama = await this.diagramaRepository.obtenerPorId(id);
    if (!diagrama) throw new Error(`Diagrama con ID ${id} no encontrado.`);
    const versionObjetivo = Number(version);
    const documentosProyecto = diagrama.proyecto_id
      ? await this.diagramaRepository.listarPorProyecto(diagrama.proyecto_id)
      : [];
    const tipo = normalizeDiagramType(diagrama.tipo);
    const documentos = [...documentosProyecto, diagrama]
      .filter((item, index, collection) =>
        normalizeDiagramType(item.tipo) === tipo &&
        collection.findIndex((candidate) => candidate.id === item.id) === index
      )
      .sort((a, b) =>
        Number(b.version || 1) - Number(a.version || 1) ||
        new Date(b.updatedAt || b.createdAt || 0) - new Date(a.updatedAt || a.createdAt || 0)
      );
    const actual = documentos[0] || diagrama;
    const snapshot = documentos
      .flatMap((documento) => [documento, ...(documento.historial_versiones || [])])
      .filter((item) => Number(item.version || 1) === versionObjetivo)
      .sort((a, b) =>
        new Date(b.guardado_en || b.updatedAt || b.createdAt || 0) -
        new Date(a.guardado_en || a.updatedAt || a.createdAt || 0)
      )[0] || null;
    if (!snapshot) throw new Error(`No existe la versión ${versionObjetivo} en el historial de este diagrama.`);

    // Restaurar solo carga un borrador. Persistirlo sin una accion explicita
    // hacia que cada intento de restauracion creara versiones duplicadas.
    return {
      id: actual.id,
      tipo: actual.tipo,
      titulo: snapshot.titulo,
      descripcion: snapshot.descripcion,
      codigo_mermaid: snapshot.codigo_mermaid,
      codigo_plantuml: snapshot.codigo_plantuml,
      estado_calidad: snapshot.estado_calidad,
      version: Number(actual.version || 1),
      restaurada_desde_version: versionObjetivo,
      es_borrador_restaurado: true
    };
  }
}

module.exports = RestaurarVersionDiagrama;
