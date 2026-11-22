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
  const base = method === 'GET' && !hasId ? definitions.find((item) => slugOf(item.name) === slug && item.lineas && !item.byId) : null;
  return base ? { name: base.name, type: 'consulta', method: 'GET', byId: false, capability: base.capability, fuente: base.lineas.destinoCapability, entity: base.lineas.destinoClave, filters: base.lineas.filtros || [], inputs: [], output: [] } : null;
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
  if (input.valor === 'hoy') return new Date().toISOString().slice(0, 10);
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
      throw new ActionError(409, `Línea ${index + 1}: ${labelOf(record.data) || spec.destino} está desactivado y no se puede vender.`);
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

async function run(store, def, ctx = {}) {
  const body = ctx.body && typeof ctx.body === 'object' && !Array.isArray(ctx.body) ? ctx.body : {};
  switch (def.type) {
    case 'consulta': {
      const filters = await resolveFilters(store, def, ctx);
      if (filters.some((filter) => filter.empty)) return [];
      const equality = Object.fromEntries(filters.filter((filter) => filter.operador === '==').map((filter) => [filter.campo, filter.value]));
      const rows = await store.list(def.fuente || def.capability, equality, def.fuente ? null : ctx.scope || null);
      const list = (Array.isArray(rows) ? rows : rows?.data || []).map(flat);
      const rest = filters.filter((filter) => filter.operador !== '==');
      const kept = rest.length ? list.filter((row) => rest.every((filter) => row[filter.campo] !== undefined && compare(row[filter.campo], filter.operador, filter.value))) : list;
      const related = await relate(store, def, kept);
      const labelsOf = (row) => Object.fromEntries(Object.entries(row).filter(([key]) => key.endsWith('__etiqueta') && (def.output || []).includes(key.slice(0, -'__etiqueta'.length))));
      return withLabels(store, def, def.output?.length ? related.map((row) => ({ id: row.id, ...pick(row, def.output), ...labelsOf(row) })) : related);
    }
    case 'crear': {
      const values = pick(body, def.inputs || []);
      if (!Object.keys(values).length && (def.inputs || []).length) throw new ActionError(400, `Envía al menos uno de: ${(def.inputs || []).join(', ')}.`);
      // Lo que completa el servidor no se toma de la petición: quien crea es la sesión y la marca de tiempo es la del registro.
      for (const input of def.sessionInputs || []) values[input.campo] = await sessionValue(store, ctx.user, input);
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
      const updated = flat(await store.update(def.capability, targetId, { [campo]: a }, ctx.scope || null));
      // Anular una venta devuelve al producto el stock que descontaron sus líneas.
      if (def.reponer?.stock) {
        const found = await store.list(def.reponer.capability, { [def.reponer.fk]: targetId }, null);
        const lines = (Array.isArray(found) ? found : found?.data || []).map(flat);
        await adjustStock(store, def.reponer, lines, +1);
      }
      return updated;
    }
    default:
      throw new ActionError(500, 'Tipo de operación no soportado.');
  }
}

module.exports = { definitions, find, run, slugOf, ActionError };
