'use strict';
// Operaciones de negocio con nombre generadas desde la especificación aprobada de la aplicación.
// Se apoyan en el almacén de datos (list/create/update/remove/getRecord): no tocan la base de datos directamente.

const crypto = require('node:crypto');

const definitions = __DEFINITIONS__;

class ActionError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const slugOf = (name) => String(name).replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
const flat = (record) => (record ? { id: record.id, ...record.data } : record);
const pick = (source, fields) => Object.fromEntries(fields.filter((field) => Object.prototype.hasOwnProperty.call(source, field)).map((field) => [field, source[field]]));

const LABEL_KEYS = ['nombre', 'name', 'titulo', 'numero', 'codigo', 'descripcion', 'email', 'correo'];
/** Texto con el que se reconoce un registro: su nombre, número o código; nunca su identificador. */
const labelOf = (row) => {
  for (const key of LABEL_KEYS) if (row[key] !== undefined && row[key] !== null && String(row[key]).trim()) return String(row[key]);
  const first = Object.entries(row).find(([key, value]) => key !== 'id' && !key.endsWith('_id') && typeof value === 'string' && value.trim() && !/^\d{4}-\d{2}-\d{2}/.test(value));
  if (first) return first[1];
  const dated = Object.entries(row).find(([key, value]) => key !== 'id' && typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value));
  return dated ? `#${row.id} · ${String(dated[1]).slice(0, 10)}` : (row.id !== undefined ? `#${row.id}` : null);
};

/** Añade `<campo>__etiqueta` a las filas con una referencia: así la pantalla muestra «Mesa 3» y no un identificador. */
async function withLabels(store, def, rows) {
  const refs = Object.entries(def.refs || {}).filter(([campo]) => !def.output?.length || def.output.includes(campo));
  if (!refs.length || !rows.length) return rows;
  const names = {};
  for (const [campo, capability] of refs) {
    try {
      const listed = await store.list(capability, {}, null);
      names[campo] = new Map((Array.isArray(listed) ? listed : listed?.data || []).map(flat).map((row) => [String(row.id), labelOf(row)]));
    } catch { names[campo] = new Map(); }
  }
  return rows.map((row) => {
    const extra = {};
    for (const [campo] of refs) {
      const label = row[campo] === undefined || row[campo] === null ? null : names[campo].get(String(row[campo]));
      if (label) extra[`${campo}__etiqueta`] = label;
    }
    return { ...row, ...extra };
  });
}

/** Datos del registro relacionado en cada fila (el pedido de una comanda): sus campos, nombres de referencias, platos, y sin lo ya despachado. */
async function relate(store, def, rows) {
  if (!def.relacionadas?.length || !rows.length) return rows;
  const all = async (capability) => { const listed = await store.list(capability, {}, null); return (Array.isArray(listed) ? listed : listed?.data || []).map(flat); };
  let result = rows;
  for (const rel of def.relacionadas) {
    const related = new Map();
    for (const record of await all(rel.capability)) if (!related.has(String(record[rel.via]))) related.set(String(record[rel.via]), record);
    const names = {};
    for (const [campo, capability] of Object.entries(rel.referencias || {})) {
      try { names[campo] = new Map((await all(capability)).map((record) => [String(record.id), labelOf(record)])); } catch { names[campo] = new Map(); }
    }
    let items = null;
    if (rel.items) {
      try {
        const labels = new Map((await all(rel.items.destinoCapability)).map((record) => [String(record.id), labelOf(record)]));
        items = new Map();
        for (const line of await all(rel.items.capability)) {
          const key = String(line[rel.items.fk]);
          items.set(key, [...(items.get(key) || []), `${line[rel.items.cantidad]}× ${labels.get(String(line[rel.items.referencia])) || '?'}`]);
        }
      } catch { items = null; }
    }
    result = result
      .filter((row) => { const record = related.get(String(row.id)); return !(record && rel.estado && (rel.excluir || []).includes(record[rel.estado])); })
      .map((row) => {
        const record = related.get(String(row.id));
        if (!record) return row;
        const extra = {};
        for (const campo of rel.campos) {
          extra[`${rel.clave}_${campo}`] = record[campo];
          const label = names[campo]?.get(String(record[campo]));
          if (label) extra[`${rel.clave}_${campo}__etiqueta`] = label;
        }
        if (items) extra[`${rel.clave}_items`] = (items.get(String(record.id)) || []).join(', ');
        return { ...row, ...extra };
      });
  }
  return result;
}

