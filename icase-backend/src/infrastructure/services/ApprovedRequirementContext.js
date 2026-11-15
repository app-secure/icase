// The approved interpretation is the drafting authority. Original documents are
// kept by the caller for local citation validation, not extracted again by AI.
const templates = `CONTRATO DE REDACCIÓN APROBADA v2. Redacta requisitos exclusivamente desde las necesidades funcionales (RF) y cualidades esperadas (RNF) indicadas, sin extraer, reclasificar ni ampliar obligaciones. Incluye todos los objetivos del lote, no solo los primeros. No cambies RF por RNF ni viceversa. actores contiene nombres canónicos (por ejemplo, Cliente), NUNCA identificadores ACT. Las reglas y restricciones solo condicionan el objetivo, no son la base para inventar otros requisitos.
RF: Cuando [evento o condición de activación], el sistema deberá [acción específica] sobre [datos u objeto], conforme a [regla aplicable], de modo que [resultado observable].
RNF: El sistema deberá [propiedad o restricción específica] en [función, componente o datos], bajo [condiciones], cumpliendo [métrica, umbral o condición verificable].
Usa estas plantillas con lenguaje natural: omite cláusulas sin sustento, nunca inventes disparadores, reglas, resultados ni métricas para rellenarlas. Conserva condiciones de certeza como idealmente o por confirmar. nombre es un título breve, no una copia de la necesidad. descripcion contiene la declaración completa. Los criterios son comprobaciones observables del objetivo y sus detalles, no una repetición del título. Una métrica de seguridad no puede incluir usabilidad ni controles ajenos.
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
function normalizeActors(req, batch, actors) {
  const byId = new Map(actors.map(actor => [actor.id, actor.nombre]));
  const names = (Array.isArray(req.actores) ? req.actores : []).map(name => byId.get(name) || name);
  if (!names.length && req.tipo === 'RF') {
    for (const need of batch.filter(n => (req.necesidades_origen || []).includes(n.id))) {
      if (byId.has(need.actor_id)) names.push(byId.get(need.actor_id));
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
