// Resolve legacy objective references for display only; never rewrite saved analysis.
export function objectiveGroups(inventory = []) {
  const groups = new Map();
  for (const item of inventory) {
    if (!['RF', 'RNF'].includes(item?.tipo) || !/^O-\d+$/i.test(String(item.objetivo_id || ''))) continue;
    const id = String(item.objetivo_id);
    groups.set(id, [...(groups.get(id) || []), item]);
  }
  return [...groups.entries()]
    .sort((a, b) => a[0].localeCompare(b[0], 'es', { numeric: true }))
    .map(([id, items]) => ({ id, needIds: items.map(item => item.id), text: items[0].necesidad || '' }));
}
export function objectiveCatalog(inventory = []) {
  return objectiveGroups(inventory).map(group => `${group.id} · ${group.needIds.join(', ')} — ${group.text}`).join('\n');
}
export function objectiveLines(value, inventory = []) {
  const catalog = objectiveCatalog(inventory);
  if (catalog) return catalog.split('\n');
  const values = Array.isArray(value) ? value : [value];
  return values.flatMap(item => {
    if (item && typeof item === 'object') return [item.descripcion || item.contenido || item.nombre || item.id || ''];
    return String(item ?? '').split('\n');
  }).map(line => line.trim()).filter(Boolean).map((line, index) => /^(?:\d+\.\s|O-\d+\b)/i.test(line) ? line : `${index + 1}. ${line}`);
}
export function summaryText(field, value, inventory = []) {
  if (field === 'objetivos') return objectiveLines(value, inventory).join('\n') || 'Sin información registrada';
  const values = Array.isArray(value) ? value : [value];
  return values.filter(v => v !== undefined && v !== null && v !== '').map(v => typeof v === 'object' ? (v.descripcion || v.contenido || v.nombre || v.id || '') : String(v)).join('\n') || 'Sin información registrada';
}
