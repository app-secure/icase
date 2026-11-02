const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { ObjectId } = require('mongodb');
const Generator = require('../src/infrastructure/services/GenericBackendGenerator');
const Infrastructure = require('../src/infrastructure/services/InfrastructureGenerator');
const Extractor = require('../src/infrastructure/services/DomainModelExtractor');
const { HttpError } = require('../src/infrastructure/templates/data-layer/store-support');
const requirements = [{ tipo: 'RF', aprobado: true, identificador: 'RF-01', nombre: 'Gestionar autores' }, { tipo: 'RF', aprobado: true, identificador: 'RF-02', nombre: 'Gestionar libros' }];
const files = new Generator().generate({ proyecto: { nombre: 'Biblioteca' }, requirements, domainModel: new Extractor().extract('class Autor\nclass Libro\nAutor "*" -- "*" Libro'), stack: { backend: 'Express', base_datos: 'MongoDB' } });
const read = (name) => files.find((f) => f.ruta === 'backend/' + name)?.contenido;
const model = JSON.parse(read('src/data/model.js').replace(/^module.exports = /, '').replace(/;\s*$/, ''));
const relation = model.associations[0];
const source = '600000000000000000000001', target = '600000000000000000000002';
function fixture(hello = { setName: 'rs0' }) {
  const session = { withTransaction: jest.fn(async (work) => work(session)), endSession: jest.fn() };
  const collections = new Map();
  const collection = (name) => {
    if (!collections.has(name)) collections.set(name, {
      findOne: jest.fn(async () => ({ _id: new ObjectId(source) })),
      updateOne: jest.fn(async () => ({ matchedCount: 1 })),
      deleteOne: jest.fn(async () => ({ deletedCount: 1 })),
      countDocuments: jest.fn(async () => 0),
      find: jest.fn(() => { const cursor = { sort: jest.fn(() => cursor), limit: jest.fn(() => cursor), toArray: jest.fn(async () => [{ source_id: new ObjectId(source), target_id: new ObjectId(target) }]) }; return cursor; })
    });
    return collections.get(name);
  };
  const command = jest.fn(async () => hello);
  const store = { client: { startSession: jest.fn(() => session) }, db: { admin: () => ({ command }), collection }, inbound: model.tables[relation.table].references.map((r) => ({ collection: relation.table, column: r.column, target: r.table })) };
  const sandbox = { module: { exports: {} }, require: (name) => name === './model' ? model : name === './store-support' ? { HttpError } : require(name) };
  vm.runInNewContext(read('src/data/mongo-associations.js'), sandbox);
  return { store, session, command, collection, service: sandbox.module.exports };
}
describe('API N:M MongoDB transaccional', () => {
  test('declara API y necesidad de replica set en contrato y OpenAPI', () => {
    const manifest = JSON.parse(read('icase.manifest.json'));
    expect(manifest.associations[0]).toMatchObject({ endpoints_generated: true, requires_replica_set: true });
    expect(JSON.parse(read('openapi.json')).paths['/api/associations/' + relation.table].post.requestBody.content['application/json'].schema.properties.source_id.pattern).toBe('^[a-fA-F0-9]{24}$');
    expect(read('src/record.store.js')).toContain("require('./data/mongo-associations').remove");
  });
  test('asocia con upsert idempotente y escritura de bloqueo en ambos extremos', async () => {
    const f = fixture();
    expect(await f.service.execute(f.store, 'link', relation, { source_id: source, target_id: target })).toMatchObject({ associated: true });
    const columns = model.tables[relation.table].columns;
    for (const c of columns) expect(f.collection(c.references).updateOne.mock.calls[0][1].$set._icase_link_lock).toBeTruthy();
    const call = f.collection(relation.table).updateOne.mock.calls[0];
    expect(call[2]).toMatchObject({ upsert: true, session: f.session });
    expect(f.session.withTransaction.mock.calls[0][1]).toMatchObject({ readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' } });
    expect(f.session.endSession).toHaveBeenCalled();
  });
  test('standalone responde 503 sin iniciar sesión ni escribir', async () => {
    const f = fixture({});
    await expect(f.service.execute(f.store, 'link', relation, { source_id: source, target_id: target })).rejects.toMatchObject({ status: 503 });
    expect(f.store.client.startSession).not.toHaveBeenCalled();
  });
  test('valida ObjectIds y campos antes de conectar', async () => {
    const f = fixture();
    await expect(f.service.execute(f.store, 'link', relation, { source_id: source, target_id: { $ne: null } })).rejects.toMatchObject({ status: 400 });
    await expect(f.service.execute(f.store, 'link', relation, { source_id: source, target_id: target, extra: 'campo' })).rejects.toMatchObject({ status: 400 });
    expect(f.command).not.toHaveBeenCalled();
  });
  test('un extremo inexistente aborta antes del upsert y cierra sesión', async () => {
    const f = fixture();
    f.collection(model.tables[relation.table].columns[0].references).updateOne.mockResolvedValue({ matchedCount: 0 });
    await expect(f.service.execute(f.store, 'link', relation, { source_id: source, target_id: target })).rejects.toMatchObject({ status: 404 });
    expect(f.collection(relation.table).updateOne).not.toHaveBeenCalled();
    expect(f.session.endSession).toHaveBeenCalled();
  });
  test('pagina con ObjectId y no una comparación textual', async () => {
    const f = fixture();
    const result = await f.service.execute(f.store, 'list', relation, { source_id: source, after_target_id: source, limit: '1' });
    expect(result.data[0]).toEqual({ source_id: source, target_id: target });
    expect(f.collection(relation.table).find.mock.calls[0][0].target_id.$gt).toBeInstanceOf(ObjectId);
  });
  test('no elimina un extremo referenciado y usa el mismo bloqueo transaccional', async () => {
    const f = fixture();
    f.collection(relation.table).countDocuments.mockResolvedValue(1);
    const name = model.tables[relation.table].columns[0].references;
    await expect(f.service.remove(f.store, name, source)).rejects.toMatchObject({ status: 409 });
    expect(f.collection(name).updateOne).toHaveBeenCalled();
    expect(f.collection(name).deleteOne).not.toHaveBeenCalled();
    expect(f.session.endSession).toHaveBeenCalled();
  });
  test('desasociar borra únicamente el vínculo', async () => {
    const f = fixture();
    expect(await f.service.execute(f.store, 'unlink', relation, { source_id: source, target_id: target })).toMatchObject({ associated: false });
    expect(f.collection(relation.table).deleteOne).toHaveBeenCalled();
    expect(f.collection(model.tables[relation.table].columns[0].references).deleteOne).not.toHaveBeenCalled();
  });
  test('Compose incluye replica set autenticado solo cuando hay N:M', async () => {
    const result = await new Infrastructure().generar({ proyecto: { nombre: 'Biblioteca' }, insumos: { decisiones: { stack_tecnologico: { backend: 'Express', base_datos: 'MongoDB' } }, requerimientos: [], diagramas: [], backend: { version: 1, archivos: files }, frontend: { version: 1 } } });
    const readOps = (name) => result.archivos.find((f) => f.ruta === name)?.contenido;
    expect(readOps('ops/docker-compose.yml')).toContain('replicaSet=rs0');
    expect(readOps('ops/docker-compose.yml')).toContain('database-key:/data/icase-key');
    expect(readOps('ops/docker/mongo-start.sh')).toContain('--keyFile');
    expect(readOps('ops/docker/mongo-health.js')).toContain('rs.initiate');
    expect(readOps('ops/README.md')).toContain('NO es alta disponibilidad');
    const standalone = await new Infrastructure().generar({ proyecto: {}, insumos: { decisiones: { stack_tecnologico: { backend: 'Express', base_datos: 'MongoDB' } }, requerimientos: [], diagramas: [], backend: { version: 1 }, frontend: { version: 1 } } });
    expect(standalone.archivos.some((f) => f.ruta === 'ops/docker/mongo-start.sh')).toBe(false);
  });
  test('el entorno de verificación también prepara un replica set efímero', async () => {
    const promises = fs.promises;
    const root = await promises.mkdtemp(path.join(__dirname, '.generated-mongo-sandbox-'));
    try {
      await promises.mkdir(path.join(root, 'backend'));
      await promises.writeFile(path.join(root, 'backend/icase.manifest.json'), read('icase.manifest.json'));
      const Sandbox = require('../src/infrastructure/services/SandboxRuntimeVerifier');
      await new Sandbox()._helpers(root, 'codigo_backend');
      const compose = await promises.readFile(path.join(root, 'verify.compose.yml'), 'utf8');
      expect(compose).toContain('"--replSet"');
      expect(compose).toContain('replicaSet=rs0');
      expect(compose).toContain('internal: true');
      expect(compose).toContain('rs.initiate');
    } finally {
      if (path.dirname(root) !== __dirname || !path.basename(root).startsWith('.generated-mongo-sandbox-')) throw new Error('Ruta temporal no segura');
      await promises.rm(root, { recursive: true, force: true });
    }
  });
});
