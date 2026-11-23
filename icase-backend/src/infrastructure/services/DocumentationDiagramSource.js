const { deflateRawSync } = require('node:zlib');
function selectDiagramSource(diagram) {
  const plantuml = String(diagram.codigo_plantuml || '').trim();
  if (plantuml) return { format: 'plantuml', extension: 'puml', code: plantuml };
  const mermaid = String(diagram.codigo_mermaid || '').trim();
  const legacy = /^graph\s+TD\s+A\[Inicio:[\s\S]*?\]\s*-->\s*B\[Ejecuci[oó]n de M[oó]dulo\]\s+B\s*-->\s*C\[Fin\]\s*;?$/i.test(mermaid);
  if (mermaid && !legacy) return { format: 'mermaid', extension: 'mmd', code: mermaid };
  return null;
}
function encodePlantUML(code) {
  const standard = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const alphabet = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-_';
  return deflateRawSync(Buffer.from(code, 'utf8'), { level: 9 }).toString('base64').replace(/=+$/, '').replace(/[A-Za-z0-9+/]/g, char => alphabet[standard.indexOf(char)]);
}
module.exports = { selectDiagramSource, encodePlantUML };
