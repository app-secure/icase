const {
  CODE_PHASE_DEFINITIONS,
  CODE_PHASE_IDS,
  CODE_PHASE_STATES
} = require('../constants/CodeGenerationPhases');

class CodeGenerationWorkflowService {
  crearEtapasIniciales() {
    return CODE_PHASE_IDS.map((id) => ({
      etapa: id,
      estado: CODE_PHASE_DEFINITIONS[id].dependencias.length
        ? CODE_PHASE_STATES.BLOCKED
        : CODE_PHASE_STATES.PENDING,
      propuesta: null,
      observaciones: '',
      version: 0,
      aprobada_por: null,
      aprobada_en: null
    }));
  }

  obtenerDefinicion(etapa) {
    const definition = CODE_PHASE_DEFINITIONS[etapa];
    if (!definition) throw new Error(`Etapa de codificación no válida: ${etapa}`);
    return definition;
  }

  enriquecer(plan) {
    const estados = new Map((plan.etapas || []).map((item) => [item.etapa, item.estado]));
    return {
      ...plan,
      etapas: CODE_PHASE_IDS.map((id) => {
        const stored = (plan.etapas || []).find((item) => item.etapa === id) || { etapa: id };
        const definition = CODE_PHASE_DEFINITIONS[id];
        const dependenciasAprobadas = definition.dependencias.every(
          (dependency) => estados.get(dependency) === CODE_PHASE_STATES.APPROVED
        );
        let estado = stored.estado || CODE_PHASE_STATES.PENDING;
        if (!dependenciasAprobadas && estado === CODE_PHASE_STATES.PENDING) estado = CODE_PHASE_STATES.BLOCKED;
        if (dependenciasAprobadas && estado === CODE_PHASE_STATES.BLOCKED) estado = CODE_PHASE_STATES.PENDING;
        return { ...definition, ...stored, estado, habilitada: dependenciasAprobadas };
      })
    };
  }

  validarDependencias(plan, etapa) {
    const definition = this.obtenerDefinicion(etapa);
    const estados = new Map((plan.etapas || []).map((item) => [item.etapa, item.estado]));
    const faltantes = definition.dependencias.filter(
      (dependency) => estados.get(dependency) !== CODE_PHASE_STATES.APPROVED
    );
    if (faltantes.length) {
      throw new Error(`Primero debes aprobar: ${faltantes.join(', ')}.`);
    }
  }

  invalidarDependientes(etapas, etapaCambiada) {
    const afectadas = new Set();
    let nuevas = [etapaCambiada];
    while (nuevas.length) {
      const actual = nuevas.shift();
      for (const definition of Object.values(CODE_PHASE_DEFINITIONS)) {
        // `influyen`: etapas opcionales que no bloquean, pero cuyo cambio deja desactualizado lo ya generado.
        if ((definition.dependencias.includes(actual) || (definition.influyen || []).includes(actual)) && !afectadas.has(definition.id)) {
          afectadas.add(definition.id);
          nuevas.push(definition.id);
        }
      }
    }
    return etapas.map((item) => afectadas.has(item.etapa) && [CODE_PHASE_STATES.APPROVED, CODE_PHASE_STATES.IN_REVIEW].includes(item.estado)
      ? { ...item, estado: CODE_PHASE_STATES.STALE, observaciones: `Desactualizada por cambios en ${etapaCambiada}.` }
      : item);
  }

  sincronizarBloqueos(etapas) {
    const estados = new Map(etapas.map((item) => [item.etapa, item.estado]));
    return etapas.filter(item => CODE_PHASE_DEFINITIONS[item.etapa]).map((item) => {
      const definition = CODE_PHASE_DEFINITIONS[item.etapa];
      const habilitada = definition.dependencias.every(
        (dependency) => estados.get(dependency) === CODE_PHASE_STATES.APPROVED
      );
      if (habilitada && item.estado === CODE_PHASE_STATES.BLOCKED) {
        return { ...item, estado: CODE_PHASE_STATES.PENDING };
      }
      if (!habilitada && item.estado === CODE_PHASE_STATES.PENDING) {
        return { ...item, estado: CODE_PHASE_STATES.BLOCKED };
      }
      return item;
    });
  }

