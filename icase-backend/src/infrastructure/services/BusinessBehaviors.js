/**
 * Comportamientos de negocio que se deducen del modelo de dominio y de los requisitos, y que una operación de datos suelta no cumple:
 * quién queda en un campo con nombre de rol, qué exige un cobro, cómo nace y se activa un saldo prepagado, qué reserva ya ocupa un cupo,
 * qué estado se cambia con un botón o qué detalle acompaña a un documento con líneas.
 *
 * Todo es determinista e idempotente: se aplica a la propuesta y otra vez al generar desde la especificación guardada.
 * La entidad se identifica siempre por su clave (`entidadClave`); el contrato le asigna después el almacén que la ejecuta.
 */
const Compatibility = require('../../core/services/RequirementScreenCompatibility');

const strip = (value) => String(value || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const list = (value) => (Array.isArray(value) ? value : []);
const ACCOUNT = /^(?:usuario|cuenta|cuentausuario)$/i;
const props = (entity) => entity?.schema?.properties || {};
const isNumber = (definition) => ['number', 'integer'].includes(definition?.type);
const isMoment = (definition) => ['date', 'date-time'].includes(definition?.format);
const findField = (entity, pattern, accept = () => true) => Object.keys(props(entity)).find((name) => pattern.test(strip(name)) && accept(props(entity)[name]));
const findValue = (definition, pattern) => list(definition?.enum).find((value) => pattern.test(strip(value)));
const roleId = (value) => strip(value).trim().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
const pascal = (value) => String(value || '').split(/[^A-Za-z0-9]+/).filter(Boolean).map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()).join('');
const plural = (value) => (/[aeiou]$/i.test(value) ? `${value}s` : `${value}es`);

/** El actor al que nombra un campo que apunta a la cuenta («mesero_id» → Mesero); null si no es un rol del proyecto. */
function roleOfField(campo, definition, actors) {
  if (!ACCOUNT.test(String(definition?.['x-references'] || ''))) return null;
  const base = String(campo).replace(/_?id$/i, '');
  if (ACCOUNT.test(base)) return null;
  const canonical = Compatibility.canonicalRole(base);
  return actors.find((actor) => Compatibility.canonicalRole(actor) === canonical) || null;
}

/**
 * Un campo con nombre de rol no es «quien tiene la sesión» sin más:
 * - quien ejecuta ese rol queda registrado (el cliente de su reserva, el cajero del cobro);
 * - si lo registra otro rol y un dato referenciado ya dice quién es (la mesa tiene su mesero), se hereda de él;
 * - si nada lo dice, lo elige la persona (el administrador asigna el mesero de una mesa).
 */
function roleFields(operation, entity, entities, actors) {
  if (operation.tipo !== 'crear') return;
  const performers = list(operation.actores).map((actor) => Compatibility.canonicalRole(actor));
  const result = [];
  for (const [campo, definition] of Object.entries(props(entity))) {
    const role = roleOfField(campo, definition, actors);
    if (!role) continue;
    const canonical = Compatibility.canonicalRole(role);
    const performs = performers.includes(canonical);
    // Quien lo registra es el propio rol: no necesita que nadie se lo asigne.
    const onlyRole = performs && performers.every((item) => item === canonical);
    let heredar = null;
    if (!onlyRole) {
      for (const [via, ref] of Object.entries(props(entity))) {
        const source = entities.get(ref?.['x-references']);
        if (!source || ACCOUNT.test(source.name) || props(source)[campo]?.['x-references'] !== definition['x-references']) continue;
        heredar = { via, campo, entidad: source.name, entidadClave: source.key };
        break;
      }
    }
    operation.sesionEntradas = list(operation.sesionEntradas).filter((item) => item.campo !== campo);
    if (performs || heredar) {
      operation.entradas = list(operation.entradas).filter((item) => item !== campo);
      result.push({ campo, rol: roleId(role), nombreRol: role, ...(heredar ? { heredar } : {}) });
    } else {
      if (!list(operation.entradas).includes(campo)) operation.entradas = [...list(operation.entradas), campo];
      result.push({ campo, rol: roleId(role), nombreRol: role, elegido: true });
    }
  }
  if (result.length) operation.rolEntradas = result; else delete operation.rolEntradas;
  if (!list(operation.sesionEntradas).length) delete operation.sesionEntradas;
}

