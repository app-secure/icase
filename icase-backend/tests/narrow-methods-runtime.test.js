const runtime = require('../src/infrastructure/services/SamplePayload');
const { boot, useEnvironment, ENV } = require('./helpers/boot-generated-app');

const requirements = [
  { aprobado: true, tipo: 'RF', identificador: 'RF-01', nombre: 'Consultar reportes', actores: ['Lector'] },
  { aprobado: true, tipo: 'RF', identificador: 'RF-02', nombre: 'Gestionar notas', actores: ['Lector'] }
];
const control = {
  autenticacion: { metodo: 'jwt', expiracion: '1h' },
  roles: [{ nombre: 'Lector', incluir: true, autoregistro: false }],
  permisos: ['RF-01', 'RF-02'].map((operacion) => ({ operacion, rol: 'lector', metodos: ['GET', 'POST', 'PATCH', 'DELETE'] }))
};

const cleanups = [];
useEnvironment();
afterEach(async () => { while (cleanups.length) await cleanups.pop()(); });

const start = async () => {
  const booted = await boot({ decisiones: { control_acceso: control }, requerimientos: requirements, verbosPorRf: { 'RF-01': ['consultar'] }, cleanups });
  const access = await runtime.setupAccess(booted.base, { base: booted.base, adminEmail: ENV.ADMIN_EMAIL, adminPassword: ENV.ADMIN_PASSWORD, roles: [{ id: 'lector' }] });
  cleanups.push(access.cleanup);
  return { booted, access };
};

describe('propiedad de registros con una operación hija de solo consulta (HTTP real)', () => {
  const plantuml = '@startuml\nclass Cliente {\n+String id\n+String nombre\n}\nclass Pedido {\n+String id\n+int cantidad\n}\nPedido "0..*" --> "1" Cliente : de\n@enduml';
  const rfs = [
    { aprobado: true, tipo: 'RF', identificador: 'RF-01', nombre: 'Gestionar cliente', actores: ['Vendedor'] },
    { aprobado: true, tipo: 'RF', identificador: 'RF-02', nombre: 'Gestionar pedido', actores: ['Vendedor'] }
  ];
  const own = {
    autenticacion: { metodo: 'jwt', expiracion: '1h' },
    roles: [{ nombre: 'Vendedor', incluir: true, autoregistro: false }],
    permisos: ['RF-01', 'RF-02'].map((operacion) => ({ operacion, rol: 'vendedor', metodos: ['GET', 'POST', 'PATCH', 'DELETE'], alcance: 'propios' }))
  };

  test('exerciseOwnership no intenta crear en una operación hija que ya no admite POST', async () => {
    const booted = await boot({ decisiones: { control_acceso: own }, requerimientos: rfs, plantuml, verbosPorRf: { 'RF-02': ['consultar'] }, cleanups });
    const access = await runtime.setupAccess(booted.base, { base: booted.base, adminEmail: ENV.ADMIN_EMAIL, adminPassword: ENV.ADMIN_PASSWORD, roles: [{ id: 'vendedor' }] });
    cleanups.push(access.cleanup);
    const operations = booted.manifest.operations;
    expect(operations.find((item) => item.id === 'RF-02').methods).toEqual(['GET']);
    const parent = operations.find((item) => item.id === 'RF-01');
    await expect(runtime.exerciseOwnership(access, operations, parent, booted.manifest.auth.operaciones[parent.key], { base: booted.base, associations: [], auth: booted.manifest.auth })).resolves.toBeUndefined();
  });
});

describe('backend generado con una operación solo de consulta (HTTP real)', () => {
  test('el contrato y el OpenAPI declaran solo GET para la operación de consulta y CRUD para la otra', async () => {
    const { booted } = await start();
    const methods = Object.fromEntries(booted.manifest.operations.map((operation) => [operation.id, operation.methods]));
    expect(methods).toEqual({ 'RF-01': ['GET'], 'RF-02': ['GET', 'POST', 'PATCH', 'DELETE'] });
    expect(Object.keys(booted.openapi.paths['/api/operations/rf-01'])).toEqual(['get']);
    expect(booted.openapi.paths['/api/operations/rf-01/{id}']).toBeUndefined();
    expect(Object.keys(booted.openapi.paths['/api/operations/rf-02'])).toEqual(expect.arrayContaining(['get', 'post']));
  });

  test('un rol no administrador solo puede consultar la operación de consulta: el resto responde 403', async () => {
    const { access } = await start();
    const lector = access.roles.lector.api;
    expect((await lector('/api/operations/rf-01')).status).toBe(200);
    expect((await lector('/api/operations/rf-01', 'POST', { valor: 'x' })).status).toBe(403);
    expect((await lector('/api/operations/rf-01/1', 'PATCH', { valor: 'x' })).status).toBe(403);
    expect((await lector('/api/operations/rf-01/1', 'DELETE')).status).toBe(403);
    const created = await lector('/api/operations/rf-02', 'POST', { valor: 'x' });
    expect(created.status).toBe(201);
    await access.admin('/api/operations/rf-02/' + created.data.id, 'DELETE');
  });

  test('límite conocido: el administrador conserva acceso total aunque la operación declare solo GET', async () => {
    const { access } = await start();
    const created = await access.admin('/api/operations/rf-01', 'POST', { valor: 'x' });
    expect(created.status).toBe(201);
    await access.admin('/api/operations/rf-01/' + created.data.id, 'DELETE');
  });

  test('las pruebas generadas ejercen solo lo declarado y pasan contra el backend real', async () => {
    const { booted, access } = await start();
    const operation = booted.manifest.operations.find((item) => item.id === 'RF-01');
    await runtime.exerciseOperation(access.admin, booted.manifest.operations, operation);
    await runtime.exerciseAccess(access, booted.manifest.operations, operation, booted.manifest.auth.operaciones['rf-01']);
    await runtime.exerciseOpenApi(access.admin, booted.manifest.operations, booted.manifest.auth);
  });
});
