/**
 * Campos que un formulario de alta NO debe pedir porque los completa el sistema. Sin esto, la revisión de formularios
 * exigía un control para cada atributo de la entidad (el cliente de la sesión, el estado inicial, un código QR generado,
 * fechas de registro, totales calculados), y avisaba de faltantes que en realidad serían un error de diseño si se pidieran.
 */
const strip = (value) => String(value || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

// Referencia a quien actúa: sale de la sesión, no se elige en el formulario.
const ACTOR_REFERENCE = /^(?:cliente|usuario|mesero|cajero|cocinero|administrador|empleado|responsable|propietario|autor|owner|creador)_?id$/;
const STATE = /^(?:estado|status)$/;
// Identificadores y códigos que se generan.
const GENERATED = /(?:qr|token|hash|uuid|guid|folio|correlativo|secuencia)$/;
// Marcas de tiempo del propio registro.
const TIMESTAMP = /^(?:fecha|fechahora|hora)(?:de)?(?:adquisicion|compra|creacion|registro|alta|cierre|apertura|emision|liberacion|actualizacion|modificacion|confirmacion|pago)$/;
const VALIDITY = /^(?:inicio|fin)vigencia$/;
// Cantidades derivadas de otras: totales, diferencias, esperados y contadores de uso.
const DERIVED = /^(?:total(?:es)?\w*|subtotal\w*|diferencia\w*|\w*esperado|usos(?:totales|restantes|disponibles)|saldo\w*|puntosacumulados)$/;

/** Motivo por el que el sistema completa el campo, o null si es un dato que la persona sí debe escribir. */
function systemManaged(name, definition = {}) {
  const key = strip(name).replace(/[^a-z0-9_]/g, '');
  const compact = key.replace(/_/g, '');
  if (definition.readOnly) return 'solo lectura';
  if (ACTOR_REFERENCE.test(key) || ACTOR_REFERENCE.test(compact)) return 'la toma de la sesión';
  if (STATE.test(key) && (definition.enum || definition.type === 'string')) return 'empieza en su estado inicial';
  if (GENERATED.test(compact)) return 'lo genera el sistema';
  if (TIMESTAMP.test(compact) || VALIDITY.test(compact)) return 'lo registra el sistema';
  if (DERIVED.test(compact)) return 'se calcula';
  return null;
}

module.exports = { systemManaged };
