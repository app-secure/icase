const Extractor = require('./DomainModelExtractor');

const RELATION = /^(\w+)\s*(?:"([^"]*)")?\s*([<|*o#}{+.\-]*[-.]+[>|*o#}{+.\-]*)\s*(?:"([^"]*)")?\s*(\w+)\s*(?::\s*(.*))?$/;

function blocks(code) {
  const lines = String(code || '').split(/\r?\n/);
  const items = [];
  for (let index = 0; index < lines.length; index += 1) {
    const match = lines[index].match(/^\s*(?:abstract\s+)?(class|enum|entity|interface)\s+(?:"[^"]+"\s+as\s+(\w+)|([\w.]+))/i);
    if (!match) continue;
    const start = index;
    const collected = [];
    if (!lines[index].includes('{')) {
      collected.push(lines[index]);
    } else {
      let depth = 0;
      for (let cursor = index; cursor < lines.length; cursor += 1) {
        collected.push(lines[cursor]);
        depth += (lines[cursor].match(/\{/g) || []).length - (lines[cursor].match(/\}/g) || []).length;
        index = cursor;
        if (depth <= 0) break;
      }
    }
    items.push({
      name: match[2] || match[3],
      kind: match[1].toLowerCase(),
      header: lines[start],
      lines: collected,
      start,
      end: index
    });
  }
  return items;
}

function declaredName(designNames, sourceName) {
  if (designNames.has(sourceName)) return sourceName;
  if (designNames.has(`${sourceName}Entity`)) return `${sourceName}Entity`;
  return null;
}

function attributeLines(block) {
  return block.lines.filter((line) => {
    const trimmed = line.trim();
    return trimmed && trimmed !== '}' && !trimmed.includes('(') && !/^(?:abstract\s+)?(?:class|enum|entity|interface)\b/i.test(trimmed);
  });
}

function attributeName(line) {
  const cleaned = line.trim().replace(/^[+\-#~]\s*/, '');
  return cleaned.match(/^(\w+)\s*:/)?.[1] || cleaned.match(/^[\w.<>,\s]+\s+(\w+)$/)?.[1] || null;
}

class DesignDiagramCompletion {
  /**
   * Copia al diseño las clases, atributos y asociaciones que el dominio aprobado
   * ya declaró, y enlaza un caso de uso con un puerto existente cuando ese puerto
   * ya menciona la entidad. No crea repositorios.
   */
  complete(designCode, domainCode) {
    const code = String(designCode || '');
    const domain = String(domainCode || '');
    if (!code.includes('@start') || !domain.trim()) return code;

    const extractor = new Extractor();
    const source = extractor.extract(domain);
    const target = extractor.extract(code);
    if (!source.entities.length) return code;

    const designBlocks = blocks(code);
    const domainBlocks = blocks(domain);
    const designNames = new Set(designBlocks.map((item) => item.name));
    const lines = code.split(/\r?\n/);
    let changed = false;

    for (const entity of source.entities) {
      const present = declaredName(designNames, entity.name);
      if (!present) continue;
      const designBlock = designBlocks.find((item) => item.name === present);
      const domainBlock = domainBlocks.find((item) => item.name === entity.name);
      if (!designBlock || !domainBlock || !designBlock.lines.at(-1).includes('}')) continue;
      const owned = new Set(attributeLines(designBlock).map(attributeName).filter(Boolean));
      const missing = attributeLines(domainBlock).filter((line) => {
        const name = attributeName(line);
        return name && !owned.has(name);
      });
      if (!missing.length) continue;
      lines.splice(designBlock.end, 0, ...missing);
      changed = true;
      const shift = missing.length;
      for (const block of designBlocks) {
        if (block.start > designBlock.end) {
          block.start += shift;
          block.end += shift;
        }
      }
      designBlock.end += shift;
    }

    const refreshedNames = new Set(blocks(lines.join('\n')).map((item) => item.name));
    const pendingClasses = [];
    for (const block of domainBlocks) {
      if (block.kind === 'interface') continue;
      if (block.kind !== 'enum' && !source.entities.some((entity) => entity.name === block.name)) continue;
      if (declaredName(refreshedNames, block.name)) continue;
      pendingClasses.push(block.lines.join('\n'));
      refreshedNames.add(block.name);
    }

    const presentRelations = new Set(target.relations.flatMap((relation) => [
      `${relation.from}|${relation.to}`,
      `${relation.to}|${relation.from}`
    ]));
    const pendingRelations = [];
    for (const raw of domain.split(/\r?\n/)) {
      const match = raw.trim().match(RELATION);
      if (!match || raw.trim().startsWith("'")) continue;
      const from = declaredName(refreshedNames, match[1]);
      const to = declaredName(refreshedNames, match[5]);
      if (!from || !to) continue;
      if (!source.entities.some((entity) => entity.name === match[1]) || !source.entities.some((entity) => entity.name === match[5])) continue;
      const key = `${from}|${to}`;
      if (presentRelations.has(key) || presentRelations.has(`${to}|${from}`)) continue;
      presentRelations.add(key);
      const line = from === match[1] && to === match[5] ? raw.trim() : raw.trim().replace(match[1], from).replace(match[5], to);
      pendingRelations.push(line);
    }

    const current = lines.join('\n');
    const outgoing = new Set([...current.matchAll(/^\s*(\w+)\s+(?:\.\.>|-->)\s+\w+/gm)].map((match) => match[1]));
    const explained = new Set([...current.matchAll(/^\s*note\s+(?:top|bottom|left|right)\s+of\s+(\w+)\s*:\s*(.+)$/gim)]
      .filter((match) => /sin puerto propio|no necesita dependencias|no declara persistencia/i.test(match[2]))
      .map((match) => match[1]));
    const repositories = blocks(current).filter((item) => /Repository|Repositorio/i.test(item.name) || /<<[^>]*(?:Repository|Repositorio)/i.test(item.header));
    const ports = repositories.some((item) => item.kind === 'interface')
      ? repositories.filter((item) => item.kind === 'interface')
      : repositories;
    const entityNames = source.entities.map((entity) => entity.name);
    const links = [];
    for (const block of blocks(current)) {
      if (!/(?:UseCase|CasoUso)$/i.test(block.name) && !/<<[^>]*(?:UseCase|CasoUso)/i.test(block.header)) continue;
      if (outgoing.has(block.name) || explained.has(block.name)) continue;
      const body = block.lines.join('\n');
      const needed = entityNames.filter((name) => block.name.includes(name) || new RegExp(`\\b${name}\\b`).test(body));
      const chosen = ports.filter((port) => needed.some((name) => port.name.includes(name) || port.lines.join('\n').includes(name)));
      if (chosen.length) {
        for (const port of chosen) links.push(`${block.name} --> ${port.name} : usa`);
      } else {
        links.push(`note bottom of ${block.name} : Sin puerto propio: la operación no declara persistencia adicional.`);
      }
    }

    if (!changed && !pendingClasses.length && !pendingRelations.length && !links.length) return code;

    const addition = [];
    if (pendingClasses.length) {
      const packageStart = lines.findIndex((line) => /^\s*package\s+"Dominio"\s*\{/.test(line));
      let packageEnd = -1;
      if (packageStart >= 0) {
        let depth = 0;
        let openedAt = null;
        for (let index = 0; index < lines.length; index += 1) {
          const opens = (lines[index].match(/\{/g) || []).length;
          const closes = (lines[index].match(/\}/g) || []).length;
          if (index === packageStart) openedAt = depth;
          depth += opens - closes;
          if (openedAt !== null && index > packageStart && depth === openedAt) {
            packageEnd = index;
            break;
          }
        }
      }
      if (packageEnd >= 0) lines.splice(packageEnd, 0, ...pendingClasses.flatMap((item) => item.split('\n')));
      else addition.push('package "Dominio" {', ...pendingClasses, '}');
    }
    addition.push(...pendingRelations, ...links);

    const end = lines.findIndex((line) => /^\s*@enduml\b/i.test(line));
    if (end >= 0) lines.splice(end, 0, ...addition);
    else lines.push(...addition, '@enduml');
    return lines.join('\n');
  }
}

module.exports = DesignDiagramCompletion;