/** Operación que atiende un método y una ruta (con o sin identificador); null si no existe. */
function find(slug, method, hasId) {
  const direct = definitions.find((item) => slugOf(item.name) === slug && item.method === method && Boolean(item.byId) === Boolean(hasId));
  if (direct) return direct;
  // GET de un alta con líneas: las opciones que se pueden elegir en ellas (los platos disponibles), con el permiso de quien la crea.
  if (method !== 'GET' || hasId) return null;
  const base = definitions.find((item) => slugOf(item.name) === slug && item.lineas && !item.byId);
  if (base) return { name: base.name, type: 'consulta', method: 'GET', byId: false, capability: base.capability, ...(base.permiso ? { permiso: base.permiso } : {}), ...(base.opciones ? { opciones: base.opciones } : {}), requiere: 'POST', fuente: base.lineas.destinoCapability, entity: base.lineas.destinoClave, filters: base.lineas.filtros || [], inputs: [], output: [] };
  // GET de una operación que pide elegir registros: sus opciones, con el mismo permiso que ejecutarla.
  const form = definitions.find((item) => slugOf(item.name) === slug && item.opciones);
  if (!form) return null;
  const needed = { crear: 'POST', actualizar: 'PATCH', transicion: 'PATCH', eliminar: 'DELETE' }[form.type] || 'GET';
  return { name: form.name, type: 'opciones', method: 'GET', byId: false, capability: form.capability, ...(form.permiso ? { permiso: form.permiso } : {}), opciones: form.opciones, requiere: needed, filters: [], inputs: [], output: [] };
}

const money = (value) => Math.round(Number(value) * 100) / 100;
const rowsFrom = (found) => (Array.isArray(found) ? found : found?.data || []).map(flat);
/** Fecha de hoy (o dentro de `days` días) como AAAA-MM-DD en la zona horaria del servidor. */
const localDate = (days = 0) => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};
const empty = (value) => value === undefined || value === null || value === '';

// Un solo servidor: las comprobaciones que dependen de otros registros (cupo, cobro, saldo) se ejecutan de una en una por recurso.
const queues = new Map();
async function withLock(key, task) {
  const previous = queues.get(key) || Promise.resolve();
  let release;
  const current = new Promise((resolve) => { release = resolve; });
  const tail = previous.then(() => current);
  queues.set(key, tail);
  await previous;
  try { return await task(); } finally {
    release();
    if (queues.get(key) === tail) queues.delete(key);
  }
}

/** Opciones que la persona puede elegir en un campo: nunca más datos que el nombre con que se reconoce cada registro. */
async function listOptions(store, def, field, ctx) {
  const spec = def.opciones?.[field];
  if (!spec) throw new ActionError(404, 'El campo no tiene opciones.');
  if (spec.cuentas) {
    const users = await store.listUsers();
    return users.filter((user) => user.activo !== false && (spec.rol ? user.rol === spec.rol : user.rol !== 'administrador'))
      .map((user) => ({ id: String(user.id), etiqueta: user.nombre || user.email }));
  }
  let rows = rowsFrom(await store.list(spec.capability, {}, null));
  // Quien tiene un papel en el registro solo elige los suyos (el mesero, sus mesas).
  const mine = ctx.user && `${ctx.user.rol}_id`;
  if (mine) rows = rows.filter((row) => row[mine] === undefined || String(row[mine]) === String(ctx.user.id));
  if (spec.estado) rows = rows.filter((row) => row[spec.estado.campo] === spec.estado.valor);
  const names = {};
  for (const [campo, capability] of Object.entries(spec.referencias || {})) {
    names[campo] = new Map(rowsFrom(await store.list(capability, {}, null)).map((row) => [String(row.id), labelOf(row)]));
  }
  return rows.map((row) => {
    if (!spec.total) return { id: String(row.id), etiqueta: spec.entidad && /^\d+$/.test(String(labelOf(row))) ? `${spec.entidad} ${labelOf(row)}` : String(labelOf(row)) };
    const extra = Object.keys(spec.referencias || {}).map((campo) => (names[campo]?.get(String(row[campo])) ? `${campo.replace(/_id$/, '')} ${names[campo].get(String(row[campo]))}` : null)).filter(Boolean);
    return { id: String(row.id), etiqueta: [`${spec.entidad} #${row.id}`, ...extra, `USD ${money(row[spec.total]).toFixed(2)}`].join(' · '), total: money(row[spec.total]) };
  });
}

/** Una cuenta elegida para un papel (el mesero de una mesa) debe existir y tener ese rol. */
async function checkRoles(store, def, values) {
  for (const [campo, spec] of Object.entries(def.roles || {})) {
    if (empty(values[campo]) || typeof store.findUserById !== 'function') continue;
    const account = await store.findUserById(values[campo]);
    if (!account || account.activo === false || account.rol !== spec.rol) throw new ActionError(400, `La cuenta elegida no es de un ${spec.nombre.toLowerCase()} activo.`);
  }
}

