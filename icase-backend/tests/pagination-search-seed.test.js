const DomainModelExtractor = require('../src/infrastructure/services/DomainModelExtractor');
const ApplicationContractBuilder = require('../src/infrastructure/services/ApplicationContractBuilder');
const BackendDataLayerGenerator = require('../src/infrastructure/services/BackendDataLayerGenerator');
const OpenApiGenerator = require('../src/infrastructure/services/OpenApiGenerator');
const samplePayload = require('../src/infrastructure/services/SamplePayload');

const PLANTUML = `@startuml
class Cliente {
  +String id
  +String nombre
  +String email
  +boolean activo
}
class Factura {
  +String id
  +String numero
  +float total
}
Cliente "1" --> "0..*" Factura
@enduml`;

const rf = (identificador, nombre) => ({ aprobado: true, tipo: 'RF', identificador, nombre });
const requirements = [rf('RF-01', 'Gestionar clientes'), rf('RF-02', 'Registrar facturas')];
const contract = new ApplicationContractBuilder().build({
  proyecto: { nombre: 'Demo' },
  requerimientos: requirements,
  domainModel: new DomainModelExtractor().extract(PLANTUML)
});

describe('Módulos: paginacion_busqueda y datos_iniciales', () => {
  describe('Topological sort y seed migrations deterministas', () => {
    test('ordena tablas topológicamente para que padres vayan antes que hijos', () => {
      const dataLayer = new BackendDataLayerGenerator().build({
        contract,
        database: 'postgres',
        policy: { habilitada: true },
        modules: ['auth_jwt', 'datos_iniciales']
      });

      const seedMigration = dataLayer.migrations.find(m => m.id && m.id.includes('seed'));
      expect(seedMigration).toBeDefined();
      expect(seedMigration.id).toBe('0003_seed');

      // Cliente debe insertarse antes que Factura
      const sql = seedMigration.statements.join('\n');
      const indexCliente = sql.indexOf('INSERT INTO "cliente"');
      const indexFactura = sql.indexOf('INSERT INTO "factura"');
      expect(indexCliente).toBeGreaterThan(-1);
      expect(indexFactura).toBeGreaterThan(-1);
      expect(indexCliente).toBeLessThan(indexFactura);
    });

    test('genera ON CONFLICT DO NOTHING y setval en postgres', () => {
      const dataLayer = new BackendDataLayerGenerator().build({
        contract,
        database: 'postgres',
        policy: { habilitada: false },
        modules: ['datos_iniciales']
      });

      const seedMigration = dataLayer.migrations.find(m => m.id && m.id.includes('seed'));
      expect(seedMigration.id).toBe('0002_seed');
      const sql = seedMigration.statements.join('\n');
      expect(sql).toContain('ON CONFLICT ("id") DO NOTHING');
      expect(sql).toContain('setval(pg_get_serial_sequence');
    });

    test('genera INSERT IGNORE en mysql', () => {
      const dataLayer = new BackendDataLayerGenerator().build({
        contract,
        database: 'mysql',
        policy: { habilitada: false },
        modules: ['datos_iniciales']
      });

      const seedMigration = dataLayer.migrations.find(m => m.id && m.id.includes('seed'));
      const sql = seedMigration.statements.join('\n');
      expect(sql).toContain('INSERT IGNORE INTO `cliente`');
      expect(sql).toContain('INSERT IGNORE INTO `factura`');
    });

    test('genera seeds JSON deterministas para mongodb', () => {
      const dataLayer = new BackendDataLayerGenerator().build({
        contract,
        database: 'mongodb',
        policy: { habilitada: false },
        modules: ['datos_iniciales']
      });

      const seedMigration = dataLayer.migrations.find(m => m.id && m.id.includes('seed'));
      expect(seedMigration.id).toBe('0002_seed');
      expect(seedMigration.seeds).toBeDefined();
      const clienteSeed = seedMigration.seeds.find(s => s.collection === 'cliente');
      const facturaSeed = seedMigration.seeds.find(s => s.collection === 'factura');
      expect(clienteSeed).toBeDefined();
      expect(facturaSeed).toBeDefined();
      expect(clienteSeed.documents.length).toBe(2);
      expect(clienteSeed.documents[0]._id).toBe('600000000000000000000001');
    });

    test('no genera migración seed si el módulo datos_iniciales no está activo', () => {
      const dataLayer = new BackendDataLayerGenerator().build({
        contract,
        database: 'postgres',
        policy: { habilitada: false },
        modules: []
      });

      const seedMigration = dataLayer.migrations.find(m => m.id && m.id.includes('seed'));
      expect(seedMigration).toBeUndefined();
    });
  });

  describe('OpenAPI con paginación y búsqueda', () => {
    test('incluye query parameters page, limit, search y cabeceras de respuesta X-Total-Count', () => {
      const dataLayer = new BackendDataLayerGenerator().build({
        contract,
        database: 'postgres',
        policy: { habilitada: false },
        modules: ['paginacion_busqueda']
      });

      const openapi = new OpenApiGenerator().build({
        proyecto: { nombre: 'Demo' },
        contract,
        model: dataLayer.model,
        policy: { habilitada: false }
      });

      const getOperation = openapi.paths['/api/operations/rf-01'].get;
      expect(getOperation).toBeDefined();

      const paramNames = getOperation.parameters.map(p => p.name);
      expect(paramNames).toContain('page');
      expect(paramNames).toContain('limit');
      expect(paramNames).toContain('search');
      expect(paramNames).toContain('nombre');
      expect(paramNames).toContain('email');

      const headers = getOperation.responses['200'].headers;
      expect(headers['X-Total-Count']).toBeDefined();
      expect(headers['X-Page']).toBeDefined();
      expect(headers['X-Limit']).toBeDefined();
      expect(headers['X-Total-Pages']).toBeDefined();
    });
  });

  describe('Store Templates - Paginación, filtros y búsqueda', () => {
    test('PostgresStore list() soporta paginación, filtros y búsqueda', () => {
      const dataLayer = new BackendDataLayerGenerator().build({
        contract,
        database: 'postgres',
        policy: { habilitada: false },
        modules: ['paginacion_busqueda']
      });

      const storeCode = dataLayer.files.store;
      expect(storeCode).toContain('ILIKE');
      expect(storeCode).toContain('LIMIT $');
      expect(storeCode).toContain('OFFSET $');
      expect(storeCode).toContain('COUNT(*)');
    });

    test('MySQL Store list() soporta LIKE y LIMIT/OFFSET', () => {
      const dataLayer = new BackendDataLayerGenerator().build({
        contract,
        database: 'mysql',
        policy: { habilitada: false },
        modules: ['paginacion_busqueda']
      });

      const storeCode = dataLayer.files.store;
      expect(storeCode).toContain('LIKE ?');
      expect(storeCode).toContain('LIMIT ? OFFSET ?');
      expect(storeCode).toContain('COUNT(*)');
    });

    test('MongoDB Store list() soporta $regex, countDocuments, skip y limit', () => {
      const dataLayer = new BackendDataLayerGenerator().build({
        contract,
        database: 'mongodb',
        policy: { habilitada: false },
        modules: ['paginacion_busqueda']
      });

      const storeCode = dataLayer.files.store;
      expect(storeCode).toContain('new RegExp(');
      expect(storeCode).toContain('countDocuments');
      expect(storeCode).toContain('.skip(');
      expect(storeCode).toContain('.limit(');
    });
  });

  describe('SamplePayload con paginación', () => {
    test('exerciseOperation ejercita paginación y búsqueda', async () => {
      const operation = contract.operations[0];
      const records = new Map();
      let nextId = 1;

      // Mock api
      const mockApi = async (url, method = 'GET', body = null) => {
        const [path, queryString] = url.split('?');
        const query = Object.fromEntries(new URLSearchParams(queryString || ''));

        if (path === operation.collectionPath && method === 'POST') {
          if (body.activo === 'valor-que-no-corresponde') {
            return { status: 400, data: { error: 'Tipo inválido para activo' } };
          }
          const id = nextId++;
          const record = { ...body, id, creadoEn: new Date().toISOString() };
          records.set(String(id), record);
          return { status: 201, data: { id, data: record } };
        }

        if (path === operation.collectionPath && method === 'GET') {
          let list = Array.from(records.values());
          if (query.search) {
            list = list.filter(r => JSON.stringify(r).toLowerCase().includes(query.search.toLowerCase()));
          }
          if (query.page && query.limit) {
            const page = parseInt(query.page, 10);
            const limit = parseInt(query.limit, 10);
            list = list.slice((page - 1) * limit, page * limit);
          }
          return { status: 200, data: { data: list, pagination: { total: records.size } } };
        }

        if (path.startsWith(operation.collectionPath + '/') && method === 'PATCH') {
          const id = path.split('/').pop();
          const existing = records.get(String(id));
          if (!existing) return { status: 404, data: { error: 'Not found' } };
          const updated = { ...existing, ...body };
          records.set(String(id), updated);
          return { status: 200, data: { data: updated } };
        }

        if (path.startsWith(operation.collectionPath + '/') && method === 'DELETE') {
          const id = path.split('/').pop();
          if (!records.has(String(id))) return { status: 404, data: { error: 'Not found' } };
          records.delete(String(id));
          return { status: 200, data: { status: 'deleted' } };
        }

        return { status: 400, data: { error: 'Bad request' } };
      };

      await expect(samplePayload.exerciseOperation(mockApi, contract.operations, operation)).resolves.not.toThrow();
    });
  });
});
