// Núcleo de autenticación y autorización del backend generado.
// Independiente del framework: Express y NestJS lo usan a través de adaptadores finos.
const crypto = require('node:crypto');
const { promisify } = require('node:util');
const jwt = require('jsonwebtoken');
const { HttpError } = require('../data/store-support');
const policy = require('./policy');

const scrypt = promisify(crypto.scrypt);
const METHODS = ['GET', 'POST', 'PATCH', 'DELETE'];
const ADMIN = 'administrador';
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const WEAK_SECRET = /change-?me|replace-?with/i;
const COST = { N: 16384, r: 8, p: 1, keylen: 64 };

async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = await scrypt(password, salt, COST.keylen, { N: COST.N, r: COST.r, p: COST.p });
  return ['scrypt', COST.N, COST.r, COST.p, salt.toString('base64'), hash.toString('base64')].join('$');
}

async function verifyPassword(password, stored) {
  const [scheme, N, r, p, salt, hash] = String(stored || '').split('$');
  if (scheme !== 'scrypt' || !hash) return false;
  const expected = Buffer.from(hash, 'base64');
  const actual = await scrypt(password, Buffer.from(salt, 'base64'), expected.length, { N: Number(N), r: Number(r), p: Number(p) });
  return crypto.timingSafeEqual(actual, expected);
}

/** Limita intentos fallidos por clave dentro de una ventana de tiempo. */
class AttemptLimiter {
  constructor({ max, windowMs, now }) {
    Object.assign(this, { max, windowMs, now, entries: new Map() });
  }

  check(key) {
    const entry = this.entries.get(key);
    if (!entry) return;
    if (this.now() - entry.since > this.windowMs) { this.entries.delete(key); return; }
    if (entry.count >= this.max) throw new HttpError(429, 'Demasiados intentos. Inténtalo de nuevo más tarde.');
  }

  fail(key) {
    const current = this.entries.get(key);
    if (current && this.now() - current.since <= this.windowMs) current.count += 1;
    else this.entries.set(key, { count: 1, since: this.now() });
    if (this.entries.size > 5000) for (const [stored, entry] of this.entries) if (this.now() - entry.since > this.windowMs) this.entries.delete(stored);
  }

  reset(key) { this.entries.delete(key); }
}

const lower = (value) => String(value || '').trim().toLowerCase();
const bad = (message) => { throw new HttpError(400, message); };

