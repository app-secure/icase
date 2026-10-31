const fs = require('node:fs');
const path = require('node:path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { startPlatform, listRoutes, token, ids, SECRET } = require('./helpers/platform-fixture');
const { getJwtSecret } = require('../src/infrastructure/security/jwtSecret');
const RateLimiter = require('../src/infrastructure/security/RateLimiter');
const createApp = require('../src/app');

const PUBLIC = new Set(['GET /health', 'POST /auth/registro', 'POST /auth/login']);
const GLOBAL = new Set(['GET /auth/perfil', 'GET /proyectos', 'POST /proyectos', 'GET /proyectos/modelos-ia', 'POST /diagramas/validar-sintaxis']);
const normalize = (value) => value.replace(/\/+/g, '/').replace(/(.)\/$/, '$1');

/** Sustituye los parámetros de una ruta por identificadores reales del proyecto de A. */
function fill(routePath) {
  const family = routePath.startsWith('/requerimientos') ? 'requirement' : routePath.startsWith('/diagramas') ? 'diagram' : routePath.startsWith('/fuentes') ? 'source' : 'project';
  const byFamily = { requirement: ids.requirementA, diagram: ids.diagramA, source: ids.sourceA, project: ids.projectA };
  return routePath
    .replace(':id', byFamily[family]).replace(':proyectoId', ids.projectA).replace(':trabajoId', ids.jobA).replace(':artefactoId', ids.artifactA)
    .replace(':etapa', 'stack_tecnologico').replace(':nombrePantalla', 'inicio').replace(':fuenteIdOrName', ids.sourceA);
}

describe('toda ruta exige sesión y pertenencia', () => {
  let platform;
  let routes;
  beforeAll(async () => {
    platform = await startPlatform();
    routes = listRoutes(platform.app).map((route) => ({ ...route, path: normalize(route.path) }));
  });
  afterAll(() => platform.close());
  beforeEach(() => { platform.calls.length = 0; });

  const hit = (route, auth, body) => platform.request(route.method, fill(route.path), { auth, body: ['POST', 'PUT', 'PATCH'].includes(route.method) ? (body ?? {}) : undefined });

  test('se descubren todas las rutas de la aplicación', () => {
    expect(routes.length).toBeGreaterThanOrEqual(55);
    expect(routes.map((route) => `${route.method} ${route.path}`)).toEqual(expect.arrayContaining(['DELETE /fuentes/:id', 'GET /proyectos/:id/codificacion', 'POST /mockups/proyecto/:proyectoId/generar', 'PUT /diagramas/:id']));
  });

  test('sin sesión, todas las rutas (salvo salud, registro e inicio de sesión) responden 401 sin tocar nada', async () => {
    const failures = [];
    for (const route of routes.filter((item) => !PUBLIC.has(`${item.method} ${item.path}`))) {
      const response = await hit(route, null);
      if (response.status !== 401) failures.push(`${route.method} ${route.path} -> ${response.status}`);
    }
    expect(failures).toEqual([]);
    expect(platform.calls).toEqual([]);
  });

  test('con la sesión de otro usuario, ninguna ruta con recurso llega a su controlador (404)', async () => {
    const failures = [];
    for (const route of routes.filter((item) => !PUBLIC.has(`${item.method} ${item.path}`) && !GLOBAL.has(`${item.method} ${item.path}`) && !(item.method === 'POST' && item.path === '/requerimientos'))) {
      platform.calls.length = 0;
      const response = await hit(route, token(ids.userB));
      const reached = platform.calls.filter((call) => call.method !== 'obtenerPorId');
      if (response.status !== 404 || reached.length) failures.push(`${route.method} ${route.path} -> ${response.status} ${reached.map((call) => `${call.repository}.${call.method}`).join(',')}`);
    }
    expect(failures).toEqual([]);
  });

  test('crear un requisito en el proyecto de otro usuario también se rechaza', async () => {
    const response = await platform.request('POST', '/requerimientos', { auth: token(ids.userB), body: { proyecto_id: ids.projectA, nombre: 'Intruso' } });
    expect(response.status).toBe(404);
    expect(platform.calls.some((call) => call.method === 'crear')).toBe(false);
  });

  test('un proyecto sin dueño (anterior a exigir sesión) no es accesible para nadie', async () => {
    for (const userId of [ids.userA, ids.userB]) {
      expect((await platform.request('GET', `/proyectos/${ids.projectOrphan}`, { auth: token(userId) })).status).toBe(404);
      expect((await platform.request('PUT', `/requerimientos/${ids.requirementOrphan}`, { auth: token(userId), body: { nombre: 'x' } })).status).toBe(404);
    }
  });

  test('identificadores con formato inválido se tratan como inexistentes, no como error', async () => {
    for (const bad of ['no-es-un-id', '123', '%7B%22%24ne%22%3Anull%7D']) {
      const response = await platform.request('GET', `/proyectos/${bad}`, { auth: token(ids.userA) });
      expect(response.status).toBe(404);
    }
  });

  test('el dueño sí accede: lista solo lo suyo y lee su proyecto', async () => {
    const list = await platform.request('GET', '/proyectos', { auth: token(ids.userA) });
    expect(list.status).toBe(200);
    expect(list.json.map((project) => project.id)).toEqual([ids.projectA]);
    expect((await platform.request('GET', '/proyectos', { auth: token(ids.userB) })).json.map((project) => project.id)).toEqual([ids.projectB]);
    const own = await platform.request('GET', `/proyectos/${ids.projectA}`, { auth: token(ids.userA) });
    expect(own.status).toBe(200);
    expect(own.json.nombre).toBe('Proyecto de A');
  });
});

describe('sin asignación masiva', () => {
  let platform;
  beforeEach(async () => { platform = await startPlatform(); });
  afterEach(() => platform.close());
  const updatesOf = (repository) => platform.calls.filter((call) => call.repository === repository && call.method === 'actualizar');

  test('el proyecto solo admite sus campos editables: no se cambia dueño ni fase', async () => {
    const response = await platform.request('PUT', `/proyectos/${ids.projectA}`, { auth: token(ids.userA), body: { nombre: 'Nuevo', usuario_id: ids.userB, estado_fase: 'finalizado', _id: 'x' } });
    expect(response.status).toBe(200);
    expect(updatesOf('proyecto')[0].args[1]).toEqual({ nombre: 'Nuevo' });
    expect(platform.data.proyecto[0]).toMatchObject({ usuario_id: ids.userA, estado_fase: 'insumos_pendientes' });
  });

  test('crear un proyecto usa siempre el usuario de la sesión, aunque el cuerpo diga otro', async () => {
    await platform.request('POST', '/proyectos', { auth: token(ids.userA), body: { nombre: 'Mío', usuario_id: ids.userB } });
    const created = platform.calls.find((call) => call.repository === 'proyecto' && call.method === 'crear');
    expect(String(created.args[0].usuario_id)).toBe(ids.userA);
  });

  test('un requisito no puede cambiarse de proyecto ni aprobarse desde el cliente', async () => {
    await platform.request('PUT', `/requerimientos/${ids.requirementA}`, { auth: token(ids.userA), body: { nombre: 'Editado', proyecto_id: ids.projectB, aprobado: true } });
    const changes = updatesOf('requerimiento')[0].args[1];
    expect(changes).toMatchObject({ nombre: 'Editado', aprobado: false });
    expect(changes.proyecto_id).toBeUndefined();
  });

  test('un diagrama solo admite contenido: la aprobación y la versión no se fijan desde el cliente', async () => {
    await platform.request('PUT', `/diagramas/${ids.diagramA}`, { auth: token(ids.userA), body: { titulo: 'Nuevo título', aprobado: true, version: 99, proyecto_id: ids.projectB, estado: 'aprobado' } });
    const changes = updatesOf('diagrama')[0].args[1];
    expect(changes.titulo).toBe('Nuevo título');
    expect(changes.proyecto_id).toBeUndefined();
    expect(changes.version).not.toBe(99);
    expect(changes.aprobado).not.toBe(true);
  });

  test('una fuente de otro proyecto no se borra con el identificador en la ruta de un proyecto propio', async () => {
    const response = await platform.request('DELETE', `/proyectos/${ids.projectA}/fuentes/${ids.sourceB}`, { auth: token(ids.userA) });
    // La eliminación es idempotente (200), pero sin borrar nada: la fuente de B sigue existiendo.
    expect(response.json).toMatchObject({ success: true, eliminado: false });
    expect(platform.calls.some((call) => call.repository === 'fuente' && call.method === 'eliminar')).toBe(false);
    expect(platform.data.fuente.some((source) => source.id === ids.sourceB)).toBe(true);
  });
});

describe('tokens de sesión', () => {
  let platform;
  beforeAll(async () => { platform = await startPlatform(); });
  afterAll(() => platform.close());
  const status = async (auth) => (await platform.request('GET', '/proyectos', { auth })).status;
  const forged = (header, payload) => `${Buffer.from(JSON.stringify(header)).toString('base64url')}.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.`;

  test('acepta un token válido y rechaza los caducados, de otra clave, de otro algoritmo o sin identificador', async () => {
    expect(await status(token(ids.userA))).toBe(200);
    expect(await status(token(ids.userA, { expiresIn: -10 }))).toBe(401);
    expect(await status(token(ids.userA, {}, 'otra-clave-distinta-de-la-del-servidor-0123456789'))).toBe(401);
    expect(await status(jwt.sign({ id: ids.userA }, SECRET, { algorithm: 'HS512' }))).toBe(401);
    expect(await status(forged({ alg: 'none', typ: 'JWT' }, { id: ids.userA }))).toBe(401);
    expect(await status(jwt.sign({ correo: 'x@example.test' }, SECRET, { algorithm: 'HS256' }))).toBe(401);
    expect(await status(jwt.sign({ id: { $ne: null } }, SECRET, { algorithm: 'HS256' }))).toBe(401);
    expect(await status('no-es-un-token')).toBe(401);
  });

  test('un token firmado con el antiguo secreto por defecto ya no sirve', async () => {
    expect(await status(token(ids.userA, {}, 'icase_secure_jwt_secret_key_2026'))).toBe(401);
  });
});

describe('secreto de sesión', () => {
  const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  afterAll(() => warn.mockRestore());

  test('en producción es obligatorio, largo y no puede parecerse a un valor de ejemplo', () => {
    expect(() => getJwtSecret({ NODE_ENV: 'production' })).toThrow('JWT_SECRET no está definido');
    for (const weak of ['corto', 'cambia_este_secreto_por_uno_aleatorio', 'icase_secure_jwt_secret_key_2026', 'replace-with-a-long-random-secret-value-1234', 'my-password-that-is-long-enough-0123456789']) {
      expect(() => getJwtSecret({ NODE_ENV: 'production', JWT_SECRET: weak })).toThrow('JWT_SECRET es inseguro');
    }
    const strong = 'k3J9xV7qLw2PzR8mN5tY1uB6cD4fH0aS';
    expect(getJwtSecret({ NODE_ENV: 'production', JWT_SECRET: strong })).toBe(strong);
  });

  test('en desarrollo sin secreto se usa uno aleatorio de este proceso y se avisa', () => {
    const first = getJwtSecret({ NODE_ENV: 'development' });
    expect(first).toMatch(/^[0-9a-f]{96}$/);
    expect(getJwtSecret({})).toBe(first);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('JWT_SECRET no está definido'));
  });

  test('el servidor no arranca en producción sin un secreto válido', () => {
    expect(() => createApp({ env: { NODE_ENV: 'production' } })).toThrow('JWT_SECRET no está definido');
    expect(() => createApp({ env: { NODE_ENV: 'production', JWT_SECRET: 'cambia_este_secreto_por_uno_aleatorio' } })).toThrow('JWT_SECRET es inseguro');
  });

  test('el código ya no contiene el secreto por defecto', () => {
    const source = fs.readFileSync(path.join(__dirname, '../src/infrastructure/middlewares/authMiddleware.js'), 'utf8');
    expect(source).not.toContain('icase_secure_jwt_secret_key');
  });
});

