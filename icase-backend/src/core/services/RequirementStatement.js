const strip = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
const tokens = value => strip(value).split(/[^a-z0-9]+/).filter(token => token.length > 3);
const stem = token => token.slice(0, 5);

function evidenceText(need) {
  return [need?.evidencia, ...(need?.evidencias || []).map(item => item?.texto)].filter(Boolean).join(' ');
}

function grounded(condition, needs) {
  const text = strip(condition);
  if (text.length < 12) return false;
  const source = strip(needs.map(evidenceText).join(' '));
  if (!source) return false;
  if (source.includes(text)) return true;
  const words = tokens(condition);
  if (words.length < 3) return false;
  return words.filter(word => source.includes(word)).length / words.length >= 0.8;
}

/** Condición de la evidencia que no está en la declaración. Sirve para no exigir un segundo criterio cuando el insumo no lo trae. */
function extraConditions(needs, coveredText) {
  const covered = strip(coveredText);
  return needs.flatMap(need => evidenceText(need).split(/(?<=[.?!])\s+/)).map(chunk => chunk.trim()).filter(chunk => {
    if (!/\b(si|antes de|salvo|cuando|menos de|siempre que)\b/i.test(chunk)) return false;
    const words = tokens(chunk);
    if (words.length < 3) return false;
    return words.filter(word => covered.includes(word)).length / words.length < 0.7;
  });
}

function overlaps(clause, rule) {
  const left = new Set(tokens(clause).map(stem));
  const shared = tokens(rule?.necesidad).map(stem).filter(token => left.has(token));
  return new Set(shared).size >= 2;
}

function capabilityOf(necesidad, rules) {
  const text = String(necesidad || '').trim().replace(/\s+/g, ' ');
  const parts = text.split(/\s*,\s*(?=solo\b|solamente\b|únicamente\b|unicamente\b|pero no\b|salvo\b)/i);
  if (parts.length < 2) return { text, linked: [] };
  const clause = parts.slice(1).join(', ');
  const linked = rules.filter(rule => overlaps(clause, rule));
  return linked.length ? { text: parts[0].replace(/[,.\s]+$/, ''), linked } : { text, linked: [] };
}

function actorLabel(name) {
  return String(name || '').trim().replace(/\p{L}+/gu, word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase());
}

function namedActor(text) {
  const match = String(text || '').match(/^(?:el|la|los|las)\s+(.+?)\s+(?:debe poder|pueden|puede|podrá|podrán|deberá|debe|haga|hagan|realice|realicen)\b/iu);
  if (!match || strip(match[1]) === 'sistema') return '';
  return actorLabel(match[1]);
}

function allow(article, actor, result) {
  const to = article.toLowerCase() === 'el' ? 'al' : `a ${article.toLowerCase()}`;
  return `El sistema debe permitir ${to} ${actor} ${result}.`;
}

function resultOf(text) {
  const clean = String(text || '').trim().replace(/[.\s]+$/, '');
  const capability = clean.match(/^(el|la|los|las)\s+(.+?)\s+(debe poder|pueden|puede|podrá|podrán|deberá|debe)\s+(.+)$/iu);
  if (capability) return strip(capability[2]) === 'sistema' && /^debe/.test(strip(capability[3])) ? capability[4] : capability[4];
  const action = clean.match(/^(el|la|los|las)\s+.+?\s+(?:haga|hagan|realice|realicen)\s+(.+)$/iu);
  if (action) return action[2];
  const quality = clean.match(/^(?:el|la|los|las)\s+.+?\s+deben\s+ser\s+(.+)$/iu);
  if (quality) return quality[1];
  return clean;
}

function statementOf(text) {
  const clean = String(text || '').trim().replace(/\s+/g, ' ').replace(/[.\s]+$/, '');
  if (!clean) return '';
  const want = clean.match(/\b(?:queremos|se requiere|se necesitan)\s+(.+)$/iu);
  if (/^si\b/i.test(clean) && want) {
    const action = want[1].replace(/\s+y poder\s+/i, ' y ').replace(/^(poder|puede)\s+/i, '');
    return `El sistema debe ${/^(permitir|realizar|registrar|autenticar|proteger|reflejar|presentar|recuperar|respaldar)\b/i.test(action) ? action : `permitir ${action}`}.`;
  }
  const quality = clean.match(/^(el|la|los|las)\s+(.+?)\s+deben\s+ser\s+(.+)$/iu);
  if (quality) return `El sistema debe presentar ${quality[1].toLowerCase()} ${quality[2]} ${quality[3]}.`;
  if (/usará|usarán/iu.test(clean)) {
    const devices = clean.replace(/usará/giu, 'en').replace(/usarán/giu, 'en');
    return `El sistema debe estar disponible según el dispositivo de cada rol: ${devices.charAt(0).toLowerCase()}${devices.slice(1)}.`;
  }
  const capability = clean.match(/^(el|la|los|las)\s+(.+?)\s+(debe poder|pueden|puede|podrá|podrán|deberá|debe)\s+(.+)$/iu);
  if (capability) {
    const [, article, actor, modal, result] = capability;
    if (strip(actor) === 'sistema' && /^debe/.test(strip(modal))) return `El sistema debe ${result}.`;
    return allow(article, actor, result);
  }
  const subjunctive = clean.match(/^(el|la|los|las)\s+(.+?)\s+(haga|hagan|realice|realicen)\s+(.+)$/iu);
  if (subjunctive) {
    const infinitive = /^hag/i.test(subjunctive[3]) ? 'hacer' : 'realizar';
    return allow(subjunctive[1], subjunctive[2], `${infinitive} ${subjunctive[4]}`);
  }
  if (/^el sistema debe\b/i.test(clean)) return `El sistema debe ${clean.replace(/^el sistema debe\s+/i, '')}.`;
  return `El sistema debe ${clean.charAt(0).toLowerCase()}${clean.slice(1)}.`;
}

