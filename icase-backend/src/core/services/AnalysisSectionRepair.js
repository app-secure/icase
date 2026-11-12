const { inspectEvidence } = require('../../infrastructure/services/SourceEvidence');
const { key } = require('./RequirementActors');
module.exports = function repair(base, patch, selected, input) {
  const actors = structuredClone(base.actores);
  const used = new Set();
  for (const change of patch.correcciones_actores || []) {
    const index = actors.findIndex(a => a.id === change.id);
    if (index < 0 || !selected.has(change.id) || used.has(change.id)) throw new Error('Corrección de actor fuera de alcance.');
    used.add(change.id);
    const candidate = { ...actors[index], ...change.actor, id: change.id };
    const evidence = inspectEvidence(candidate, input);
    if (!candidate.nombre?.trim() || !['persona', 'sistema_externo'].includes(candidate.tipo) || !['confirmado', 'pendiente'].includes(candidate.estado) || !evidence.valido) throw new Error(`Actor ${change.id}: estructura o evidencia inválida.`);
    actors[index] = { ...candidate, evidencias: evidence.valid, advertencias: [] };
  }
  if (new Set(actors.map(a => key(a.nombre))).size !== actors.length) throw new Error('La reparación duplica actores.');
  const summary = patch.sintesis === undefined ? base.sintesis : patch.sintesis;
  if (patch.sintesis !== undefined) {
    if (!selected.has('sintesis')) throw new Error('Síntesis fuera del alcance de los hallazgos.');
    const errors = require('../../infrastructure/services/InitialAnalysisContract').errors({ sintesis: summary, actores: actors, inventario_necesidades: base.inventario });
    if (errors.length) throw new Error(errors.join('; '));
  }
  return { actores: actors, sintesis: summary };
};
