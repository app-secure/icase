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

function infinitive(verb) {
  const word = String(verb || '').toLowerCase();
  const irregular = { cierra: 'cerrar', cierran: 'cerrar', tiene: 'tener', tienen: 'tener', hace: 'hacer', hacen: 'hacer', pide: 'pedir', piden: 'pedir', ve: 'ver', ven: 'ver' };
  if (irregular[word]) return irregular[word];
  if (/[aei]n$/i.test(word) && word.length > 4) return `${word.slice(0, -2)}${word.endsWith('an') ? 'ar' : word.endsWith('en') ? 'er' : 'ir'}`;
  if (/a$/i.test(word) && word.length > 3) return `${word.slice(0, -1)}ar`;
  if (/e$/i.test(word) && word.length > 3) return `${word.slice(0, -1)}er`;
  return '';
}
function behaviorOf(text) {
  const clean = String(text || '').trim().replace(/\s+/g, ' ').replace(/[.\s]+$/, '');
  const capability = clean.match(/^(el|la|los|las)\s+(.+?)\s+(?:debe poder|pueden|puede|podrá|podrán|deberá|debe)\s+(.+)$/iu);
  if (capability && strip(capability[2]) !== 'sistema') return { article: `${capability[1].toLowerCase()} ${capability[2].toLowerCase()}`, phrase: capability[3] };
  if (capability) return { article: '', phrase: capability[3] };
  const subjunctive = clean.match(/^(el|la|los|las)\s+(.+?)\s+(?:haga|hagan|realice|realicen)\s+(.+)$/iu);
  if (subjunctive) {
    const verb = /^hag/i.test(subjunctive[0]) ? 'hacer' : 'realizar';
    return { article: `${subjunctive[1].toLowerCase()} ${subjunctive[2].toLowerCase()}`, phrase: `${verb} ${subjunctive[3]}` };
  }
  const finite = clean.match(/^(el|la|los|las)\s+(\p{L}+)\s+(\p{L}+)\s+(.+)$/iu);
  const verb = finite ? infinitive(finite[3]) : '';
  const rest = finite ? finite[4].replace(/\b(y|e)\s+(\p{L}+)\b/giu, (all, conj, word) => infinitive(word) ? `${conj} ${infinitive(word)}` : all) : '';
  if (finite && verb && strip(finite[2]) !== 'sistema') return { article: `${finite[1].toLowerCase()} ${finite[2].toLowerCase()}`, phrase: `${verb} ${rest}` };
  return { article: '', phrase: clean.charAt(0).toLowerCase() + clean.slice(1) };
}

function permit(article, phrase) {
  if (!article) return phrase;
  const [kind, ...rest] = article.split(/\s+/);
  const noun = rest.join(' ');
  return `permitir ${kind === 'el' ? 'al' : `a ${kind}`} ${noun} ${phrase}`;
}

function triggerVerb(rule) {
  const match = /\bantes de\s+(\p{L}+)/iu.exec(rule?.necesidad || '');
  if (!match) return '';
  const verb = match[1].replace(/(?:me|te|le|lo|la|nos|les)$/iu, '');
  return verb.length >= 4 ? verb.toLowerCase() : match[1].toLowerCase();
}

function conditionOf(need) {
  const source = evidenceText(need);
  if (/funcionando normalmente/i.test(source)) return 'el funcionamiento normal';
  const match = /cuando\s+([^.]{8,80})/i.exec(source);
  return match && !/menos de/i.test(match[1]) ? match[1].trim() : '';
}

function traitsOf(need) {
  const match = /,\s*con\s+([^.]{8,160})/i.exec(evidenceText(need));
  return match ? match[1].replace(/[.\s]+$/, '') : '';
}

function metricPhrase(metric) {
  return /^menos de\s+/i.test(metric) ? `un tiempo menor a ${metric.replace(/^menos de\s+/i, '')}` : metric;
}

