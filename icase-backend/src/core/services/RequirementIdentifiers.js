// Solo para generaciones nuevas; nunca aplicar a revisiones de proyectos guardados.
// El número lo asigna el sistema. Un identificador repetido por el modelo no fusiona requisitos.
function originRank(row) {
  const numbers = (row.necesidades_origen || []).map(id => {
    const match = String(id).match(/(\d+)/);
    return match ? Number(match[1]) : Number.MAX_SAFE_INTEGER;
  });
  return numbers.length ? Math.min(...numbers) : Number.MAX_SAFE_INTEGER;
}

module.exports = function normalizeIdentifiers(result) {
  const rows = result.requerimientos || [];
  if (!rows.length) return result;
  const indexed = rows.map((row, index) => ({ row, index }));
  indexed.sort((a, b) => {
    const typeOrder = (a.row.tipo === 'RNF') - (b.row.tipo === 'RNF');
    if (typeOrder) return typeOrder;
    return originRank(a.row) - originRank(b.row) || a.index - b.index;
  });
  const counts = { RF: 0, RNF: 0 };
  const pairs = indexed.map(({ row }) => {
    const tipo = row.tipo === 'RNF' ? 'RNF' : 'RF';
    return { from: row.identificador, to: `${tipo}-${String(++counts[tipo]).padStart(2, '0')}`, row };
  });
  const frequency = new Map();
  for (const pair of pairs) if (pair.from) frequency.set(pair.from, (frequency.get(pair.from) || 0) + 1);
  const mapping = new Map(pairs.filter(pair => pair.from && frequency.get(pair.from) === 1 && pair.from !== pair.to).map(pair => [pair.from, pair.to]));
  const referenceFields = new Set(['identificador', 'requisito', 'requisitos', 'requisitos_afectados', 'eliminar_identificadores']);
  const textFields = new Set(['mensaje', 'justificacion', 'accion_propuesta', 'advertencias', 'errores']);
  const pattern = mapping.size ? new RegExp(`(?<![\\w-])(?:${[...mapping.keys()].sort((a, b) => b.length - a.length).map(id => id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})(?![\\w-])`, 'g') : null;
  function visit(value, field = '') {
    if (typeof value === 'string') return referenceFields.has(field) ? mapping.get(value) || value : textFields.has(field) && pattern ? value.replace(pattern, id => mapping.get(id) || id) : value;
    if (Array.isArray(value)) return value.map(item => visit(item, field));
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([name, item]) => [name, visit(item, name)]));
    return value;
  }
  const visited = visit({ ...result, requerimientos: [] });
  visited.requerimientos = pairs.map(pair => ({ ...visit(pair.row), identificador: pair.to }));
  return visited;
};