  /**
   * Reconcilia etapas de generación cuando un artefacto ya fue aprobado (o regenerado)
   * pero la actualización del plan quedó desfasada por un fallo parcial o concurrencia.
   */
  reconciliarEtapasConArtefactos(etapas = [], artefactos = []) {
    if (!Array.isArray(etapas) || !etapas.length || !Array.isArray(artefactos) || !artefactos.length) {
      return { etapas, corregido: false };
    }
    const latestByType = new Map();
    for (const artefacto of artefactos) {
      if (!artefacto?.tipo) continue;
      const prev = latestByType.get(artefacto.tipo);
      if (!prev || Number(artefacto.version || 0) > Number(prev.version || 0)) {
        latestByType.set(artefacto.tipo, artefacto);
      }
    }

    const stageMap = new Map(etapas.map((item) => [item.etapa, item]));
    const applyStageMap = (nextList) => nextList.forEach((item) => stageMap.set(item.etapa, item));
    let corregido = false;

    for (const id of CODE_PHASE_IDS) {
      const def = CODE_PHASE_DEFINITIONS[id];
      if (!def?.artefacto) continue;
      const current = stageMap.get(id);
      const latest = latestByType.get(def.artefacto);
      if (!current || !latest) continue;

      const dependenciasAprobadas = def.dependencias.every(
        (dep) => stageMap.get(dep)?.estado === CODE_PHASE_STATES.APPROVED
      );
      if (
        latest.estado === 'aprobado' &&
        latest.aprobado === true &&
        dependenciasAprobadas &&
        [CODE_PHASE_STATES.IN_REVIEW, CODE_PHASE_STATES.PENDING, CODE_PHASE_STATES.BLOCKED].includes(current.estado)
      ) {
        const autoObs = /^(Artefacto |Suite |Infraestructura |Pipeline |Paquete )/.test(current.observaciones || '');
        stageMap.set(id, {
          ...current,
          estado: CODE_PHASE_STATES.APPROVED,
          observaciones: autoObs ? '' : (current.observaciones || ''),
          aprobada_en: current.aprobada_en || latest.updatedAt || new Date()
        });
        corregido = true;
      } else if (
        latest.estado === 'en_revision' &&
        dependenciasAprobadas &&
        [CODE_PHASE_STATES.APPROVED, CODE_PHASE_STATES.PENDING, CODE_PHASE_STATES.BLOCKED].includes(current.estado)
      ) {
        const wasApproved = current.estado === CODE_PHASE_STATES.APPROVED;
        stageMap.set(id, {
          ...current,
          estado: CODE_PHASE_STATES.IN_REVIEW,
          aprobada_por: null,
          aprobada_en: null
        });
        if (wasApproved) {
          applyStageMap(this.invalidarDependientes(Array.from(stageMap.values()), id));
        }
        corregido = true;
      }
    }

    const synced = this.sincronizarBloqueos(etapas.map((item) => stageMap.get(item.etapa) || item));
    const syncedChanged = synced.some((item, index) => item.estado !== etapas[index]?.estado);
    if (!corregido && !syncedChanged) return { etapas, corregido: false };
    return { etapas: synced, corregido: true };
  }

  async reconciliarPlan({ plan, proyectoId, planRepository, artefactoRepository }) {
    if (!plan || typeof artefactoRepository?.listarPorProyecto !== 'function') return plan;
    const artefactos = await artefactoRepository.listarPorProyecto(proyectoId);
    const { etapas, corregido } = this.reconciliarEtapasConArtefactos(plan.etapas, artefactos);
    if (!corregido) return plan;
    if (typeof planRepository?.guardar !== 'function') return { ...plan, etapas };
    return (await planRepository.guardar(proyectoId, { etapas, version: (plan.version || 0) + 1 })) || { ...plan, etapas };
  }
}

module.exports = CodeGenerationWorkflowService;
