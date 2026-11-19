module.exports = function scope(previous, ids) {
  const selected = new Set(ids || []);
  const inventory = previous.inventario || [];
  const actors = previous.actores || [];
  const related = new Set(inventory.filter(item => selected.has(item.id)).flatMap(item => [item.actor_id, ...(item.reglas_ids || []), ...(item.preguntas_ids || []), ...(item.origenes || [])]).filter(Boolean));
  const goals = new Set(inventory.filter(item => selected.has(item.id)).map(item => item.objetivo_id).filter(Boolean));
  return {
    sintesis: previous.sintesis,
    inventario: inventory.filter(item => selected.has('sintesis') || selected.has(item.id) || related.has(item.id) || goals.has(item.objetivo_id) || selected.has(item.actor_id)),
    actores: actors.filter(actor => selected.has('sintesis') || selected.has(actor.id) || related.has(actor.id)),
    alcance_correccion: { editables: [...selected], relacionados_solo_lectura: true }
  };
};
