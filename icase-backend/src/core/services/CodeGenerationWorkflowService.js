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
    return etapas.map((item) => afectadas.has(item.etapa) && item.estado === CODE_PHASE_STATES.APPROVED
      ? { ...item, estado: CODE_PHASE_STATES.STALE, observaciones: `Desactualizada por cambios en ${etapaCambiada}.` }
      : item);
  }

  sincronizarBloqueos(etapas) {
    const estados = new Map(etapas.map((item) => [item.etapa, item.estado]));
    return etapas.map((item) => {
      const definition = this.obtenerDefinicion(item.etapa);
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
}

module.exports = CodeGenerationWorkflowService;
