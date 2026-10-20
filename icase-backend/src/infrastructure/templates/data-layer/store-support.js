// Utilidades compartidas por todas las variantes del almacén generado.
// No nombrar motores de base de datos aquí: ArtifactVerificationService infiere el motor buscando su nombre en todo el backend.
// Describe tipos y estructura; las reglas de negocio no viven aquí.

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const RESERVED = new Set(['id', 'created_at', 'updated_at']);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function tableFor(model, operation) {
  const name = Object.prototype.hasOwnProperty.call(model.operations, operation) ? model.operations[operation] : null;
  if (!name) throw new HttpError(404, 'Operación inexistente');
  return { name, table: model.tables[name] };
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** Valida y normaliza un valor según el tipo físico de la columna. Lanza 400 si no corresponde. */
function coerce(column, value, { idKind = 'numeric' } = {}) {
  if (value === null) return null;
  const fail = (expected) => { throw new HttpError(400, `El campo "${column.name}" debe ser ${expected}.`); };
  switch (column.type) {
    case 'string':
      if (typeof value !== 'string') fail('texto');
      return value;
    case 'integer': {
      const number = typeof value === 'string' && /^-?\d+$/.test(value) ? Number(value) : value;
      if (!Number.isSafeInteger(number)) fail('un entero');
      return number;
    }
    case 'number': {
      const number = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
      if (typeof number !== 'number' || !Number.isFinite(number)) fail('un número');
      return number;
    }
    case 'boolean':
      if (value === 'true') return true;
      if (value === 'false') return false;
      if (typeof value !== 'boolean') fail('verdadero o falso');
      return value;
    case 'datetime': {
      const date = value instanceof Date ? value : typeof value === 'string' ? new Date(value) : null;
      if (!date || Number.isNaN(date.getTime())) fail('una fecha y hora ISO 8601');
      return date;
    }
    case 'date':
      if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(value))) fail('una fecha AAAA-MM-DD');
      return value;
    case 'time':
      if (typeof value !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/.test(value)) fail('una hora HH:MM[:SS]');
      return value;
    case 'uuid':
      if (typeof value !== 'string' || !UUID.test(value)) fail('un UUID');
      return value;
    case 'json':
      if (!Array.isArray(value)) fail('una lista');
      return value;
    case 'id': {
      const text = typeof value === 'number' ? String(value) : value;
      const valid = idKind === 'objectid' ? /^[a-f0-9]{24}$/i.test(text) : /^\d{1,18}$/.test(text);
      if (typeof text !== 'string' || !valid) fail('un identificador válido');
      return text;
    }
    default:
      return value;
  }
}

/** Separa el cuerpo en valores de columnas conocidas y campos adicionales. */
function split(table, body, options) {
  if (!isObject(body)) throw new HttpError(400, 'El cuerpo debe ser un objeto');
  const columns = new Map(table.columns.map((column) => [column.name, column]));
  const values = {};
  const extra = {};
  for (const [key, value] of Object.entries(body)) {
    if (RESERVED.has(key) && !columns.has(key)) continue; // gestionados por el sistema
    const column = columns.get(key);
    if (column) values[column.column] = coerce(column, value, options);
    else extra[key] = value;
  }
  return { values, extra };
}

/** Datos por nombre de campo (columnas conocidas + adicionales) tal como los verá el motor de reglas. */
function viewOf(table, values, extra) {
  const view = { ...extra };
  for (const column of table.columns) if (Object.prototype.hasOwnProperty.call(values, column.column)) view[column.name] = values[column.column];
  return view;
}

function fromStorage(column, value) {
  switch (column.type) {
    case 'integer': case 'number': return Number(value);
    case 'boolean': return Boolean(value);
    case 'datetime': return new Date(value).toISOString();
    case 'date': return value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10);
    case 'json': return typeof value === 'string' ? JSON.parse(value) : value;
    case 'id': return String(value);
    default: return value;
  }
}

/** Convierte una fila/documento en el registro público: { id, capability, data, created_at, updated_at }. */
function toRecord(table, operation, row) {
  const extra = typeof row.extra === 'string' ? JSON.parse(row.extra) : row.extra || {};
  const data = {};
  for (const [key, value] of Object.entries(extra)) if (value !== null) data[key] = value;
  for (const column of table.columns) {
    const value = row[column.column];
    if (value !== null && value !== undefined) data[column.name] = fromStorage(column, value);
  }
  return { id: String(row.id !== undefined ? row.id : row._id), capability: operation, data, created_at: row.created_at, updated_at: row.updated_at };
}

const TRANSIENT_CODES = new Set(['ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'EAI_AGAIN', 'PROTOCOL_CONNECTION_LOST', '57P03', '08006', '08001']);

/** Reintenta el arranque mientras la base de datos todavía no acepta conexiones. */
async function withRetry(operation, { attempts = 15, delayMs = 2000 } = {}) {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      const transient = error && (TRANSIENT_CODES.has(error.code) || /^Mongo(?:ServerSelection|Network)/.test(error.name || ''));
      if (!transient || attempt >= attempts) throw error;
      console.warn(`Base de datos no disponible (${error.code || error.name}); reintento ${attempt}/${attempts - 1}`);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}

module.exports = { withRetry, HttpError, coerce, split, viewOf, toRecord, tableFor, isObject };
