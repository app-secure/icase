// The approved interpretation is the drafting authority. Original documents are
// kept by the caller for local citation validation, not extracted again by AI.
const templates = `CONTRATO DE REDACCIÓN APROBADA v2. Redacta requisitos exclusivamente desde las necesidades funcionales (RF) y cualidades esperadas (RNF) indicadas, sin extraer, reclasificar ni ampliar obligaciones. Incluye todos los objetivos del lote, no solo los primeros. No cambies RF por RNF ni viceversa. actores contiene nombres canónicos (por ejemplo, Cliente), NUNCA identificadores ACT. Las reglas y restricciones solo condicionan el objetivo, no son la base para inventar otros requisitos.
RF: Cuando [evento o condición de activación], el sistema deberá [acción específica] sobre [datos u objeto], conforme a [regla aplicable], de modo que [resultado observable].
RNF: El sistema deberá [propiedad o restricción específica] en [función, componente o datos], bajo [condiciones], cumpliendo [métrica, umbral o condición verificable].
Usa estas plantillas con lenguaje natural: omite cláusulas sin sustento, nunca inventes disparadores, reglas, resultados ni métricas para rellenarlas. Conserva condiciones de certeza como idealmente o por confirmar. nombre es un título breve, no una copia de la necesidad. descripcion contiene la declaración completa. Los criterios son comprobaciones observables del objetivo y sus detalles, no una repetición del título. Una métrica de seguridad no puede incluir usabilidad ni controles ajenos.
Especifica cada comprobación independiente acordada en criterios: entrada o condición, resultado visible y restricciones pertinentes. No basta 'se gestiona exitosamente' o repetir la declaración; no inventes operaciones cuando el análisis solo dice gestionar. Para cierres u operaciones compuestas conserva los datos registrados, cálculos acordados, exclusiones y conservación del resultado, sin inventar fórmulas. Una sola prueba puede verificar varios detalles relacionados; no hay una cantidad mínima de criterios. metrica_medible admite una condición cualitativa verificable, además de cifras; si ya existen en la necesidad una frecuencia, retención, tiempo de recuperación o proporción de éxito, consérvalos y no pongas Por confirmar con el usuario. actores puede quedar vacío si el análisis no asigna actor: no lo sustituyas por Sistema ni por todos los roles. Las reglas deben expresarse en lenguaje natural en la declaración; sus IDs pertenecen a reglas_relacionadas, no sustituyen la explicación.
JSON {"requerimientos":[{"tipo":"RF o RNF","identificador":"RF-01 o RNF-01","nombre":"Título breve","descripcion":"Declaración","prioridad":"Alta o Media o Baja","actores":[],"precondiciones":"","poscondiciones":"","metrica_medible":"","origen":"explicito o inferido","estado_decision":"confirmado o pendiente","requiere_confirmacion":false,"necesidades_origen":[],"reglas_relacionadas":[],"criterios_aceptacion":[{"descripcion":"Resultado comprobable","necesidades_origen":[]}],"evidencias":[{"texto":"Fragmento literal","fuente":"Archivo"}]}],"diagramas":[]}.
Un requisito por objetivo y tipo; incluye todos sus IDs N en necesidades_origen y conserva todos sus detalles y evidencias. No generes requisitos para reglas, contexto, preguntas, tecnologías ni exclusiones. Las preguntas no crean obligaciones confirmadas. No copies los valores de ejemplo. No cambies los requisitos existentes no seleccionados.`;

function compact(n) {
  return Object.fromEntries(['id', 'tipo', 'objetivo_id', 'necesidad', 'estado', 'origen', 'actor_id', 'reglas_ids', 'preguntas_ids', 'objetivos_relacionados', 'prioridad', 'respuesta'].filter(key => n[key] !== undefined).map(key => [key, n[key]]).concat([
    ['evidencias', n.evidencias?.length ? n.evidencias.map(({ texto, fuente }) => ({ texto, fuente })) : n.evidencia ? [{ texto: n.evidencia, fuente: n.fuente }] : []]
  ]));
}
function select(batch, inventory, actors = []) {
  const goals = new Set(batch.map(n => n.objetivo_id).filter(Boolean));
  const ids = new Set(batch.flatMap(n => [n.id, ...(n.reglas_ids || []), ...(n.preguntas_ids || []), ...(n.origenes || [])]));
  const related = inventory.filter(n => !batch.some(b => b.id === n.id) && !['rechazado', 'fuera_de_alcance'].includes(n.estado) &&
    (ids.has(n.id) || (n.objetivos_relacionados || []).some(id => goals.has(id))));
  const actorIds = new Set(batch.map(n => n.actor_id).filter(Boolean));
  return { objetivos: batch.map(n => ({ ...compact(n), reglas_permitidas: inventory.filter(rule => rule.tipo === 'regla_negocio' &&
    !['rechazado', 'fuera_de_alcance'].includes(rule.estado) &&
    ((n.reglas_ids || []).includes(rule.id) || (rule.objetivos_relacionados || []).includes(n.objetivo_id))).map(rule => rule.id) })), elementos_relacionados: related.map(compact),
    actores: actors.filter(a => actorIds.has(a.id)).map(({ id, nombre, descripcion, estado }) => ({ id, nombre, descripcion, estado })) };
}