/** «El sistema asigna un código de reserva»: el código lo genera el servidor; nadie lo escribe ni queda vacío. */
function assignedCode(operation, entity, texts) {
  if (operation.tipo !== 'crear') return;
  const text = strip(texts.join(' '));
  if (!/(?:sistema[^.]{0,60}(?:asign|gener)\w*|(?:asign|gener)\w*[^.]{0,60}automatic\w*)[^.]{0,60}\bcodigo|\bcodigo[^.]{0,60}(?:automatic|generad\w* por el sistema)/.test(text)) return;
  for (const [campo, definition] of Object.entries(props(entity))) {
    if (!/^codigo/i.test(campo) || definition.type !== 'string' || definition.enum) continue;
    if (list(operation.autoEntradas).some((item) => item.campo === campo)) continue;
    operation.entradas = list(operation.entradas).filter((item) => item !== campo);
    operation.autoEntradas = [...list(operation.autoEntradas), { campo, valor: 'generado' }];
  }
}

/** La entidad que lleva la cuenta del saldo prepagado de una persona: saldo, vigencia y un estado «activo». */
function balanceEntity(entities) {
  for (const entity of entities.values()) {
    const saldo = findField(entity, /^saldo/, isNumber);
    const estado = findField(entity, /^estado$/);
    const activo = estado && findValue(props(entity)[estado], /^activ/);
    const inicio = findField(entity, /^(fecha_?inicio|inicio|vigencia_?desde)$/);
    const fin = findField(entity, /^(fecha_?fin|fin|vigencia_?hasta|fecha_?vencimiento)$/);
    if (saldo && activo && inicio && fin) return { entity, saldo, estado, activo, inicio, fin };
  }
  return null;
}

/** Entidades con líneas: cabecera → { hijo, fk, referencia, cantidad, destino }. */
function linesOf(entity, entities, specService) {
  return specService._lineasDe({ tipo: 'crear' }, entity, entities);
}

/** «1 punto por cada unidad de un plato de categoría almuerzo»: contador de la persona, premio por unidad y la categoría que cuenta. */
function pointsRule(entities, texts) {
  const account = [...entities.values()].find((entity) => findField(entity, /^puntos(_acumulados)?$/, isNumber)
    && Object.values(props(entity)).some((definition) => ACCOUNT.test(String(definition?.['x-references'] || ''))));
  if (!account) return null;
  const text = texts.map(strip).find((item) => /\b\d+\s+puntos?\b[^.]*\bpor cada\b/.test(item));
  if (!text) return null;
  const porUnidad = Number(text.match(/\b(\d+)\s+puntos?\b/)[1]);
  const campo = findField(account, /^puntos(_acumulados)?$/, isNumber);
  const titular = Object.keys(props(account)).find((name) => ACCOUNT.test(String(props(account)[name]?.['x-references'] || '')));
  return { account, campo, titular, porUnidad, text };
}

/**
 * Cobrar un documento (el pedido de un cobro): solo en el estado «listo», una sola vez, por su total; el documento queda «pagado».
 * Con saldo prepagado se exige un paquete activo, vigente y con saldo; y el cliente suma sus puntos.
 */