/** Quién queda en cada campo con nombre de rol: quien ejecuta ese rol, lo que dice el registro relacionado o la cuenta elegida. */
async function fillRoles(store, def, values, body, ctx) {
  for (const item of def.rolInputs || []) {
    if (ctx.user && ctx.user.rol === item.rol) { values[item.campo] = String(ctx.user.id); continue; }
    if (item.heredar) {
      const sourceId = values[item.heredar.via] ?? body[item.heredar.via];
      if (empty(sourceId)) throw new ActionError(400, `Indica ${item.heredar.entidad.toLowerCase()}.`);
      const source = await store.getRecord(item.heredar.capability, sourceId, null);
      if (!source) throw new ActionError(400, `${item.heredar.entidad} inexistente.`);
      const inherited = source.data?.[item.heredar.campo];
      if (empty(inherited)) throw new ActionError(409, `${item.heredar.entidad} no tiene ${item.nombreRol.toLowerCase()} asignado.`);
      values[item.campo] = String(inherited);
      continue;
    }
    // Lo elige la persona (o queda sin dueño); si quien opera es el administrador en una operación de ese rol, queda a su nombre.
    if (!item.elegido && ctx.user) values[item.campo] = String(ctx.user.id);
  }
}

/** Reserva: la mesa completa ocupa todo; cada silla ocupa una plaza, hasta las que tiene la mesa. */
async function checkCapacity(store, def, values) {
  const spec = def.cupo;
  const resource = values[spec.recurso];
  const moment = values[spec.momento];
  if (empty(resource) || empty(moment)) throw new ActionError(400, 'Indica el lugar, la fecha y la hora.');
  const minute = (value) => { const date = new Date(value); return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 16); };
  if (!minute(moment)) throw new ActionError(400, 'La fecha y hora no son válidas.');
  const record = await store.getRecord(spec.capacidad.capability, resource, null);
  if (!record) throw new ActionError(400, `${spec.capacidad.entidad} inexistente.`);
  const taken = rowsFrom(await store.list(def.capability, { [spec.recurso]: resource }, null))
    .filter((row) => minute(row[spec.momento]) === minute(moment) && !/^(anul|cancel|rechaz)/i.test(String(row.estado || '')));
  const name = spec.capacidad.entidad.toLowerCase();
  if (taken.some((row) => row[spec.tipo] === spec.completo)) throw new ActionError(409, `Esa ${name} ya está reservada completa para esa fecha y hora.`);
  if (values[spec.tipo] === spec.completo) {
    if (taken.length) throw new ActionError(409, `Esa ${name} ya tiene reservas para esa fecha y hora: no puede reservarse completa.`);
    return;
  }
  const places = Number(record.data?.[spec.capacidad.campo]) || 0;
  if (taken.length >= places) throw new ActionError(409, `No quedan sillas libres en esa ${name} para esa fecha y hora (${places} en total).`);
}

/** Antes de cobrar: el documento está listo y sin cobro; el monto es su total; el saldo prepagado alcanza. */
async function prepareSettlement(store, def, values) {
  const spec = def.liquida;
  const doc = spec.documento;
  const name = doc.entidad.toLowerCase();
  Object.assign(values, spec.fijo || {});
  const id = values[doc.campo];
  if (empty(id)) throw new ActionError(400, `Elige el ${name} que se cobra.`);
  const record = await store.getRecord(doc.capability, id, null);
  if (!record) throw new ActionError(404, `${doc.entidad} inexistente.`);
  const state = record.data?.[doc.estado];
  const paid = rowsFrom(await store.list(def.capability, { [doc.campo]: id }, null));
  if (state === doc.a || paid.length) throw new ActionError(409, `Ese ${name} ya fue cobrado: se cobra una sola vez.`);
  if (state !== doc.de) throw new ActionError(409, `Solo se cobra un ${name} en estado ${doc.de} (está ${state || 'sin estado'}).`);
  const total = money(record.data?.[doc.total]);
  if (!(total > 0)) throw new ActionError(409, `El ${name} no tiene un total que cobrar.`);
  values[spec.monto] = total;
  if (spec.metodo && empty(values[spec.metodo])) throw new ActionError(400, 'Indica el método de pago.');
  const holder = doc.cliente ? record.data?.[doc.cliente] : null;
  let balance = null;
  if (spec.saldo && values[spec.metodo] === spec.saldo.valor) {
    const rule = spec.saldo;
    if (empty(holder)) throw new ActionError(409, `El ${name} no tiene un cliente: no puede pagarse con saldo prepagado.`);
    const today = localDate();
    const active = rowsFrom(await store.list(rule.capability, { [rule.titular]: holder }, null)).filter((row) => row[rule.estado] === rule.activo);
    if (!active.length) throw new ActionError(409, 'El cliente no tiene un paquete prepagado activo.');
    const current = active.filter((row) => String(row[rule.inicio]).slice(0, 10) <= today && today <= String(row[rule.fin]).slice(0, 10));
    if (!current.length) throw new ActionError(409, 'El paquete prepagado del cliente no está vigente.');
    balance = current.find((row) => money(row[rule.campo]) >= total);
    if (!balance) throw new ActionError(409, `Saldo insuficiente: quedan USD ${Math.max(...current.map((row) => money(row[rule.campo]))).toFixed(2)} y se necesitan USD ${total.toFixed(2)}.`);
  }
  return { id, total, holder, balance };
}