function draft(batch, inventory, actors, instruction = '') {
  return `${templates}\nreglas_permitidas pertenece a CADA objetivo, no a todo el lote: solo esos IDs pueden aparecer en reglas_relacionadas o en la cláusula conforme a del requisito correspondiente. Si está vacío, omite conforme a; no tomes reglas de otros objetivos. Cada regla relacionada indica un vínculo aprobado, no que TODAS sus cláusulas se apliquen a cada objetivo. Usa solo la condición correspondiente a la operación; no añadas una regla de cobro a consultar o validar una reserva. Si el vínculo es contradictorio, no lo fuerces: conserva la obligación y deja constancia de la duda. No supongas vínculos nuevos por coincidencias de palabras. Copia citas solo de las evidencias de estos elementos.\n${instruction ? `AJUSTE SOLICITADO (no es evidencia): ${instruction}\n` : ''}CONTEXTO APROBADO DEL LOTE:\n${JSON.stringify(select(batch, inventory, actors))}`;
}

function evidence(inventory) {
  return JSON.stringify(inventory.map(n => ({ id: n.id, evidencias: n.evidencias?.length ? n.evidencias.map(({ texto, fuente }) => ({ texto, fuente })) : [{ texto: n.evidencia, fuente: n.fuente }] })));
}
const plain = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
// «administrador» y «administradora», «vendedor» y «vendedora» son el mismo rol: una sola forma en todo el proyecto.
const roleKey = value => plain(value).trim().split(/\s+/).pop().replace(/dora$/, 'dor').replace(/(?:es|s)$/, '');
const GENERIC_ACTOR = /^(?:usuarios?|personas?|usuario del sistema|usuarios del sistema)$/;
const AUTH = /autentic|iniciar sesi|inicio de sesi|acceso seg[uú]n (?:el )?rol/i;
function normalizeActors(req, batch, actors) {
  const people = actors.filter(actor => actor.tipo !== 'sistema_externo' && actor.estado !== 'rechazado' && actor.nombre);
  const byId = new Map(actors.map(actor => [actor.id, actor.nombre]));
  const canonical = name => (people.find(actor => roleKey(actor.nombre) === roleKey(name)) || {}).nombre || name;
  const names = (Array.isArray(req.actores) ? req.actores : []).map(name => byId.get(name) || name)
    .filter(name => !/^sistema$/i.test(name) || actors.some(a => a.nombre?.toLowerCase() === String(name).toLowerCase()))
    .map(canonical)
    // «Usuario» a secas, cuando el proyecto ya nombra a sus personas, no es un rol más.
    .filter(name => !(GENERIC_ACTOR.test(plain(name).trim()) && people.length && !people.some(actor => roleKey(actor.nombre) === roleKey(name))));
  if (!names.length && req.tipo === 'RF') {
    for (const need of batch.filter(n => (req.necesidades_origen || []).includes(n.id))) {
      if (byId.has(need.actor_id)) names.push(byId.get(need.actor_id));
    }
  }
  // El acceso con usuario y contraseña lo usan todas las personas del sistema: un RF de autenticación sin actor
  // dejaría el inicio de sesión fuera de los permisos y de la navegación de cada rol.
  if (req.tipo === 'RF' && AUTH.test(`${req.nombre || ''} ${req.descripcion || ''}`) && (!names.length || names.every(name => GENERIC_ACTOR.test(plain(name).trim())))) {
    names.length = 0;
    names.push(...people.map(actor => actor.nombre));
  }
  // Sin actor en el RF ni en su necesidad: el actor cuya descripción dice esa misma función («emite facturas» para «Emitir factura»).
  if (!names.length && req.tipo === 'RF') {
    const words = plain(req.nombre).match(/[a-z]{4,}/g) || [];
    const verb = (words[0] || '').slice(0, 4);
    const object = (words.slice(1).find(word => !/^(?:con|para|por|del|las|los|una|uno|sus|sin)$/.test(word) && word.length >= 5) || '').slice(0, 5);
    if (verb && object) {
      const owners = people.filter(actor => { const description = plain(actor.descripcion); return new RegExp('\\b' + verb).test(description) && description.includes(object); });
      if (owners.length === 1) names.push(owners[0].nombre);
    }
  }
  return { ...req, actores: [...new Set(names)] };
}
function auditView(result, inventory) {
  const actors = (result.auditoria_requisitos?.actores || []).map(({ id, nombre, descripcion, tipo, estado, alias, origen }) => ({ id, nombre, descripcion, tipo, estado, alias, origen }));
  const needs = inventory.map(n => { const { evidencias, ...item } = compact(n); return item; });
  const requirements = (result.requerimientos || []).map(r => Object.fromEntries([
    'identificador', 'tipo', 'nombre', 'descripcion', 'actores', 'necesidades_origen', 'reglas_relacionadas',
    'criterios_aceptacion', 'precondiciones', 'poscondiciones', 'metrica_medible', 'estado_decision', 'requiere_confirmacion'
  ].filter(key => r[key] !== undefined).map(key => [key, key === 'criterios_aceptacion' ? (r[key] || []).map(({ descripcion, necesidades_origen }) => ({ descripcion, necesidades_origen })) : r[key]])));
  const quotes = new Map();
  for (const n of [...inventory, ...(result.auditoria_requisitos?.actores || []), ...(result.requerimientos || [])]) {
    for (const quote of compact(n).evidencias) {
      const key = JSON.stringify(quote);
      if (!quotes.has(key)) quotes.set(key, { ...quote, elementos: [] });
      quotes.get(key).elementos.push(n.id || n.identificador);
    }
  }
  return { actors, inventory: needs, requirements, quotes: [...quotes.values()] };
}
function initialAuditView(data) {
  return { sintesis: data.sintesis, inventario: (data.inventario || []).map(compact),
    actores: (data.actores || []).map(a => ({ ...Object.fromEntries(['id', 'nombre', 'descripcion', 'tipo', 'estado', 'origen', 'alias'].filter(k => a[k] !== undefined).map(k => [k, a[k]])), evidencias: compact(a).evidencias })) };
}
module.exports = { draft, select, evidence, templates, normalizeActors, auditView, initialAuditView };
