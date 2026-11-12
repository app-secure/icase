// Solo para generaciones nuevas; nunca aplicar a revisiones de proyectos guardados.
module.exports = function normalizeIdentifiers(result) {
  const rows = result.requerimientos || [];
  const ids = rows.map(row => row.identificador);
  if (new Set(ids).size !== ids.length || ids.some(id => !id)) return result;
  const counts = { RF: 0, RNF: 0 }, mapping = new Map();
  for (const row of rows) if (row.tipo in counts) mapping.set(row.identificador, `${row.tipo}-${String(++counts[row.tipo]).padStart(2, '0')}`);
  const referenceFields = new Set(['identificador', 'requisito', 'requisitos', 'requisitos_afectados', 'eliminar_identificadores']);
  const textFields = new Set(['mensaje', 'justificacion', 'accion_propuesta', 'advertencias', 'errores']);
  const pattern = mapping.size ? new RegExp(`(?<![\\w-])(?:${[...mapping.keys()].sort((a, b) => b.length - a.length).map(id => id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})(?![\\w-])`, 'g') : null;
  function visit(value, field = '') {
    if (typeof value === 'string') return referenceFields.has(field) ? mapping.get(value) || value : textFields.has(field) && pattern ? value.replace(pattern, id => mapping.get(id)) : value;
    if (Array.isArray(value)) return value.map(item => visit(item, field));
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([name, item]) => [name, visit(item, name)]));
    return value;
  }
  return visit(result);
};
