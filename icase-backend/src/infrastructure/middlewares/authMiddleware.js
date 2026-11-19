const jwt = require('jsonwebtoken');
const { getJwtSecret } = require('../security/jwtSecret');

/** Exige una sesión válida: token firmado con HS256 y no caducado. */
async function authMiddleware(req, res, next) {
  const header = req.headers.authorization || '';
  if (!/^Bearer\s+\S+$/i.test(header)) {
    return res.status(401).json({ error: 'Acceso no autorizado: Token no proporcionado' });
  }
  try {
    const token = header.split(/\s+/)[1];
    const decoded = jwt.verify(token, req.app?.locals.jwtSecret || getJwtSecret(), { algorithms: ['HS256'] });
    if (!decoded || typeof decoded.id !== 'string' || !decoded.id) throw new Error('Token sin identificador de usuario');
    req.usuario = decoded;
    req.sessionToken = token;
  } catch (error) {
    return res.status(401).json({ error: 'Token inválido o expirado' });
  }
  try {
    if (req.app?.locals.sessionRevocation && await req.app.locals.sessionRevocation.estaRevocada(req.sessionToken)) {
      return res.status(401).json({ error: 'La sesión fue cerrada. Inicia sesión nuevamente.' });
    }
    return next();
  } catch {
    return res.status(503).json({ error: 'No se pudo comprobar la sesión.' });
  }
}

module.exports = { authMiddleware };