function statedMetric(needs) {
  const source = needs.map(need => `${need.necesidad || ''} ${evidenceText(need)}`).join(' ');
  const match = source.match(/menos de\s+(?:un|una|\d+)\s+[a-záéíóúñ]+|\d+(?:[.,]\d+)?\s*(?:segundos?|minutos?|horas?|%)/iu);
  return match ? match[0] : '';
}

function ownCriteria(req, group, inventory) {
  const ids = group.map(need => need.id);
  const source = Array.isArray(req.criterios_aceptacion) ? req.criterios_aceptacion : [];
  if (!source.length) return [];
  const own = strip(group.map(need => need.necesidad).join(' '));
  const kept = source.filter(criterion => {
    if (!criterion || typeof criterion !== 'object' || !criterion.descripcion) return false;
    const refs = criterion.necesidades_origen || [];
    if (refs.length && !refs.some(id => ids.includes(id))) return false;
    const words = tokens(criterion.descripcion);
    const ownHits = words.filter(word => own.includes(word)).length;
    const elsewhere = inventory.some(need => need.tipo === group[0].tipo && !ids.includes(need.id) && words.filter(word => strip(need.necesidad).includes(word)).length >= 2 && words.filter(word => strip(need.necesidad).includes(word)).length > ownHits);
    return !elsewhere;
  }).map(criterion => {
    const refs = (criterion.necesidades_origen || []).filter(id => ids.includes(id));
    return { ...criterion, necesidades_origen: refs.length ? refs : ids };
  });
  if (kept.length) return kept;
  return [{ descripcion: group.map(need => statementOf(capabilityOf(need.necesidad, []).text)).join(' '), necesidades_origen: ids }];
}

function titleOf(results) {
  const text = results.filter(Boolean).join('; ');
  if (!text) return '';
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function oneRequirement(req, group, inventory, rules, replaceEvidence) {
  const tipo = req.tipo === 'RNF' ? 'RNF' : 'RF';
  const linked = new Set((req.reglas_relacionadas || []).filter(id => inventory.find(item => item.id === id)?.tipo === 'regla_negocio'));
  const capabilities = group.map(need => {
    const split = capabilityOf(need.necesidad, rules);
    split.linked.forEach(rule => linked.add(rule.id));
    return split.text;
  });
  const descripcion = capabilities.map(statementOf).filter(Boolean).join(' ');
  const nombre = titleOf(capabilities.map(resultOf)) || req.nombre || '';
  const named = [...new Set(capabilities.map(namedActor).filter(Boolean))];
  const given = (Array.isArray(req.actores) ? req.actores : []).map(actorLabel).filter(Boolean);
  const actors = named.length ? named : given;
  const metric = tipo === 'RNF' ? statedMetric(group) : '';
  const quotes = group.flatMap(need => (need.evidencias?.length ? need.evidencias : (need.evidencia ? [{ texto: need.evidencia, fuente: need.fuente }] : [])));
  const dropped = (req.necesidades_origen || []).some(id => !group.some(need => need.id === id));
  const next = {
    ...req,
    tipo,
    nombre,
    descripcion,
    ...(actors.length ? { actores: actors } : {}),
    necesidades_origen: group.map(need => need.id),
    reglas_relacionadas: [...linked],
    precondiciones: grounded(req.precondiciones, group) ? String(req.precondiciones).trim() : '',
    poscondiciones: grounded(req.poscondiciones, group) ? String(req.poscondiciones).trim() : '',
    criterios_aceptacion: ownCriteria(req, group, inventory),
    ...(replaceEvidence && quotes.length ? { evidencia: quotes[0].texto, evidencias: quotes } : {})
  };
  if (metric) {
    next.metrica_medible = metric;
    next.requiere_confirmacion = false;
    delete next.estado_decision;
  }
  if (dropped && !group.some(need => need.estado === 'pendiente')) {
    delete next.estado_decision;
    delete next.requiere_confirmacion;
  }
  return next;
}

function shape(requirements = [], inventory = []) {
  const byId = new Map(inventory.map(item => [item.id, item]));
  const rules = inventory.filter(item => item?.tipo === 'regla_negocio');
  return requirements.flatMap(req => {
    if (!req || typeof req !== 'object') return [];
    const tipo = req.tipo === 'RNF' ? 'RNF' : 'RF';
    const refs = [...new Set(req.necesidades_origen || [])].filter(id => {
      const item = byId.get(id);
      return item && item.tipo === tipo && !['rechazado', 'fuera_de_alcance'].includes(item.estado);
    });
    if (inventory.length && !refs.length) return [];
    const needs = refs.map(id => byId.get(id)).filter(Boolean);
    if (!needs.length) return [oneRequirement(req, [{ id: '', necesidad: req.descripcion || req.nombre || '', evidencia: req.evidencia }], inventory, rules, false)];
    const groups = new Map();
    for (const need of needs) {
      const key = `${need.tipo}:${need.objetivo_id || need.id}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(need);
    }
    const replaceEvidence = groups.size > 1;
    return [...groups.values()].map(group => oneRequirement(req, group, inventory, rules, replaceEvidence));
  });
}

module.exports = { shape, extraConditions, statementOf };
