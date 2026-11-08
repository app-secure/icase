const { normalizeDiagramType, DIAGRAM_TYPE_VALUES } = require('../constants/DiagramTypes');
const { DIAGRAM_STATES } = require('./DiagramWorkflowService');

const FIELDS = [
  'identificador', 'tipo', 'nombre', 'descripcion', 'prioridad', 'actores',
  'precondiciones', 'poscondiciones', 'metrica_medible', 'criterios_aceptacion', 'reglas_relacionadas',
  'necesidades_origen', 'estado_decision', 'restricciones_excluidas'
];

class RequirementChangeService {
  constructor({ proyectoRepository, diagramaRepository, disenoRepository = null, planCodificacionRepository = null, artefactoRepository = null }) {
    this.proyectoRepository = proyectoRepository;
    this.diagramaRepository = diagramaRepository;
    this.disenoRepository = disenoRepository;
    this.planCodificacionRepository = planCodificacionRepository;
    this.artefactoRepository = artefactoRepository;
  }

  normalize(requirements = []) {
    return requirements.map((requirement) => Object.fromEntries(FIELDS.map((field) => {
      const value = requirement[field];
      if (field === 'estado_decision') return [field, value || 'confirmado'];
      if (['necesidades_origen', 'restricciones_excluidas'].includes(field)) return [field, (Array.isArray(value) ? value : []).map(String).sort()];
      if (field === 'criterios_aceptacion') return [field, (Array.isArray(value) ? value : []).map((criterion) => ({
        descripcion: String(criterion.descripcion || '').trim(),
        necesidades_origen: [...(criterion.necesidades_origen || [])].map(String).sort()
      })).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))];
      if (field === 'reglas_relacionadas') return [field, (Array.isArray(value) ? value : []).map(String).sort()];
      if (Array.isArray(value)) return [field, [...value].map(String).sort()];
      return [field, String(value ?? '').trim()];
    }))).sort((a, b) => `${a.tipo}:${a.identificador}`.localeCompare(`${b.tipo}:${b.identificador}`));
  }

  changed(previous = [], next = []) {
    return JSON.stringify(this.normalize(previous)) !== JSON.stringify(this.normalize(next));
  }

  async invalidateCode(projectId, reason = 'Cambió el análisis de origen.') {
    if (this.planCodificacionRepository) {
      const plan = await this.planCodificacionRepository.obtenerPorProyecto(projectId);
      if (plan) await this.planCodificacionRepository.guardar(projectId, { version: Number(plan.version || 1) + 1,
        etapas: (plan.etapas || []).map(item => ({ ...item, estado: 'desactualizada', aprobada_por: null, aprobada_en: null, observaciones: reason })) });
    }
    if (this.artefactoRepository) {
      const artifacts = await this.artefactoRepository.listarPorProyecto(projectId);
      for (const artifact of artifacts) await this.artefactoRepository.actualizar(artifact.id, { estado: 'desactualizado', aprobado: false });
    }
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
    await this.invalidateCode(projectId, reason);
    return diagrams.length;
  }
}

module.exports = RequirementChangeService;