function qualityStatement(need) {
  const name = String(need.necesidad || '').trim().replace(/[.\s]+$/, '');
  if (/^facilidad de uso de\s+/i.test(name)) {
    const where = name.replace(/^facilidad de uso de\s+/i, '');
    const traits = traitsOf(need);
    return `El sistema deberá ser fácil de usar en ${where}${traits ? `, cumpliendo ${traits}` : ''}.`;
  }
  let property = name.replace(/^(?:el|la|los|las)\s+sistema\s+debe(?:n)?(?:\s+poder)?\s+/i, '');
  property = property.replace(/\s+en\s+menos de\s+.+$/i, '').replace(/[.\s]+$/, '');
  const reflexive = property.match(/^((?:el|la|los|las)\s+.+?)\s+se\s+(\p{L}+)$/iu);
  if (reflexive && infinitive(reflexive[2])) property = `${infinitive(reflexive[2])} ${reflexive[1].charAt(0).toLowerCase()}${reflexive[1].slice(1)}`;
  const metric = statedMetric([need]);
  const condition = conditionOf(need);
  let sentence = `El sistema deberá ${property.charAt(0).toLowerCase()}${property.slice(1)}`;
  if (condition) sentence += `, bajo ${condition}`;
  if (metric) sentence += `, cumpliendo ${metricPhrase(metric)}`;
  return `${sentence}.`;
}

function functionalStatement(need, linked) {
  const { applicableClause, preconditionAction, actionOf, tidyNeed } = require('./NeedGranularity');
  const behavior = behaviorOf(tidyNeed(need.necesidad));
  const said = strip(behavior.phrase).split(/\s+/)[0];
  const operation = actionOf(said);
  const trigger = operation && linked.some(rule => preconditionAction(rule.necesidad) === operation) ? said.replace(/(?:me|te|le|lo|la|nos|les)$/iu, '') : '';
  const phrase = /^permitir\b/i.test(behavior.phrase) || trigger ? behavior.phrase : permit(behavior.article, behavior.phrase);
  const rules = linked.map(rule => {
    let text = applicableClause(rule, { necesidad: tidyNeed(need.necesidad) }).replace(/[.\s]+$/, '');
    const ban = text.split(/\bpero no\b/i);
    if (ban.length > 1) text = `no ${ban[1].trim()}`;
    return text ? text.charAt(0).toLowerCase() + text.slice(1) : '';
  }).filter(Boolean);
  const goes = /^(?:los|las)\b/.test(behavior.article) ? 'van' : 'va';
  let sentence = trigger && behavior.article ? `Cuando ${behavior.article} ${goes} a ${trigger}, el sistema deberá ${phrase}` : `El sistema deberá ${phrase}`;
  if (rules.length) sentence += `, conforme a ${rules.join('; ')}`;
  return `${sentence}.`;
}

function statementOf(text) {
  return functionalStatement({ necesidad: text }, []);
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
  const statement = strip(group.map(need => need.necesidad).join(' '));
  const distinct = kept.filter(criterion => !sameText(criterion.descripcion, statement) && !sameText(criterion.descripcion, req.nombre) && !sameText(criterion.descripcion, req.descripcion));
  return distinct;
}

function titleOf(text) {
  const phrase = behaviorOf(text).phrase.replace(/^permitir\s+(?:al|a\s+(?:el|la|los|las))\s+.+?\s+/i, '');
  const clean = phrase.replace(/\s+en\s+menos de\s+.+$/i, '').trim();
  if (!clean) return '';
  return clean.charAt(0).toUpperCase() + clean.slice(1);
}

function sameText(left, right) {
  return strip(left) === strip(right);
}

