const Semantic = require('./DiagramSemanticValidatorService');
const key = text => String(text || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
function nodes(code, kind) {
  return String(code || '').split(/\r?\n/).flatMap(line => {
    const pattern = kind === 'actor' ? /^\s*actor\s+(?:"([^"]+)"|([\w.]+))(?:\s+as\s+([\w.]+))?/i : /^\s*usecase\s+(?:"([^"]+)"|([\w.]+))(?:\s+as\s+([\w.]+))?/i;
    const match = line.match(pattern);
    if (!match) return [];
    // Soporta también «usecase UC as "Etiqueta"».
    const reverse = line.match(new RegExp(`^\\s*${kind}\\s+([\\w.]+)\\s+as\\s+"([^"]+)"`, 'i'));
    const label = reverse ? reverse[2] : (match[1] || match[2]);
    return [{ label, alias: reverse ? reverse[1] : (match[3] || match[2] || `"${match[1]}"`), line }];
  });
}

/** Recupera solo casos omitidos; nunca sustituye ni borra el diagrama anterior. */
class UseCaseRepairMerger {
  merge(previous, candidate, requirements) {
    const semantic = new Semantic();
    const originalCases = nodes(previous, 'usecase');
    const originalActors = nodes(previous, 'actor');
    const missing = new Set(semantic.validarCasosUso(previous, requirements, []).metricas.rf_omitidos);
    const needed = requirements.filter(item => missing.has(item.identificador || item.id));
    const mapping = new Map();
    const addedCases = [], addedActors = [];
    let sequence = 0;
    const fresh = prefix => { let alias; do { alias = `${prefix}_${++sequence}`; } while (previous.includes(alias) || candidate.includes(alias)); return alias; };
    for (const node of nodes(candidate, 'usecase')) {
      const same = originalCases.find(item => key(item.label) === key(node.label));
      if (same) { mapping.set(node.alias, same.alias); continue; }
      if (!needed.some(req => semantic.validarCasosUso(node.line, [req], []).metricas.rf_cubiertos > 0)) continue;
      const alias = fresh('UC_RECUPERADO');
      mapping.set(node.alias, alias);
      addedCases.push({ alias, declaration: `usecase "${node.label}" as ${alias}` });
    }
    if (!addedCases.length) return null;
    for (const node of nodes(candidate, 'actor')) {
      const same = originalActors.find(item => key(item.label) === key(node.label));
      const alias = same?.alias || fresh('ACTOR_RECUPERADO');
      mapping.set(node.alias, alias);
      if (!same) addedActors.push({ alias, declaration: `actor "${node.label}" as ${alias}` });
    }
    const newAliases = new Set(addedCases.map(item => item.alias));
    const actorAliases = new Set([...originalActors.map(item => item.alias), ...addedActors.map(item => item.alias)]);
    const connected = new Set();
    const edges = String(candidate).split(/\r?\n/).flatMap(line => {
      if (/\[hidden\]/i.test(line)) return [];
      const edge = line.match(/^\s*("[^"]+"|[\w.]+)\s*((?:<[-.]+|[-.]+>|[-.]{2,}))\s*("[^"]+"|[\w.]+)(.*)$/);
      if (!edge || !mapping.has(edge[1]) || !mapping.has(edge[3])) return [];
      const left = mapping.get(edge[1]), right = mapping.get(edge[3]);
      if (newAliases.has(left) && actorAliases.has(right)) connected.add(left);
      if (newAliases.has(right) && actorAliases.has(left)) connected.add(right);
      return newAliases.has(left) || newAliases.has(right) ? [`${left} ${edge[2]} ${right}${edge[4]}`] : [];
    });
    // No agregar óvalos sueltos para simular cobertura.
    if (addedCases.some(item => !connected.has(item.alias))) return null;
    const lines = String(previous).split(/\r?\n/);
    let closing = -1;
    lines.forEach((line, index) => { if (line.trim() === '}') closing = index; });
    const boundary = lines.findIndex(line => /^\s*(rectangle|package)\s+/i.test(line));
    if (closing < 0 || boundary < 0) return null;
    lines.splice(closing, 0, 'package "Cobertura recuperada" {', ...addedCases.map(item => item.declaration), ...edges, '}');
    lines.splice(boundary, 0, ...addedActors.filter(item => edges.some(edge => edge.includes(item.alias))).map(item => item.declaration));
    return lines.join('\n');
  }
}
module.exports = UseCaseRepairMerger;
