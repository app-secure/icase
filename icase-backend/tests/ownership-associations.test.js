const fs = require('node:fs');
const path = require('node:path');
const support = require('../src/infrastructure/templates/data-layer/store-support');
const ownership = require('../src/infrastructure/templates/auth/ownership');

const model = {
  database: 'mongodb',
  operations: { 'rf-01': 'clientes', 'rf-02': 'etiquetas' },
  associations: [{ table: 'cliente_etiqueta' }],
  tables: {
    cliente_etiqueta: {
      columns: [
        { name: 'source_id', column: 'source_id', references: 'clientes' },
        { name: 'target_id', column: 'target_id', references: 'etiquetas' }
      ]
    },
    clientes: { columns: [{ name: '__owner', column: 'owner_id', type: 'id' }] },
    etiquetas: { columns: [{ name: '__owner', column: 'owner_id', type: 'id' }] }
  }
};

const policy = {
  habilitada: true,
  operaciones: {
    'rf-01': { cliente: { metodos: ['GET', 'POST', 'PATCH', 'DELETE'], alcance: 'propios' } },
    'rf-02': { cliente: { metodos: ['GET', 'POST', 'PATCH', 'DELETE'], alcance: 'propios' } }
  }
};

function template(name, overrides = {}) {
  const mod = { exports: {} };
  const source = fs.readFileSync(path.join(__dirname, '../src/infrastructure/templates/data-layer', name), 'utf8');
  // eslint-disable-next-line no-new-func
  new Function('require', 'module', 'exports', source)(
    (id) => overrides[id] || (id === './store-support' ? support : require(id)),
    mod,
    mod.exports
  );
  return mod.exports;
}

describe('ownership N:M', () => {
  test('associationScopes marca propios en cada extremo', () => {
    const scopes = ownership.associationScopes(policy, { id: '7', rol: 'cliente' }, { table: 'cliente_etiqueta' }, model);
    expect(scopes.sourceKey).toBe('rf-01');
    expect(scopes.targetKey).toBe('rf-02');
    expect(scopes.sourceScope).toEqual({ ownerId: '7' });
    expect(scopes.targetScope).toEqual({ ownerId: '7' });
    expect(ownership.associationForbidden()).toBe(false);
  });

  test('mongo execute oculta targets ajenos y rechaza link cruzado', async () => {
    const ObjectId = require('mongodb').ObjectId;
    const mine = new ObjectId();
    const theirs = new ObjectId();
    const tagMine = new ObjectId();
    const tagTheirs = new ObjectId();
    const owners = new Map([
      [String(mine), 'a'],
      [String(theirs), 'b'],
      [String(tagMine), 'a'],
      [String(tagTheirs), 'b']
    ]);
    const links = [
      { source_id: mine, target_id: tagMine },
      { source_id: mine, target_id: tagTheirs }
    ];
    const store = {
      _icaseTransactionsChecked: true,
      client: { startSession: () => ({
        withTransaction: async (work) => work({}),
        endSession: async () => {}
      }) },
      db: {
        admin: () => ({ command: async () => ({ setName: 'rs0' }) }),
        collection: (name) => ({
          findOne: async (query) => {
            if (name === 'clientes' || name === 'etiquetas') return { _id: query._id };
            return null;
          },
          find: (query) => {
            const filtered = links.filter((row) => String(row.source_id) === String(query.source_id)
              && (!query.target_id || String(row.target_id) > String(query.target_id.$gt)));
            return {
              sort: () => ({
                limit: (n) => ({
                  toArray: async () => filtered.sort((a, b) => String(a.target_id).localeCompare(String(b.target_id))).slice(0, n)
                })
              })
            };
          },
          updateOne: async () => ({ matchedCount: 1 }),
          deleteOne: async () => ({ deletedCount: 1 })
        })
      },
      getRecord: async (key, id, scope) => {
        const owner = owners.get(String(id));
        if (!owner) return null;
        if (scope?.ownerId && String(owner) !== String(scope.ownerId)) return null;
        return { id: String(id) };
      }
    };
    const { execute } = template('mongo-associations.js', { './model': model, './store-support': support });
    const scopes = ownership.associationScopes(policy, { id: 'a', rol: 'cliente' }, { table: 'cliente_etiqueta' }, model);
    const listed = await execute(store, 'list', { table: 'cliente_etiqueta' }, { source_id: String(mine) }, scopes);
    expect(listed.data.map((row) => row.target_id)).toEqual([String(tagMine)]);
    await expect(execute(store, 'link', { table: 'cliente_etiqueta' }, { source_id: String(mine), target_id: String(tagTheirs) }, scopes))
      .rejects.toMatchObject({ status: 404 });
    const ok = await execute(store, 'link', { table: 'cliente_etiqueta' }, { source_id: String(mine), target_id: String(tagMine) }, scopes);
    expect(ok.associated).toBe(true);
  });

  test('Express generado pasa linkScopes a associations', () => {
    const GenericBackendGenerator = require('../src/infrastructure/services/GenericBackendGenerator');
    const DomainModelExtractor = require('../src/infrastructure/services/DomainModelExtractor');
    const files = new GenericBackendGenerator().generate({
      proyecto: { nombre: 'Demo' },
      requirements: [{ aprobado: true, tipo: 'RF', identificador: 'RF-01', nombre: 'Clientes', actores: ['Cliente'] }],
      domainModel: new DomainModelExtractor().extract('@startuml\nclass Cliente {\n +String id\n}\n@enduml'),
      rules: [],
      access: {
        autenticacion: { metodo: 'jwt', expiracion: '1h' },
        roles: [{ id: 'cliente', nombre: 'Cliente', incluir: true, autoregistro: false }],
        permisos: [{ operacion: 'RF-01', rol: 'cliente', metodos: ['GET', 'POST', 'PATCH', 'DELETE'], alcance: 'propios' }]
      },
      stack: { backend: 'Express', base_datos: 'PostgreSQL' },
      modules: []
    });
    const app = files.find((file) => file.ruta === 'backend/src/app.js').contenido;
    expect(app).toContain('associationScopes');
    expect(app).toContain('linkScopes');
    expect(files.find((file) => file.ruta === 'backend/src/auth/auth-core.js').contenido).not.toContain('associationForbidden');
  });
});