/** Después de cobrar: el documento queda pagado, el saldo baja en lo cobrado y el cliente suma sus puntos. */
async function applySettlement(store, def, plan) {
  const spec = def.liquida;
  await store.update(spec.documento.capability, plan.id, { [spec.documento.estado]: spec.documento.a }, null);
  if (plan.balance) await store.update(spec.saldo.capability, plan.balance.id, { [spec.saldo.campo]: money(money(plan.balance[spec.saldo.campo]) - plan.total) }, null);
  const points = spec.puntos;
  if (!points || empty(plan.holder)) return;
  const lines = points.lineas;
  let units = 0;
  for (const line of rowsFrom(await store.list(lines.capability, { [lines.fk]: plan.id }, null))) {
    const item = await store.getRecord(lines.destinoCapability, line[lines.referencia], null);
    if (item?.data?.[lines.campo] === lines.valor) units += Number(line[lines.cantidad]) || 0;
  }
  if (!units) return;
  await withLock(`puntos:${points.capability}:${plan.holder}`, async () => {
    const [account] = rowsFrom(await store.list(points.capability, { [points.titular]: plan.holder }, null));
    const earned = units * points.porUnidad;
    if (account) await store.update(points.capability, account.id, { [points.campo]: (Number(account[points.campo]) || 0) + earned }, null);
    else await store.create(points.capability, { [points.titular]: String(plan.holder), [points.campo]: earned }, null);
  });
}

/** Añade a cada documento lo que contiene («2× Lomo saltado, 1× Jugo»). */
async function withDetail(store, def, rows) {
  const spec = def.detalle;
  if (!spec || !rows.length) return rows;
  const names = new Map(rowsFrom(await store.list(spec.destinoCapability, {}, null)).map((row) => [String(row.id), labelOf(row)]));
  const lines = new Map();
  for (const line of rowsFrom(await store.list(spec.capability, {}, null))) {
    const key = String(line[spec.fk]);
    lines.set(key, [...(lines.get(key) || []), `${line[spec.cantidad]}× ${names.get(String(line[spec.referencia])) || '?'}`]);
  }
  return rows.map((row) => ({ ...row, [spec.campo]: (lines.get(String(row.id)) || []).join(', ') }));
}

/** Valor de un filtro que depende de la sesión; null si la persona no tiene un registro asociado en la entidad referida. */
async function sessionValue(store, user, filter) {
  if (!user) throw new ActionError(401, 'Esta operación requiere iniciar sesión.');
  if (filter.valor === 'usuario.email') return user.email;
  if (filter.valor === 'usuario.rol') return user.rol;
  if (filter.via) {
    // El campo apunta a un registro de datos (p. ej. un empleado) que se reconoce por su correo, no por la cuenta de acceso.
    const rows = await store.list(filter.via.capability, { [filter.via.campo]: user.email }, null);
    const list = Array.isArray(rows) ? rows : rows?.data || [];
    return list.length ? String(list[0].id) : null;
  }
  return String(user.id);
}

function compare(left, operator, right) {
  const numeric = left !== '' && right !== '' && !Number.isNaN(Number(left)) && !Number.isNaN(Number(right));
  const a = numeric ? Number(left) : String(left);
  const b = numeric ? Number(right) : String(right);
  switch (operator) {
    case '==': return a === b;
    case '!=': return a !== b;
    case '>': return a > b;
    case '>=': return a >= b;
    case '<': return a < b;
    case '<=': return a <= b;
    default: return false;
  }
}

async function resolveFilters(store, def, ctx) {
  const resolved = [];
  for (const filter of def.filters || []) {
    let value;
    // «Mis ventas» para el administrador: no es vendedor y tiene acceso completo, así que ve todas (el vendedor sigue viendo las suyas).
    if (filter.origen === 'sesion' && filter.valor === 'usuario.id' && def.type === 'consulta' && ctx.user && ctx.user.rol === 'administrador') continue;
    if (filter.origen === 'sesion') value = await sessionValue(store, ctx.user, filter);
    else if (filter.origen === 'parametro') value = ctx.query?.[filter.valor];
    else value = filter.valor;
    // Un filtro de parámetro sin valor no restringe; uno de sesión sin registro asociado no devuelve nada.
    if (filter.origen === 'parametro' && (value === undefined || value === '')) continue;
    resolved.push({ campo: filter.campo, operador: filter.operador || '==', value, empty: value === null || value === undefined, ...(filter.en ? { en: filter.en } : {}) });
  }
  return resolved;
}

