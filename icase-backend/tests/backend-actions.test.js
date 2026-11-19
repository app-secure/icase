const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const BackendScaffoldGenerator = require('../src/infrastructure/services/BackendScaffoldGenerator');
const AccessControlService = require('../src/core/services/AccessControlService');

const PLANTUML = `@startuml
enum EstadoMesa {
  LIBRE
  OCUPADA
}
class Empleado {
  +String id
  +String email
}
class Mesa {
  +String id
  +int numero
  +EstadoMesa estado
}
Empleado "1" --> "0..*" Mesa
@enduml`;

const dominio = { tipo: 'clases_dominio', aprobado: true, estado: 'aprobado', desactualizado: false, codigo_plantuml: PLANTUML };
const rf = [
  { aprobado: true, tipo: 'RF', identificador: 'RF-01', nombre: 'Gestión de empleados', descripcion: 'Empleado', actores: ['Mesero'] },
  { aprobado: true, tipo: 'RF', identificador: 'RF-04', nombre: 'Consulta de mesas asignadas', descripcion: 'El mesero consulta sus mesas.', actores: ['Mesero'] }
];
const operaciones = [
  { nombre: 'listarMesasAsignadas', rf: 'RF-04', tipo: 'consulta', entidad: 'Mesa', estado_decision: 'confirmado', origen: 'ia', filtros: [{ campo: 'empleado_id', operador: '==', origen: 'sesion', valor: 'usuario.id' }], entradas: [], salida: ['numero', 'estado'] },
  { nombre: 'mesasConAforo', rf: 'RF-04', tipo: 'consulta', entidad: 'Mesa', estado_decision: 'confirmado', origen: 'ia', filtros: [{ campo: 'numero', operador: '>=', origen: 'parametro', valor: 'minimo' }], entradas: [], salida: ['numero'] },
  { nombre: 'ocuparMesa', rf: 'RF-04', tipo: 'transicion', entidad: 'Mesa', estado_decision: 'confirmado', origen: 'ia', filtros: [], entradas: [], salida: [], transicion: { campo: 'estado', de: ['LIBRE'], a: 'OCUPADA' } },
  { nombre: 'registrarMesa', rf: 'RF-04', tipo: 'crear', entidad: 'Mesa', estado_decision: 'confirmado', origen: 'ia', filtros: [], entradas: ['numero', 'estado'], salida: [] }
];

const tmpDirs = [];
afterAll(() => tmpDirs.forEach((dir) => fs.rmSync(dir, { recursive: true, force: true })));

const generar = async (backend = 'Node.js + Express', { acceso = true } = {}) => {
  const decisiones = { stack_tecnologico: { backend, base_datos: 'PostgreSQL' }, especificacion_aplicacion: { version: 1, operaciones, pantallas: [] } };
  if (acceso) decisiones.control_acceso = (() => { const r = new AccessControlService().proponer({ requerimientos: rf }); return r.valor || r.propuesta || r; })();
  const { archivos, advertencias } = await new BackendScaffoldGenerator().generar({
    proyecto: { nombre: 'Demo' }, insumos: { decisiones, requerimientos: rf, diagramaDominio: dominio }, versionesOrigen: {}
  });
  return { archivos, advertencias, file: (ruta) => archivos.find((item) => item.ruta === ruta)?.contenido };
};

const cargarRuntime = (contenido) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'icase-actions-'));
  fs.writeFileSync(path.join(dir, 'actions.js'), contenido);
  return require(path.join(dir, 'actions.js'));
};

const tienda = (tablas) => ({
  list: jest.fn(async (cap, query = {}) => (tablas[cap] || []).filter((row) => Object.entries(query).every(([k, v]) => String(row.data[k]) === String(v)))),
  getRecord: jest.fn(async (cap, id) => (tablas[cap] || []).find((row) => row.id === id) || null),
  create: jest.fn(async (cap, values) => ({ id: '99', data: values })),
  update: jest.fn(async (cap, id, values) => { const row = (tablas[cap] || []).find((item) => item.id === id); if (!row) return null; Object.assign(row.data, values); return row; }),
  remove: jest.fn(async () => true)
});

