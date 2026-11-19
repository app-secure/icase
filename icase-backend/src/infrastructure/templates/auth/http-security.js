const helmet = require('helmet');
const cors = require('cors');
const { rateLimit } = require('express-rate-limit');

function positive(value, fallback) {
  if (value === undefined || value === '') return fallback;
  if (!/^\d+$/.test(String(value)) || Number(value) < 1 || Number(value) > 2147483647) throw new Error('Configuración de límite HTTP inválida');
  return Number(value);
}

// Express y Nest (adaptador Express) comparten los mismos controles.
module.exports = function configureHttpSecurity(app, env = process.env) {
  const production = env.NODE_ENV === 'production';
  const origins = (env.CORS_ORIGINS || (production ? '' : 'http://localhost:5173,http://localhost:8080')).split(',').map((v) => v.trim()).filter(Boolean);
  if (origins.some((v) => v === '*' || !/^https?:\/\/[^/]+$/.test(v))) throw new Error('CORS_ORIGINS debe contener orígenes HTTP(S) explícitos');
  app.disable('x-powered-by');
  // Nunca confiar indiscriminadamente en X-Forwarded-For.
  if (env.TRUST_PROXY_HOPS) app.set('trust proxy', positive(env.TRUST_PROXY_HOPS, 1));
  app.use(helmet({ strictTransportSecurity: production ? undefined : false }));
  app.use(cors({ origin: (origin, cb) => cb(null, !origin || origins.includes(origin)), exposedHeaders: ['X-Total-Count', 'X-Page', 'X-Limit', 'X-Total-Pages'] }));
  const options = { windowMs: positive(env.HTTP_RATE_WINDOW_MS, 60000), standardHeaders: true, legacyHeaders: false, message: { message: 'Demasiadas solicitudes. Inténtalo más tarde.' } };
  app.use('/api', rateLimit({ ...options, limit: positive(env.HTTP_RATE_MAX, 300) }));
  const authLimit = rateLimit({ ...options, windowMs: 15 * 60000, limit: positive(env.AUTH_RATE_MAX, 20) });
  app.use(['/api/auth/login', '/api/auth/register'], authLimit);
};
