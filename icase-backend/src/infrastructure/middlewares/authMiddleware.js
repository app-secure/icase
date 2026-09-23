const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'icase_secure_jwt_secret_key_2026';

function authMiddleware(req, res, next) {
  try {
    const authHeader = req.headers.authorization || req.headers.Authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Acceso no autorizado: Token no proporcionado' });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET);
    req.usuario = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Token inválido o expirado' });
  }
}

function optionalAuthMiddleware(req, res, next) {
  try {
    const authHeader = req.headers.authorization || req.headers.Authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1];
      const decoded = jwt.verify(token, JWT_SECRET);
      req.usuario = decoded;
    }
  } catch (err) {
    // Si el token es inválido, simplemente continuamos sin usuario autenticado
  }
  next();
}

module.exports = {
  authMiddleware,
  optionalAuthMiddleware,
  JWT_SECRET
};
