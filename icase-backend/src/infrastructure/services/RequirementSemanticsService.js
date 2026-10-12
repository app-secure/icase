function normalize(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function requirementText(requirement) {
  return [
    requirement?.nombre,
    requirement?.descripcion,
    requirement?.metrica_medible,
    requirement?.evidencia
  ].filter(Boolean).join(' ');
}

const HA_PATTERN = /alta disponibilidad|high availability|tolerancia a fallos|failover|conmutacion|99\.9%|99\.99%|redundancia activa|activo-pasivo|cluster redundante|balanceo de carga con replica/i;
const HA_REJECTION_PATTERN = /(?:no\s+(?:se\s+)?(?:requiere|requieren|desea|deseamos|queremos|solicita|necesita|incluye)|sin\s+(?:requerir|necesitar|incluir)|fuera\s+de\s+alcance|mas\s+adelante\s+(?:se\s+)?(?:evaluara|podria)|por\s+ahora\s+no)[^.!?]{0,100}(?:alta disponibilidad|failover|replica|balanceador|redundancia)|(?:alta disponibilidad|failover|replica|balanceador|redundancia)[^.!?]{0,80}(?:no\s+(?:se\s+)?(?:requiere|desea|solicita)|fuera\s+de\s+alcance)/i;

class RequirementSemanticsService {
  hasExcluded(requirement, decision) {
    const exclusions = (requirement?.restricciones_excluidas || []).map(normalize);
    if (decision instanceof RegExp) return exclusions.some((item) => decision.test(item));
    return exclusions.includes(normalize(decision));
  }

  rejectsHighAvailability(requirement) {
    const text = normalize(requirementText(requirement));
    return this.hasExcluded(requirement, 'alta_disponibilidad') || HA_REJECTION_PATTERN.test(text);
  }

  requestsHighAvailability(requirement) {
    if (!requirement || requirement?.estado_decision === 'rechazado' || this.rejectsHighAvailability(requirement)) return false;
    return HA_PATTERN.test(normalize(requirementText(requirement)));
  }

  enrich(requirement, sourceText = '') {
    const requirementOnly = normalize(requirementText(requirement));
    const combined = normalize(`${requirementText(requirement)} ${sourceText}`);
    const restrictions = new Set((requirement?.restricciones_excluidas || []).map(normalize).filter(Boolean));
    if ((HA_PATTERN.test(requirementOnly) || /disponibilidad|recuperacion|respaldo/.test(requirementOnly)) && HA_REJECTION_PATTERN.test(combined)) {
      restrictions.add('alta_disponibilidad');
    }

    const existingMetric = String(requirement?.metrica_medible || '').trim();
    const metric = existingMetric && !/por confirmar/i.test(existingMetric)
      ? existingMetric
      : this.extractPerformanceMetric(requirement);
    const requiresConfirmation = Boolean(requirement?.requiere_confirmacion) ||
      (String(requirement?.tipo || '').toUpperCase() === 'RNF' && !(metric || requirement?.metrica_medible));
    const state = requirement?.estado_decision || (requiresConfirmation ? 'pendiente' : 'confirmado');
    return {
      ...requirement,
      metrica_medible: metric || requirement?.metrica_medible,
      requiere_confirmacion: requiresConfirmation && !metric,
      estado_decision: ['confirmado', 'pendiente', 'rechazado', 'fuera_de_alcance'].includes(state) ? state : 'pendiente',
      restricciones_excluidas: [...restrictions]
    };
  }

  extractPerformanceMetric(requirement) {
    const type = String(requirement?.tipo || '').toUpperCase();
    const text = normalize(requirementText(requirement));
    if (type !== 'RNF' || !/rendimiento|latencia|tiempo de respuesta|propagacion|tiempo real/.test(text)) return '';
    const time = text.match(/(?:menos de|inferior a|menor a|hasta|maximo de|<=?)\s*(un|uno|una|\d+(?:[.,]\d+)?)\s*(milisegundos?|ms|segundos?|s)\b/);
    const concurrency = text.match(/(?:hasta|para|con)?\s*(\d+)\s*(?:personas|usuarios|conexiones)(?:\s+concurrentes|\s+conectad[oa]s)?/);
    if (!time && !concurrency) return '';
    const rawNumber = time?.[1];
    const numeric = /^(?:un|uno|una)$/.test(rawNumber || '') ? '1' : String(rawNumber || '').replace(',', '.');
    const operator = /menos de|inferior a|menor a|</.test(time?.[0] || '') ? '<' : '<=';
    const unit = /miliseg|\bms\b/.test(time?.[2] || '') ? 'ms' : 'segundo(s)';
    const parts = [];
    if (time) parts.push(`Tiempo de propagación ${operator} ${numeric} ${unit}`);
    if (concurrency) parts.push(`hasta ${concurrency[1]} conexiones concurrentes`);
    return parts.join(' para ');
  }
}

module.exports = RequirementSemanticsService;
