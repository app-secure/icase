const { inspectEvidence } = require('./SourceEvidence');
const pendingMetric = text => !String(text || '').trim() || /por confirmar/i.test(text);

function agreedCondition(needs) {
  const conditions = needs.flatMap(n => {
    if (n.estado !== 'confirmado') return [];
    if (!pendingMetric(n.metrica_medible)) return [n.metrica_medible];
    // Preserve the literal agreed condition, not an invented numeric translation.
    // It can be quantitative OR an observable qualitative restriction.
    return String(n.necesidad || '').split(/(?<=[.!?])\s+/).filter(sentence =>
      /\d+\s*(?:horas?|minutos?|segundos?|d[ií]as?|%|copias?|usuarios?|participantes?)/iu.test(sentence) ||
      /\b(?:un[oa]?|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez)\s+(?:de\s+(?:\d+|[\p{L}]+)|copias?|horas?|minutos?|segundos?|participantes?)\b/iu.test(sentence) ||
      /\bno\s+(?:se\s+)?(?:almacen|registr|permit|expon|acept|transmit)[\p{L}]*\b/iu.test(sentence) ||
      /\b(?:se\s+rechazan?|rechazando|impidiendo)\b/iu.test(sentence));
  });
  return [...new Set(conditions)].join(' ');
}

function ground(req, analysis, input) {
  const needs = (analysis?.inventario || []).filter(n => (req.necesidades_origen || []).includes(n.id) && n.tipo === req.tipo);
  if (!needs.length || needs.some(n => !inspectEvidence(n, input).valido)) return req;
  const explicitOrigin = needs.every(n => n.estado === 'confirmado' && n.origen !== 'inferido');
  let next = { ...req, ...(explicitOrigin ? { origen: 'explicito' } : {}) };
  const originalQuestions = analysis.inventario || [];
  const pending = needs.some(n => n.estado === 'pendiente' || (n.preguntas_ids || []).some(id => originalQuestions.some(q => q.id === id && q.estado === 'pendiente' && !q.respuesta)));
  if (req.tipo === 'RNF' && pendingMetric(req.metrica_medible)) {
    const condition = agreedCondition(needs);
    if (condition) next.metrica_medible = condition;
  }
  // A confirmed obligation with a testable qualitative condition does not need a
  // fabricated percentage. Do not retain the model's generic pending default.
  const requiresConfirmation = pending || (req.tipo === 'RNF' && pendingMetric(next.metrica_medible));
  return { ...next, requiere_confirmacion: requiresConfirmation, estado_decision: requiresConfirmation ? 'pendiente' : 'confirmado' };
}
module.exports = { ground, agreedCondition };
