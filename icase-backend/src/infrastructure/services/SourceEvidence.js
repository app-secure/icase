// Quita únicamente comillas envolventes, no palabras, puntuación interna ni elipsis.
function unwrapEvidence(value) {
  let text = String(typeof value === 'string' ? value : value?.texto || '').trim();
  const pairs = { '"': '"', "'": "'", '“': '”', '‘': '’', '«': '»' };
  while (text.length > 1 && pairs[text[0]] === text.at(-1)) text = text.slice(1, -1).trim();
  return text;
}
// Ubicaciones calculadas sobre el texto procesado, nunca confiadas a la IA.
// Los offsets son UTF-16 [inicio, fin); no son coordenadas del PDF original.
function inspectEvidence(value, input) {
  const text = String(input || '');
  const sections = [];
  const marker = /\[Fuente enriquecida\]\r?\nArchivo: ([^\r\n]+)[\s\S]*?\[(?:Contenido extraído|contenido_original)\]\r?\n|\[Insumo adicional\]\r?\n/g;
  const matches = [...text.matchAll(marker)];
  if (!matches.length) sections.push({ fuente: 'insumo_directo', start: 0, end: text.length });
  else {
    if (matches[0].index > 0) sections.push({ fuente: 'insumo_directo', start: 0, end: matches[0].index });
    matches.forEach((match, index) => sections.push({ fuente: match[1]?.trim() || 'insumo_directo', start: match.index + match[0].length, end: matches[index + 1]?.index ?? text.length }));
  }
  const originalEntries = Array.isArray(value?.evidencias) && value.evidencias.length ? value.evidencias
    : [value?.evidencia && typeof value.evidencia === 'object' ? value.evidencia : { texto: value?.evidencia || '' }];
  // Una cita con omisiones no es un fragmento continuo. Validar cada tramo
  // independientemente, en el mismo archivo, sin acreditar elipsis inventadas.
  const separate = raw => /(?:\.{3}|…|\s+\/\s+)/u.test(raw) &&
    raw.split(/\s*(?:\.{3}|…|\s+\/\s+)\s*/u).every(part => part.trim().length >= 15);
  const fragmented = originalEntries.some(entry => separate(typeof entry === 'string' ? entry : entry?.texto || ''));
  const entries = originalEntries.flatMap(entry => {
    const raw = typeof entry === 'string' ? entry : entry?.texto || '';
    const pieces = separate(raw) ? raw.split(/\s*(?:\.{3}|…|\s+\/\s+)\s*/u) : [raw];
    return pieces.length < 2 ? [entry] : pieces.map(piece => ({ ...(typeof entry === 'object' ? entry : {}), texto: piece }));
  });
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
    if (!locations.length && !/(?:\.{3}|…)/u.test(quote)) {
      // El hablante, una conjunción inicial o el punto final no forman parte de la oración
      // citada. Se acepta solo si el resto es un fragmento literal y único.
      const withoutSpeaker = quote.replace(/^[A-ZÁÉÍÓÚÜÑ][a-záéíóúüñ]{1,24}:\s+/u, '').trim();
      const withoutPunctuation = (withoutSpeaker || quote).replace(/[.,;:]+$/u, '').trim();
      const withoutConjunction = withoutPunctuation.replace(/^(?:y|e|o)\s+/iu, '').trim();
      for (const candidate of [withoutSpeaker, withoutPunctuation, withoutConjunction]) {
        if (!candidate || candidate === quote || candidate.split(/\s+/).length < 5) continue;
        const relaxed = candidate.split(/\s+/).map(part => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\s+');
        const hits = [];
        for (const section of sections) {
          if (entry?.fuente && entry.fuente !== section.fuente) continue;
          for (const match of text.slice(section.start, section.end).matchAll(new RegExp(relaxed, 'giu'))) {
            hits.push({ texto: match[0], fuente: section.fuente, inicio: section.start + match.index, fin: section.start + match.index + match[0].length });
          }
        }
        if (hits.length === 1) { locations.push(hits[0]); break; }
      }
    }
    if (!locations.length) {
      // Recuperación conservadora de oraciones concatenadas: solo citas extensas,
      // literales, únicas, ordenadas y del mismo contenido original. Nunca buscar
      // palabras sueltas ni aceptar paráfrasis o saltos dentro de una oración.
      const sentences = quote.split(/(?<=[.!?])\s+(?=[A-ZÁÉÍÓÚÜÑ¿¡])/u);
      const recoverable = sentences.length >= 2 && sentences.length <= 8 && sentences.every(sentence => sentence.trim().split(/\s+/).length >= 6);
      const candidates = [];
      if (recoverable) for (const section of sections) {
        if (entry?.fuente && entry.fuente !== section.fuente) continue;
        const fragments = sentences.map(sentence => {
          const exact = sentence.split(/\s+/).map(part => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\s+');
          const hits = [...text.slice(section.start, section.end).matchAll(new RegExp(exact, 'giu'))];
          return hits.length === 1 ? { texto: hits[0][0], fuente: section.fuente, inicio: section.start + hits[0].index, fin: section.start + hits[0].index + hits[0][0].length } : null;
        });
        if (fragments.every(Boolean) && fragments.every((fragment, index) => !index || fragment.inicio >= fragments[index - 1].fin && fragment.inicio - fragments[index - 1].fin <= 4000)) candidates.push(fragments);
      }
      if (candidates.length === 1) valid.push(...candidates[0]);
      else invalid.push({ texto: quote, fuente: entry?.fuente, codigo: candidates.length > 1 ? 'evidencia_ambigua' : new RegExp(pattern, 'iu').test(text) ? 'evidencia_fuera_del_contenido_original' : 'evidencia_no_localizada' });
    }
    else if (locations.length > 1) invalid.push({ texto: quote, fuente: entry?.fuente, codigo: 'evidencia_ambigua', total_coincidencias: locations.length,
      candidatos: locations.slice(0, 8).map(location => {
        const section = sections.find(s => s.fuente === location.fuente && location.inicio >= s.start && location.fin <= s.end);
        const inicio = Math.max(section.start, location.inicio - 180);
        const fin = Math.min(section.end, location.fin + 180);
        return { ...location, contexto: text.slice(inicio, fin), contexto_inicio: inicio, contexto_fin: fin };
      }) });
    else valid.push(locations[0]);
  }
  if (fragmented && valid.length > 1 && new Set(valid.map(item => item.fuente)).size > 1) {
    invalid.push({ codigo: 'evidencia_fuentes_distintas' });
  }
  return { valid, invalid, valido: valid.length > 0 && invalid.length === 0 };
}
// Una cita corta puede estar bien y, aun así, repetirse. Se conserva la oración
// literal de la fuente que mejor corresponde a la necesidad; no se inventa texto.
function quoteWords(value) {
  return String(value || '').match(/[\p{L}\p{N}]+/gu) || [];
}
function locateSpans(text, quote) {
  const words = quoteWords(quote);
  const windows = [];
  if (words.length >= 2) windows.push(words);
  for (let size = words.length - 1; size >= 4; size--) {
    for (let start = 0; start <= words.length - size; start++) windows.push(words.slice(start, start + size));
  }
  for (const window of windows) {
    const pattern = window.map(part => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\s+');
    const hits = [...text.matchAll(new RegExp(pattern, 'giu'))];
    if (hits.length) return hits;
  }
  return [];
}
function supportQuote(item, input) {
  const located = inspectEvidence(item, input);
  if (located.valido) return located.valid[0];
  const quote = unwrapEvidence(item?.evidencias?.[0] || item?.evidencia);
  if (!quote || quoteWords(quote).length < 2) return null;
  const text = String(input || '');
  const sentences = [...new Set(locateSpans(text, quote).map(hit => {
    const start = Math.max(text.lastIndexOf('.', hit.index), text.lastIndexOf('!', hit.index), text.lastIndexOf('?', hit.index), text.lastIndexOf('\n', hit.index));
    const rest = text.slice(hit.index + hit[0].length);
    const endMatch = rest.match(/[.!?\n]/u);
    const end = endMatch ? hit.index + hit[0].length + endMatch.index + (endMatch[0] === '\n' ? 0 : 1) : text.length;
    return text.slice(start + 1, end).trim();
  }).filter(Boolean))];
  const hint = String(item?.necesidad || '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
  const tokens = hint.split(/[^\p{L}\p{N}]+/u).filter(token => token.length > 3);
  const score = sentence => {
    const plain = sentence.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
    return tokens.filter(token => plain.includes(token)).length;
  };
  sentences.sort((left, right) => score(right) - score(left) || right.length - left.length);
  for (const sentence of sentences) {
    const chosen = inspectEvidence({ evidencia: sentence }, input);
    if (chosen.valido) return chosen.valid[0];
    const repeated = chosen.invalid.find(entry => entry.codigo === 'evidencia_ambigua' && new Set((entry.candidatos || []).map(candidate => candidate.texto)).size === 1);
    if (repeated?.candidatos?.[0]) return repeated.candidatos[0];
  }
  return null;
}
module.exports = { unwrapEvidence, inspectEvidence, supportQuote };