function settlement(operation, entity, entities, specService, texts) {
  if (operation.tipo !== 'crear') return;
  let found = null;
  for (const [campo, definition] of Object.entries(props(entity))) {
    const target = entities.get(definition?.['x-references']);
    const estado = target && findField(target, /^estado$/);
    const de = estado && findValue(props(target)[estado], /^(list|emitid|por_?cobrar|entregad|confirmad)/);
    const a = estado && findValue(props(target)[estado], /^(pagad|cobrad)/);
    const total = target && findField(target, /^(total|monto_?total|importe_?total)$/, isNumber);
    const monto = findField(entity, /^(monto|importe|total|valor)/, isNumber);
    if (de && a && total && monto) { found = { campo, target, estado, de, a, total, monto }; break; }
  }
  if (!found) return;
  const { campo, target, estado, de, a, total, monto } = found;
  const metodo = findField(entity, /^(metodo|metodo_?pago|forma_?pago|medio_?pago)$/);
  const prepaid = metodo && findValue(props(entity)[metodo], /prepag|saldo/);
  const holder = (item) => Object.keys(props(item)).find((name) => /^cliente_?id$/i.test(name) && ACCOUNT.test(String(props(item)[name]?.['x-references'] || '')));
  const client = holder(target);
  const balance = balanceEntity(entities);
  const liquida = { documento: { campo, entidad: target.name, entidadClave: target.key, estado, de, a, total, ...(client ? { cliente: client } : {}) }, monto, ...(metodo ? { metodo } : {}) };
  if (prepaid && balance && client && holder(balance.entity)) {
    liquida.saldo = { valor: prepaid, entidad: balance.entity.name, entidadClave: balance.entity.key, titular: holder(balance.entity), estado: balance.estado, activo: balance.activo, inicio: balance.inicio, fin: balance.fin, campo: balance.saldo };
  }
  const points = pointsRule(entities, texts);
  const lines = linesOf(target, entities, specService);
  if (points && lines && client) {
    const destination = entities.get(lines.destino);
    const categoria = Object.keys(props(destination)).find((name) => list(props(destination)[name].enum).some((value) => points.text.includes(strip(value))));
    const valor = categoria && props(destination)[categoria].enum.find((value) => points.text.includes(strip(value)));
    if (valor) {
      liquida.puntos = {
        entidad: points.account.name, entidadClave: points.account.key, titular: points.titular, campo: points.campo, porUnidad: points.porUnidad,
        lineas: { entidadClave: lines.entidadClave, fk: lines.fk, referencia: lines.referencia, cantidad: lines.cantidad, destinoClave: lines.destinoClave, campo: categoria, valor }
      };
    }
  }
  operation.liquida = liquida;
  // El monto es el total del documento: no lo escribe quien cobra.
  operation.entradas = [...new Set([campo, ...list(operation.entradas).filter((item) => item !== monto && item !== campo)])];
  operation.autoEntradas = list(operation.autoEntradas).filter((item) => item.campo !== monto);
  // Una operación que ya es «cobrar con saldo prepagado» no pregunta el método.
  const dedicated = prepaid && /prepag|saldo/.test(strip(operation.nombre));
  if (dedicated) {
    operation.entradas = operation.entradas.filter((item) => item !== metodo);
    liquida.fijo = { [metodo]: prepaid };
  } else if (metodo && !operation.entradas.includes(metodo)) operation.entradas.push(metodo);
}

/** Solicitar un saldo de «una semana»: nace hoy, vence a los días que dice el requisito y sin saldo hasta que se pague. */
function period(operation, entity, entities, texts) {
  if (operation.tipo !== 'crear') return;
  const balance = balanceEntity(entities);
  if (!balance || balance.entity.name !== entity.name) return;
  const text = strip(texts.join(' '));
  const dias = /\bsemanal(es)?\b|\buna semana\b/.test(text) ? 7 : /\bquincenal\b|\bquince dias\b/.test(text) ? 15 : /\bmensual\b|\bun mes\b/.test(text) ? 30 : null;
  if (!dias) return;
  const pagado = findField(entity, /^(monto_?pagado|monto|importe)$/, isNumber);
  operation.periodo = { inicio: balance.inicio, fin: balance.fin, dias, saldo: balance.saldo, ...(pagado ? { positivo: pagado } : {}) };
  const own = [balance.inicio, balance.fin, balance.saldo];
  operation.entradas = list(operation.entradas).filter((item) => !own.includes(item));
  operation.autoEntradas = list(operation.autoEntradas).filter((item) => !own.includes(item.campo));
}

