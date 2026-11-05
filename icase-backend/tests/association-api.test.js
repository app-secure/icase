const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Data = require('../src/infrastructure/services/BackendDataLayerGenerator');
const Extractor = require('../src/infrastructure/services/DomainModelExtractor');
const Builder = require('../src/infrastructure/services/ApplicationContractBuilder');
const Generator = require('../src/infrastructure/services/GenericBackendGenerator');
const { HttpError } = require('../src/infrastructure/templates/data-layer/store-support');
const { boot } = require('./helpers/boot-generated-app');
const domain = 'class Alumno\nclass Curso\nAlumno "*" -- "*" Curso : matriculas';
const requirements = [{ identificador: 'RF-01', nombre: 'Gestionar alumnos', tipo: 'RF', aprobado: true }, { identificador: 'RF-02', nombre: 'Gestionar cursos', tipo: 'RF', aprobado: true }];
function setup(database = 'postgres') {
  const contract = new Builder().build({ proyecto: {}, requerimientos: requirements, domainModel: new Extractor().extract(domain) });
  const model = new Data().build({ contract, database, modules: [] }).model;
  const sandbox = { module: { exports: {} }, require: (name) => name === './model' ? model : { HttpError } };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../src/infrastructure/templates/data-layer/associations.js'), 'utf8'), sandbox);
  const connection = { query: jest.fn(async (sql) => {
    const rows = sql.startsWith('SELECT id') ? [{ id: '1' }] : sql.startsWith('SELECT source_id') ? [{ source_id: '1', target_id: '2' }] : [];
    return database === 'postgres' ? { rows } : [rows];
  }), release: jest.fn() };
  const store = { pool: { connect: async () => connection, getConnection: async () => connection } };
  return { model, connection, store, api: sandbox.module.exports, key: model.associations[0].table };
}
describe('API de asociaciones SQL', () => {
  test.each(['PostgreSQL', 'MySQL'])('Spring publica el mismo contrato de vínculos en %s', (database) => {
    const files = new Generator().generate({ proyecto: {}, requirements, domainModel: new Extractor().extract(domain), stack: { backend: 'Spring Boot', base_datos: database } });
    const read = (name) => files.find((f) => f.ruta === 'backend/' + name)?.contenido;
    const manifest = JSON.parse(read('icase.manifest.json'));
    const relation = manifest.associations[0];
    expect(relation.endpoints_generated).toBe(true);
    expect(relation.operations).toEqual([['rf-01'], ['rf-02']]);
    expect(read('src/main/java/app/AssociationsController.java')).toContain('@PostMapping("/api/associations/{relation}")');
    expect(read('src/test/java/app/AssociationStoreTest.java')).toBeTruthy();
    expect(JSON.parse(read('openapi.json')).paths['/api/associations/' + relation.table].get.parameters.some((p) => p.name === 'after_target_id')).toBe(true);
  });
  test.each(['postgres', 'mysql'])('vincula y desvincula transaccionalmente en %s', async (database) => {
    const { api, store, key, connection } = setup(database);
    expect(await api(store, 'link', key, { source_id: '1', target_id: '2' })).toMatchObject({ associated: true });
    expect(connection.query.mock.calls[0][0]).toBe('BEGIN');
    expect(connection.query.mock.calls.some(([sql]) => sql.includes(database === 'postgres' ? 'ON CONFLICT' : 'ON DUPLICATE KEY'))).toBe(true);
    expect(connection.query.mock.calls.at(-1)[0]).toBe('COMMIT');
    expect(await api(store, 'unlink', key, { source_id: '1', target_id: '2' })).toMatchObject({ associated: false });
    expect(connection.release).toHaveBeenCalledTimes(2);
  });
  test('lista resultados acotados con IDs como cadenas', async () => {
    const { api, store, key } = setup();
    expect(await api(store, 'list', key, { source_id: '1', limit: '10' })).toEqual({ data: [{ source_id: '1', target_id: '2' }], has_more: false });
  });
  test.each(['postgres', 'mysql'])('pagina con cursor parametrizado en %s', async (database) => {
    const { api, store, key, connection } = setup(database);
    await api(store, 'list', key, { source_id: '1', after_target_id: '999', limit: '10' });
    const query = connection.query.mock.calls.find(([sql]) => sql.startsWith('SELECT source_id'));
    expect(query[0]).toContain('target_id >');
    expect(query[1]).toEqual(['1', '999', 11]);
  });
  test.each([{}, { source_id: '1', target_id: '2;DROP TABLE' }, { source_id: 1, target_id: '2' }, { source_id: '1', target_id: '9223372036854775808' }, { source_id: '1', target_id: '2', table: 'otra' }])('rechaza entradas inválidas %j antes de consultar SQL', async (input) => {
    const { api, store, key, connection } = setup();
    await expect(api(store, 'link', key, input)).rejects.toMatchObject({ status: 400 });
    expect(connection.query).not.toHaveBeenCalled();
  });
  test('revierte y libera conexión si un extremo no existe', async () => {
    const { api, store, key, connection } = setup();
    connection.query.mockImplementation(async (sql) => ({ rows: [] }));
    await expect(api(store, 'link', key, { source_id: '1', target_id: '2' })).rejects.toMatchObject({ status: 404 });
    expect(connection.query.mock.calls.at(-1)[0]).toBe('ROLLBACK');
    expect(connection.release).toHaveBeenCalled();
  });
  test('no acepta relaciones inventadas', async () => {
    const { api, store, key } = setup('mongodb');
    await expect(api(store, 'link', 'inventada', {})).rejects.toMatchObject({ status: 404 });
  });
  test('autoriza vínculos solo con permisos en ambos extremos', () => {
    const { model, key } = setup();
    const policy = { habilitada: true, operaciones: { 'rf-01': { lector: ['GET'], editor: ['GET', 'PATCH'] }, 'rf-02': { lector: ['GET'], editor: ['GET', 'PATCH'] } } };
    const sandbox = { module: { exports: {} }, process, Buffer, require: (name) => {
      if (name === './policy') return policy;
      if (name === './ownership') return require('../src/infrastructure/templates/auth/ownership');
      if (name === '../data/model') return model;
      if (name === '../data/store-support') return { HttpError };
      return require(name);
    } };
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../src/infrastructure/templates/auth/auth-core.js'), 'utf8'), sandbox);
    const auth = sandbox.module.exports.createAuth({ store: {} });
    const route = '/api/associations/' + key;
    expect(() => auth.authorize({ rol: 'lector' }, 'GET', route)).not.toThrow();
    expect(() => auth.authorize({ rol: 'lector' }, 'POST', route)).toThrow('ambos extremos');
    expect(() => auth.authorize({ rol: 'lector' }, 'POST', route.replace('rel_', 'rel%5F'))).toThrow('ambos extremos');
    expect(() => auth.authorize({ rol: 'editor' }, 'POST', route)).not.toThrow();
    delete policy.operaciones['rf-02'].editor;
    expect(() => auth.authorize({ rol: 'editor' }, 'DELETE', route)).toThrow('ambos extremos');
    expect(() => auth.authorize({ rol: 'administrador' }, 'DELETE', route)).not.toThrow();
  });
  test.each(['Express', 'NestJS'])('exporta rutas, metadata y OpenAPI para %s', async (backend) => {
    const files = new Generator().generate({ proyecto: {}, requirements, domainModel: new Extractor().extract(domain), stack: { backend, base_datos: 'PostgreSQL' } });
    const read = (name) => files.find((f) => f.ruta === 'backend/' + name).contenido;
    const manifest = JSON.parse(read('icase.manifest.json'));
    const key = manifest.storage.associations[0].table;
    expect(manifest.storage.associations[0].endpoints_generated).toBe(true);
    expect(manifest.associations[0].operations).toEqual([['rf-01'], ['rf-02']]);
    expect(JSON.parse(read('openapi.json')).paths['/api/associations/' + key].post).toBeTruthy();
    expect(read(backend === 'Express' ? 'src/app.js' : 'src/app.controller.ts')).toContain('associations/:relation');
  });
  test('las rutas Express ejecutan el servicio generado por HTTP', async () => {
    const cleanups = [];
    try {
      const instance = await boot({ requerimientos: requirements, plantuml: domain, cleanups });
      const fixture = setup();
      instance.app.locals.store.pool = fixture.store.pool;
      const key = instance.manifest.storage.associations[0].table;
      const response = await fetch(instance.base + '/api/associations/' + key, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ source_id: '1', target_id: '2' }) });
      expect(response.status).toBe(200);
      expect((await response.json()).associated).toBe(true);
    } finally { for (const cleanup of cleanups.reverse()) await cleanup(); }
  });
});
