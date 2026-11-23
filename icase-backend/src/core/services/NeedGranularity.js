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
function leadingFamily(segment) {
  const start = clean(segment)
    .replace(/^(?:tambi[eé]n|adem[aá]s|luego|despu[eé]s)\s+/i, '')
    .replace(/^(?:(?:el|la|los|las)\s+\S+\s+)?(?:debe(?:n)? poder|puede|pueden|podrán|podrá)\s+/i, '');
  const word = /^[a-záéíóúüñ]+/i.exec(start);
  return word ? familyOf(word[0]) : null;
}
function isRule(text) {
  return /^(?:sin que|pero no|no\b|nunca\b)/i.test(clean(text)) || /\bno\s+(?:se\s+)?(?:debe|pued[ae]|quier|permit)/i.test(text);
}
function partition(text) {
  const operations = [];
  const rules = [];
  let previous = null;
  let bareVerb = '';
  for (const raw of segments(text)) {
    let segment = clean(raw);
    if (!segment) continue;
    // «Ver y consultar la factura»: un verbo suelto comparte el objeto del segmento siguiente; no es otra operación.
    if (/^\p{L}+$/u.test(segment) && !isRule(segment)) {
      bareVerb = bareVerb ? `${bareVerb}, ${segment}` : segment;
      continue;
    }
    if (bareVerb) {
      segment = `${bareVerb} y ${segment.charAt(0).toLowerCase()}${segment.slice(1)}`;
      bareVerb = '';
    }
    if (isRule(segment) || /^(?:solo|solamente|únicamente|unicamente)\s+(?:él|ella|el|la|los|las)\b/i.test(segment)) {
      rules.push(segment);
      const exception = /salvo que\s+(.{8,120})/i.exec(raw);
      if (exception && /reasign/i.test(exception[1])) operations.push({ family: 'cambio', text: reassignmentName(raw) });
      previous = null;
      continue;
    }
    if (/\bantes de\b/i.test(segment) && /\b(?:comprobar|verificar|validar|revisar)\b/i.test(segment)) {
      rules.push(segment);
      previous = null;
      continue;
    }
    const own = leadingFamily(segment);
    const referred = /\bantes de\s+(\S+)/i.exec(segment);
    const referredFamily = referred ? familyOf(referred[1].replace(/^[^\p{L}]+|[^\p{L}]+$/gu, '')) : null;
    if (own) {
      const bucket = { family: own, text: segment };
      operations.push(bucket);
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
  const matches = [...window.matchAll(/\b((?:el|la|los|las)\s+[a-záéíóúñ]+)\s+(debe(?:n)? poder|puedan|pueden|pueda|puede|podrán|podrá)(?!\p{L})/giu)];
  const last = matches.at(-1);
  if (!last) return '';
  const [article, noun] = last[1].split(/\s+/);
  const actor = `${article.charAt(0).toUpperCase()}${article.slice(1).toLowerCase()} ${noun.toLowerCase()}`;
  const modal = last[2].replace(/^puedan$/i, 'pueden').replace(/^pueda$/i, 'puede');
  return `${actor} ${modal} `;
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
  // Solo una acción sin sujeto («Registrar…», «Consultar…») recibe el actor; una frase que ya tiene sujeto
  // («Administrador y vendedores registran…», «Una venta anulada…») se deja como está.
  const bareAction = /^[a-záéíóúñ]+(?:ar|er|ir)(?:se|lo|la|los|las|le|les)?\b/i.test(clean(necesidad));
  if (bareAction && !/\b(?:el|la|los|las)\s+\S+\s+(?:debe|puede|podr)/i.test(necesidad)) {
    const prefix = actorModal(quote, input) || actorModal(necesidad, necesidad);
    // «Editar clientes…, por administrador y vendedor»: si la necesidad ya nombra al actor, no se antepone otro.
    const noun = normalize(prefix).split(/\s+/)[1] || '';
    const named = noun.length >= 5 && normalize(necesidad).includes(noun.slice(0, 7));
    if (prefix && !named) necesidad = withSubject(prefix, necesidad);
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
  // «Gestionar X permitiendo crear, consultar, actualizar y eliminar»: la gestión de una entidad es una sola función; partirla
  // deja «…permitiendo crear» y fragmentos sueltos («consultar, actualizar y eliminar registros») sin objeto propio.
  if (/^(?:gestionar|administrar|mantener)\b/i.test(clean(item.necesidad))) return [item];
  const parts = partition(item.necesidad);
  if (parts.operations.length < 2 && !parts.rules.length) return [item];
  if (parts.operations.slice(1).some(operation => clean(operation.text).split(/\s+/).length <= 5 && !/\b(?:el|la|los|las|un|una)\s+\p{L}{4,}/iu.test(operation.text) && /^(?:consultar|actualizar|eliminar|crear|editar|modificar|listar|ver)\b/i.test(clean(operation.text)))) return [item];
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
  // Lo que el insumo declara «fuera de alcance» es una decisión explícita: si la IA solo lo dejó en el texto del alcance, se recupera.
  if (/fuera (?:del|de) alcance/.test(text)) {
    const covered = [...inventory, ...items].some(item => item.tipo === 'decision' && (item.estado === 'fuera_de_alcance' || /fuera (?:del|de) alcance|excluir|excluye/.test(normalize(item.necesidad))));
    if (!covered) add('decision', sentence.replace(/^(?:anoto|anotamos|dejamos|queda(?:n)?)\s+como\s+/i, 'Queda ').trim(), 'fuera_de_alcance');
    return items;
  }
  if (/alta disponibilidad|balanceador|replicas|conmutacion|failover/.test(text) && /no queremos|no se debe|por ahora no|no exige/.test(text)) {
    add('decision', sentence, 'fuera_de_alcance');
    return items;
  }
  if (/pendientes se deben registrar|necesitamos confirmar|queda(?:n)? por confirmar/.test(text)) {
    const open = [
      [/frecuencia de respaldos|recurrencia/, '¿Con qué recurrencia se harán las copias de seguridad de la base de datos (por ejemplo, diarias)?'],
      [/tiempo maximo de recuperacion|inactiv/, '¿Cuánto tiempo puede permanecer el sistema inactivo antes de volver a funcionar?'],
      [/requisito futuro de alta disponibilidad|alta disponibilidad/, '¿Qué haría falta, más adelante, para que el sistema siga funcionando aunque falle un servidor?'],
      [/metricas concretas/, '¿Qué métricas concretas faltan todavía para la seguridad y la facilidad de uso?']
    ];
    for (const [pattern, pregunta] of open) {
      if (pattern.test(text) && !inventory.some(item => item.tipo === 'pregunta' && pattern.test(normalize(`${item.necesidad} ${item.evidencia}`)))) add('pregunta', pregunta, 'pendiente');
    }
    if (open.some(([pattern]) => pattern.test(text))) return items;
  }
  if (/menos de un segundo/.test(text) && !already(inventory, 'RNF', /segundo|latencia|tiempo real|propag/)) {
    add('RNF', sentence);
    return items;
  }
  if (/respaldo|recuperar la informacion|copias de seguridad/.test(text)) {
    if (/caida breve|atender manualmente/.test(text) && !already(inventory, 'decision', /caida breve|manualmente/)) add('decision', 'Una caída breve se puede atender manualmente.');
    // Si la política de copias queda pendiente, la herramienta no la asume: la cubren las preguntas abiertas.
    const pendiente = /pendiente|por definir|lo definimos despues/.test(text);
    if (!pendiente && !already(inventory, 'RF', /respaldo|recuper/) && !/menos de\s+(?:un|una|\d+)/.test(text)) add('RF', 'Permitir respaldos de la base de datos y recuperación de información.');
    return items;
  }
  if (/botones claros|pocas acciones por pantalla/.test(text) && !already(inventory, 'RNF', /boton|usabilidad|facilidad de uso|pocas acciones/)) {
    add('RNF', usabilityName(sentence));
    return items;
  }
  if (deviceAssignment(sentence)) {
    const noun = /celular|tableta|computadora|pantalla grande/.exec(text)[0];
    if (!already(inventory, 'RNF', new RegExp(noun)) && !already(inventory, 'restriccion_tecnica', new RegExp(noun))) add('restriccion_tecnica', sentence, accepted ? 'confirmado' : 'pendiente');
    return items;
  }
  if (/contrasenas|validacion de datos|acceso autenticado|seguridad y la facilidad de uso/.test(text)) {
    if (/acceso autenticado|autenticacion/.test(text) && !already(inventory, 'RF', /autentic/)) add('RF', 'Autenticar el acceso según el rol.');
    if (!already(inventory, 'RNF', /contrasen|seguridad|confidencial/)) add('RNF', 'Proteger las contraseñas y validar los datos de entrada.');
    return items;
  }
  if (/\bjwt\b|autenticacion/.test(text)) {
    if (!already(inventory, 'RF', /autentic/)) add('RF', 'Autenticar el acceso según el rol.');
    if (/\bjwt\b/.test(text) && !already(inventory, 'restriccion_tecnica', /\bjwt\b/)) add('restriccion_tecnica', 'Usar JWT como mecanismo de autenticación.');
    return items;
  }
  if (/no pueda|no pueden|no debe|no se puede|no se pueden|sin que|pero no|solamente|unicamente|cualquier persona/.test(normalize(mainClause(sentence)))) {
    add('regla_negocio', sentence);
    const exception = /salvo que\s+((?:el|la|los|las)\s+[^.]{8,140})/i.exec(sentence);
    if (exception && /reasign/.test(normalize(exception[1])) && !already(inventory, 'RF', /reasign/)) add('RF', reassignmentName(sentence));
  }
  const pendingTech = /si ayuda|habiamos pensado|podriamos/.test(text);
  if (TECH.test(sentence) && /propon|usemos|usaran|utilizar|confirma|despleg|publicar|pantalla/.test(text)) {
    const estado = pendingTech ? 'pendiente' : accepted || /usemos|quedan? confirmad|usaran/.test(text) ? 'confirmado' : 'pendiente';
    add('restriccion_tecnica', sentence, estado);
    return items;
  }
  // «gestiona productos, usuarios, anula ventas…»: el sustantivo suelto tras «gestiona» comparte esa acción.
  // Sin esto, «usuarios» se pierde y la aplicación queda sin gestión de usuarios.
  if (/\bgestion(?:a|ar|an)\b/.test(text)) {
    const covered = noun => [...inventory, ...items].some(item => item.tipo === 'RF' && normalize(item.necesidad).includes(noun.slice(0, 6)));
    const bare = value => normalize(value).replace(/[.;:]+$/, '').replace(/^(?:los|las|el|la|sus)\s+/, '');
    let managing = false;
    let previous = '';
    for (const raw of segments(sentence)) {
      const segment = clean(raw).replace(/[.;:]+$/, '');
      const own = /\bgestion(?:a|ar|an)\s+(.+)$/i.exec(segment);
      if (own) { managing = true; previous = bare(own[1]); continue; }
      const verb = FAMILIES.some(([, pattern]) => pattern.test(segment)) || /^\p{L}+(?:a|an|e|en|ar|er|ir)\s+\p{L}/u.test(segment) && segment.split(/\s+/).length > 1 && !/^(?:los|las|el|la|sus|mis)\b/i.test(segment);
      if (!managing || verb) { managing = false; continue; }
      const noun = bare(segment);
      if (!noun || noun.split(/\s+/).length > 3) continue;
      // «gestionar usuarios y roles»: lo unido con «y» al objeto anterior es parte de ese objeto, no otro RF.
      const joined = previous && normalize(sentence).includes(`${previous} y ${noun}`);
      const object = joined ? `${previous} y ${noun}` : noun;
      if (!covered(joined ? previous : noun)) add('RF', `Gestionar ${object}.`);
      previous = noun;
    }
  }
  if (/debe|podra|podran|puede|pueden/.test(text) && !isRule(sentence)) {
    for (const [name, pattern] of FAMILIES) {
      if (!pattern.test(sentence)) continue;
      const clause = segments(sentence).map(clean).find(segment => pattern.test(segment) && !isRule(segment));
      const equivalents = { reportes: ['ventas'], ventas: ['reportes'], globales: ['ventas', 'reportes'], precios: ['precio'], usuarios: ['usuario'], pedidos: ['pedido', 'comanda'], comandas: ['pedido'], reservas: ['reserva'], paquetes: ['paquete'], puntos: ['punto'], mesas: ['mesa'] };
      const tokens = normalize(clause || '').split(/[^a-z0-9]+/).filter(token => token.length > 4);
      const samePayment = name === 'registro' && /cobro|pago/.test(normalize(clause || '')) && inventory.some(item => item.tipo === 'RF' && familyOf(item.necesidad) === 'cobro');
      const stem = token => token.slice(0, 5);
      const duplicated = samePayment || inventory.some(item => item.tipo === 'RF' && familyOf(item.necesidad) === name && tokens.some(token => [token, ...(equivalents[token] || [])].some(form => {
        const known = normalize(item.necesidad).split(/[^a-z0-9]+/).filter(part => part.length > 4).map(stem);
        return known.some(part => part === stem(form) || part.startsWith(stem(form)) || stem(form).startsWith(part));
      })));
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
const PLAIN_QUESTIONS = [
  [/frecuencia|recurrencia/, /respaldo|copia/, '¿Con qué recurrencia se harán las copias de seguridad de la base de datos (por ejemplo, diarias)?'],
  [/rto|rpo|inactiv/, /recuper|caida|inactiv|funcionar/, '¿Cuánto tiempo puede permanecer el sistema inactivo antes de volver a funcionar?'],
  [/tiempo maximo/, /recuper|caida|inactiv/, '¿Cuánto tiempo puede permanecer el sistema inactivo antes de volver a funcionar?'],
  [/alta disponibilidad/, /futur|mas adelante|posterior|evaluar/, '¿Qué haría falta, más adelante, para que el sistema siga funcionando aunque falle un servidor?'],
  [/metricas concretas/, /seguridad|uso|usabilidad|umbral/, '¿Qué métricas concretas faltan todavía para la seguridad y la facilidad de uso?']
];
function clarifyQuestions(inventory) {
  const seen = new Set();
  const result = [];
  for (const item of inventory || []) {
    if (item?.tipo !== 'pregunta' || item.estado !== 'pendiente') {
      result.push(item);
      continue;
    }
    const text = normalize(item.necesidad);
    if (/\b150\b/.test(text) && /personas conectadas/.test(text) && !/[¿?]/.test(item.necesidad) && inventory.some(other => other.tipo === 'RNF' && /150|personas conectadas/.test(normalize(other.necesidad)))) continue;
    const replacement = PLAIN_QUESTIONS.find(([left, right]) => left.test(text) && right.test(text));
    const necesidad = replacement ? replacement[2] : item.necesidad;
    const key = normalize(necesidad);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(necesidad === item.necesidad ? item : { ...item, necesidad });
  }
  return result;
}
function reassignmentName(sentence) {
  const object = /(?:ver|modificar)\s+(?:las?|los?|el|la)\s+(\p{L}+)/iu.exec(sentence);
  const role = /otro\s+(\p{L}+)/iu.exec(sentence);
  if (!object) return 'Reasignar';
  const people = role ? (role[1].toLowerCase().endsWith('s') ? role[1].toLowerCase() : `${role[1].toLowerCase()}s`) : '';
  return people ? `Reasignar ${object[1].toLowerCase()} entre ${people}` : `Reasignar ${object[1].toLowerCase()}`;
}
function usabilityName(sentence) {
  const match = String(sentence || '').match(/((?:las|los)\s+pantallas?\s+de\s+.+?)(?:\s+deben|\s+sean|\s+sea)\b/i);
  const scope = match ? match[1].trim() : 'las pantallas operativas';
  return `Facilidad de uso de ${scope.charAt(0).toLowerCase()}${scope.slice(1)}`;
}
function contentStems(text) {
  const equivalents = { reportes: ['ventas'], ventas: ['reportes'], globales: ['ventas', 'reportes'], precios: ['precio'], precio: ['precios'], usuarios: ['usuario'], usuario: ['usuarios'], pedidos: ['pedido', 'comanda'], comandas: ['pedido'], reservas: ['reserva'], mesas: ['mesa'], mesa: ['mesas'] };
  const stop = new Set(['debe', 'deben', 'poder', 'puede', 'pueden', 'podra', 'podran', 'sistema', 'solo', 'solamente', 'unicamente', 'otro', 'otra', 'otros', 'para', 'como', 'esta', 'este', 'cuando', 'antes', 'sobre']);
  return normalize(text).split(/[^a-z0-9]+/).filter(token => token.length > 4 && !stop.has(token)).flatMap(token => [token.slice(0, 5), ...(equivalents[token] || []).map(form => form.slice(0, 5))]);
}
function sharedStems(left, right) {
  const known = new Set(contentStems(right));
  return new Set(contentStems(left).filter(token => known.has(token))).size;
}
function deviceAssignment(text) {
  const value = normalize(text);
  return /celular|tableta|computadora|pantalla grande/.test(value) && /usara|usaran|usara su|canal/.test(value) && !/botones claros|pocas acciones/.test(value);
}
function quoteList(item) {
  const listed = Array.isArray(item?.evidencias) ? item.evidencias.map(entry => (typeof entry === 'string' ? { texto: entry } : entry)).filter(entry => entry?.texto) : [];
  if (listed.length) return listed;
  return item?.evidencia ? [{ texto: item.evidencia, fuente: item.fuente }] : [];
}
function sentencesOf(text) {
  return String(text || '').split(/(?<=[.!?])\s+/).map(sentence => sentence.trim()).filter(sentence => sentence.split(/\s+/).length >= 4);
}
function focusEvidence(item, inventory, input) {
  if (!['RF', 'RNF'].includes(item?.tipo)) return item;
  const others = (inventory || []).filter(other => other?.id !== item.id && ['RF', 'RNF'].includes(other.tipo));
  const source = String(input || '');
  const focused = quoteList(item).map(fragment => {
    const parts = sentencesOf(fragment.texto);
    if (parts.length < 2) return fragment;
    const best = parts.map(part => ({ part, mine: sharedStems(item.necesidad, part), other: Math.max(0, ...others.map(candidate => sharedStems(candidate.necesidad, part))) }))
      .sort((left, right) => right.mine - left.mine || Number(right.mine > right.other) - Number(left.mine > left.other))[0];
    return best?.mine >= 1 && source.includes(best.part) ? { ...fragment, texto: best.part } : fragment;
  }).filter(fragment => {
    const mine = sharedStems(item.necesidad, fragment.texto);
    const other = Math.max(0, ...others.map(candidate => sharedStems(candidate.necesidad, fragment.texto)));
    return mine >= 1 && mine >= other;
  });
  if (!focused.length || !source.includes(focused[0].texto)) return item;
  return { ...item, evidencia: focused[0].texto, ...(item.evidencias ? { evidencias: focused } : {}) };
}
function polish(inventory, input, identifiers) {
  const prepared = [];
  for (const original of inventory || []) {
    let item = { ...original };
    const text = normalize(item.necesidad);
    if (item.tipo === 'RNF' && deviceAssignment(item.necesidad)) {
      delete item.objetivo_id;
      item = { ...item, tipo: 'restriccion_tecnica' };
    } else if (/caida breve|atender manualmente/.test(text) && /respaldo|recuper/.test(text)) {
      const covered = [...inventory, ...prepared].some(other => other.id !== item.id && other.tipo === 'RF' && /respaldo|recuper/.test(normalize(other.necesidad)));
      prepared.push({ id: covered ? item.id : identifiers.next('N'), tipo: 'decision', necesidad: 'Una caída breve se puede atender manualmente.', estado: item.estado || 'confirmado', evidencia: item.evidencia, ...(item.evidencias ? { evidencias: item.evidencias } : {}), origen: item.origen || 'explicito' });
      if (covered) continue;
      item = { ...item, tipo: 'RF', necesidad: 'Permitir respaldos de la base de datos y recuperación de información.', objetivo_id: item.objetivo_id || identifiers.next('O') };
    } else if (item.tipo === 'RNF' && /respaldo|recuper/.test(text) && !/menos de\s+(?:un|una|\d+)/.test(text) && [...inventory, ...prepared].some(other => other.id !== item.id && other.tipo === 'RF' && /respaldo|recuper/.test(normalize(other.necesidad)))) {
      continue;
    } else if (item.tipo === 'RNF' && /botones claros|pocas acciones por pantalla|pantallas?\s+de\s+.+\s+deben ser simples/.test(text)) {
      item = { ...item, necesidad: usabilityName(`${item.necesidad}. ${item.evidencia || ''}`) };
    } else if (item.tipo === 'RNF' && /contrasen/.test(text) && /valid/.test(text) && item.necesidad.length > 80) {
      item = { ...item, necesidad: 'Proteger las contraseñas y validar los datos de entrada.' };
    } else if (item.tipo === 'RF' && /haga una reasignacion/.test(text)) {
      item = { ...item, necesidad: reassignmentName(`${item.necesidad} ${item.evidencia || ''}`) };
    } else if (item.tipo === 'RF' && /autentic/.test(text) && /rol/.test(text)) {
      item = { ...item, necesidad: 'Autenticar el acceso según el rol.' };
    } else if (item.tipo === 'RF') {
      item = { ...item, necesidad: item.necesidad.replace(/,?\s*actualizando\b[^.]{0,120}\b(?:tiempo real|menos de\s+(?:un|una|\d+)\s+\p{L}+)/giu, '').replace(/\s+/g, ' ').trim() };
    }
    if (item.tipo === 'RF' && /reporte/.test(normalize(item.necesidad)) && /confirma que|[?]/.test(`${item.evidencia || ''} ${(item.evidencias || []).map(entry => entry?.texto || '').join(' ')}`) && [...inventory, ...prepared].some(other => other.id !== item.id && other.tipo === 'RF' && /venta/.test(normalize(other.necesidad)))) continue;
    prepared.push(item);
  }
  const withoutSubsumed = prepared.filter(item => {
    if (item.tipo !== 'regla_negocio') return true;
    const own = new Set(contentStems(item.necesidad));
    const siblings = prepared.filter(other => other.tipo === 'regla_negocio');
    return !siblings.some(other => other.id !== item.id && own.size && [...own].every(token => contentStems(other.necesidad).includes(token)) && contentStems(other.necesidad).length > own.size);
  });
  const uniqueAuth = [];
  let authKept = false;
  for (const item of withoutSubsumed) {
    if (item.tipo === 'RF' && /autentic/.test(normalize(item.necesidad))) {
      if (authKept) continue;
      authKept = true;
    }
    uniqueAuth.push(item);
  }
  const focused = uniqueAuth.map(item => focusEvidence(item, uniqueAuth, input));
  const questions = focused.filter(item => item.tipo === 'pregunta' && item.estado === 'pendiente');
  const aligned = align(focused, identifiers).map(item => {
    if (!['RF', 'RNF'].includes(item.tipo)) return item;
    const preguntas = questions.filter(question => {
      const topic = normalize(`${question.necesidad} ${question.evidencia || ''}`);
      const subject = normalize(`${item.necesidad} ${item.evidencia || ''}`);
      if (/metricas concretas/.test(topic) && /seguridad|contrasen|usabilidad|facilidad de uso|boton/.test(subject) && !/menos de\s+(?:un|una|\d+)|\d+\s*(?:segundos|minutos|horas)/.test(subject)) return true;
      if (/recurrencia|frecuencia de respaldos|inactivo|tiempo maximo de recuperacion/.test(topic) && /respaldo|recuper/.test(subject)) return true;
      return false;
    }).map(question => question.id);
    return preguntas.length ? { ...item, preguntas_ids: [...new Set(preguntas)] } : item;
  });
  return aligned;
}
const ACTION = [
  ['ver', /\b(?:ver|visualizar|visualizan?|consult(?:ar|an|a|e|en)|revisar|revisan?|mostrar|muestra|muestran|listar|lista|listan)\b/],
  ['reservar', /\breserv/],
  ['comprar', /\bcompr/],
  ['acumular', /\bacumul/],
  ['tomar', /\btomar\b|\btoma(?:n)?\b/],
  ['ordenar', /\borden|\bpedir(?:lo|la|le|los|las)?\b|\bpid[ae]n?\b/],
  ['cobrar', /\bcobr|\bpago\b|\bpagar\b/],
  ['cerrar', /\bcerr/],
  ['marcar', /\bmarc/],
  ['cambiar', /\bcambi|\bmodific|\bedit|\bactualiz/],
  ['gestionar', /\bgestion/],
  ['validar', /\bvalid|\bescane/],
  ['autenticar', /\bautentic/],
  ['reasignar', /\breasign/],
  ['reflejar', /\breflej/],
  ['respaldar', /\brespald|\brecuper|\bcopias? de seguridad/],
  // Vender: el verbo, o registrar/emitir/realizar una venta. «precio de venta» es un dato, no la acción.
  ['vender', /\bvend(?:er|e|en)\b|\b(?:permitir|impedir|evitar|bloquear|rechazar)\s+(?:la\s+|una\s+)?venta\b|\b(?:registr\w+|emitir|realizar)\s+(?:una?\s+|la\s+)?venta\b/],
  ['anular', /\banul/]
];
function actionOf(text) {
  const value = normalize(text);
  return (ACTION.find(([, pattern]) => pattern.test(value)) || [])[0] || '';
}
function actionsOf(text) {
  const value = normalize(text);
  return ACTION.filter(([, pattern]) => pattern.test(value)).map(([name]) => name);
}
function leadingActor(text) {
  const match = /^(?:el|la|los|las)\s+(\p{L}+)/iu.exec(String(text || '').trim());
  if (!match) return '';
  const noun = normalize(match[1]);
  return noun === 'sistema' ? '' : noun;
}
function objectStems(text) {
  const ignored = new Set(['ver', 'visua', 'consu', 'revis', 'reser', 'compr', 'acumu', 'tomar', 'cobra', 'pagar', 'cerra', 'marca', 'cambi', 'modif', 'gesti', 'valid', 'escan', 'auten', 'reasi', 'refle', 'respa', 'recup', 'permi', 'reali', 'clien', 'meser', 'cajer', 'cocin', 'admin', 'perso', 'siste']);
  return contentStems(text).filter(token => !ignored.has(token));
}
function preconditionAction(text) {
  const value = normalize(text);
  const match = /antes de\s+(?:realizar|hacer|efectuar)?\s*(?:el|la|los|las)?\s*([a-z]+)/.exec(value);
  if (!match) return '';
  return actionOf(match[1]) || (/cobro|pago/.test(match[1]) ? 'cobrar' : '');
}
function constraintClause(text) {
  return /no\b|\bsolo\b|salvo|imped|restring|unicamente|solamente|antes de/.test(normalize(text));
}
// Raíces de rol («vendedor» → «vende», «administrador» → «admin»): nombran quién, no sobre qué objeto actúa la regla.
const ROLE_STEM = /^(?:vende|admin|duena|cajer|gerent)$/;
// Raíces del texto tal cual (sin las equivalencias «ventas ~ reportes»), sin roles ni palabras de relleno de una restricción.
const PLAIN_STOP = new Set(['debe', 'deben', 'poder', 'puede', 'pueden', 'podra', 'podran', 'sistema', 'solo', 'solamente', 'unicamente', 'otro', 'otra', 'otros', 'otras', 'para', 'como', 'esta', 'este', 'cuando', 'antes', 'sobre', 'tiene', 'tienen', 'tener', 'acceso', 'acceder', 'permiso', 'operacion', 'informacion', 'mediante']);
function plainStems(text) {
  return new Set(normalize(text).split(/[^a-z0-9]+/).filter(token => token.length > 4 && !PLAIN_STOP.has(token)).map(token => token.slice(0, 5)).filter(token => !ROLE_STEM.test(token)));
}
function clauseApplies(clause, need) {
  const target = preconditionAction(clause);
  // «Emitir factura después de registrar una venta» emite, no vende: lo que va tras «después de / tras / al / cuando» es contexto.
  const mainClause = String(need.necesidad || '').replace(/\b(?:despu[eé]s de|tras|luego de|al|cuando)\b[^,.;]*/giu, ' ');
  const needActions = actionsOf(mainClause);
  if (target) return needActions.includes(target);
  if (!constraintClause(clause)) return false;
  const clauseActor = leadingActor(clause);
  const needActor = leadingActor(need.necesidad);
  if (clauseActor && needActor && clauseActor !== needActor && !needActor.startsWith(clauseActor) && !clauseActor.startsWith(needActor)) return false;
  const clauseActions = actionsOf(clause);
  if (/solamente|unicamente/.test(normalize(clause)) && !clauseActions.length) return false;
  // Una regla que habla de una acción (vender, anular…) solo aplica a una necesidad que la comparte: si la necesidad
  // no tiene ninguna acción reconocida, compartir una palabra suelta («vendedor» ~ «vender») no basta.
  if (clauseActions.length && !clauseActions.some(action => needActions.includes(action))) return false;
  const roleless = text => objectStems(text).filter(token => !ROLE_STEM.test(token));
  const clauseObjects = roleless(clause);
  const needObjects = roleless(need.necesidad);
  // Sin una acción reconocible en la regla, una sola palabra compartida («venta», «acceso») no basta: se piden dos.
  if (!clauseActions.length) {
    const own = plainStems(clause);
    const shared = [...plainStems(need.necesidad)].filter(token => own.has(token)).length;
    return shared >= 2 && shared / own.size >= 2 / 3;
  }
  return needObjects.some(token => clauseObjects.includes(token));
}
function redundantNeed(item, inventory) {
  if (item?.tipo !== 'RF') return false;
  const text = normalize(tidyNeed(item.necesidad));
  const permission = /^(?:el|la|los|las)\s+\S+\s+(?:puede|pueden|podra|podran)\s+/.test(text) || /^(?:solamente|unicamente)\b/.test(text);
  if (!permission) return false;
  const actions = actionsOf(item.necesidad);
  const objects = objectStems(item.necesidad);
  return (inventory || []).some(other => other.id !== item.id && other.tipo === 'RF' && String(other.necesidad || '').length > String(item.necesidad || '').length && actionsOf(other.necesidad).some(action => actions.includes(action)) && objects.some(token => objectStems(other.necesidad).includes(token)));
}
function applicableClause(rule, need) {
  const sentences = String(rule?.necesidad || '').split(/(?<=[.;])\s+/).map(part => part.trim()).filter(Boolean);
  // Las frases que solo repiten la restricción sin nombrar una acción («no tiene acceso a las ventas de otros») no deciden por sí
  // solas: si la regla tiene alguna frase con acción, se evalúan esas.
  const withAction = sentences.filter(part => actionsOf(part).length);
  const candidates = withAction.length ? withAction : sentences;
  const sentence = candidates.find(part => clauseApplies(part, need)) || '';
  if (!sentence) return '';
  const parts = sentence.split(/\s*,\s*|\s+\by\b\s+/iu).map(part => part.trim()).filter(Boolean);
  const listed = parts.length > 1 && parts.filter(part => actionsOf(part).length).length >= 2 && !parts.slice(1).some(part => /^(?:salvo|pero|aunque)\b/i.test(part));
  if (!listed) return sentence;
  const prefix = (parts[0].match(/^((?:solamente|únicamente|unicamente)\s+)?(?:el|la|los|las)\s+\p{L}+(?:\s+\p{L}+)?\s+podr(?:á|an|a)\s+/iu) || [])[0] || '';
  const match = parts.find((part, index) => clauseApplies(index && prefix ? `${prefix}${part}` : part, need));
  return match ? (parts.indexOf(match) && prefix ? `${prefix}${match}` : match).replace(/\s+/g, ' ').trim() : '';
}
function ruleApplies(rule, need) {
  return Boolean(applicableClause(rule, need));
}
function tidyNeed(text) {
  return String(text || '')
    .replace(/^(?:el|la|los|las)\s+\p{L}+\s+(?:debe(?:n)? poder|puede|pueden|podrá|podrán)\s+(?=(?:el|la|los|las)\s+\p{L}+\s+)/iu, '')
    .replace(/\s+por parte de(?:l| la| los| las)?\s+\p{L}+[.]?/giu, '')
    .replace(/\s+para el cliente\b[.]?\s*$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}
function sameResult(left, right) {
  if (left.tipo !== right.tipo) return false;
  const first = actionOf(left.necesidad);
  const second = actionOf(right.necesidad);
  if (first && second && first !== second) return false;
  const shared = objectStems(left.necesidad).filter(token => objectStems(right.necesidad).includes(token));
  return shared.length >= 2 || Boolean(first && first === second && shared.length >= 1);
}
function align(inventory, identifiers) {
  const prepared = [];
  for (const original of inventory || []) {
    let item = { ...original };
    if (deviceAssignment(item.necesidad) || deviceAssignment(item.evidencia || '')) {
      delete item.objetivo_id;
      item = { ...item, tipo: 'restriccion_tecnica', grupo: 'restriccion' };
    }
    if (!['RF', 'RNF'].includes(item.tipo)) delete item.objetivo_id;
    if (item.tipo === 'RF') item = { ...item, necesidad: tidyNeed(item.necesidad) };
    if (redundantNeed(item, [...(inventory || []), ...prepared])) continue;
    const backup = actionsOf(`${item.necesidad || ''} ${item.evidencia || ''}`).includes('respaldar');
    const measured = /menos de\s+(?:un|una|\d+)|\d+\s*(?:segundos|minutos|horas)/.test(normalize(`${item.necesidad || ''} ${item.evidencia || ''}`));
    if (item.tipo === 'RNF' && backup && !measured && [...(inventory || []), ...prepared].some(other => other.id !== item.id && other.tipo === 'RF' && actionsOf(`${other.necesidad || ''} ${other.evidencia || ''}`).includes('respaldar'))) continue;
    const target = item.tipo === 'RF' ? preconditionAction(item.necesidad) : '';
    const checksAnother = target && /comprobar|verificar|validar/.test(normalize(item.necesidad)) && (inventory || []).some(other => other.id !== item.id && other.tipo === 'RF' && actionOf(other.necesidad) === target);
    if (checksAnother) {
      const covered = [...inventory, ...prepared].some(other => other.id !== item.id && other.tipo === 'regla_negocio' && preconditionAction(other.necesidad) === target);
      if (!covered) prepared.push({ ...item, tipo: 'regla_negocio', necesidad: tidyNeed(item.necesidad) });
      continue;
    }
    prepared.push(item);
  }
  const goals = new Map();
  for (const item of prepared) {
    if (!['RF', 'RNF'].includes(item.tipo) || !item.objetivo_id) continue;
    if (!goals.has(item.objetivo_id)) goals.set(item.objetivo_id, []);
    goals.get(item.objetivo_id).push(item);
  }
  for (const items of goals.values()) {
    const clusters = [];
    for (const item of items) {
      const cluster = clusters.find(group => group.every(other => sameResult(other, item)));
      if (cluster) cluster.push(item);
      else clusters.push([item]);
    }
    for (const cluster of clusters.slice(1)) {
      const objetivo = identifiers.next('O');
      for (const item of cluster) item.objetivo_id = objetivo;
    }
  }
  const rules = prepared.filter(item => item.tipo === 'regla_negocio');
  return prepared.map(item => {
    // Las reglas de negocio acotan funciones; una cualidad («menos de 2 s al registrar una venta») no las hereda.
    if (item.tipo !== 'RF') return item;
    const reglas = rules.filter(rule => ruleApplies(rule, item)).map(rule => rule.id);
    const next = { ...item };
    if (reglas.length) next.reglas_ids = [...new Set(reglas)];
    else delete next.reglas_ids;
    return next;
  });
}
function linkActors(inventory, actors) {
  const people = (actors || []).filter(actor => actor?.id && actor.estado !== 'rechazado');
  if (!people.length) return inventory;
  const namesOf = candidate => [candidate.nombre, ...(candidate.alias || [])].map(name => normalize(name).split(/\s+/).pop()).filter(word => word && word.length >= 4);
  const mentions = (candidate, text) => namesOf(candidate).some(word => new RegExp('(?:^|[^a-z])(?:el|la|los|las)\\s+' + word.slice(0, Math.max(5, word.length - 2)), 'i').test(text));
  return (inventory || []).map(item => {
    if (item?.tipo !== 'RF') return item;
    const subject = (/^(?:el|la|los|las)\s+(\p{L}+)/iu.exec(item.necesidad) || [])[1] || '';
    const noun = normalize(subject);
    let actor = subject && noun !== 'sistema' ? people.find(candidate => namesOf(candidate).some(word => word === noun || word.startsWith(noun) || noun.startsWith(word))) : null;
    // Sin sujeto en la frase («Emitir factura…»), el actor es el único que la cita nombra («…el vendedor emite la factura»).
    if (!actor && !item.actor_id) {
      const quote = normalize([item.evidencia, ...(Array.isArray(item.evidencias) ? item.evidencias.map(entry => (typeof entry === 'string' ? entry : entry?.texto)) : [])].filter(Boolean).join(' '));
      const named = people.filter(candidate => mentions(candidate, quote));
      if (named.length === 1) actor = named[0];
    }
    return actor ? { ...item, actor_id: actor.id } : item;
  });
}
/**
 * «Capturar en cada venta: fecha, vendedor, cliente…» no es otra función: son los datos que guarda la operación
 * que registra la venta. Como RF genera un requisito, una operación y una pantalla duplicados.
 */
function dataDetailAsRule(item) {
  if (item?.tipo !== 'RF') return item;
  const text = normalize(item.necesidad);
  const dataOnly = /^(?:capturar|almacenar|guardar|registrar|conservar)\s+(?:en|de|para|por)\s+cada\s+\p{L}+/u.test(text)
    || /^(?:capturar|almacenar|guardar)\b[^.]*\bpor cada\s+\p{L}+/u.test(text);
  if (!dataOnly) return item;
  const { objetivo_id, actor_id, ...rest } = item;
  return { ...rest, tipo: 'regla_negocio', ...(objetivo_id ? { objetivos_relacionados: [objetivo_id] } : {}) };
}
/**
 * Un solo formato de objetivo («O-01»): la IA escribe «O001» y el generador «O-01», y la pantalla solo reconoce el segundo,
 * así que los objetivos de la IA no aparecían en el resumen y los nuevos podían chocar con ellos. «O001» pasa a «O-01»
 * (mismo número) y, si ese número ya lo usa otro objetivo distinto, toma el siguiente libre. Los demás objetivos y las
 * referencias de las reglas se reescriben con la misma correspondencia.
 */
function canonicalGoals(inventory) {
  const items = Array.isArray(inventory) ? inventory : [];
  const goalOf = value => (typeof value === 'string' ? value : '');
  const isCanonical = id => /^O-\d+$/.test(id);
  const used = new Set();
  for (const item of items) for (const id of [goalOf(item?.objetivo_id), ...(Array.isArray(item?.objetivos_relacionados) ? item.objetivos_relacionados.map(goalOf) : [])]) if (isCanonical(id)) used.add(id);
  const map = new Map();
  const nextFree = () => { let n = 1; while (used.has(`O-${String(n).padStart(2, '0')}`)) n += 1; const id = `O-${String(n).padStart(2, '0')}`; used.add(id); return id; };
  const convert = id => {
    if (!id || isCanonical(id) || !/^O0*\d+$/i.test(id)) return id;
    if (!map.has(id)) {
      const wanted = `O-${String(Number(id.slice(1))).padStart(2, '0')}`;
      if (!used.has(wanted)) { used.add(wanted); map.set(id, wanted); } else map.set(id, nextFree());
    }
    return map.get(id);
  };
  // Los objetivos propios se convierten primero; las referencias («objetivos_relacionados») apuntan a un objetivo que ya
  // existe, nunca crean uno nuevo: «O2» es el objetivo «O-02», no uno distinto.
  const own = items.map(item => (item && typeof item === 'object' && goalOf(item.objetivo_id) ? { ...item, objetivo_id: convert(item.objetivo_id) } : item));
  const numberOf = id => (/^O-?0*(\d+)$/i.exec(id) || [])[1];
  const byNumber = new Map();
  for (const item of own) {
    const id = item?.objetivo_id;
    const key = numberOf(id);
    if (id && key && !byNumber.has(String(Number(key)))) byNumber.set(String(Number(key)), id);
  }
  const reference = id => {
    if (!id) return id;
    if (map.has(id)) return map.get(id);
    const key = numberOf(id);
    return (key && byNumber.get(String(Number(key)))) || id;
  };
  return own.map(item => (item && typeof item === 'object' && Array.isArray(item.objetivos_relacionados)
    ? { ...item, objetivos_relacionados: [...new Set(item.objetivos_relacionados.map(id => reference(goalOf(id)) || id))] }
    : item));
}
/**
 * Una aplicación con acceso por usuario y contraseña (JWT, roles, cuentas) necesita su función de inicio de sesión: si el insumo solo
 * la menciona como tecnología o restricción («autenticación con JWT»), no queda ningún RF que la pida y el sistema generado no tiene
 * pantalla de acceso ni cuentas reales. Se añade ese RF con la evidencia de la mención.
 */
function ensureAuthentication(inventory, identifiers) {
  const items = Array.isArray(inventory) ? inventory : [];
  if (items.some(item => item?.tipo === 'RF' && /(?:autentic|inicio de sesion|iniciar sesion|login|acceso al sistema|validar acceso)/.test(normalize(item.necesidad)))) return items;
  const source = items.find(item => item && item.tipo !== 'RF' && item.tipo !== 'pregunta' && /\b(?:jwt|autenticacion|inicio de sesion|usuario y contrasena|acceso con usuario)\b/.test(normalize(`${item.necesidad} ${item.evidencia || ''}`)) && !/\b(?:no habra|sin)\b.*\b(?:login|autenticacion)\b/.test(normalize(item.necesidad)));
  if (!source || !(source.evidencia || (source.evidencias || []).length)) return items;
  return [...items, {
    id: identifiers.next('N'), tipo: 'RF', objetivo_id: identifiers.next('O'), necesidad: 'Autenticar usuarios mediante usuario y contraseña para acceder al sistema según su rol.',
    estado: 'confirmado', evidencia: source.evidencia, ...(source.evidencias ? { evidencias: source.evidencias } : {})
  }];
}
function refine(inventory, input, identifiers, actors) {
  const current = [];
  for (const item of (inventory || []).map(dataDetailAsRule)) current.push(...splitItem(item, identifiers).map(part => ensureSubject(part === item ? item : withEvidence(part, item.evidencia), input)));
  const recovered = clarifyQuestions(current.concat(recover(input, current, identifiers).map(item => ensureSubject(item, input))));
  return canonicalGoals(ensureAuthentication(linkActors(polish(recovered, input, identifiers), actors), identifiers));
}
module.exports = { canonicalGoals, refine, align, partition, familyOf, linkActors, ruleApplies, applicableClause, preconditionAction, actionOf, actionsOf, tidyNeed, redundantNeed };