/** Activar el paquete pagado: quien cobra indica lo pagado y ese monto es el saldo con el que queda activo. */
function activation(operation, entity, entities) {
  if (operation.tipo !== 'transicion') return;
  const balance = balanceEntity(entities);
  if (!balance || balance.entity.name !== entity.name || operation.transicion?.a !== balance.activo) return;
  const pagado = findField(entity, /^(monto_?pagado|monto|importe)$/, isNumber);
  if (!pagado) return;
  operation.entradas = [pagado];
  operation.alCambiar = { exigir: [pagado], copiar: { [balance.saldo]: pagado } };
}

/**
 * Reservar «una mesa completa o una silla»: la mesa completa ocupa todas sus sillas; cada silla ocupa una, hasta las que tiene la mesa.
 * Lo mismo vale para cualquier recurso con capacidad que se reserva entero o por plazas.
 */
function capacity(operation, entity, entities) {
  if (operation.tipo !== 'crear') return;
  const tipo = Object.keys(props(entity)).find((name) => findValue(props(entity)[name], /complet|entera|total/) && findValue(props(entity)[name], /silla|asiento|plaza|cupo|puesto|individual/));
  const momento = Object.keys(props(entity)).find((name) => props(entity)[name].format === 'date-time' && !/crea|registro/.test(strip(name)));
  if (!tipo || !momento) return;
  for (const [campo, definition] of Object.entries(props(entity))) {
    const resource = entities.get(definition?.['x-references']);
    const plazas = resource && findField(resource, /^(cantidad_?(sillas|asientos|plazas|puestos)|sillas|asientos|capacidad|cupos?|plazas)$/, isNumber);
    if (!plazas) continue;
    operation.cupo = {
      recurso: campo, momento, tipo, completo: findValue(props(entity)[tipo], /complet|entera|total/),
      capacidad: { entidad: resource.name, entidadClave: resource.key, campo: plazas }
    };
    return;
  }
}

/** Las consultas de un documento con líneas (la comanda) muestran lo pedido: «2× Lomo saltado, 1× Jugo». */
function detail(operation, entity, entities, specService) {
  if (operation.tipo !== 'consulta') return;
  const lines = linesOf(entity, entities, specService);
  if (!lines) return;
  const campo = strip(plural(lines.destino));
  if (props(entity)[campo]) return;
  operation.detalle = { campo, entidadClave: lines.entidadClave, fk: lines.fk, referencia: lines.referencia, cantidad: lines.cantidad, destinoClave: lines.destinoClave };
}

/** Documentos que ya no cambian: lo cobrado (el pedido pagado), el propio cobro y los cierres. */
function locks(operations, entities) {
  const result = [];
  for (const operation of operations) {
    if (operation.tipo !== 'crear' || operation.estado_decision === 'rechazado') continue;
    const entity = entities.get(operation.entidad);
    if (!entity) continue;
    if (operation.liquida) {
      const doc = operation.liquida.documento;
      result.push({ id: `BLQ-${doc.entidadClave}`, entidad: doc.entidad, tipo: 'bloqueo', campo: doc.estado, valor: doc.a, mensaje: `Un registro de ${doc.entidad} en estado ${doc.a} no se modifica ni se elimina.` });
      result.push({ id: `BLQ-${entity.key}`, entidad: entity.name, tipo: 'solo_insercion', mensaje: `Un registro de ${entity.name} no se modifica ni se elimina.` });
      // Una sola vez: también lo garantiza la base de datos, aunque dos cajas cobren a la vez.
      result.push({ id: `UNI-${entity.key}`, entidad: entity.name, tipo: 'unico', campos: [operation.liquida.documento.campo], mensaje: `Ese ${doc.entidad.toLowerCase()} ya fue cobrado.` });
    } else if (/cierre/i.test(entity.name)) {
      result.push({ id: `BLQ-${entity.key}`, entidad: entity.name, tipo: 'solo_insercion', mensaje: `Un registro de ${entity.name} no se modifica ni se elimina.` });
    }
  }
  return [...new Map(result.map((rule) => [rule.id, rule])).values()];
}

/**
 * Aplica los comportamientos a las operaciones vigentes (modifica los objetos recibidos).
 * `texts` son las declaraciones de los requisitos y reglas aprobadas, de donde salen cifras como «1 punto por cada almuerzo».
 */