describe('operaciones de negocio en el backend generado', () => {
  test('Express: genera runtime, rutas, permisos, OpenAPI y manifiesto', async () => {
    const { file } = await generar();
    expect(file('backend/src/actions/actions.js')).toContain('listarMesasAsignadas');
    expect(file('backend/src/app.js')).toContain("app.get('/api/actions/:name',runAction)");
    expect(() => new (require('node:vm').Script)(file('backend/src/app.js'))).not.toThrow();
    expect(() => new (require('node:vm').Script)(file('backend/src/actions/actions.js'))).not.toThrow();
    expect(file('backend/src/auth/auth-core.js')).toContain("require('../actions/actions')");
    const openapi = JSON.parse(file('backend/openapi.json'));
    expect(openapi.paths['/api/actions/listar-mesas-asignadas'].get.operationId).toBe('listarMesasAsignadas');
    expect(openapi.paths['/api/actions/ocupar-mesa/{id}'].post.responses[409]).toBeDefined();
    const manifest = JSON.parse(file('backend/icase.manifest.json'));
    expect(manifest.endpoints).toContain('/api/actions/ocupar-mesa/:id');
  });

  test('NestJS: el controlador expone las operaciones', async () => {
    const { file } = await generar('NestJS');
    expect(file('backend/src/app.controller.ts')).toContain("@Get('api/actions/:name')");
    expect(file('backend/src/actions/actions.js')).toContain('ocuparMesa');
  });

  test('sin especificación confirmada no se genera nada nuevo', async () => {
    const { archivos } = await new BackendScaffoldGenerator().generar({
      proyecto: { nombre: 'Demo' }, versionesOrigen: {},
      insumos: { decisiones: { stack_tecnologico: { backend: 'Node.js + Express', base_datos: 'PostgreSQL' }, especificacion_aplicacion: { operaciones: operaciones.map((op) => ({ ...op, estado_decision: 'pendiente' })) } }, requerimientos: rf, diagramaDominio: dominio }
    });
    expect(archivos.some((item) => item.ruta === 'backend/src/actions/actions.js')).toBe(false);
  });

  test('la consulta filtra por la persona de la sesión resuelta por su correo y proyecta la salida', async () => {
    const { file } = await generar();
    const runtime = cargarRuntime(file('backend/src/actions/actions.js'));
    const store = tienda({
      'rf-01': [{ id: '7', data: { email: 'ana@x.com' } }, { id: '8', data: { email: 'luis@x.com' } }],
      'rf-04': [{ id: '1', data: { numero: 1, estado: 'LIBRE', empleado_id: '7' } }, { id: '2', data: { numero: 2, estado: 'LIBRE', empleado_id: '8' } }]
    });
    const def = runtime.find('listar-mesas-asignadas', 'GET', false);
    expect(def.capability).toBe('rf-04');
    expect(def.filters[0].via).toEqual({ capability: 'rf-01', campo: 'email' });
    expect(await runtime.run(store, def, { user: { id: 'u1', email: 'ana@x.com', rol: 'mesero' } })).toEqual([{ id: '1', numero: 1, estado: 'LIBRE' }]);
    // Sin registro asociado a la sesión no se devuelve nada (no todo).
    expect(await runtime.run(store, def, { user: { id: 'u2', email: 'otra@x.com' } })).toEqual([]);
    await expect(runtime.run(store, def, {})).rejects.toMatchObject({ status: 401 });
  });

  test('filtros por parámetro y comparaciones se aplican; sin parámetro no restringen', async () => {
    const { file } = await generar();
    const runtime = cargarRuntime(file('backend/src/actions/actions.js'));
    const store = tienda({ 'rf-04': [{ id: '1', data: { numero: 1 } }, { id: '2', data: { numero: 5 } }] });
    const def = runtime.find('mesas-con-aforo', 'GET', false);
    expect(await runtime.run(store, def, { query: { minimo: '3' } })).toEqual([{ id: '2', numero: 5 }]);
    expect((await runtime.run(store, def, { query: {} })).length).toBe(2);
  });

  test('la transición valida el estado de origen y los campos de entrada se limitan a los declarados', async () => {
    const { file } = await generar();
    const runtime = cargarRuntime(file('backend/src/actions/actions.js'));
    const store = tienda({ 'rf-04': [{ id: '1', data: { estado: 'LIBRE' } }, { id: '2', data: { estado: 'OCUPADA' } }] });
    const ocupar = runtime.find('ocupar-mesa', 'POST', true);
    expect(await runtime.run(store, ocupar, { id: '1' })).toMatchObject({ id: '1', estado: 'OCUPADA' });
    await expect(runtime.run(store, ocupar, { id: '2' })).rejects.toMatchObject({ status: 409 });
    await expect(runtime.run(store, ocupar, { id: '404' })).rejects.toMatchObject({ status: 404 });
    const crear = runtime.find('registrar-mesa', 'POST', false);
    await runtime.run(store, crear, { body: { numero: 3, estado: 'LIBRE', admin: true } });
    expect(store.create).toHaveBeenCalledWith('rf-04', { numero: 3, estado: 'LIBRE' }, null);
    await expect(runtime.run(store, crear, { body: { admin: true } })).rejects.toMatchObject({ status: 400 });
  });

  test('el permiso de una operación es el del CRUD de su requisito', async () => {
    const { file } = await generar();
    const dir = fs.mkdtempSync(path.join(__dirname, '..', '.tmp-icase-auth-'));
    tmpDirs.push(dir); // dentro del paquete para resolver jsonwebtoken
    for (const ruta of ['auth/auth-core.js', 'auth/policy.js', 'auth/ownership.js', 'actions/actions.js', 'data/model.js', 'data/store-support.js']) {
      fs.mkdirSync(path.dirname(path.join(dir, ruta)), { recursive: true });
      fs.writeFileSync(path.join(dir, ruta), file(`backend/src/${ruta}`));
    }
    const { createAuth } = require(path.join(dir, 'auth/auth-core.js'));
    const policy = require(path.join(dir, 'auth/policy.js'));
    const auth = createAuth({ store: {} });
    const rol = Object.keys(policy.operaciones['rf-04']).find((item) => item !== 'administrador');
    expect(() => auth.authorize({ rol }, 'GET', '/api/actions/listar-mesas-asignadas')).not.toThrow();
    expect(() => auth.authorize({ rol: 'intruso' }, 'GET', '/api/actions/listar-mesas-asignadas')).toThrow(/permiso/);
    expect(() => auth.authorize({ rol: 'administrador' }, 'POST', '/api/actions/ocupar-mesa/1')).not.toThrow();
  });

  test('con Spring se conserva el CRUD genérico y se avisa', async () => {
    const { archivos, advertencias } = await generar('Java + Spring Boot', { acceso: false });
    expect(archivos.some((item) => item.ruta.endsWith('actions.js'))).toBe(false);
    expect(advertencias.join(' ')).toMatch(/Spring/);
  });
});

