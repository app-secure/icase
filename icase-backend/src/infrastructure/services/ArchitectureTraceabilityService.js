function normalize(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function tokens(value) {
  const ignored = new Set(['de', 'del', 'la', 'las', 'los', 'el', 'y', 'para', 'servidor', 'servicio', 'sistema', 'componente']);
  return [...new Set(normalize(value).replace(/[^a-z0-9]+/g, ' ').split(/\s+/)
    .filter((token) => token.length > 2 && !ignored.has(token)))];
}

function aliasesFromCode(code) {
  const result = new Map();
  for (const match of String(code || '').matchAll(/(?:Container(?:Db)?|Component|System|Deployment_Node|Node)\s*\(\s*([\w.]+)\s*,\s*"([^"]+)"/gim)) {
    result.set(normalize(match[1]), match[2]);
  }
  return result;
}

function elementPresent(item, code) {
  const lowerCode = normalize(code);
  const aliases = aliasesFromCode(code);
  const elementId = normalize(item?.elemento_id || item?.alias || '');
  if (elementId && (aliases.has(elementId) || new RegExp(`\\b${elementId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(code))) return true;
  const label = item?.elemento || item?.componente || '';
  if (!label) return true;
  if (lowerCode.includes(normalize(label))) return true;
  const expected = tokens(label);
  if (!expected.length) return true;
  const candidates = [...aliases.values(), ...[...String(code || '').matchAll(/"([^"]+)"/g)].map((match) => match[1])];
  return candidates.some((candidate) => {
    const actual = tokens(candidate);
    return expected.filter((token) => actual.includes(token)).length / expected.length >= 0.5;
  });
}

function normalizeTraceability(input, code) {
  const list = Array.isArray(input) ? input : [input].filter(Boolean);
  return list.map((item) => {
    const normalized = typeof item === 'string'
      ? (() => {
        const parts = item.split(/->|:|,/).map((part) => part.trim());
        return { rnf_id: parts[0] || 'RNF', elemento: parts[1] || parts[0] };
      })()
      : {
        rnf_id: item?.rnf_id || item?.rnf || item?.id || 'RNF',
        elemento_id: item?.elemento_id || item?.alias || '',
        elemento: item?.elemento || item?.componente || '',
        justificacion: item?.justificacion || item?.motivo || ''
      };
    return { ...normalized, presente_en_codigo: elementPresent(normalized, code) };
  });
}

module.exports = { normalizeTraceability, elementPresent, aliasesFromCode };
