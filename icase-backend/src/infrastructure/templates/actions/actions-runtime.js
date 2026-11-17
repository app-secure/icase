'use strict';
// Operaciones de negocio con nombre generadas desde la especificación aprobada de la aplicación.
// Se apoyan en el almacén de datos (list/create/update/remove/getRecord): no tocan la base de datos directamente.

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

/** Operación que atiende un método y una ruta (con o sin identificador); null si no existe. */
function find(slug, method, hasId) {
  return definitions.find((item) => slugOf(item.name) === slug && item.method === method && Boolean(item.byId) === Boolean(hasId)) || null;
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
    if (filter.origen === 'sesion') value = await sessionValue(store, ctx.user, filter);
    else if (filter.origen === 'parametro') value = ctx.query?.[filter.valor];
    else value = filter.valor;
    // Un filtro de parámetro sin valor no restringe; uno de sesión sin registro asociado no devuelve nada.
    if (filter.origen === 'parametro' && (value === undefined || value === '')) continue;
    resolved.push({ campo: filter.campo, operador: filter.operador || '==', value, empty: value === null || value === undefined });
  }
  return resolved;
}

async function run(store, def, ctx = {}) {
  const body = ctx.body && typeof ctx.body === 'object' && !Array.isArray(ctx.body) ? ctx.body : {};
  switch (def.type) {
    case 'consulta': {
      const filters = await resolveFilters(store, def, ctx);
      if (filters.some((filter) => filter.empty)) return [];
      const equality = Object.fromEntries(filters.filter((filter) => filter.operador === '==').map((filter) => [filter.campo, filter.value]));
      const rows = await store.list(def.capability, equality, ctx.scope || null);
      const list = (Array.isArray(rows) ? rows : rows?.data || []).map(flat);
      const rest = filters.filter((filter) => filter.operador !== '==');
      const kept = rest.length ? list.filter((row) => rest.every((filter) => row[filter.campo] !== undefined && compare(row[filter.campo], filter.operador, filter.value))) : list;
      return def.output?.length ? kept.map((row) => ({ id: row.id, ...pick(row, def.output) })) : kept;
    }
    case 'crear': {
      const values = pick(body, def.inputs || []);
      if (!Object.keys(values).length) throw new ActionError(400, `Envía al menos uno de: ${(def.inputs || []).join(', ')}.`);
      return flat(await store.create(def.capability, values, ctx.scope || null));
    }
    case 'actualizar': {
      const values = pick(body, def.inputs || []);
      if (!Object.keys(values).length) throw new ActionError(400, `Envía al menos uno de: ${(def.inputs || []).join(', ')}.`);
      const updated = await store.update(def.capability, ctx.id, values, ctx.scope || null);
      if (!updated) throw new ActionError(404, 'Registro inexistente');
      return flat(updated);
    }
    case 'eliminar': {
      const removed = await store.remove(def.capability, ctx.id, ctx.scope || null);
      if (!removed) throw new ActionError(404, 'Registro inexistente');
      return { deleted: true, id: ctx.id };
    }
    case 'transicion': {
      const current = await store.getRecord(def.capability, ctx.id, ctx.scope || null);
      if (!current) throw new ActionError(404, 'Registro inexistente');
      const { campo, de = [], a } = def.transition;
      const actual = current.data?.[campo];
      if (de.length && !de.includes(actual)) throw new ActionError(409, `No se puede pasar de «${actual ?? 'sin valor'}» a «${a}»: el estado debe ser ${de.join(' o ')}.`);
      return flat(await store.update(def.capability, ctx.id, { [campo]: a }, ctx.scope || null));
    }
    default:
      throw new ActionError(500, 'Tipo de operación no soportado.');
  }
}

module.exports = { definitions, find, run, slugOf, ActionError };