/** Valor que el servidor pone en un campo que la persona no escribe: la fecha del registro, el estado inicial o un código generado. */
function autoValue(input) {
  if (input.valor === 'hoy') return localDate();
  if (input.valor === 'inicial') return (input.opciones || [])[0] ?? null;
  if (input.valor === 'cero' || input.valor === 'lineas') return 0;
  if (input.valor === 'generado') return crypto.randomBytes(5).toString('hex').toUpperCase();
  return new Date().toISOString();
}

/** Valida las líneas del cuerpo (plato y cantidad), toma el precio del plato y calcula el subtotal de cada una. */
async function prepareLines(store, def, body) {
  const spec = def.lineas;
  const received = Array.isArray(body.lineas) ? body.lineas : [];
  if (!received.length) throw new ActionError(400, 'Agrega al menos una línea.');
  if (received.length > 100) throw new ActionError(400, 'Demasiadas líneas.');
  const prepared = [];
  for (const [index, line] of received.entries()) {
    const quantity = Number(line?.[spec.cantidad]);
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 1000) throw new ActionError(400, `Línea ${index + 1}: la cantidad debe ser un entero entre 1 y 1000.`);
    const reference = line?.[spec.referencia];
    if (reference === undefined || reference === null || reference === '') throw new ActionError(400, `Línea ${index + 1}: elige ${spec.destino}.`);
    const record = await store.getRecord(spec.destinoCapability, reference, null);
    if (!record) throw new ActionError(400, `Línea ${index + 1}: ${spec.destino} inexistente.`);
    if (record.data?.disponible === false) throw new ActionError(409, `Línea ${index + 1}: ${labelOf(record.data) || spec.destino} no está disponible.`);
    // Un producto desactivado no se vende.
    if (spec.activo && record.data?.[spec.activo.campo] !== undefined && record.data[spec.activo.campo] !== spec.activo.valor) {
      const reason = /disponib/i.test(spec.activo.campo) ? 'está agotado y no se puede pedir' : 'está desactivado y no se puede vender';
      throw new ActionError(409, `Línea ${index + 1}: ${labelOf(record.data) || spec.destino} ${reason}.`);
    }
    // No se vende más de lo que hay: suma las líneas del mismo producto antes de comparar con su stock.
    if (spec.stock) {
      const available = Number(record.data?.[spec.stock]);
      const requested = received.slice(0, index + 1).filter((item) => String(item?.[spec.referencia]) === String(reference))
        .reduce((sum, item) => sum + (Number(item?.[spec.cantidad]) || 0), 0);
      if (Number.isFinite(available) && requested > available) {
        throw new ActionError(409, `Línea ${index + 1}: stock insuficiente de ${labelOf(record.data) || spec.destino} (disponible ${available}, pedido ${requested}).`);
      }
    }
    const price = spec.precio ? Number(record.data?.[spec.precio.desde]) : 0;
    const values = { [spec.referencia]: reference, [spec.cantidad]: quantity, ...(spec.precio ? { [spec.precio.campo]: Number.isFinite(price) ? price : 0 } : {}) };
    prepared.push({ values, subtotal: (Number.isFinite(price) ? price : 0) * quantity });
  }
  return prepared;
}

/** Suma `delta` (negativo al vender, positivo al anular) al stock de cada producto de las líneas. */
async function adjustStock(store, spec, lines, sign) {
  const totals = new Map();
  for (const line of lines) {
    const reference = String(line[spec.referencia]);
    totals.set(reference, (totals.get(reference) || 0) + (Number(line[spec.cantidad]) || 0));
  }
  for (const [reference, quantity] of totals) {
    const record = await store.getRecord(spec.destinoCapability, reference, null);
    if (!record) continue;
    const current = Number(record.data?.[spec.stock]) || 0;
    await store.update(spec.destinoCapability, reference, { [spec.stock]: current + sign * quantity }, null);
  }
}

/** Gestión de usuarios: son cuentas de acceso (contraseña cifrada y rol válido), con los nombres de campo del modelo. */
async function runAccount(def, ctx, body) {
  const fields = def.cuenta;
  const accounts = ctx.accounts;
  if (!accounts) throw new ActionError(503, 'La gestión de cuentas no está disponible.');
  const record = (user) => ({
    id: String(user.id), ...(fields.nombre ? { [fields.nombre]: user.nombre } : {}), [fields.email]: user.email, ...(fields.rol ? { [fields.rol]: user.rol } : {}), activo: user.activo !== false
  });
  const input = () => {
    const values = {};
    const has = (key) => key && !empty(body[key]);
    if (has(fields.email)) values.email = body[fields.email];
    if (has(fields.password)) values.password = body[fields.password];
    if (has(fields.nombre)) values.nombre = body[fields.nombre];
    // El modelo puede listar los roles en mayúsculas (CAJERO): las cuentas los guardan en minúsculas.
    if (has(fields.rol)) values.rol = String(body[fields.rol]).toLowerCase();
    if (typeof body.activo === 'boolean') values.activo = body.activo;
    return values;
  };
  if (def.type === 'consulta') return (await accounts.list()).map(record);
  if (def.type === 'crear') return record(await accounts.create(input()));
  if (def.type === 'actualizar') {
    const values = input();
    if (!Object.keys(values).length) throw new ActionError(400, 'No hay cambios que guardar.');
    const updated = await accounts.update(ctx.id, values);
    if (!updated) throw new ActionError(404, 'Registro inexistente');
    return record(updated);
  }
  throw new ActionError(405, 'Las cuentas se desactivan, no se eliminan desde esta operación.');
}

