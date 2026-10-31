/**
 * Catálogo de stacks que el generador sabe producir.
 *
 * Un stack no soportado nunca se sustituye en silencio por otro: se rechaza con un mensaje que explica qué sí hay.
 * Para añadir un stack basta con registrarlo aquí y en el generador; solo se considera soportado cuando pasa las
 * pruebas HTTP de verificación (CRUD, reglas, permisos, autenticación y OpenAPI).
 */
const BACKENDS = Object.freeze([
  { id: 'express', etiqueta: 'Node.js + Express', lenguaje: 'node', patron: /express|^\s*node(?:\.?js)?\s*$/i },
  { id: 'nest', etiqueta: 'Node.js + NestJS', lenguaje: 'node', patron: /nest/i },
  { id: 'spring', etiqueta: 'Java + Spring Boot', lenguaje: 'java', patron: /spring|\bjava\b/i }
]);

const DATABASES = Object.freeze([
  { id: 'postgres', etiqueta: 'PostgreSQL', patron: /postgres/i },
  { id: 'mysql', etiqueta: 'MySQL', patron: /mysql/i },
  { id: 'mongodb', etiqueta: 'MongoDB', patron: /mongo/i }
]);

// Combinaciones que existen por separado pero todavía no se pueden generar juntas.
const UNSUPPORTED_COMBINATIONS = Object.freeze([
  { backend: 'spring', database: 'mongodb', motivo: 'Java + Spring Boot solo se genera con bases de datos relacionales (PostgreSQL o MySQL) por ahora.' }
]);

const FRONTEND = /react/i;

const options = (list) => list.map((item) => item.etiqueta).join(', ');

class StackCatalog {
  /**
   * @param {object} stack decisión de stack (`backend`, `base_datos`, `frontend`)
   * @returns {{ backend: string, database: string, language: string }}
   * @throws {Error} con un mensaje comprensible si algo no está soportado
   */
  static resolve(stack = {}) {
    const requestedBackend = String(stack.backend || '').trim();
    const requestedDatabase = String(stack.base_datos || '').trim();
    const backend = requestedBackend
      ? BACKENDS.find((item) => item.patron.test(requestedBackend))
      : BACKENDS[0];
    if (!backend) {
      throw new Error(`El backend «${requestedBackend}» no está soportado todavía. Opciones disponibles: ${options(BACKENDS)}.`);
    }
    const database = requestedDatabase
      ? DATABASES.find((item) => item.patron.test(requestedDatabase))
      : DATABASES.find((item) => item.id === (backend.id === 'spring' ? 'postgres' : 'mongodb')); // sin indicación: MongoDB (histórico); Java solo admite relacionales
    if (!database) {
      throw new Error(`La base de datos «${requestedDatabase}» no está soportada todavía. Opciones disponibles: ${options(DATABASES)}.`);
    }
    const unsupported = UNSUPPORTED_COMBINATIONS.find((item) => item.backend === backend.id && item.database === database.id);
    if (unsupported) throw new Error(`${unsupported.motivo} Elige ${options(DATABASES.filter((item) => item.id !== database.id && !UNSUPPORTED_COMBINATIONS.some((combo) => combo.backend === backend.id && combo.database === item.id)))} o cambia el backend.`);
    const frontend = String(stack.frontend || '').trim();
    if (frontend && !FRONTEND.test(frontend)) {
      throw new Error(`El frontend «${frontend}» no está soportado todavía. Opción disponible: React + Vite.`);
    }
    return { backend: backend.id, database: database.id, language: backend.lenguaje };
  }

  /** Solo el backend: para quien únicamente necesita saber el framework (Dockerfile, CI). */
  static resolveBackend(text) {
    const requested = String(text || '').trim();
    const backend = requested ? BACKENDS.find((item) => item.patron.test(requested)) : BACKENDS[0];
    if (!backend) throw new Error(`El backend «${requested}» no está soportado todavía. Opciones disponibles: ${options(BACKENDS)}.`);
    return { backend: backend.id, language: backend.lenguaje };
  }

  /** Lo que el generador puede producir, para mostrarlo en la interfaz. */
  static supported() {
    return {
      backends: BACKENDS.map(({ id, etiqueta, lenguaje }) => ({ id, etiqueta, lenguaje })),
      bases_de_datos: DATABASES.map(({ id, etiqueta }) => ({ id, etiqueta })),
      frontends: [{ id: 'react', etiqueta: 'React + Vite' }],
      combinaciones_no_soportadas: UNSUPPORTED_COMBINATIONS.map(({ backend, database, motivo }) => ({ backend, database, motivo }))
    };
  }
}

module.exports = StackCatalog;