function apply(operations, { entities, actors = [], texts = [], textsByRf = new Map(), specService }) {
  for (const operation of operations) {
    const entity = entities.get(operation.entidad);
    if (!entity || operation.estado_decision === 'rechazado') continue;
    roleFields(operation, entity, entities, actors);
    assignedCode(operation, entity, [operation.nombre, ...list(textsByRf.get(String(operation.rf).toUpperCase()))]);
    settlement(operation, entity, entities, specService, texts);
    period(operation, entity, entities, [operation.nombre, ...list(textsByRf.get(String(operation.rf).toUpperCase())), entity.name]);
    activation(operation, entity, entities);
    capacity(operation, entity, entities);
    detail(operation, entity, entities, specService);
    requireCode(operation);
  }
  return operations;
}

const uniqueName = (base, names) => { let name = base; for (let n = 2; names.has(name); n += 1) name = `${base}${n}`; names.add(name); return name; };
const publicFields = (entity) => Object.keys(props(entity)).filter((name) => name !== 'id' && !/password|hash|secret|token|clave/i.test(name));

/**
 * «El Mesero marca una mesa como libre u ocupada»: un estado de dos valores que el requisito manda cambiar son dos botones (transiciones),
 * no un formulario que edita todos los datos del registro. Devuelve las operaciones nuevas y los nombres de las que sustituyen.
 */
function stateButtons(operations, { rf, entities, names }) {
  const added = [];
  const removed = new Set();
  for (const requirement of rf) {
    const id = String(requirement.identificador).toUpperCase();
    const text = strip(`${requirement.nombre} ${requirement.descripcion}`);
    if (!/\bmarc\w*|\b(?:cambi|actualiz)\w*\s+(?:(?:su|el|de)\s+)?(?:estado|disponibilidad)/.test(text)) continue;
    const word = (value) => new RegExp(`\\b${strip(value)}s?\\b`).test(text);
    for (const entity of entities.values()) {
      if (!new RegExp(`\\b${strip(entity.name)}(?:s|es)?\\b`).test(strip(requirement.nombre))) continue;
      for (const [campo, definition] of Object.entries(props(entity))) {
        const values = list(definition.enum);
        if (values.length !== 2 || !values.every(word)) continue;
        // Dos botones solo si el requisito ofrece las dos opciones («libre u ocupada»): «de pendiente a validada» va en un solo sentido.
        const [first, second] = values.map(strip);
        if (!new RegExp(`\\b(?:${first}s?\\s+(?:o|u|y)\\s+(?:como\\s+)?${second}|${second}s?\\s+(?:o|u|y)\\s+(?:como\\s+)?${first})s?\\b`).test(text)) continue;
        const covered = (value) => operations.some((op) => op.tipo === 'transicion' && op.entidad === entity.name && op.transicion?.campo === campo && op.transicion?.a === value);
        if (values.every(covered)) continue;
        // La edición genérica del mismo requisito dejaba cambiar cualquier dato del registro: la sustituyen los botones.
        for (const op of operations) if (op.rf === id && op.entidad === entity.name && op.tipo === 'actualizar' && list(op.entradas).includes(campo)) removed.add(op.nombre);
        for (const value of values.filter((item) => !covered(item))) {
          added.push({
            nombre: uniqueName(`marcar${entity.name}${pascal(value)}`, names), rf: id, tipo: 'transicion', entidad: entity.name, entidadClave: entity.key,
            actores: list(requirement.actores), filtros: [], entradas: [], salida: [], transicion: { campo, de: values.filter((item) => item !== value), a: value },
            descripcion: `Marca ${entity.name} como ${strip(value)}.`, estado_decision: 'pendiente', origen: 'derivado'
          });
        }
      }
    }
  }
  return { added, removed };
}

