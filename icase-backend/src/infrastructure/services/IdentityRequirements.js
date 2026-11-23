/**
 * Reconoce lo que pertenece a la identidad de la aplicación (acceso, cuentas de usuario y credenciales), que no debe
 * tratarse como una tabla de datos más. Es determinista y se basa en patrones, no en nombres de un proyecto concreto.
 */
const strip = (value) => String(value || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

// Nombres de campo que guardan un secreto (se comparan sin tildes, mayúsculas ni separadores).
const SENSITIVE_FIELD = /^(?:password|passwd|pwd|pass|contrasena|clave|secret|secreto|apikey|token|(?:password|passwd|pass|contrasena|clave)hash|hash(?:password|contrasena|clave)?|salt)$/;
// Autorizar acciones según el rol también es acceso: lo resuelven la sesión y la matriz de permisos, no una tabla de datos.
const LOGIN = /\b(?:autenticar|autenticacion|autenticarse|inicio de sesion|iniciar sesion|login|jwt|control de acceso)\b|\bautoriz\w*\b.*\brol(?:es)?\b/;
const USERS = /\busuarios?\b/;

const isSensitiveField = (name) => SENSITIVE_FIELD.test(strip(name).replace(/[^a-z0-9]/g, ''));

/** RF de autenticación (iniciar sesión, JWT, control de acceso): lo resuelve la sesión de la aplicación, no una tabla. */
const isLoginRequirement = (requirement) => LOGIN.test(strip(requirement?.nombre));

/** RF que gestiona cuentas de usuario (por el nombre del RF); la entidad debe confirmarlo con `hasCredentials`. */
const isUsersRequirement = (requirement) => !isLoginRequirement(requirement) && USERS.test(strip(requirement?.nombre));

const hasCredentials = (schema) => Object.keys(schema?.properties || {}).some(isSensitiveField);

/** Marca como sensibles (`x-sensitive`, `writeOnly`) los campos de secretos de un esquema. Devuelve el mismo esquema. */
function markSensitive(schema) {
  for (const [name, property] of Object.entries(schema?.properties || {})) {
    if (isSensitiveField(name) && property && typeof property === 'object') {
      property['x-sensitive'] = true;
      property.writeOnly = true;
    }
  }
  return schema;
}

module.exports = { isSensitiveField, isLoginRequirement, isUsersRequirement, hasCredentials, markSensitive };
