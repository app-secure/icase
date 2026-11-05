const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { HttpError, split, viewOf, toRecord, tableFor, publicColumns, ownerWhere, assignOwner } = require('../src/infrastructure/templates/data-layer/store-support');

const model = {
  database: 'postgres',
  tables: {
    cliente: { entity: 'Cliente', columns: [{ name: 'email', column: 'email', type: 'string' }, { name: '__owner', column: 'owner_id', type: 'id', internal: true }], references: [] }
  },
  operations: { 'rf-01': 'cliente' },
  associations: []
};

function loadStore(filename, database, queryImpl) {
  const source = fs.readFileSync(path.join(__dirname, '../src/infrastructure/templates/data-layer', filename), 'utf8');
  const calls = [];
  const sandbox = {
    module: { exports: {} },
    require: (name) => {
      if (name === 'pg') return { Pool: class { constructor() { this.connect = async () => ({ query: async () => {}, release() {} }); this.query = async (sql, params) => { calls.push({ sql, params }); return queryImpl(sql, params); }; } }, types: { setTypeParser() {} } };
      if (name === 'mysql2/promise') return { createPool: () => ({ getConnection: async () => ({ query: async () => {}, release() {} }), query: async (sql, params) => { calls.push({ sql, params }); return queryImpl(sql, params); }, pool: { on() {} } }) };
      if (name === 'mongodb') return { MongoClient: class {}, ObjectId: class { constructor(id) { this.id = id; } static isValid() { return true; } } };
      if (name === './data/model') return { ...model, database };
      if (name === './data/migrations') return [];
      if (name === './data/store-support') return { HttpError, withRetry: (fn) => fn(), split, viewOf, toRecord, tableFor, publicColumns, ownerWhere, assignOwner };
      if (name === './data/rules-engine') return { prepare: (_table, body) => body, derive: (_table, body) => body, check() {} };
      return require(name);
    },
    process, Buffer, console, setTimeout, Error, JSON, Object, String, Number, Array, Date, Math, parseInt, Boolean
  };
  vm.runInNewContext(source, sandbox, { filename });
  return { Store: sandbox.module.exports, calls };
}

describe('filtros de propietario en almacenes', () => {
  test('PostgreSQL parametriza owner_id en list/get/update/remove y no interpola el identificador', async () => {
    const { Store, calls } = loadStore('postgres.store.js', 'postgres', async (sql) => {
      if (/RETURNING/.test(sql) || /SELECT \*/.test(sql)) return { rows: [{ id: 1, email: 'a@test', extra: {}, created_at: new Date(), updated_at: new Date() }], rowCount: 1 };
      return { rows: [], rowCount: 1 };
    });
    const store = new Store();
    const scope = { ownerId: '42' };
    await store.list('rf-01', {}, scope);
    await store.getRecord('rf-01', '1', scope);
    await store.update('rf-01', '1', { email: 'b@test' }, scope);
    await store.remove('rf-01', '1', scope);
    expect(calls.some(({ sql, params }) => sql.includes('owner_id') && params.includes('42') && !sql.includes('42'))).toBe(true);
    expect(calls.every(({ sql }) => !sql.includes("'42'") && !/owner_id = 42/.test(sql))).toBe(true);
  });

  test('MySQL usa marcadores y el valor del propietario como parámetro', async () => {
    const { Store, calls } = loadStore('mysql.store.js', 'mysql', async (sql) => {
      if (/SELECT \*/.test(sql)) return [[{ id: 1, email: 'a@test', extra: '{}', created_at: new Date(), updated_at: new Date() }]];
      return [[{}], { insertId: 1, affectedRows: 1 }];
    });
    const store = new Store();
    await store.list('rf-01', {}, { ownerId: '7' });
    expect(calls.some(({ sql, params }) => sql.includes('owner_id') && params.includes('7'))).toBe(true);
  });

  test('MongoDB añade owner_id al filtro y no acepta el campo en consultas públicas', async () => {
    const filters = [];
    const source = fs.readFileSync(path.join(__dirname, '../src/infrastructure/templates/data-layer/mongodb.store.js'), 'utf8');
    const sandbox = {
      module: { exports: {} },
      require: (name) => {
        if (name === 'mongodb') return { MongoClient: class { constructor() { this.db = () => ({}); } }, ObjectId: class ObjectId { constructor(id) { this.id = String(id); } toString() { return this.id; } static isValid() { return true; } } };
        if (name === './data/model') return { ...model, database: 'mongodb' };
        if (name === './data/migrations') return [];
        if (name === './data/store-support') return { HttpError, withRetry: (fn) => fn(), split, viewOf, toRecord, tableFor, publicColumns, ownerWhere, assignOwner };
        if (name === './data/rules-engine') return { prepare: (_table, body) => body, derive: (_table, body) => body, check() {} };
        return require(name);
      },
      process, Buffer, console, Error, JSON, Object, String, Number, Array, Date, Math, parseInt, Boolean, Set
    };
    vm.runInNewContext(source, sandbox, { filename: 'mongodb.store.js' });
    const store = new sandbox.module.exports();
    store.db = { collection: () => ({ find: (filter) => { filters.push(filter); return { sort: () => ({ toArray: async () => [] }) }; } }) };
    await store.list('rf-01', { owner_id: 'hack', __owner: 'hack' }, { ownerId: 'abc' });
    expect(filters[0].owner_id).toBeDefined();
    expect(filters[0].email).toBeUndefined();
  });
});