/** «Busca la reserva por su código y la marca como validada»: primero se busca por el código y después se cambia ese registro. */
function codeSearch(operations, { entities, names }) {
  const added = [];
  for (const transition of operations.filter((op) => op.tipo === 'transicion' && op.estado_decision !== 'rechazado')) {
    const filter = list(transition.filtros).find((item) => item.origen === 'parametro' && /^codigo/i.test(item.campo));
    if (!filter) continue;
    const entity = entities.get(transition.entidad);
    transition.filtros = transition.filtros.filter((item) => item !== filter);
    if (!entity || operations.some((op) => op.tipo === 'consulta' && op.entidad === entity.name && list(op.filtros).some((item) => item.campo === filter.campo && item.origen === 'parametro'))) continue;
    added.push({
      nombre: uniqueName(`buscar${entity.name}PorCodigo`, names),
      rf: transition.rf, tipo: 'consulta', entidad: entity.name, entidadClave: entity.key, actores: transition.actores,
      filtros: [{ campo: filter.campo, operador: '==', origen: 'parametro', valor: filter.valor }], entradas: [], salida: publicFields(entity),
      descripcion: `Busca ${entity.name} por ${filter.campo}.`, estado_decision: 'pendiente', origen: 'derivado'
    });
  }
  return added;
}

/** Una consulta que busca por un código no lista todo cuando aún no se ha escrito el código. */
function requireCode(operation) {
  if (operation.tipo === 'consulta' && list(operation.filtros).some((item) => item.origen === 'parametro' && /^codigo/i.test(item.campo))) operation.exigeParametro = true;
}

/**
 * Coloca en las pantallas las operaciones añadidas: la búsqueda en la pantalla de su requisito y los botones de estado en las listas del
 * mismo dato que ve quien puede ejecutarlos. Quita componentes y botones de las operaciones sustituidas.
 */
function wire(views, { added, removed, operations, screens, screenId, entities = new Map(), names = new Set() }) {
  const byName = new Map(operations.map((op) => [op.nombre, op]));
  const byScreen = new Map(list(screens).map((screen) => [screenId(screen), screen]));
  const allowed = (viewId, operation) => {
    const roles = Compatibility.rolesOf(byScreen.get(viewId));
    const actors = list(operation.actores).map(Compatibility.canonicalRole);
    return !roles.length || !actors.length || roles.some((role) => actors.includes(role));
  };
  for (const view of views) {
    view.componentes = view.componentes.filter((component) => !removed.has(component.operacion));
    for (const component of view.componentes) component.acciones = list(component.acciones).filter((action) => !removed.has(action.operacion));
  }
  const label = (operation) => `Marcar ${strip(operation.transicion.a).replace(/_/g, ' ')}`;
  for (const operation of added.filter((op) => op.tipo === 'consulta')) {
    const screen = list(screens).find((item) => list(item.rf_trazabilidad).map((value) => String(value).toUpperCase()).includes(operation.rf) && allowed(screenId(item), operation));
    if (!screen) continue;
    const id = screenId(screen);
    let view = views.find((item) => item.id === id);
    if (!view) { view = { id, componentes: [] }; views.push(view); }
    const follow = operations.filter((op) => op.tipo === 'transicion' && op.entidad === operation.entidad && op.rf === operation.rf && op.estado_decision !== 'rechazado');
    view.componentes.unshift({ tipo: 'tabla', operacion: operation.nombre, campos: operation.salida, acciones: follow.map((op) => ({ etiqueta: label(op), operacion: op.nombre })) });
  }
  for (const operation of added.filter((op) => op.tipo === 'transicion')) {
    for (const view of views) {
      if (!allowed(view.id, operation)) continue;
      for (const component of view.componentes) {
        const source = byName.get(component.operacion);
        if (!['tabla', 'tarjetas'].includes(component.tipo) || source?.entidad !== operation.entidad || source.tipo !== 'consulta') continue;
        component.acciones = list(component.acciones);
        if (!component.acciones.some((action) => action.operacion === operation.nombre)) component.acciones.push({ etiqueta: label(operation), operacion: operation.nombre });
      }
    }
  }
  repair(views, { operations, byScreen, entities, names, allowed });
  place(views, { operations, screens, screenId, allowed });
  // En una pantalla que es un formulario, el formulario va primero; la lista que lo acompaña, después.
  for (const view of views) {
    if (!/\b(formulario|solicitar|registro de)\b/.test(strip(byScreen.get(view.id)?.nombre || ''))) continue;
    view.componentes = [...view.componentes].sort((a, b) => Number(b.tipo === 'formulario') - Number(a.tipo === 'formulario'));
  }
  return views.filter((view) => view.componentes.length);
}