describe('registro e inicio de sesión', () => {
  const passwordHash = bcrypt.hashSync('Contraseña-correcta-1', 4);
  const userDoc = { password: passwordHash, toJSON: () => ({ id: ids.userA, correo: 'ana@example.test', nombre: 'Ana', apellido: 'Pérez' }) };
  let created;
  const usuario = () => ({
    obtenerPorCorreo: jest.fn(async (correo) => (typeof correo === 'string' && correo === 'ana@example.test' ? userDoc : null)),
    crear: jest.fn(async (data) => { created = data; return { id: ids.userB, ...data, password: undefined }; }),
    obtenerPorId: jest.fn(async () => null)
  });
  let platform;
  beforeEach(async () => { platform = await startPlatform({ usuario: usuario() }); created = null; });
  afterEach(() => platform.close());
  const valid = { nombre: 'Luis', apellido: 'Gómez', correo: 'Luis@Example.test', celular: '+593 99 123 4567', password: 'Contraseña-larga-1' };

  test('registra con datos válidos: correo en minúsculas, contraseña con hash y sesión de 12 horas', async () => {
    const response = await platform.request('POST', '/auth/registro', { body: valid });
    expect(response.status).toBe(201);
    expect(created.correo).toBe('luis@example.test');
    expect(created.password).not.toBe(valid.password);
    expect(await bcrypt.compare(valid.password, created.password)).toBe(true);
    const claims = jwt.verify(response.json.token, SECRET);
    expect(claims.exp - claims.iat).toBe(12 * 3600);
  });

  test.each([
    ['correo como objeto (inyección de operadores)', { correo: { $ne: null } }],
    ['nombre como objeto', { nombre: { $gt: '' } }],
    ['contraseña como lista', { password: ['x'] }],
    ['correo mal formado', { correo: 'no-es-correo' }],
    ['celular con letras', { celular: 'abc' }],
    ['contraseña de 7 caracteres', { password: '1234567' }],
    ['contraseña de más de 72 bytes', { password: 'ñ'.repeat(40) }],
    ['nombre demasiado largo', { nombre: 'x'.repeat(81) }]
  ])('rechaza el registro con %s', async (_name, change) => {
    const response = await platform.request('POST', '/auth/registro', { body: { ...valid, ...change } });
    expect(response.status).toBe(400);
    expect(created).toBeNull();
  });

  test('inicio de sesión: éxito, credenciales incorrectas y tipos inválidos', async () => {
    const ok = await platform.request('POST', '/auth/login', { body: { correo: 'ana@example.test', password: 'Contraseña-correcta-1' } });
    expect(ok.status).toBe(200);
    expect(ok.json.token).toBeDefined();
    expect(ok.json.usuario.password).toBeUndefined();
    expect((await platform.request('POST', '/auth/login', { body: { correo: 'ana@example.test', password: 'incorrecta' } })).status).toBe(401);
    expect((await platform.request('POST', '/auth/login', { body: { correo: 'nadie@example.test', password: 'cualquiera' } })).status).toBe(401);
    for (const body of [{ correo: { $ne: null }, password: 'x' }, { correo: 'ana@example.test', password: { $ne: null } }, {}, { correo: 'ana@example.test' }]) {
      const response = await platform.request('POST', '/auth/login', { body });
      expect(response.status).toBe(400);
    }
  });

  test('un correo inexistente cuesta lo mismo que uno existente (se compara contra un hash falso)', async () => {
    const compare = jest.spyOn(bcrypt, 'compare');
    await platform.request('POST', '/auth/login', { body: { correo: 'nadie@example.test', password: 'cualquiera' } });
    expect(compare).toHaveBeenCalledTimes(1);
    compare.mockRestore();
  });

  test('tras 5 intentos fallidos se bloquea, incluso con la contraseña correcta, y avisa cuánto esperar', async () => {
    const attempt = (password) => platform.request('POST', '/auth/login', { body: { correo: 'ana@example.test', password } });
    for (let index = 0; index < 5; index += 1) expect((await attempt('mala')).status).toBe(401);
    const blocked = await attempt('Contraseña-correcta-1');
    expect(blocked.status).toBe(429);
    expect(Number(blocked.headers.get('retry-after'))).toBeGreaterThan(0);
    // Otro correo desde la misma dirección sigue el límite propio.
    expect((await platform.request('POST', '/auth/login', { body: { correo: 'otra@example.test', password: 'x' } })).status).toBe(401);
  });

  test('un inicio de sesión correcto reinicia el contador de ese correo', async () => {
    const attempt = (password) => platform.request('POST', '/auth/login', { body: { correo: 'ana@example.test', password } });
    for (let index = 0; index < 4; index += 1) await attempt('mala');
    expect((await attempt('Contraseña-correcta-1')).status).toBe(200);
    for (let index = 0; index < 4; index += 1) expect((await attempt('mala')).status).toBe(401);
  });

  test('el registro masivo desde una misma dirección se frena', async () => {
    let last;
    for (let index = 0; index < 11; index += 1) last = await platform.request('POST', '/auth/registro', { body: { ...valid, correo: `u${index}@example.test`, password: 'corta' } });
    expect(last.status).toBe(429);
  });

  test('los errores internos no revelan detalles', async () => {
    const failing = { ...usuario(), obtenerPorCorreo: jest.fn(async () => { throw new Error('connect ECONNREFUSED 10.0.0.5:27017 secreto-interno'); }) };
    const other = await startPlatform({ usuario: failing });
    const error = jest.spyOn(console, 'error').mockImplementation(() => {});
    const response = await other.request('POST', '/auth/login', { body: { correo: 'ana@example.test', password: 'x' } });
    expect(response.status).toBe(500);
    expect(response.text).not.toContain('ECONNREFUSED');
    error.mockRestore();
    await other.close();
  });
});

