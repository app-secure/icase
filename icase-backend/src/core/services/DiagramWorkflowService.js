const {
  DIAGRAM_TYPE_VALUES,
  DIAGRAM_DEFINITIONS,
  normalizeDiagramType
} = require('../constants/DiagramTypes');

const DIAGRAM_STATES = Object.freeze({
  BLOCKED: 'bloqueado',
  AVAILABLE: 'disponible',
  GENERATING: 'generando',
  PENDING_REVIEW: 'pendiente_revision',
  APPROVED: 'aprobado',
  STALE: 'desactualizado',
  ERROR: 'error',
  REJECTED: 'rechazado'
});

function diagramTimestamp(diagram) {
  const value = diagram?.updatedAt || diagram?.createdAt;
  const timestamp = value ? new Date(value).getTime() : 0;
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function originVersions(diagram) {
  const raw = diagram?.versiones_origen;
  if (!raw) return {};
  if (raw instanceof Map) return Object.fromEntries(raw.entries());
  if (typeof raw.toObject === 'function') return raw.toObject();
  return typeof raw === 'object' ? raw : {};
}

class DiagramWorkflowService {
  latestByType(diagrams = []) {
    const latest = new Map();
    for (const diagram of diagrams || []) {
      const type = normalizeDiagramType(diagram?.tipo);
      if (!DIAGRAM_TYPE_VALUES.includes(type)) continue;
      const previous = latest.get(type);
      const currentVersion = Number(diagram.version || 1);
      const previousVersion = Number(previous?.version || 1);
      if (!previous || currentVersion > previousVersion ||
        (currentVersion === previousVersion && diagramTimestamp(diagram) >= diagramTimestamp(previous))) {
        latest.set(type, diagram);
      }
    }
    return latest;
  }

  staleReasons(diagram, latest = new Map()) {
    if (!diagram) return [];
    const reasons = Array.isArray(diagram.motivos_desactualizacion)
      ? [...diagram.motivos_desactualizacion]
      : [];
    const origins = originVersions(diagram);
    const definition = DIAGRAM_DEFINITIONS[normalizeDiagramType(diagram.tipo)];

    for (const dependency of definition?.dependencies || []) {
      const current = latest.get(dependency);
      const usedVersion = Number(origins[dependency]);
      const currentVersion = Number(current?.version || 1);
      if (current && Number.isFinite(usedVersion) && usedVersion > 0 && usedVersion !== currentVersion) {
        reasons.push(`Usa ${dependency} v${usedVersion}, pero la versión vigente es v${currentVersion}.`);
      }
    }
    return [...new Set(reasons.filter(Boolean))];
  }

  resolveState(diagram, latest = new Map()) {
    if (!diagram) return null;
    if (diagram.desactualizado || diagram.estado === DIAGRAM_STATES.STALE || this.staleReasons(diagram, latest).length > 0) {
      return DIAGRAM_STATES.STALE;
    }
    if (diagram.aprobado || diagram.estado === DIAGRAM_STATES.APPROVED) return DIAGRAM_STATES.APPROVED;
    return diagram.estado || DIAGRAM_STATES.PENDING_REVIEW;
  }

  build({ requirementsApproved = false, diagrams = [] } = {}) {
    const latest = this.latestByType(diagrams);
    const items = DIAGRAM_TYPE_VALUES
      .map((type) => {
        const definition = DIAGRAM_DEFINITIONS[type];
        const diagram = latest.get(type) || null;
        const unmetDependencies = definition.dependencies.filter((dependency) => {
          const dependencyDiagram = latest.get(dependency);
          return this.resolveState(dependencyDiagram, latest) !== DIAGRAM_STATES.APPROVED;
        });
        const unlocked = requirementsApproved && unmetDependencies.length === 0;
        const staleReasons = this.staleReasons(diagram, latest);
        const state = this.resolveState(diagram, latest) || (unlocked ? DIAGRAM_STATES.AVAILABLE : DIAGRAM_STATES.BLOCKED);

        return {
          tipo: type,
          label: definition.label,
          order: definition.order,
          dependencies: [...definition.dependencies],
          unmet_dependencies: unmetDependencies,
          motivos_desactualizacion: staleReasons,
          estado: state,
          habilitado: unlocked && ![DIAGRAM_STATES.GENERATING].includes(state),
          diagrama: diagram
        };
      })
      .sort((a, b) => a.order - b.order);

    return {
      items,
      todos_aprobados: items.every((item) => item.estado === DIAGRAM_STATES.APPROVED),
      siguiente: items.find((item) => item.habilitado && item.estado !== DIAGRAM_STATES.APPROVED)?.tipo || null
    };
  }

  dependentTypes(type) {
    const canonicalType = normalizeDiagramType(type);
    const found = new Set();
    const visit = (dependency) => {
      for (const candidate of DIAGRAM_TYPE_VALUES) {
        if (found.has(candidate)) continue;
        if (DIAGRAM_DEFINITIONS[candidate].dependencies.includes(dependency)) {
          found.add(candidate);
          visit(candidate);
        }
      }
    };
    visit(canonicalType);
    return [...found];
  }
}

module.exports = {
  DiagramWorkflowService,
  DIAGRAM_STATES
};
