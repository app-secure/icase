// Incluye pendientes y versiones anteriores: un ID histórico nunca se recicla.
module.exports = function analysisIdentifiers(contents) {
  const reserved = new Set();
  const visit = value => {
    if (typeof value === 'string' && /^(N|O|ACT)-[\w-]+$/.test(value)) reserved.add(value);
    else if (Array.isArray(value)) value.forEach(visit);
    else if (value && typeof value === 'object') Object.values(value).forEach(visit);
  };
  visit(contents);
  return { next(prefix) {
    let number = Math.max(0, ...[...reserved].filter(id => id.startsWith(prefix + '-')).map(id => Number(id.slice(prefix.length + 1)) || 0)) + 1;
    let id;
    do { id = `${prefix}-${String(number++).padStart(2, '0')}`; } while (reserved.has(id));
    reserved.add(id); return id;
  } };
};
module.exports.normalizeNew = function normalizeNew(inventory) {
  if (!Array.isArray(inventory)) return inventory;
  const canonical = (value, prefix) => /^\d+$/.test(String(value || '')) ? `${prefix}-${String(value).padStart(2, '0')}` : value;
  return inventory.map(n => n && typeof n === 'object' ? { ...n, id: canonical(n.id, 'N'), ...(n.objetivo_id !== undefined ? { objetivo_id: canonical(n.objetivo_id, 'O') } : {}), ...(Array.isArray(n.objetivos_relacionados) ? { objetivos_relacionados: n.objetivos_relacionados.map(id => canonical(id, 'O')) } : {}) } : n);
};
module.exports.reserveManualAdditions = function reserveManualAdditions(current, history, next) {
  const allocator = module.exports([current, history, next]);
  const active = new Set((current.inventario || []).map(n => n.id));
  const pending = new Set((current.necesidades_pendientes || []).map(n => n.id));
  const activeGoals = new Set((current.inventario || []).map(n => n.objetivo_id));
  const historicIds = new Set(), historicGoals = new Set();
  const collect = data => { for (const n of [...(data.inventario || []), ...(data.necesidades_pendientes || []).map(p => p.elemento).filter(Boolean)]) { historicIds.add(n.id); historicGoals.add(n.objetivo_id); } };
  [current, ...history].forEach(collect);
  const goals = new Map();
  return next.map(item => {
    const resolvingPending = pending.has(item.id) && !(item.origenes || []).some(id => id !== item.id);
    if (active.has(item.id) || resolvingPending) return item;
    const result = { ...item, id: historicIds.has(item.id) ? allocator.next('N') : item.id };
    if (item.objetivo_id && historicGoals.has(item.objetivo_id) && !activeGoals.has(item.objetivo_id)) {
      if (!goals.has(item.objetivo_id)) goals.set(item.objetivo_id, allocator.next('O'));
      result.objetivo_id = goals.get(item.objetivo_id);
    }
    return result;
  });
};
