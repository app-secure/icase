// Quita únicamente comillas envolventes, no palabras, puntuación interna ni elipsis.
function unwrapEvidence(value) {
  let text = String(value || '').trim();
  const pairs = { '"': '"', "'": "'", '“': '”', '‘': '’', '«': '»' };
  while (text.length > 1 && pairs[text[0]] === text.at(-1)) text = text.slice(1, -1).trim();
  return text;
}
// Ubicaciones calculadas sobre el texto procesado, nunca confiadas a la IA.
// Los offsets son UTF-16 [inicio, fin); no son coordenadas del PDF original.
function inspectEvidence(value, input) {
  const text = String(input || '');
  const sections = [];
  const marker = /\[Fuente enriquecida\]\r?\nArchivo: ([^\r\n]+)[\s\S]*?\[Contenido extraído\]\r?\n/g;
  const matches = [...text.matchAll(marker)];
  if (!matches.length) sections.push({ fuente: 'insumo_directo', start: 0, end: text.length });
  else {
    if (matches[0].index > 0) sections.push({ fuente: 'insumo_directo', start: 0, end: matches[0].index });
    matches.forEach((match, index) => sections.push({ fuente: match[1].trim(), start: match.index + match[0].length, end: matches[index + 1]?.index ?? text.length }));
  }
  const entries = Array.isArray(value?.evidencias) && value.evidencias.length ? value.evidencias : [{ texto: value?.evidencia || '' }];
  const valid = [], invalid = [];
  for (const entry of entries) {
    const quote = unwrapEvidence(typeof entry === 'string' ? entry : entry?.texto);
    if (!quote) { invalid.push({ texto: quote, codigo: 'evidencia_ausente' }); continue; }
    const pattern = quote.split(/\s+/).map(part => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\s+');
    const locations = [];
    for (const section of sections) {
      if (entry?.fuente && entry.fuente !== section.fuente) continue;
      for (const match of text.slice(section.start, section.end).matchAll(new RegExp(pattern, 'giu'))) {
        locations.push({ texto: match[0], fuente: section.fuente, inicio: section.start + match.index, fin: section.start + match.index + match[0].length });
      }
    }
    if (!locations.length) invalid.push({ texto: quote, fuente: entry?.fuente, codigo: 'evidencia_no_localizada' });
    else if (locations.length > 1) invalid.push({ texto: quote, codigo: 'evidencia_ambigua' });
    else valid.push(locations[0]);
  }
  return { valid, invalid, valido: valid.length > 0 && invalid.length === 0 };
}
module.exports = { unwrapEvidence, inspectEvidence };