/**
 * Una pantalla muestra lo que su rol puede ver. La propuesta a veces pone la lista de otro rol (las comandas del cocinero en «Pedidos
 * listos para cobrar») o un alta donde va una lista («Listado de mis reservas»): se reemplaza por la consulta del dato para quien usa la
 * pantalla, filtrada por el estado desde el que actúan sus botones y, si es «lo mío», por la sesión.
 */
function repair(views, { operations, byScreen, entities, names, allowed }) {
  const byName = () => new Map(operations.map((op) => [op.nombre, op]));
  const actorsOfEntity = new Set(operations.flatMap((op) => list(op.actores)));
  const listing = (screen) => /\b(listado|lista|mis|pendientes|listos|por \w+)\b/.test(strip(screen?.nombre || ''));
  for (const view of views) {
    const screen = byScreen.get(view.id);
    const roles = Compatibility.rolesOf(screen);
    if (!roles.length) continue;
    const actors = [...actorsOfEntity].filter((actor) => roles.includes(Compatibility.canonicalRole(actor)));
    const rebuilt = [];
    for (const component of view.componentes) {
      const index = byName();
      const source = index.get(component.operacion);
      if (!source) { rebuilt.push(component); continue; }
      const foreign = !allowed(view.id, source);
      const notAList = ['tabla', 'tarjetas'].includes(component.tipo) && !['consulta', 'resumen'].includes(source.tipo) && listing(screen);
      if (!foreign && !notAList) { rebuilt.push(component); continue; }
      const related = list(component.acciones).map((action) => index.get(action.operacion)).filter((op) => op && allowed(view.id, op));
      // El documento de la lista: el que cobran sus botones o, si no, el dato de la operación original.
      const settle = related.find((op) => op.liquida) || (source.liquida && !foreign ? source : null);
      const entityName = settle?.liquida?.documento.entidad || source.entidad;
      const entity = entities.get(entityName);
      if (!entity || !actors.length || !['tabla', 'tarjetas', 'detalle', 'kpi'].includes(component.tipo)) continue;
      const transitions = operations.filter((op) => op.tipo === 'transicion' && op.entidad === entityName && allowed(view.id, op) && op.estado_decision !== 'rechazado');
      const estado = findField(entity, /^estado$/);
      const wanted = settle?.liquida?.documento.de
        || (/\bpor \w+/.test(strip(screen.nombre)) && transitions.length === 1 && list(transitions[0].transicion?.de).length === 1 ? transitions[0].transicion.de[0] : null);
      const mine = Object.entries(props(entity)).find(([campo, definition]) => {
        const role = roleOfField(campo, definition, actors);
        return role && roles.includes(Compatibility.canonicalRole(role));
      })?.[0];
      const filtros = [
        ...(wanted && estado ? [{ campo: estado, operador: '==', origen: 'constante', valor: wanted }] : []),
        ...(mine ? [{ campo: mine, operador: '==', origen: 'sesion', valor: 'usuario.id' }] : [])
      ];
      // «Lo mío» lo acota además el alcance del rol: una lista sin filtro de sesión del mismo rol sirve igual.
      const signature = (op) => JSON.stringify(list(op.filtros).filter((item) => item.origen === 'constante').map((item) => `${item.campo}${item.operador}${item.valor}`).sort());
      let consulta = operations.find((op) => op.tipo === 'consulta' && op.entidad === entityName && allowed(view.id, op) && !op.exigeParametro && signature(op) === signature({ filtros }));
      if (!consulta) {
        const base = `listar${entityName}${wanted ? pascal(wanted) : mine ? 'Propios' : ''}`;
        consulta = {
          nombre: uniqueName(base, names), rf: (settle || related[0] || source).rf, tipo: 'consulta', entidad: entityName, entidadClave: entity.key, actores: actors,
          filtros, entradas: [], salida: publicFields(entity), descripcion: `Lista de ${entityName} para ${actors.join(' y ')}.`, estado_decision: 'pendiente', origen: 'derivado'
        };
        operations.push(consulta);
      }
      const buttons = [...new Set([...related, ...transitions.filter((op) => !wanted || list(op.transicion?.de).includes(wanted))])]
        .filter((op) => op.tipo === 'transicion' || op.liquida)
        .map((op) => ({ etiqueta: op.liquida ? 'Cobrar' : list(component.acciones).find((action) => action.operacion === op.nombre)?.etiqueta || pascal(op.nombre.replace(/([a-z])([A-Z])/g, '$1 $2')), operacion: op.nombre }));
      rebuilt.push({ tipo: component.tipo === 'tarjetas' ? 'tarjetas' : 'tabla', operacion: consulta.nombre, campos: consulta.salida, acciones: buttons });
    }
    // Un cambio de estado se hace desde la fila: no necesita además un formulario suelto.
    const rowActions = new Set(rebuilt.flatMap((component) => ['tabla', 'tarjetas'].includes(component.tipo) ? list(component.acciones).map((action) => action.operacion) : []));
    view.componentes = rebuilt.filter((component) => !(component.tipo === 'formulario' && byName().get(component.operacion)?.tipo === 'transicion' && rowActions.has(component.operacion)))
      .filter((component, position, all) => all.findIndex((other) => other.tipo === component.tipo && other.operacion === component.operacion) === position);
  }
}

