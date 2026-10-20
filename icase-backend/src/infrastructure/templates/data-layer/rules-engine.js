// Motor de reglas de negocio del backend generado.
// Aplica de forma determinista las reglas confirmadas en ./rules; no ejecuta código recibido de terceros.
const { HttpError } = require('./store-support');
const rules = require('./rules');

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const COMPARATORS = {
  '<': (a, b) => a < b,
  '<=': (a, b) => a <= b,
  '>': (a, b) => a > b,
  '>=': (a, b) => a >= b,
  '==': (a, b) => a === b,
  '!=': (a, b) => a !== b
};

const present = (value) => value !== undefined && value !== null && value !== '';

/** Lleva fechas, números y textos a un valor comparable; null si no hay valor. */
function comparable(value) {
  if (!present(value)) return null;
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'number') return value;
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value) && !Number.isNaN(Date.parse(value))) return Date.parse(value);
  return value;
}

function url(value) {
  try { return ['http:', 'https:'].includes(new URL(value).protocol); } catch { return false; }
}

function same(a, b) {
  return comparable(a) === comparable(b);
}

/** Valores por defecto y estado inicial: se aplican al crear, antes de validar. */
function prepare(table, body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return body;
  const result = { ...body };
  for (const rule of rules[table] || []) {
    if (rule.tipo === 'valor_por_defecto' && !present(result[rule.campo])) result[rule.campo] = rule.valor;
    if (rule.tipo === 'maquina_estados' && !present(result[rule.campo])) result[rule.campo] = rule.inicial;
  }
  return result;
}

/**
 * Valida el estado resultante de una operación.
 * @param {string} table tabla o colección
 * @param {'create'|'update'} mode
 * @param {object} next datos resultantes, por nombre de campo
 * @param {object|null} previous datos antes de la modificación (solo en 'update')
 */
function check(table, mode, next, previous) {
  const violations = [];
  const fail = (rule) => violations.push({ regla: rule.id, mensaje: rule.mensaje, rf: rule.rf });
  for (const rule of rules[table] || []) {
    const value = next[rule.campo];
    switch (rule.tipo) {
      case 'requerido':
        if (!present(value)) fail(rule);
        break;
      case 'rango': {
        const number = comparable(value);
        if (number === null) break;
        if (typeof number !== 'number' || (rule.min !== undefined && number < rule.min) || (rule.max !== undefined && number > rule.max)) fail(rule);
        break;
      }
      case 'longitud':
        if (present(value) && (typeof value !== 'string' || (rule.min !== undefined && value.length < rule.min) || (rule.max !== undefined && value.length > rule.max))) fail(rule);
        break;
      case 'formato':
        if (present(value) && !(rule.formato === 'email' ? EMAIL.test(value) : url(value))) fail(rule);
        break;
      case 'comparacion': {
        const left = comparable(value);
        const right = comparable(rule.con_campo !== undefined ? next[rule.con_campo] : rule.con_valor);
        if (left === null || right === null) break;
        if (typeof left !== typeof right || !COMPARATORS[rule.operador](left, right)) fail(rule);
        break;
      }
      case 'maquina_estados': {
        if (!present(value)) break;
        if (mode === 'create') {
          if (value !== rule.inicial) fail(rule);
        } else if (previous && present(previous[rule.campo]) && previous[rule.campo] !== value
          && !rule.transiciones.some((item) => item.de === previous[rule.campo] && item.a === value)) {
          violations.push({ regla: rule.id, mensaje: `${rule.mensaje} (${previous[rule.campo]} → ${value})`, rf: rule.rf });
        }
        break;
      }
      case 'inmutable':
        if (mode === 'update' && previous && present(previous[rule.campo]) && !same(previous[rule.campo], value)) fail(rule);
        break;
      default:
        break; // 'unico' lo garantiza la base de datos; 'valor_por_defecto' se aplica en prepare()
    }
  }
  if (violations.length) {
    const error = new HttpError(422, `Se incumplen reglas de negocio: ${violations.map((item) => item.mensaje).join(' ')}`);
    error.details = violations;
    throw error;
  }
}

module.exports = { prepare, check };
