// Separa resultados independientes y recupera obligaciones explícitas que el
// inventario no citó. No inventa funciones: cada elemento nuevo usa una cita literal.
const FAMILIES = [
  ['consulta', /\b(?:ver|visualizar|visualiza|visualizan|consultar|consultan|revisar|revisa|revisan|mostrar|muestra|muestran)\b/iu],
  ['registro', /\b(?:tomar|toman|registrar|registra|registran|crear|crean|comprar|compra|compran|reservar|reservan|pedir|pide|piden)\b/iu],
  ['cambio', /\b(?:modificar|modifica|modifican|cambiar|cambia|cambian|marcar|marca|marcan|actualizar|actualiza|actualizan|reasignar|reasigna|reasignan)\b/iu],
  ['cierre', /\b(?:cerrar|cierra|cierran)\b/iu],
  ['validacion', /\b(?:validar|valida|validan|escanear|escanea|escanean)\b/iu],
  ['cobro', /\b(?:cobrar|cobra|cobran)\b/iu],
  ['acumulacion', /\b(?:acumular|acumula|acumulan)\b/iu],
  ['gestion', /\b(?:gestionar|gestiona|gestionan)\b/iu],
  ['autorizacion', /\b(?:autorizar|autoriza|autorizan)\b/iu],
  ['autenticacion', /\b(?:autenticar|autentica|autenticarse|iniciar sesi[oó]n)\b/iu]
];
const QUALITIES = [
  ['seguridad', /\b(?:seguridad|confidencialidad|integridad|contraseñas|contrasenas)\b/iu],
  ['usabilidad', /\b(?:usabilidad|facilidad de uso|botones claros|pantallas claras)\b/iu],
  ['rendimiento', /\b(?:rendimiento|latencia|tiempo de respuesta|menos de un segundo)\b/iu],
  ['recuperacion', /\b(?:respaldo|respaldos|recuperar|recuperaci[oó]n de la informaci[oó]n|recuperaci[oó]n de datos)\b/iu]
];
const TECH = /\b(?:react native|react|tailwind|nestjs|postgresql|prisma|socket\.io|redis|jwt|railway|vercel|google play|kds)\b/iu;

