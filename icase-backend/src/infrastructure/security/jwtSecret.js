const crypto = require('node:crypto');

// Valores de ejemplo conocidos: nunca son un secreto válido en producción.
const WEAK = /change-?me|replace-?with|cambia_este|icase_secure_jwt_secret_key|example|secret_key|password/i;
let generated = null;

/**
 * Secreto con el que se firman las sesiones. No existe un valor por defecto:
 * - En producción es obligatorio y debe ser largo y no parecerse a un ejemplo; si no, el servidor no arranca.
 * - En desarrollo, si falta, se genera uno aleatorio solo para este proceso (las sesiones se pierden al reiniciar).
 */
function getJwtSecret(env = process.env) {
  const configured = env.JWT_SECRET;
  const production = env.NODE_ENV === 'production';
  if (configured) {
    if (production && (configured.length < 32 || WEAK.test(configured))) {
      throw new Error('JWT_SECRET es inseguro: en producción debe tener al menos 32 caracteres aleatorios y no parecerse a un valor de ejemplo.');
    }
    return configured;
  }
  if (production) throw new Error('JWT_SECRET no está definido: es obligatorio en producción.');
  if (!generated) {
    generated = crypto.randomBytes(48).toString('hex');
    console.warn('[Seguridad] JWT_SECRET no está definido: se usa un secreto aleatorio solo para este proceso. Las sesiones se perderán al reiniciar; define JWT_SECRET en .env.');
  }
  return generated;
}

module.exports = { getJwtSecret };
