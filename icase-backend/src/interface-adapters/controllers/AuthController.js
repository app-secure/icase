const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { getJwtSecret } = require('../../infrastructure/security/jwtSecret');
const RateLimiter = require('../../infrastructure/security/RateLimiter');

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE = /^[0-9+()\-\s]{7,20}$/;
const MIN_PASSWORD = 8;
const MAX_PASSWORD_BYTES = 72; // límite de bcrypt: más allá se ignora en silencio, así que se rechaza

// Los campos deben ser texto: un objeto como { "$ne": null } llegaría tal cual a la consulta de Mongo.
const text = (value) => (typeof value === 'string' ? value.trim() : '');

class AuthController {
  constructor({ usuarioRepository, env = process.env, now = Date.now }) {
    this.usuarioRepository = usuarioRepository;
    this.expiresIn = env.JWT_EXPIRES_IN || '12h';
    this.loginAttempts = new RateLimiter({ max: 5, windowMs: 15 * 60 * 1000, now });
    this.loginAttemptsByIp = new RateLimiter({ max: 30, windowMs: 15 * 60 * 1000, now });
    this.registrations = new RateLimiter({ max: 10, windowMs: 60 * 60 * 1000, now });
    // Se compara contra un hash falso cuando el correo no existe, para que el tiempo de respuesta no lo delate.
    this.dummyHash = bcrypt.hashSync('contraseña-que-nadie-usa', 10);
  }

  _token(usuario) {
    return jwt.sign(
      { id: String(usuario.id), correo: usuario.correo, nombre: usuario.nombre, apellido: usuario.apellido },
      getJwtSecret(),
      { algorithm: 'HS256', expiresIn: this.expiresIn }
    );
  }

  _blocked(res, seconds) {
    res.set('Retry-After', String(seconds));
    return res.status(429).json({ error: 'Demasiados intentos. Inténtalo de nuevo más tarde.' });
  }

  _passwordError(password) {
    if (typeof password !== 'string' || password.length < MIN_PASSWORD) return `La contraseña debe tener al menos ${MIN_PASSWORD} caracteres.`;
    if (Buffer.byteLength(password) > MAX_PASSWORD_BYTES) return `La contraseña no puede superar ${MAX_PASSWORD_BYTES} bytes.`;
    return null;
  }

  async registro(req, res) {
    try {
      const key = req.ip;
      const wait = this.registrations.blockedFor(key);
      if (wait) return this._blocked(res, wait);
      this.registrations.fail(key);

      const body = req.body || {};
      const nombre = text(body.nombre);
      const apellido = text(body.apellido);
      const correo = text(body.correo).toLowerCase();
      const celular = text(body.celular);
      const password = body.password;

      if (!nombre || !apellido || !correo || !celular || !password) {
        return res.status(400).json({ error: 'Todos los campos son obligatorios: Nombre, Apellido, Correo, Celular y Contraseña.' });
      }
      if (nombre.length > 80 || apellido.length > 80) return res.status(400).json({ error: 'El nombre y el apellido no pueden superar 80 caracteres.' });
      if (!EMAIL.test(correo) || correo.length > 254) return res.status(400).json({ error: 'El correo electrónico no es válido.' });
      if (!PHONE.test(celular)) return res.status(400).json({ error: 'El número de celular no es válido.' });
      const passwordError = this._passwordError(password);
      if (passwordError) return res.status(400).json({ error: passwordError });

      if (await this.usuarioRepository.obtenerPorCorreo(correo)) {
        return res.status(409).json({ error: 'Ya existe una cuenta registrada con este correo electrónico.' });
      }

      const nuevoUsuario = await this.usuarioRepository.crear({ nombre, apellido, correo, celular, password: await bcrypt.hash(password, 10) });
      return res.status(201).json({ success: true, message: 'Usuario registrado con éxito', usuario: nuevoUsuario, token: this._token(nuevoUsuario) });
    } catch (err) {
      console.error('[AuthController] Error en registro:', err);
      return res.status(500).json({ error: 'Error en el servidor al registrar usuario' });
    }
  }

  async login(req, res) {
    try {
      const body = req.body || {};
      const correo = text(body.correo).toLowerCase();
      const password = body.password;
      if (!correo || typeof password !== 'string' || !password) {
        return res.status(400).json({ error: 'Por favor ingrese su correo electrónico y contraseña.' });
      }

      const key = `${req.ip}|${correo}`;
      const wait = Math.max(this.loginAttempts.blockedFor(key), this.loginAttemptsByIp.blockedFor(req.ip));
      if (wait) return this._blocked(res, wait);

      const usuarioDoc = await this.usuarioRepository.obtenerPorCorreo(correo);
      const valida = await bcrypt.compare(password, usuarioDoc ? usuarioDoc.password : this.dummyHash);
      if (!usuarioDoc || !valida) {
        this.loginAttempts.fail(key);
        this.loginAttemptsByIp.fail(req.ip);
        return res.status(401).json({ error: 'Credenciales inválidas: Correo o contraseña incorrectos.' });
      }
      this.loginAttempts.reset(key);

      const usuarioJson = usuarioDoc.toJSON();
      return res.json({ success: true, message: 'Sesión iniciada con éxito', usuario: usuarioJson, token: this._token(usuarioJson) });
    } catch (err) {
      console.error('[AuthController] Error en login:', err);
      return res.status(500).json({ error: 'Error en el servidor al iniciar sesión' });
    }
  }

  async perfil(req, res) {
    try {
      const usuario = await this.usuarioRepository.obtenerPorId(req.usuario.id);
      if (!usuario) return res.status(404).json({ error: 'Usuario no encontrado' });
      return res.json(usuario);
    } catch (err) {
      console.error('[AuthController] Error en perfil:', err);
      return res.status(500).json({ error: 'Error en el servidor' });
    }
  }
}

module.exports = AuthController;
