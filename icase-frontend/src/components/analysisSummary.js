// Resolve legacy objective references for display only; never rewrite saved analysis.
export function summaryText(field, value, inventory = []) {
  const values = Array.isArray(value) ? value : [value];
  return values.filter(v => v !== undefined && v !== null && v !== '').map(v => {
    if (field !== 'objetivos' || !/^O-\d+$/i.test(String(v).trim())) return typeof v === 'object' ? (v.descripcion || v.contenido || v.nombre || v.id || '') : String(v);
    const matches = inventory.filter(n => n.objetivo_id === String(v).trim() && ['RF', 'RNF'].includes(n.tipo));
    return `${v}: ${matches.length ? [...new Set(matches.map(n => n.necesidad))].join('; ') : 'Descripción pendiente de revisión'}`;
  }).join('\n') || 'Sin información registrada';
}
