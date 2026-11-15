const { inspectEvidence } = require('../../infrastructure/services/SourceEvidence');
const { isRequirementNeed } = require('../constants/RequirementAnalysisContract');
const fail = message => Object.assign(new Error(message), { status: 400 });
module.exports = function apply(inventory, elements, { answer, questionId, related, identifiers }) {
  const next = structuredClone(inventory);
  const resultingIds = [];
  for (const element of elements) {
    if (!['decision', 'RF', 'RNF', 'regla_negocio', 'restriccion_tecnica'].includes(element.tipo) || !String(element.necesidad || '').trim() || !['confirmado', 'pendiente'].includes(element.estado || 'confirmado')) throw fail('Elemento de respuesta inválido.');
    const evidence = inspectEvidence(element, answer);
    if (!evidence.valido) throw fail('Cada elemento debe citar literalmente la respuesta registrada.');
    const located = evidence.valid.map(e => ({ texto: e.texto, fuente: 'insumo_directo' }));
    let candidates = [];
    if (element.destino_id || element.objetivo_id) {
      candidates = next.filter(item => item.tipo === element.tipo && isRequirementNeed(item) && (element.destino_id ? item.id === element.destino_id : item.objetivo_id === element.objetivo_id));
      if (candidates.length !== 1) throw fail('Selecciona una necesidad activa concreta para complementar; el objetivo es inexistente o está compartido.');
    }
    if (candidates.length) {
      const target = candidates[0];
      const text = element.necesidad.trim();
      target.complementos ||= [];
      if (!target.complementos.some(c => c.pregunta_id === questionId && c.contenido === text)) {
        target.complementos.push({ pregunta_id: questionId, contenido: text, estado: element.estado || 'confirmado', evidencias: located });
        if (!target.necesidad.includes(text)) target.necesidad = `${target.necesidad}\n${text}`;
      }
      const previousEvidence = target.evidencias?.length ? target.evidencias : target.evidencia ? [{ texto: target.evidencia }] : [];
      target.evidencias = [...new Map([...previousEvidence, ...located].map(e => [JSON.stringify([e.fuente, e.texto]), e])).values()];
      target.origenes = [...new Set([...(target.origenes || []), questionId])];
      target.elementos_relacionados = [...new Set([...(target.elementos_relacionados || []), ...related])].filter(id => id !== target.id);
      resultingIds.push(target.id);
    } else {
      const item = { id: identifiers.next('N'), tipo: element.tipo, necesidad: element.necesidad.trim(), estado: element.estado || 'confirmado', origen: 'explicito', evidencia: located[0].texto, evidencias: located, origenes: [questionId], elementos_relacionados: [...new Set(related)], ...(['RF', 'RNF'].includes(element.tipo) ? { objetivo_id: identifiers.next('O') } : {}) };
      next.push(item); resultingIds.push(item.id);
    }
  }
  return { inventory: next, ids: [...new Set(resultingIds)] };
};