function oneRequirement(req, group, inventory, rules, replaceEvidence, actorsCatalog) {
  const tipo = req.tipo === 'RNF' ? 'RNF' : 'RF';
  const linked = new Set((req.reglas_relacionadas || []).filter(id => inventory.find(item => item.id === id)?.tipo === 'regla_negocio'));
  const capabilities = group.map(need => {
    const split = capabilityOf(need.necesidad, rules);
    split.linked.forEach(rule => linked.add(rule.id));
    (need.reglas_ids || []).forEach(id => { if (rules.some(rule => rule.id === id)) linked.add(id); });
    return split.text;
  });
  const { ruleApplies, tidyNeed } = require('./NeedGranularity');
  const linkedRules = [...linked].map(id => rules.find(rule => rule.id === id)).filter(rule => rule && ruleApplies(rule, { necesidad: tidyNeed(capabilities[0] || group[0].necesidad) }));
  const primary = { ...group[0], necesidad: tidyNeed(capabilities[0] || group[0].necesidad) };
  const descripcion = tipo === 'RNF' ? qualityStatement(primary) : functionalStatement(primary, linkedRules);
  const nombre = tipo === 'RNF' && /^facilidad de uso\b/i.test(primary.necesidad) ? primary.necesidad : tipo === 'RNF' ? (qualityStatement(primary).replace(/^El sistema deberá\s+/i, '').replace(/, bajo[\s\S]*$/, '').replace(/, cumpliendo[\s\S]*$/, '').replace(/\.$/, '').replace(/^./, letter => letter.toUpperCase())) : (titleOf(primary.necesidad) || req.nombre || '');
  const catalogActor = (actorsCatalog || []).find(actor => actor.id && actor.id === group[0].actor_id);
  const named = catalogActor ? [actorLabel(catalogActor.nombre)] : [...new Set(capabilities.map(namedActor).filter(Boolean))];
  const given = (Array.isArray(req.actores) ? req.actores : []).map(actorLabel).filter(Boolean);
  const people = !named.length && !given.length && /segun el rol|roles del sistema/i.test(strip(primary.necesidad))
    ? (actorsCatalog || []).filter(actor => actor.tipo !== 'sistema_externo' && actor.nombre).map(actor => actorLabel(actor.nombre)) : [];
  const actors = named.length ? named : given.length ? given : people;
  const assigned = tipo === 'RF' && !actors.length ? ['Sistema'] : actors;
  const metric = tipo === 'RNF' ? statedMetric(group) : '';
  const quotes = group.flatMap(need => (need.evidencias?.length ? need.evidencias : (need.evidencia ? [{ texto: need.evidencia, fuente: need.fuente }] : [])));
  const dropped = (req.necesidades_origen || []).some(id => !group.some(need => need.id === id));
  const next = {
    ...req,
    tipo,
    nombre,
    descripcion,
    ...(assigned.length ? { actores: assigned } : {}),
    necesidades_origen: group.map(need => need.id),
    reglas_relacionadas: linkedRules.map(rule => rule.id),
    precondiciones: grounded(req.precondiciones, group) ? String(req.precondiciones).trim() : '',
    poscondiciones: grounded(req.poscondiciones, group) ? String(req.poscondiciones).trim() : '',
    criterios_aceptacion: (() => {
      const kept = ownCriteria(req, group, inventory).filter(criterion => String(criterion.descripcion || '').trim().length > 8 && !sameText(criterion.descripcion, descripcion) && !sameText(criterion.descripcion, nombre));
      if (kept.length) return kept;
      const observable = behaviorOf(tidyNeed(primary.necesidad)).phrase.replace(/[.\s]+$/, '');
      return observable ? [{ descripcion: `Queda comprobado: ${observable}.`, necesidades_origen: group.map(need => need.id).filter(Boolean) }] : [];
    })(),
    ...(replaceEvidence && quotes.length ? { evidencia: quotes[0].texto, evidencias: quotes } : {})
  };
  if (req.prioridad) next.prioridad = /prioridad\s+baja/i.test(group.map(need => `${need.necesidad} ${evidenceText(need)}`).join(' ')) ? 'Baja' : 'Alta';
  const questions = [...new Set(group.flatMap(need => need.preguntas_ids || []))];
  if (tipo === 'RNF' && questions.length) next.preguntas_relacionadas = questions;
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

function shape(requirements = [], inventory = [], actors = []) {
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
    const { redundantNeed } = require('./NeedGranularity');
    if (tipo === 'RF' && needs.length && needs.every(need => redundantNeed(need, inventory))) return [];
    if (tipo === 'RNF' && needs.length && needs.every(need => {
      const { actionsOf } = require('./NeedGranularity');
      const backup = actionsOf(`${need.necesidad || ''} ${need.evidencia || ''}`).includes('respaldar');
      const measured = /menos de\s+(?:un|una|\d+)|\d+\s*(?:segundos|minutos|horas)/i.test(`${need.necesidad || ''} ${need.evidencia || ''}`);
      return backup && !measured && inventory.some(other => other.tipo === 'RF' && actionsOf(`${other.necesidad || ''} ${other.evidencia || ''}`).includes('respaldar'));
    })) return [];
    if (!needs.length) return [oneRequirement(req, [{ id: '', necesidad: req.descripcion || req.nombre || '', evidencia: req.evidencia }], inventory, rules, false, actors)];
    const groups = new Map();
    for (const need of needs) {
      const key = `${need.tipo}:${need.objetivo_id || need.id}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(need);
    }
    const replaceEvidence = groups.size > 1;
    return [...groups.values()].map(group => oneRequirement(req, group, inventory, rules, replaceEvidence, actors));
  });
}

module.exports = { shape, extraConditions, statementOf };