/**
 * Un alta o una lista que ninguna pantalla usa se coloca en la pantalla del árbol que la nombra («Formulario de pedido de mesa»,
 * «Listado de pedidos de mis mesas») y que ve quien la ejecuta: sin pantalla, la función existiría solo en la API.
 */
function place(views, { operations, screens, screenId, allowed }) {
  const words = (value) => strip(String(value || '').replace(/([a-z])([A-Z])/g, '$1 $2')).split(/[^a-z0-9]+/).filter(Boolean).map((word) => word.replace(/(?:es|s)$/, ''));
  const used = () => new Set(views.flatMap((view) => view.componentes.flatMap((component) => [component.operacion, ...list(component.acciones).map((action) => action.operacion)])));
  for (const operation of operations) {
    if (!['crear', 'consulta'].includes(operation.tipo) || operation.estado_decision === 'rechazado' || used().has(operation.nombre)) continue;
    const kind = operation.tipo === 'crear' ? /\b(formulario|registr\w*|nuev[oa]|solicit\w*)\b/ : /\b(listado|lista|consulta|mis)\b/;
    const entityWords = words(operation.entidad);
    const candidates = list(screens).filter((screen) => {
      const name = strip(screen.nombre || screen.slug || '');
      return kind.test(name) && entityWords.every((word) => words(name).includes(word)) && allowed(screenId(screen), operation)
        // Una pantalla de un rol concreto no sirve a otro: «Formulario de pedido» del cliente no es el del mesero.
        && Compatibility.rolesOf(screen).length;
    });
    // La pantalla libre (sin alta o sin lista de ese dato) tiene prioridad.
    const target = candidates.find((screen) => {
      const view = views.find((item) => item.id === screenId(screen));
      return !view || !view.componentes.some((component) => operations.find((item) => item.nombre === component.operacion)?.tipo === operation.tipo);
    });
    if (!target) continue;
    const id = screenId(target);
    let view = views.find((item) => item.id === id);
    if (!view) { view = { id, componentes: [] }; views.push(view); }
    view.componentes.push(operation.tipo === 'crear'
      ? { tipo: 'formulario', operacion: operation.nombre, campos: [...list(operation.entradas)], acciones: [] }
      : { tipo: 'tabla', operacion: operation.nombre, campos: [...list(operation.salida)], acciones: [] });
  }
}

module.exports = { apply, locks, stateButtons, codeSearch, requireCode, wire, roleOfField, balanceEntity, pointsRule, pascal, ACCOUNT, roleId, findField, findValue };
