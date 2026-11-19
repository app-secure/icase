// Notas de PlantUML: aclaraciones del modelo que enriquecen el diagrama pero lo cargan. Se muestran solo si la persona lo pide.
const SINGLE_LINE = /^\s*note\s+(?:(?:left|right|top|bottom)\b[^:\n]*|"[^"]*"\s+as\s+\w+)\s*:/i;
const BLOCK_START = /^\s*(?:note\s+(?:(?:left|right|top|bottom)\b.*|over\b.*|"[^"]*"\s+as\s+\w+|as\s+\w+)|floating\s+note\b.*)\s*$/i;
const BLOCK_END = /^\s*end\s*note\s*$/i;

export function hasNotes(code) {
  return /^\s*(?:floating\s+)?note\b/im.test(String(code || ''));
}

/** Quita las notas (de una línea y de bloque) y los conectores que apuntaban a notas con nombre. */
export function stripNotes(code) {
  const lines = String(code || '').split(/\r?\n/);
  const out = [];
  const named = new Set();
  let inBlock = false;
  for (const line of lines) {
    if (inBlock) { if (BLOCK_END.test(line)) inBlock = false; continue; }
    const alias = /\bas\s+(\w+)\s*(?::|$)/i.exec(line);
    if (/^\s*(?:floating\s+)?note\b/i.test(line)) {
      if (alias) named.add(alias[1]);
      // «note "texto" as N1» es una nota completa en una línea (no abre bloque).
      if (/^\s*(?:floating\s+)?note\s+"[^"]*"\s+as\s+\w+\s*$/i.test(line)) continue;
      if (SINGLE_LINE.test(line) || /^\s*note\s+over\b[^:]*:/i.test(line)) continue;
      if (BLOCK_START.test(line)) { inBlock = true; continue; }
      continue;
    }
    out.push(line);
  }
  if (!named.size) return out.join('\n');
  const names = [...named].join('|');
  const connector = new RegExp(`(?:^\\s*(?:${names})\\s*\\.{2,}|\\.{2,}\\s*(?:${names})\\b)`);
  return out.filter((line) => !connector.test(line)).join('\n');
}