/** Clave del recurso que no pueden tocar dos peticiones a la vez. */
function lockKey(def, body, ctx) {
  if (def.liquida) return `cobro:${def.liquida.documento.capability}:${body[def.liquida.documento.campo]}:${def.liquida.saldo ? def.liquida.saldo.capability : ''}`;
  if (def.cupo) return `cupo:${def.capability}:${body[def.cupo.recurso]}`;
  if (def.type === 'transicion') return `estado:${def.capability}:${ctx.id}`;
  return null;
}

async function run(store, def, ctx = {}) {
  const body = ctx.body && typeof ctx.body === 'object' && !Array.isArray(ctx.body) ? ctx.body : {};
  if (def.method === 'GET' && ctx.query?.opciones) return listOptions(store, def, ctx.query.opciones, ctx);
  if (def.cuenta) return runAccount(def, ctx, body);
  // El saldo de un mismo cliente puede pagar dos pedidos a la vez: los cobros se atienden de uno en uno.
  const key = def.liquida?.saldo ? `cobro:${def.liquida.saldo.capability}` : lockKey(def, body, ctx);
  return key ? withLock(key, () => execute(store, def, ctx, body)) : execute(store, def, ctx, body);
}

async function execute(store, def, ctx, body) {
  switch (def.type) {
    case 'opciones':
      throw new ActionError(400, 'Indica el campo del que quieres las opciones.');
    case 'consulta': {
      // Una búsqueda por código no lista todo mientras no se escriba el código.
      if (def.exigeParametro && (def.filters || []).filter((filter) => filter.origen === 'parametro').every((filter) => empty(ctx.query?.[filter.valor]))) return [];
      const filters = await resolveFilters(store, def, ctx);
      if (filters.some((filter) => filter.empty)) return [];
      const equality = Object.fromEntries(filters.filter((filter) => filter.operador === '==').map((filter) => [filter.campo, filter.value]));
      const rows = await store.list(def.fuente || def.capability, equality, def.fuente ? null : ctx.scope || null);
      const list = (Array.isArray(rows) ? rows : rows?.data || []).map(flat);
      const rest = filters.filter((filter) => filter.operador !== '==');
      const kept = rest.length ? list.filter((row) => rest.every((filter) => row[filter.campo] !== undefined && compare(row[filter.campo], filter.operador, filter.value))) : list;
      const related = await relate(store, def, kept);
      const labelsOf = (row) => Object.fromEntries(Object.entries(row).filter(([key]) => key.endsWith('__etiqueta') && (def.output || []).includes(key.slice(0, -'__etiqueta'.length))));
      const visible = def.output?.length ? related.map((row) => ({ id: row.id, ...pick(row, def.output), ...labelsOf(row) })) : related;
      return withDetail(store, def, await withLabels(store, def, visible));
    }
    case 'crear': {
      const values = pick(body, def.inputs || []);
      if (!Object.keys(values).length && (def.inputs || []).length) throw new ActionError(400, `Envía al menos uno de: ${(def.inputs || []).join(', ')}.`);
      // Lo que completa el servidor no se toma de la petición: quien crea es la sesión y la marca de tiempo es la del registro.
      for (const input of def.sessionInputs || []) values[input.campo] = await sessionValue(store, ctx.user, input);
      await checkRoles(store, def, values);
      await fillRoles(store, def, values, body, ctx);
      // Emitir para un registro existente (la factura de una venta): debe existir y no tener ya uno vinculado.
      let linked = null;
      if (def.vincula) {
        const ownerId = body[def.vincula.parametro];
        if (ownerId === undefined || ownerId === null || ownerId === '') throw new ActionError(400, `Indica ${def.vincula.parametro}.`);
        linked = await store.getRecord(def.vincula.capability, ownerId, ctx.scope || null);
        if (!linked) throw new ActionError(404, `${def.vincula.entidad} inexistente.`);
        if (linked.data?.[def.vincula.campo]) throw new ActionError(409, `${def.vincula.entidad} ya tiene su ${def.entity || 'documento'}: solo se emite uno.`);
        if (/^anulad/i.test(String(linked.data?.estado || ''))) throw new ActionError(409, `${def.vincula.entidad} está anulada.`);
      }
      for (const input of def.autoInputs || []) {
        if (input.valor === 'correlativo') {
          // F001-00001, F001-00002…: el siguiente número de la serie según los ya emitidos.
          const rows = await store.list(def.capability, {}, null);
          const used = (Array.isArray(rows) ? rows : rows?.data || []).map(flat).map((row) => String(row[input.campo] || ''))
            .filter((value) => value.startsWith(input.prefijo || '')).map((value) => Number(value.slice((input.prefijo || '').length)) || 0);
          values[input.campo] = `${input.prefijo || ''}${String((used.length ? Math.max(...used) : 0) + 1).padStart(input.digitos || 5, '0')}`;
        } else if (input.valor === 'vinculado') {
          values[input.campo] = Number(linked?.data?.[input.desde]) || 0;
        } else values[input.campo] = autoValue(input);
      }
      if (def.periodo) {
        // Un saldo prepagado nace hoy, vence a los días acordados y sin saldo hasta que se pague.
        if (def.periodo.positivo && !(Number(values[def.periodo.positivo]) > 0)) throw new ActionError(400, 'El monto debe ser mayor que cero.');
        Object.assign(values, { [def.periodo.inicio]: localDate(), [def.periodo.fin]: localDate(def.periodo.dias), [def.periodo.saldo]: 0 });
      }
      if (def.cupo) await checkCapacity(store, def, values);
      const settlement = def.liquida ? await prepareSettlement(store, def, values) : null;
      const lines = def.lineas ? await prepareLines(store, def, body) : [];
      if (def.lineas?.total && lines.length) values[def.lineas.total] = Math.round(lines.reduce((sum, line) => sum + line.subtotal, 0) * 100) / 100;
      const created = await store.create(def.capability, values, ctx.scope || null);
      try {
        for (const line of lines) await store.create(def.lineas.capability, { ...line.values, [def.lineas.fk]: created.id }, ctx.scope || null);
      } catch (error) {
        // Sin todas sus líneas el pedido no queda a medias.
        try { await store.remove(def.capability, created.id, ctx.scope || null); } catch { /* se informa el fallo original */ }
        throw error;
      }
      if (settlement) await applySettlement(store, def, settlement);
      // Al registrar la venta, el stock de cada producto baja automáticamente.
      if (def.lineas?.stock && lines.length) await adjustStock(store, def.lineas, lines.map((line) => line.values), -1);
      if (linked) await store.update(def.vincula.capability, linked.id, { [def.vincula.campo]: created.id, ...(def.anula ? { [def.anula.estado]: def.anula.valor } : {}) }, ctx.scope || null);
      if (linked && def.anula) {
        // Anular devuelve al producto el stock de cada línea y deja anulados los documentos de la venta (su factura).
        if (def.anula.reponer?.stock) {
          const found = await store.list(def.anula.reponer.capability, { [def.anula.reponer.fk]: linked.id }, null);
          await adjustStock(store, def.anula.reponer, (Array.isArray(found) ? found : found?.data || []).map(flat), +1);
        }
        for (const doc of def.anula.documentos || []) {
          const docId = linked.data?.[doc.campo];
          if (docId) await store.update(doc.capability, docId, { [doc.estado]: doc.valor }, null);
        }
      }
      return { ...flat(created), ...(lines.length ? { lineas: lines.length } : {}) };
    }
    case 'actualizar': {
      const values = pick(body, def.inputs || []);
      if (!Object.keys(values).length) throw new ActionError(400, `Envía al menos uno de: ${(def.inputs || []).join(', ')}.`);
      await checkRoles(store, def, values);
      const updated = await store.update(def.capability, ctx.id, values, ctx.scope || null);
      if (!updated) throw new ActionError(404, 'Registro inexistente');
      return flat(updated);
    }
    case 'resumen': {
      // Reporte: filtra (rango de fechas, también sobre la cabecera), quita lo anulado, agrupa y calcula las medidas.
      const spec = def.resumen || {};
      const filters = await resolveFilters(store, def, ctx);
      const rowsOf = (found) => (Array.isArray(found) ? found : found?.data || []).map(flat);
      const base = rowsOf(await store.list(def.capability, {}, ctx.scope || null));
      const headers = spec.via?.capability ? new Map(rowsOf(await store.list(spec.via.capability, {}, null)).map((row) => [String(row.id), row])) : null;
      const sourceOf = (row, where) => (where === 'via' && headers ? headers.get(String(row[spec.via.campo])) || {} : row);
      // «hasta 2026-11-21» incluye todo ese día aunque la fecha guardada tenga hora.
      const bound = (filter) => (filter.operador === '<=' && /^\d{4}-\d{2}-\d{2}$/.test(String(filter.value)) ? `${filter.value}T23:59:59.999Z` : filter.value);
      const excluded = spec.excluir ? new RegExp(spec.excluir.patron || '^(anul|cancel)', 'i') : null;
      const kept = base.filter((row) => filters.every((filter) => {
        const value = sourceOf(row, filter.en)[filter.campo];
        return value !== undefined && value !== null && compare(value, filter.operador, bound(filter));
      }) && !(excluded && excluded.test(String(sourceOf(row, spec.excluir.en)[spec.excluir.campo] ?? ''))));
      const groups = new Map();
      for (const row of kept) {
        const key = spec.agruparPor ? String(row[spec.agruparPor] ?? '') : 'total';
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(row);
      }
      if (!spec.agruparPor && !groups.size) groups.set('total', []);
      const round = (value) => Math.round(value * 100) / 100;
      const result = [];
      for (const [key, rows] of groups) {
        const out = { id: key };
        if (spec.agruparPor) {
          out[spec.agruparPor] = key;
          const record = spec.agrupadoCapability ? await store.getRecord(spec.agrupadoCapability, key, null) : null;
          if (record) out[`${spec.agruparPor}__etiqueta`] = labelOf(record.data) || key;
        }
        for (const medida of spec.medidas || []) {
          const values = rows.map((row) => Number(row[medida.campo])).filter(Number.isFinite);
          const sum = values.reduce((total, value) => total + value, 0);
          out[medida.nombre] = medida.funcion === 'contar' ? rows.length : medida.funcion === 'promedio' ? (values.length ? round(sum / values.length) : 0) : round(sum);
        }
        result.push(out);
      }
      const first = spec.medidas?.[0]?.nombre;
      if (spec.agruparPor && first) result.sort((a, b) => (spec.orden === 'asc' ? a[first] - b[first] : b[first] - a[first]));
      return spec.limite ? result.slice(0, spec.limite) : result;
    }
    case 'eliminar': {
      const removed = await store.remove(def.capability, ctx.id, ctx.scope || null);
      if (!removed) throw new ActionError(404, 'Registro inexistente');
      return { deleted: true, id: ctx.id };
    }
    case 'transicion': {
      // «Marcar lista» una comanda: el estado es del pedido que la referencia; el identificador de la ruta es el de la comanda.
      let targetId = ctx.id;
      if (def.sobre) {
        const found = await store.list(def.capability, { [def.sobre.via]: ctx.id }, ctx.scope || null);
        const rows = (Array.isArray(found) ? found : found?.data || []).map(flat);
        if (!rows.length) throw new ActionError(404, 'Registro inexistente');
        targetId = rows[0].id;
      }
      const current = await store.getRecord(def.capability, targetId, ctx.scope || null);
      if (!current) throw new ActionError(404, 'Registro inexistente');
      const { campo, de = [], a } = def.transition;
      const actual = current.data?.[campo];
      if (de.length && !de.includes(actual)) throw new ActionError(409, `No se puede pasar de «${actual ?? 'sin valor'}» a «${a}»: el estado debe ser ${de.join(' o ')}.`);
      if (actual === a) throw new ActionError(409, `El registro ya está «${a}».`);
      const changes = { [campo]: a };
      // Datos que la transición pide (lo pagado al activar un paquete) y los que se derivan de ellos (su saldo).
      for (const required of def.alCambiar?.exigir || []) {
        if (empty(body[required]) || !(Number(body[required]) > 0)) throw new ActionError(400, `Indica ${required} (un número mayor que cero).`);
        changes[required] = money(body[required]);
      }
      for (const [target, source] of Object.entries(def.alCambiar?.copiar || {})) changes[target] = changes[source];
      const updated = flat(await store.update(def.capability, targetId, changes, ctx.scope || null));
      // Anular una venta devuelve al producto el stock que descontaron sus líneas.
      if (def.reponer?.stock) {
        const found = await store.list(def.reponer.capability, { [def.reponer.fk]: targetId }, null);
        const lines = (Array.isArray(found) ? found : found?.data || []).map(flat);
        await adjustStock(store, def.reponer, lines, +1);
      }
      // Anular un documento vinculado (la factura de una venta): su cabecera también queda anulada y devuelve el stock de sus líneas.
      if (def.cascada) {
        const found = await store.list(def.cascada.capability, { [def.cascada.campo]: targetId }, null);
        for (const owner of (Array.isArray(found) ? found : found?.data || []).map(flat)) {
          if (owner[def.cascada.estado] === def.cascada.valor) continue;
          await store.update(def.cascada.capability, owner.id, { [def.cascada.estado]: def.cascada.valor }, null);
          if (def.cascada.reponer?.stock) {
            const listed = await store.list(def.cascada.reponer.capability, { [def.cascada.reponer.fk]: owner.id }, null);
            await adjustStock(store, def.cascada.reponer, (Array.isArray(listed) ? listed : listed?.data || []).map(flat), +1);
          }
        }
      }
      return updated;
    }
    default:
      throw new ActionError(500, 'Tipo de operación no soportado.');
  }
}

module.exports = { definitions, find, run, slugOf, ActionError };
