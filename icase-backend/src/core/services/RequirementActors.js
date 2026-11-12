const { inspectEvidence } = require('../../infrastructure/services/SourceEvidence');
const key = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().replace(/\s+/g, ' ').toLowerCase();

function interviewSpeakerOnly(name, input) {
  const nombre = String(name || '').trim();
  if (nombre.length < 3) return false;
  const escaped = nombre.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const source = String(input || '');
  if (!new RegExp(`(?:^|\\n)\\s*${escaped}\\s*:`, 'i').test(source)) return false;
  const body = source.replace(new RegExp(`(?:^|\\n)\\s*${escaped}\\s*:`, 'gi'), '\n');
  return !new RegExp(`\\b(?:el|la|los|las)\\s+${escaped}\\b|\\b${escaped}\\s+(?:debe|puede|podr[aá]n?)\\b`, 'i').test(body);
}
function normalizeActors(candidates, input) {
  const actors = [];
  for (const item of Array.isArray(candidates) ? candidates : []) {
    const nombre = String(item?.nombre || '').trim();
    if (!nombre || interviewSpeakerOnly(nombre, input)) continue;
    const evidence = inspectEvidence(item, input);
    const existing = actors.find(actor => key(actor.nombre) === key(nombre));
    if (existing) {
      existing.alias = [...new Set([...existing.alias, nombre])].filter(name => name !== existing.nombre);
      existing.evidencias = [...new Map([...existing.evidencias, ...evidence.valid].map(e => [JSON.stringify(e), e])).values()];
      continue;
    }
    const explicit = key(item.origen) === 'explicito' && evidence.valido;
    actors.push({ id: `ACT-${String(actors.length + 1).padStart(2, '0')}`, nombre,
      descripcion: String(item.descripcion || ''), tipo: item.tipo === 'sistema_externo' ? 'sistema_externo' : 'persona',
      alias: [...new Set((Array.isArray(item.alias) ? item.alias : []).map(String).filter(Boolean))],
      origen: explicit ? 'explicito' : 'inferido', estado: explicit && key(item.estado) === 'confirmado' ? 'confirmado' : 'pendiente',
      evidencias: evidence.valid, advertencias: [...evidence.invalid.map(e => e.codigo), ...(!explicit && evidence.valido ? ['El modelo lo clasificó como inferido aunque aportó citas. Revisa su interacción antes de confirmarlo.'] : [])] });
  }
  return actors;
}

const actorInstructions = `Incluye actores como arreglo de objetos con nombre, descripcion (responsabilidad concreta del proyecto, nunca texto de plantilla), tipo (persona o sistema_externo), alias (arreglo), origen (explicito o inferido), estado (confirmado o pendiente) y evidencias (arreglo de fragmentos literales con texto y fuente). Extrae solo quienes interactúan con el sistema. Quien solo habla en la entrevista (gerente, analista, entrevistador u otro rótulo de turno) no es actor, aunque sus frases describan el sistema. No conviertas dispositivos, entidades ni interesados sin interacción en actores. Un actor inferido queda pendiente. No fusiones nombres distintos por asumir equivalencia. Un actor no implica una clase, pantalla ni permiso nuevo.`;
function actorCatalog(audit, requirements) {
  if (audit.actores?.length) return structuredClone(audit.actores);
  const names = [...new Map(requirements.flatMap(r => r.actores || []).map(name => [key(name), name])).values()];
  return names.map((nombre, i) => ({ id: `legacy-${i}`, nombre, descripcion: '', tipo: 'persona', origen: 'inferido', estado: 'pendiente', heredado: true, alias: [], evidencias: [] }));
}

function changeActor(catalog, body) {
  const actors = structuredClone(catalog);
  if (body.accion === 'agregar_actor') {
    const nombre = String(body.cambios?.nombre || '').trim();
    if (!nombre || actors.some(a => key(a.nombre) === key(nombre))) throw Object.assign(new Error('Nombre vacío o ya utilizado.'), { status: 400 });
    actors.push({ id: `ACT-${require('node:crypto').randomUUID()}`, nombre, descripcion: String(body.cambios?.descripcion || '').trim(),
      tipo: body.cambios?.tipo === 'sistema_externo' ? 'sistema_externo' : 'persona', alias: [], origen: 'manual', estado: 'pendiente', evidencias: [] });
    return { actors, replacements: [] };
  }
  const target = actors.find(a => a.id === body.id);
  if (!target) throw Object.assign(new Error('Actor no encontrado.'), { status: 404 });
  let replacements = [];
  if (body.accion === 'fusionar_actor') {
    const destination = actors.find(a => a.id === body.destino_id && a.id !== target.id);
    if (!destination) throw Object.assign(new Error('Selecciona otro actor como destino.'), { status: 400 });
    destination.alias = [...new Set([...(destination.alias || []), target.nombre, ...(target.alias || [])])];
    destination.evidencias = [...new Map([...(destination.evidencias || []), ...(target.evidencias || [])].map(e => [JSON.stringify(e), e])).values()];
    destination.descripcion = [...new Set([destination.descripcion, target.descripcion].filter(Boolean))].join('\n');
    replacements = [target.nombre, ...(target.alias || [])].map(nombre => [nombre, destination.nombre]);
    return { actors: actors.filter(a => a.id !== target.id), replacements };
  }
  if (body.accion === 'confirmar_actor') target.estado = 'confirmado';
  else {
    const nombre = String(body.cambios?.nombre || '').trim();
    if (!nombre || actors.some(a => a.id !== target.id && key(a.nombre) === key(nombre))) throw Object.assign(new Error('Nombre vacío o ya utilizado; utiliza fusionar si corresponde.'), { status: 400 });
    replacements = [target.nombre, ...(target.alias || [])].map(old => [old, nombre]);
    target.alias = [...new Set([...(target.alias || []), target.nombre])].filter(old => old !== nombre);
    target.nombre = nombre;
    target.descripcion = String(body.cambios?.descripcion || '').trim();
    target.tipo = body.cambios?.tipo === 'sistema_externo' ? 'sistema_externo' : 'persona';
  }
  return { actors, replacements };
}
module.exports = { normalizeActors, actorInstructions, key, actorCatalog, changeActor, interviewSpeakerOnly };
