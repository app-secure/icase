const { normalizeDiagramType, DIAGRAM_TYPE_VALUES } = require('../constants/DiagramTypes');
const { DIAGRAM_STATES } = require('./DiagramWorkflowService');

const FIELDS = [
  'identificador', 'tipo', 'nombre', 'descripcion', 'prioridad', 'actores',
  'precondiciones', 'poscondiciones', 'metrica_medible'
];

class RequirementChangeService {
  constructor({ proyectoRepository, diagramaRepository, disenoRepository = null }) {
    this.proyectoRepository = proyectoRepository;
    this.diagramaRepository = diagramaRepository;
    this.disenoRepository = disenoRepository;
  }

  normalize(requirements = []) {
    return requirements.map((requirement) => Object.fromEntries(FIELDS.map((field) => {
      const value = requirement[field];
      if (Array.isArray(value)) return [field, [...value].map(String).sort()];
      return [field, String(value ?? '').trim()];
    }))).sort((a, b) => `${a.tipo}:${a.identificador}`.localeCompare(`${b.tipo}:${b.identificador}`));
  }

  changed(previous = [], next = []) {
    return JSON.stringify(this.normalize(previous)) !== JSON.stringify(this.normalize(next));
  }

  async invalidate(projectId, reason = 'Cambió la especificación de requisitos.') {
    const diagrams = await this.diagramaRepository.listarPorProyecto(projectId);
    for (const diagram of diagrams) {
      if (!DIAGRAM_TYPE_VALUES.includes(normalizeDiagramType(diagram.tipo))) continue;
      await this.diagramaRepository.actualizar(diagram.id, {
        aprobado: false,
        estado: DIAGRAM_STATES.STALE,
        desactualizado: true,
        motivos_desactualizacion: [reason],
        aprobado_en: null,
        aprobado_por: null,
        huella_entrada: null
      });
    }
    if (this.disenoRepository && typeof this.disenoRepository.invalidarDerivados === 'function') {
      await this.disenoRepository.invalidarDerivados(projectId);
    }
    await this.proyectoRepository.actualizarEstadoFase(projectId, 'analisis_pendiente');
    return diagrams.length;
  }
}

module.exports = RequirementChangeService;