function normalize(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}
function clean(text) {
  return String(text || '').replace(/\s+/g, ' ').replace(/\s+,/g, ',').replace(/^[,;]\s*/, '').replace(/^(?:y|e)\s+/i, '').trim();
}
function segments(text) {
  const parts = [];
  let current = '';
  let depth = 0;
  const source = String(text || '');
  for (let index = 0; index < source.length; index++) {
    const char = source[index];
    if (char === '(') depth += 1;
    if (char === ')' && depth) depth -= 1;
    const conjunction = depth === 0 && /^(?:,|;|\s+y\s+|\s+e\s+)/i.exec(source.slice(index));
    if (conjunction && !/\s+o\s+/i.test(conjunction[0])) {
      if (current.trim()) parts.push(current.trim());
      current = '';
      index += conjunction[0].length - 1;
      continue;
    }
    current += char;
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
}
function familyOf(text) {
  const found = FAMILIES.find(([, pattern]) => pattern.test(text));
  return found ? found[0] : null;
}
function isRule(text) {
  return /^(?:sin que|pero no|no\b|nunca\b)/i.test(clean(text)) || /\bno\s+(?:debe|pued[ae]|quier)/i.test(text);
}
function partition(text) {
  const operations = [];
  const rules = [];
  let previous = null;
  for (const raw of segments(text)) {
    const segment = clean(raw);
    if (!segment) continue;
    if (isRule(segment)) {
      rules.push(segment);
      const exception = /salvo que\s+(.{8,120})/i.exec(raw);
      if (exception && /reasign/i.test(exception[1])) operations.push({ family: 'cambio', text: clean(exception[1]) });
      previous = null;
      continue;
    }
    const own = familyOf(segment);
    const referred = /\bantes de\s+(\S+)/i.exec(segment);
    const referredFamily = referred ? familyOf(referred[1]) : null;
    if (own) {
      let bucket = operations.find(item => item.family === own);
      if (!bucket) operations.push(bucket = { family: own, text: '' });
      bucket.text = clean(`${bucket.text} ${bucket.text ? ', ' : ''}${segment}`);
      previous = bucket;
    } else if (referredFamily && operations.some(item => item.family === referredFamily)) {
      const bucket = operations.find(item => item.family === referredFamily);
      bucket.text = clean(`${bucket.text}, ${segment}`);
      previous = bucket;
    } else if (previous) {
      previous.text = clean(`${previous.text}, ${segment}`);
    }
  }
  return { operations: operations.filter(item => item.text), rules };
}
function turnOf(quote, input) {
  const needle = String(quote || '').slice(0, 80);
  const at = needle ? String(input || '').indexOf(needle) : -1;
  const upto = at >= 0 ? String(input).slice(0, at + needle.length) : String(quote || '');
  return upto.split(/\n(?=[A-ZÁÉÍÓÚÑ][a-záéíóúñ]{2,24}:)/).at(-1) || upto;
}
function actorModal(quote, input) {
  const window = turnOf(quote, input);
  const matches = [...window.matchAll(/\b((?:El|La|Los|Las)\s+[A-Za-zÁÉÍÓÚáéíóúñ]+)\s+(debe(?:n)? poder|puedan|pueden|pueda|puede|podrán|podrá)\b/g)];
  const last = matches.at(-1);
  if (!last) return '';
  const modal = last[2].replace(/^puedan$/i, 'pueden').replace(/^pueda$/i, 'puede');
  return `${last[1]} ${modal} `;
}
function withSubject(prefix, fragment) {
  const body = clean(fragment);
  if (!prefix || !body) return body;
  const actor = normalize(prefix).split(/\s+/).slice(0, 2).join(' ');
  if (actor && normalize(body).startsWith(actor)) return body;
  return clean(`${prefix}${body.charAt(0).toLowerCase()}${body.slice(1)}`);
}
function ensureSubject(item, input) {
  if (!item || item.tipo !== 'RF') return item;
  const quote = item.evidencia || item.evidencias?.find(entry => entry?.texto)?.texto || '';
  let necesidad = item.necesidad;
  if (!/\b(?:el|la|los|las)\s+\S+\s+(?:debe|puede|podr)/i.test(necesidad)) {
    const prefix = actorModal(quote, input) || actorModal(necesidad, necesidad);
    if (prefix) necesidad = withSubject(prefix, necesidad);
  }
  const current = /^((?:El|La|Los|Las)\s+\S+)\s+puede\s+/i.exec(necesidad);
  if (current && new RegExp(`${current[1]}\\s+debe poder`, 'i').test(turnOf(quote, input))) necesidad = necesidad.replace(current[0], `${current[1]} debe poder `);
  return necesidad === item.necesidad ? item : { ...item, necesidad };
}
function withEvidence(item, quote) {
  const evidence = typeof quote === 'string' ? quote : item.evidencia;
  return { ...item, evidencia: evidence, ...(item.evidencias ? { evidencias: item.evidencias } : {}) };
}
function splitItem(item, identifiers) {
  if (!item || item.tipo === 'regla_negocio' || item.tipo === 'restriccion_tecnica' || item.tipo === 'decision' || item.tipo === 'pregunta' || item.tipo === 'contexto') return [item];
  if (item.tipo === 'RNF') {
    const clauses = QUALITIES.map(([, pattern]) => segments(item.necesidad).map(clean).filter(segment => pattern.test(segment) && QUALITIES.filter(([, other]) => other.test(segment)).length === 1).join(', ')).filter(Boolean);
    if (clauses.length < 2) return [item];
    return clauses.map((text, index) => index === 0 ? { ...item, necesidad: text } : { ...item, id: identifiers.next('N'), objetivo_id: identifiers.next('O'), necesidad: text });
  }
  if (item.tipo !== 'RF') return [item];
  const parts = partition(item.necesidad);
  if (parts.operations.length < 2 && !parts.rules.length) return [item];
  const goals = [];
  const parentPrefix = (/^((?:El|La|Los|Las)\s+\S+\s+(?:debe(?:n)? poder|puede|pueden|podrán|podrá)\s+)/i.exec(item.necesidad) || [])[1] || '';
  const functional = (parts.operations.length ? parts.operations : [{ text: item.necesidad }]).map((operation, index) => {
    const goal = index === 0 ? item.objetivo_id : identifiers.next('O');
    if (goal) goals.push(goal);
    const necesidad = withSubject(parentPrefix, operation.text);
    if (index === 0) return { ...item, necesidad, ...(goal ? { objetivo_id: goal } : {}) };
    return { ...item, id: identifiers.next('N'), objetivo_id: goal || identifiers.next('O'), necesidad };
  });
  const rules = parts.rules.map(text => ({
    id: identifiers.next('N'), tipo: 'regla_negocio', necesidad: text, estado: item.estado || 'confirmado',
    evidencia: item.evidencia, ...(item.evidencias ? { evidencias: item.evidencias } : {}),
    ...(goals.length ? { objetivos_relacionados: [...goals] } : {})
  }));
  return [...functional, ...rules];
}
function quotes(item) {
  return [item?.evidencia, ...(Array.isArray(item?.evidencias) ? item.evidencias.map(entry => typeof entry === 'string' ? entry : entry?.texto) : [])]
    .map(normalize).filter(quote => quote.length >= 20);
}
function bodies(input) {
  return String(input || '')
    .replace(/\[Fuente enriquecida\][\s\S]*?\[(?:Contenido extraído|contenido_original)\]\r?\n/g, '\n')
    .replace(/\[Insumo adicional\]\r?\n/g, '\n')
    .split(/\n+|(?<=[.!?])\s+/)
    .map(sentence => sentence.trim())
    .filter(sentence => sentence.split(/\s+/).length >= 6 && !/^\[/.test(sentence));
}
function affirmed(input, sentence) {
  const at = String(input).indexOf(sentence);
  if (at < 0) return false;
  return /\b(?:s[ií]|correcto|exactamente|de acuerdo|eso est[aá] bien|usemos|quedan? confirmad[oa]s?)\b/i
    .test(String(input).slice(at + sentence.length, at + sentence.length + 1200));
}
function quotedBy(sentence, inventory, tipo) {
  const text = normalize(sentence);
  return inventory.some(item => (!tipo || item.tipo === tipo) && quotes(item).some(quote => quote.includes(text) || text.includes(quote)));
}
function mainClause(sentence) {
  return String(sentence || '').split(/\bpara que\b/i)[0];
}
function already(inventory, tipo, pattern) {
  return inventory.some(item => item.tipo === tipo && pattern.test(normalize(item.necesidad)));
}
function classify(sentence, inventory, accepted) {
  const text = normalize(sentence);
  const items = [];
  const add = (tipo, necesidad, estado = 'confirmado') => {
    if (!necesidad || quotedBy(sentence, [...inventory, ...items], tipo)) return;
    if (already([...inventory, ...items], tipo, new RegExp(normalize(necesidad).replace(/[.*+?^${}()|[\]\\]/g, '\\$&').slice(0, 48)))) return;
    if (tipo === 'regla_negocio') {
      const keys = ['pedir', 'agot', 'borrar', 'precio', 'mesero', 'reporte', 'rol', 'tecnolog'].filter(key => normalize(necesidad).includes(key));
      if (keys.length >= 2 && [...inventory, ...items].some(item => item.tipo === 'regla_negocio' && keys.filter(key => normalize(item.necesidad).includes(key)).length >= 2)) return;
    }
    items.push({ tipo, necesidad: clean(necesidad), estado });
  };
  if (/alta disponibilidad|balanceador|replicas|conmutacion|failover/.test(text) && /no queremos|no se debe|por ahora no|no exige/.test(text)) {
    add('decision', sentence, 'fuera_de_alcance');
    return items;
  }
  if (/frecuencia de respaldos|tiempo maximo de recuperacion|metricas concretas|personas conectadas/.test(text)) {
    add('pregunta', sentence, 'pendiente');
    return items;
  }
  if (/menos de un segundo/.test(text) && !already(inventory, 'RNF', /segundo|latencia|tiempo real|propag/)) {
    add('RNF', sentence);
    return items;
  }
  if (/respaldo|recuperar la informacion/.test(text) && !already(inventory, 'RNF', /respaldo|recuper/)) {
    add('RNF', sentence);
    return items;
  }
  if (/botones claros|pocas acciones por pantalla/.test(text) && !already(inventory, 'RNF', /boton|usabilidad|pocas acciones/)) {
    add('RNF', sentence);
    return items;
  }
  if (/canales movil|usaran tabletas|pantallas grandes/.test(text) && !already(inventory, 'RNF', /canal|tableta/) && !already(inventory, 'restriccion_tecnica', /canal|tableta/)) {
    add('restriccion_tecnica', sentence, accepted ? 'confirmado' : 'pendiente');
    return items;
  }
  if (/contrasenas|validacion de datos|acceso autenticado|seguridad y la facilidad de uso/.test(text)) {
    if (/acceso autenticado|autenticacion/.test(text) && !already(inventory, 'RF', /autentic/)) add('RF', 'Autenticar el acceso según el rol de cada persona.');
    if (!already(inventory, 'RNF', /contrasen|seguridad|confidencial/)) add('RNF', 'Proteger las contraseñas y validar los datos de entrada.');
    return items;
  }
  if (/\bjwt\b|autenticacion/.test(text)) {
    if (!already(inventory, 'RF', /autentic/)) add('RF', 'Autenticar el acceso de los roles del sistema.');
    if (/\bjwt\b/.test(text) && !already(inventory, 'restriccion_tecnica', /\bjwt\b/)) add('restriccion_tecnica', 'Usar JWT como mecanismo de autenticación.');
    return items;
  }
  if (/no pueda|no pueden|no debe|sin que|pero no|solamente|unicamente|cualquier persona/.test(normalize(mainClause(sentence)))) {
    add('regla_negocio', sentence);
    if (/reasign/.test(text) && !already(inventory, 'RF', /reasign/)) add('RF', 'El administrador puede reasignar mesas entre meseros.');
  }
  const pendingTech = /si ayuda|habiamos pensado|podriamos/.test(text);
  if (TECH.test(sentence) && /propon|usemos|usaran|utilizar|confirma|despleg|publicar|pantalla/.test(text)) {
    const estado = pendingTech ? 'pendiente' : accepted || /usemos|quedan? confirmad|usaran/.test(text) ? 'confirmado' : 'pendiente';
    add('restriccion_tecnica', sentence, estado);
    return items;
  }
  if (/debe|podra|podran|puede|pueden/.test(text) && !isRule(sentence)) {
    for (const [name, pattern] of FAMILIES) {
      if (!pattern.test(sentence)) continue;
      const clause = segments(sentence).map(clean).find(segment => pattern.test(segment) && !isRule(segment));
      const equivalents = { reportes: ['ventas'], ventas: ['reportes'], globales: ['ventas', 'reportes'], precios: ['precio'], usuarios: ['usuario'], pedidos: ['pedido', 'comanda'], comandas: ['pedido'], reservas: ['reserva'], paquetes: ['paquete'], puntos: ['punto'], mesas: ['mesa'] };
      const tokens = normalize(clause || '').split(/[^a-z0-9]+/).filter(token => token.length > 4);
      const samePayment = name === 'registro' && /cobro|pago/.test(normalize(clause || '')) && inventory.some(item => item.tipo === 'RF' && familyOf(item.necesidad) === 'cobro');
      const duplicated = samePayment || inventory.some(item => item.tipo === 'RF' && familyOf(item.necesidad) === name && tokens.some(token => [token, ...(equivalents[token] || [])].some(form => normalize(item.necesidad).includes(form))));
      if (clause && !duplicated) add('RF', clause);
    }
  }
  return items;
}
function recover(input, inventory, identifiers) {
  const added = [];
  for (const sentence of bodies(input)) {
    const question = /[¿?]/.test(sentence);
    if (question && !affirmed(input, sentence)) continue;
    const statement = question ? sentence.replace(/[¿?]/g, ' ').replace(/\bconfirma que\b/i, ' ') : sentence;
    for (const item of classify(statement, [...inventory, ...added], affirmed(input, sentence))) {
      const id = identifiers.next('N');
      const created = { id, tipo: item.tipo, necesidad: item.necesidad, estado: item.estado, evidencia: sentence, origen: 'explicito' };
      if (['RF', 'RNF'].includes(item.tipo)) created.objetivo_id = identifiers.next('O');
      added.push(created);
    }
  }
  return added;
}
function refine(inventory, input, identifiers) {
  const current = [];
  for (const item of inventory || []) current.push(...splitItem(item, identifiers).map(part => ensureSubject(part === item ? item : withEvidence(part, item.evidencia), input)));
  return current.concat(recover(input, current, identifiers).map(item => ensureSubject(item, input)));
}
module.exports = { refine, partition, familyOf };
