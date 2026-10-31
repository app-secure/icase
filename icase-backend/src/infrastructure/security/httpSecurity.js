/** Configuración HTTP de seguridad: CORS por lista de orígenes, cabeceras defensivas y límite de cuerpo. */

const DEVELOPMENT_ORIGINS = ['http://localhost:5173', 'http://127.0.0.1:5173'];

/**
 * Orígenes permitidos para CORS. `CORS_ORIGINS` (lista separada por comas) manda; sin ella, en desarrollo se
 * admite el frontend local y en producción ninguno (solo mismo origen).
 */
function allowedOrigins(env = process.env) {
  if (env.CORS_ORIGINS) return env.CORS_ORIGINS.split(',').map((item) => item.trim()).filter(Boolean);
  return env.NODE_ENV === 'production' ? [] : DEVELOPMENT_ORIGINS;
}

function corsOptions(env = process.env) {
  const allowed = new Set(allowedOrigins(env));
  return {
    // Las peticiones sin cabecera Origin (curl, servidor a servidor) no pasan por CORS.
    origin: (origin, callback) => callback(null, !origin || allowed.has(origin)),
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    maxAge: 600
  };
}

/** Cabeceras que evitan que el navegador interprete, incruste o cachee las respuestas de la API. */
function securityHeaders(req, res, next) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Cache-Control', 'no-store');
  next();
}

/** Límite de tamaño del cuerpo JSON (configurable con JSON_LIMIT). */
function jsonLimit(env = process.env) {
  return env.JSON_LIMIT || '10mb';
}

module.exports = { allowedOrigins, corsOptions, securityHeaders, jsonLimit };
