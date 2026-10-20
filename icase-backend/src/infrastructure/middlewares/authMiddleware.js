const jwt = require('jsonwebtoken');
const { getJwtSecret } = require('../security/jwtSecret');

function verify(header) {
  if (!/^Bearer\s+\S+$/i.test(header || '')) return null;
  const decoded = jwt.verify(header.split(/\s+/)[1], getJwtSecret(), { algorithms: ['HS256'] });
  if (!decoded || typeof decoded.id !== 'string' || !decoded.id) throw new Error('Token sin identificador de usuario');
  return decoded;
}

/** Exige una sesión válida: token firmado con HS256 y no caducado. */
function authMiddleware(req, res, next) {
  if (!/^Bearer\s+\S+$/i.test(req.headers.authorization || '')) {
    return res.status(401).json({ error: 'Acceso no autorizado: Token no proporcionado' });
  }
  try {
    req.usuario = verify(req.headers.authorization);
    return next();
  } catch (error) {
    return res.status(401).json({ error: 'Token inválido o expirado' });
  }
}

/** Transitorio: se retira al exigir sesión en todas las rutas. */
function optionalAuthMiddleware(req, res, next) {
  try {
    const decoded = verify(req.headers.authorization);
    if (decoded) req.usuario = decoded;
  } catch (error) {
    // Un token inválido se trata como ausencia de sesión.
  }
  next();
}

module.exports = { authMiddleware, optionalAuthMiddleware };