describe('etiquetas de referencias en las consultas', () => {
  const load = (definitions) => {
    const source = fs.readFileSync(path.join(__dirname, '../src/infrastructure/templates/actions/actions-runtime.js'), 'utf8').replace('__DEFINITIONS__', JSON.stringify(definitions));
    const module = { exports: {} };
    new Function('module', 'exports', 'require', source)(module, module.exports, require);
    return module.exports;
  };
  const def = { name: 'listarPedidos', type: 'consulta', method: 'GET', byId: false, capability: 'rf-15', filters: [], inputs: [], output: ['total', 'mesa_id'], refs: { mesa_id: 'rf-04' } };

  test('añade el nombre legible del registro referido, no solo su identificador', async () => {
    const { run } = load([def]);
    const store = { list: async (capability) => (capability === 'rf-04' ? [{ id: 7, data: { numero: 'Mesa 3', zona: 'Terraza' } }] : [{ id: 1, data: { total: 20, mesa_id: 7, secreto: 'x' } }]) };
    expect(await run(store, def)).toEqual([{ id: 1, total: 20, mesa_id: 7, mesa_id__etiqueta: 'Mesa 3' }]);
  });

  test('si la referencia no se puede leer, devuelve la fila sin etiqueta', async () => {
    const { run } = load([def]);
    const store = { list: async (capability) => { if (capability === 'rf-04') throw new Error('sin acceso'); return [{ id: 1, data: { total: 20, mesa_id: 7 } }]; } };
    expect(await run(store, def)).toEqual([{ id: 1, total: 20, mesa_id: 7 }]);
  });
});
