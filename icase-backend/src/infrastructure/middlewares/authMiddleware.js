const jwt = require('jsonwebtoken');
const { getJwtSecret } = require('../security/jwtSecret');

/** Exige una sesión válida: token firmado con HS256 y no caducado. */
function authMiddleware(req, res, next) {
  const header = req.headers.authorization || '';
  if (!/^Bearer\s+\S+$/i.test(header)) {
    return res.status(401).json({ error: 'Acceso no autorizado: Token no proporcionado' });
  }
  try {
    const decoded = jwt.verify(header.split(/\s+/)[1], getJwtSecret(), { algorithms: ['HS256'] });
    if (!decoded || typeof decoded.id !== 'string' || !decoded.id) throw new Error('Token sin identificador de usuario');
    req.usuario = decoded;
    return next();
  } catch (error) {
    return res.status(401).json({ error: 'Token inválido o expirado' });
  }
}

module.exports = { authMiddleware };
