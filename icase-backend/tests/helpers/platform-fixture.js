// Plataforma iCase completa con repositorios en memoria: sirve para probar autenticación y autorización por HTTP real.
const http = require('node:http');
const jwt = require('jsonwebtoken');
const createApp = require('../../src/app');

const SECRET = 'secreto-de-pruebas-de-la-plataforma-0123456789';
const ids = {
  userA: 'a0a0a0a0a0a0a0a0a0a0a0a0', userB: 'b0b0b0b0b0b0b0b0b0b0b0b0',
  projectA: 'a1a1a1a1a1a1a1a1a1a1a1a1', projectB: 'b1b1b1b1b1b1b1b1b1b1b1b1', projectOrphan: 'c1c1c1c1c1c1c1c1c1c1c1c1',
  requirementA: 'a2a2a2a2a2a2a2a2a2a2a2a2', diagramA: 'a3a3a3a3a3a3a3a3a3a3a3a3', sourceA: 'a4a4a4a4a4a4a4a4a4a4a4a4',
  jobA: 'a5a5a5a5a5a5a5a5a5a5a5a5', artifactA: 'a6a6a6a6a6a6a6a6a6a6a6a6',
  requirementB: 'b2b2b2b2b2b2b2b2b2b2b2b2', sourceB: 'b4b4b4b4b4b4b4b4b4b4b4b4', requirementOrphan: 'c2c2c2c2c2c2c2c2c2c2c2c2'
};

const token = (userId, options = {}, secret = SECRET) => jwt.sign({ id: userId, correo: `${userId}@example.test`, nombre: 'Usuario', apellido: 'Prueba' }, secret, { algorithm: 'HS256', expiresIn: '1h', ...options });

function fakeRepository(name, rows, calls) {
  const base = {
    obtenerPorId: async (id) => rows.find((row) => String(row.id) === String(id)) || null,
    listar: async (filter = {}) => rows.filter((row) => Object.entries(filter).every(([key, value]) => String(row[key]) === String(value))),
    listarPorProyecto: async (projectId) => rows.filter((row) => String(row.proyecto_id) === String(projectId)),
    actualizar: async (id, data) => {
      const row = rows.find((item) => String(item.id) === String(id));
      if (row) Object.assign(row, data);
      return row ? { ...row } : null;
    },
    crear: async (data) => { const row = { id: `n${rows.length}`.padEnd(24, '0'), ...data }; rows.push(row); return { ...row }; }
  };
  return new Proxy(base, {
    get(target, property) {
      if (typeof property === 'symbol' || property === 'then') return undefined;
      const method = target[property] || (async () => null);
      return async (...args) => { calls.push({ repository: name, method: String(property), args }); return method(...args); };
    }
  });
}

function buildData() {
  return {
    proyecto: [
      { id: ids.projectA, usuario_id: ids.userA, nombre: 'Proyecto de A', estado_fase: 'insumos_pendientes' },
      { id: ids.projectB, usuario_id: ids.userB, nombre: 'Proyecto de B', estado_fase: 'insumos_pendientes' },
      { id: ids.projectOrphan, usuario_id: null, nombre: 'Proyecto sin dueño', estado_fase: 'insumos_pendientes' }
    ],
    requerimiento: [
      { id: ids.requirementA, proyecto_id: ids.projectA, nombre: 'Requisito de A' },
      { id: ids.requirementB, proyecto_id: ids.projectB, nombre: 'Requisito de B' },
      { id: ids.requirementOrphan, proyecto_id: ids.projectOrphan, nombre: 'Requisito huérfano' }
    ],
    diagrama: [{ id: ids.diagramA, proyecto_id: ids.projectA, tipo: 'casos_de_uso', codigo_plantuml: '@startuml\n@enduml' }],
    fuente: [
      { id: ids.sourceA, proyecto_id: ids.projectA, nombre_archivo: 'a.txt' },
      { id: ids.sourceB, proyecto_id: ids.projectB, nombre_archivo: 'b.txt' }
    ],
    trabajoGeneracion: [{ id: ids.jobA, proyecto_id: ids.projectA }],
    artefactoGenerado: [{ id: ids.artifactA, proyecto_id: ids.projectA, tipo: 'codigo_backend' }]
  };
}

async function startPlatform({ env = {}, usuario = null } = {}) {
  const data = buildData();
  const calls = [];
  const repositories = Object.fromEntries(Object.entries(data).map(([name, rows]) => [name, fakeRepository(name, rows, calls)]));
  for (const name of ['usuario', 'estandar', 'casoDeUso', 'diseno', 'planCodificacion']) repositories[name] = fakeRepository(name, [], calls);
  if (usuario) repositories.usuario = usuario;
  const merged = { ...process.env, JWT_SECRET: SECRET, NODE_ENV: 'test', ...env };
  Object.assign(process.env, { JWT_SECRET: merged.JWT_SECRET });
  const { app } = createApp({ repositories, env: merged });
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const request = async (method, path, { auth, body, headers = {} } = {}) => {
    const response = await fetch(base + path, {
      method,
      headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(auth ? { Authorization: `Bearer ${auth}` } : {}), ...headers },
      body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body)
    });
    const text = await response.text();
    let json; try { json = JSON.parse(text); } catch { json = undefined; }
    return { status: response.status, headers: response.headers, json, text };
  };
  return { app, data, calls, repositories, request, base, close: () => new Promise((resolve) => server.close(resolve)) };
}

/** Todas las rutas registradas en la aplicación, con su ruta completa. */
function listRoutes(app) {
  const routes = [];
  const mountPath = (layer) => layer.regexp.source.replace('^\\/?(?=\\/|$)', '').replace(/\\\/\?\(\?=\\\/\|\$\)$/, '').replace(/^\^/, '').replace(/\\\//g, '/');
  const walk = (stack, prefix) => {
    for (const layer of stack) {
      if (layer.route) for (const method of Object.keys(layer.route.methods)) routes.push({ method: method.toUpperCase(), path: prefix + layer.route.path });
      else if (layer.name === 'router' && layer.handle.stack) walk(layer.handle.stack, prefix + mountPath(layer));
    }
  };
  walk(app._router.stack, '');
  return routes;
}

module.exports = { startPlatform, listRoutes, token, ids, SECRET };