function createAuth({ store, env = process.env, now = Date.now } = {}) {
  const enabled = policy.habilitada === true;
  const logins = new AttemptLimiter({ max: 5, windowMs: 15 * 60 * 1000, now });
  const registrations = new AttemptLimiter({ max: 10, windowMs: 15 * 60 * 1000, now });
  let dummyHash = null;

  const roles = () => policy.roles || {};
  const knownRole = (role) => role === ADMIN || Object.prototype.hasOwnProperty.call(roles(), role);

  const publicUser = (user) => ({ id: String(user.id), email: user.email, nombre: user.nombre, rol: user.rol, activo: user.activo !== false, created_at: user.created_at });

  function permissionsOf(user) {
    const isAdmin = user.rol === ADMIN;
    const operaciones = {};
    for (const [key, byRole] of Object.entries(policy.operaciones || {})) {
      const methods = isAdmin ? METHODS : byRole[user.rol] || [];
      if (methods.length) operaciones[key] = [...methods];
    }
    return { rol: user.rol, nombre_rol: isAdmin ? 'Administrador' : (roles()[user.rol] || {}).nombre || user.rol, administrador: isAdmin, operaciones };
  }

  function validateCredentials({ email, password, nombre }, { partial = false } = {}) {
    const result = {};
    if (!partial || email !== undefined) {
      const address = lower(email);
      if (!EMAIL.test(address) || address.length > 254) bad('El correo electrónico no es válido.');
      result.email = address;
    }
    if (!partial || password !== undefined) {
      if (typeof password !== 'string' || password.length < 8 || password.length > 128) bad('La contraseña debe tener entre 8 y 128 caracteres.');
      result.password = password;
    }
    if (nombre !== undefined) {
      const name = String(nombre).trim();
      if (name.length > 120) bad('El nombre no puede superar 120 caracteres.');
      result.nombre = name;
    }
    return result;
  }

  async function init() {
    if (!enabled) return;
    const secret = env.JWT_SECRET;
    if (!secret) throw new Error('JWT_SECRET no está definido.');
    if (env.NODE_ENV === 'production' && (secret.length < 16 || WEAK_SECRET.test(secret))) {
      throw new Error('JWT_SECRET es inseguro: usa un valor aleatorio de al menos 16 caracteres.');
    }
    if (!env.ADMIN_EMAIL || !env.ADMIN_PASSWORD) {
      console.warn('ADMIN_EMAIL y ADMIN_PASSWORD no están definidos: no se creó el administrador inicial.');
      return;
    }
    const credentials = validateCredentials({ email: env.ADMIN_EMAIL, password: env.ADMIN_PASSWORD });
    if (await store.findUserByEmail(credentials.email)) return;
    try {
      await store.createUser({ email: credentials.email, nombre: 'Administrador', rol: ADMIN, activo: true, password_hash: await hashPassword(credentials.password) });
    } catch (error) {
      if (!(error instanceof HttpError && error.status === 409)) throw error; // otra instancia lo creó primero
    }
  }

  function issue(user) {
    return jwt.sign({ rol: user.rol }, env.JWT_SECRET, { algorithm: 'HS256', subject: String(user.id), expiresIn: policy.expiracion || '8h' });
  }

  async function login(email, password, ip) {
    if (typeof email !== 'string' || typeof password !== 'string') bad('Indica correo electrónico y contraseña.');
    const key = `${lower(email)}|${ip || ''}`;
    logins.check(key);
    const user = await store.findUserByEmail(lower(email));
    if (!dummyHash) dummyHash = hashPassword(crypto.randomBytes(8).toString('hex'));
    // Se verifica siempre un hash para que el tiempo de respuesta no revele si el correo existe.
    const valid = await verifyPassword(password, user ? user.password_hash : await dummyHash);
    if (!user || !valid || user.activo === false) {
      logins.fail(key);
      throw new HttpError(401, 'Credenciales inválidas.');
    }
    logins.reset(key);
    return { token: issue(user), usuario: publicUser(user), permisos: permissionsOf(user) };
  }

  async function register(input, ip) {
    const open = Object.entries(roles()).filter(([, role]) => role.autoregistro).map(([id]) => id);
    if (!open.length) throw new HttpError(403, 'El registro abierto no está habilitado.');
    registrations.check(`register|${ip || ''}`);
    registrations.fail(`register|${ip || ''}`);
    const body = input && typeof input === 'object' ? input : {};
    const role = body.rol === undefined && open.length === 1 ? open[0] : lower(body.rol);
    if (!open.includes(role)) bad(`El rol debe ser uno de: ${open.join(', ')}.`);
    const credentials = validateCredentials(body);
    const created = await store.createUser({ email: credentials.email, nombre: credentials.nombre || '', rol: role, activo: true, password_hash: await hashPassword(credentials.password) });
    return { usuario: publicUser(created) };
  }

  async function authenticate(header) {
    const match = /^Bearer\s+(\S+)$/i.exec(String(header || ''));
    if (!match) throw new HttpError(401, 'Autenticación requerida.');
    let claims;
    try { claims = jwt.verify(match[1], env.JWT_SECRET, { algorithms: ['HS256'] }); } catch { throw new HttpError(401, 'Sesión inválida o expirada.'); }
    // El usuario se lee en cada petición: desactivarlo o cambiarle el rol surte efecto de inmediato.
    const user = await store.findUserById(claims.sub);
    if (!user || user.activo === false) throw new HttpError(401, 'Sesión inválida o expirada.');
    return user;
  }

  function isPublic(method, path) {
    return (method === 'GET' && path === '/health') || (method === 'POST' && (path === '/api/auth/login' || path === '/api/auth/register'));
  }

  function authorize(user, method, path) {
    const operation = /^\/api\/operations\/([^/]+)/.exec(path);
    if (operation) {
      const byRole = Object.prototype.hasOwnProperty.call(policy.operaciones || {}, operation[1]) ? policy.operaciones[operation[1]] : null;
      if (!byRole) return; // operación inexistente: responde 404 la ruta
      if (user.rol !== ADMIN && !(byRole[user.rol] || []).includes(method)) throw new HttpError(403, 'No tienes permiso para esta operación.');
      return;
    }
    if (/^\/api\/users(?:\/|$)/.test(path) && user.rol !== ADMIN) throw new HttpError(403, 'Solo el administrador gestiona usuarios.');
  }

  async function keepAnotherAdmin(excludedId) {
    const others = (await store.listUsers()).filter((user) => String(user.id) !== String(excludedId) && user.rol === ADMIN && user.activo !== false);
    if (!others.length) throw new HttpError(409, 'Debe existir al menos un administrador activo.');
  }

  const users = {
    async list() { return (await store.listUsers()).map(publicUser); },

    async create(input) {
      const body = input && typeof input === 'object' ? input : {};
      const credentials = validateCredentials(body);
      const role = lower(body.rol);
      if (!knownRole(role)) bad(`El rol debe ser uno de: ${[ADMIN, ...Object.keys(roles())].join(', ')}.`);
      return publicUser(await store.createUser({ email: credentials.email, nombre: credentials.nombre || '', rol: role, activo: body.activo !== false, password_hash: await hashPassword(credentials.password) }));
    },

    async update(id, input) {
      const body = input && typeof input === 'object' ? input : {};
      const current = await store.findUserById(id);
      if (!current) return null;
      const credentials = validateCredentials(body, { partial: true });
      const patch = {};
      if (credentials.email !== undefined) patch.email = credentials.email;
      if (credentials.nombre !== undefined) patch.nombre = credentials.nombre;
      if (credentials.password !== undefined) patch.password_hash = await hashPassword(credentials.password);
      if (body.rol !== undefined) {
        if (!knownRole(lower(body.rol))) bad('El rol no existe.');
        patch.rol = lower(body.rol);
      }
      if (body.activo !== undefined) {
        if (typeof body.activo !== 'boolean') bad('"activo" debe ser verdadero o falso.');
        patch.activo = body.activo;
      }
      const losesAdmin = current.rol === ADMIN && current.activo !== false && ((patch.rol && patch.rol !== ADMIN) || patch.activo === false);
      if (losesAdmin) await keepAnotherAdmin(current.id);
      return publicUser(await store.updateUser(current.id, patch));
    },

    async remove(id, actor) {
      const current = await store.findUserById(id);
      if (!current) return false;
      if (actor && String(actor.id) === String(current.id)) bad('No puedes eliminar tu propio usuario.');
      if (current.rol === ADMIN && current.activo !== false) await keepAnotherAdmin(current.id);
      return store.removeUser(current.id);
    }
  };

  return { init, login, register, authenticate, authorize, isPublic, permissionsOf, publicUser, users, enabled };
}

module.exports = { createAuth, hashPassword, verifyPassword, AttemptLimiter };