describe('limitador de intentos', () => {
  test('bloquea al llegar al máximo, informa los segundos y se libera al pasar la ventana', () => {
    let now = 1000;
    const limiter = new RateLimiter({ max: 2, windowMs: 10000, now: () => now });
    expect(limiter.blockedFor('k')).toBe(0);
    limiter.fail('k'); limiter.fail('k');
    expect(limiter.blockedFor('k')).toBe(10);
    now += 4000;
    expect(limiter.blockedFor('k')).toBe(6);
    now += 7000;
    expect(limiter.blockedFor('k')).toBe(0);
    limiter.fail('k'); limiter.reset('k');
    expect(limiter.entries.size).toBe(0);
  });
});

describe('red y entrada', () => {
  test('no anuncia el framework y añade cabeceras defensivas', async () => {
    const platform = await startPlatform();
    const response = await platform.request('GET', '/health');
    expect(response.headers.get('x-powered-by')).toBeNull();
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect(response.headers.get('x-frame-options')).toBe('DENY');
    expect(response.headers.get('cache-control')).toBe('no-store');
    await platform.close();
  });

  test('CORS solo admite los orígenes configurados', async () => {
    const platform = await startPlatform({ env: { CORS_ORIGINS: 'https://app.example.test' } });
    const allowed = await platform.request('OPTIONS', '/proyectos', { headers: { Origin: 'https://app.example.test', 'Access-Control-Request-Method': 'GET' } });
    expect(allowed.headers.get('access-control-allow-origin')).toBe('https://app.example.test');
    const denied = await platform.request('OPTIONS', '/proyectos', { headers: { Origin: 'https://malo.example.test', 'Access-Control-Request-Method': 'GET' } });
    expect(denied.headers.get('access-control-allow-origin')).toBeNull();
    await platform.close();
  });

  test('en producción sin CORS_ORIGINS no se admite ningún origen externo', async () => {
    const platform = await startPlatform({ env: { NODE_ENV: 'production', JWT_SECRET: 'k3J9xV7qLw2PzR8mN5tY1uB6cD4fH0aS' } });
    process.env.JWT_SECRET = 'k3J9xV7qLw2PzR8mN5tY1uB6cD4fH0aS';
    const response = await platform.request('OPTIONS', '/proyectos', { headers: { Origin: 'http://localhost:5173', 'Access-Control-Request-Method': 'GET' } });
    expect(response.headers.get('access-control-allow-origin')).toBeNull();
    await platform.close();
    process.env.JWT_SECRET = SECRET;
  });

  test('cuerpo demasiado grande, JSON mal formado y rutas inexistentes responden JSON claro', async () => {
    const platform = await startPlatform({ env: { JSON_LIMIT: '1kb' } });
    const big = await platform.request('POST', '/auth/login', { body: { correo: 'a@example.test', password: 'x'.repeat(5000) } });
    expect(big.status).toBe(413);
    expect(big.json.error).toContain('demasiado grande');
    const bad = await platform.request('POST', '/auth/login', { body: '{"correo": ' });
    expect(bad.status).toBe(400);
    expect(bad.json.error).toContain('JSON');
    const missing = await platform.request('GET', '/no-existe', { auth: token(ids.userA) });
    expect(missing.status).toBe(404);
    expect(missing.json.error).toBe('Ruta no encontrada');
    await platform.close();
  });

  test('las subidas rechazan formatos no admitidos antes de guardar nada', async () => {
    const platform = await startPlatform();
    const uploads = path.join(__dirname, '../uploads');
    const before = fs.readdirSync(uploads).length;
    const form = new FormData();
    form.append('archivo', new Blob(['MZ ejecutable']), 'programa.exe');
    const response = await fetch(`${platform.base}/proyectos/${ids.projectA}/fuentes`, { method: 'POST', headers: { Authorization: `Bearer ${token(ids.userA)}` }, body: form });
    const body = await response.json();
    expect(response.status).toBe(400);
    expect(body.error).toContain('Tipo de archivo no admitido');
    expect(fs.readdirSync(uploads).length).toBe(before);
    const foreign = new FormData();
    foreign.append('archivo', new Blob(['hola']), 'nota.txt');
    const intruder = await fetch(`${platform.base}/proyectos/${ids.projectA}/fuentes`, { method: 'POST', headers: { Authorization: `Bearer ${token(ids.userB)}` }, body: foreign });
    expect(intruder.status).toBe(404);
    expect(fs.readdirSync(uploads).length).toBe(before);
    await platform.close();
  });
});
