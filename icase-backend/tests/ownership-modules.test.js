const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const os = require('node:os');
const express = require('express');
const support = require('../src/infrastructure/templates/data-layer/store-support');
const GenericBackendGenerator = require('../src/infrastructure/services/GenericBackendGenerator');
const DomainModelExtractor = require('../src/infrastructure/services/DomainModelExtractor');
const backfill = require('../src/infrastructure/templates/verification/backfill-owners.cjs');

const PLANTUML = `@startuml
class Cliente {
  +String id
  +String email
}
@enduml`;
const requirements = [{ aprobado: true, tipo: 'RF', identificador: 'RF-01', nombre: 'Gestionar clientes', actores: ['Cliente'] }];
const control = {
  autenticacion: { metodo: 'jwt', expiracion: '1h' },
  roles: [{ id: 'cliente', nombre: 'Cliente', incluir: true, autoregistro: false }],
  permisos: [{ operacion: 'RF-01', rol: 'cliente', metodos: ['GET', 'POST', 'PATCH', 'DELETE'], alcance: 'propios' }]
};

function template(name, overrides = {}) {
  const mod = { exports: {} };
  const source = fs.readFileSync(path.join(__dirname, '../src/infrastructure/templates/auth', name), 'utf8');
  // eslint-disable-next-line no-new-func
  new Function('require', 'module', 'exports', source)(
    (id) => overrides[id] || (id === '../data/store-support' ? support : require(id)),
    mod,
    mod.exports
  );
  return mod.exports;
}

describe('ownership en módulos laterales', () => {
  test('archivos y reportes respetan scope; sin filtro fallan', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'icase-own-files-'));
    const old = process.env.APP_DATA_DIR;
    process.env.APP_DATA_DIR = root;
    const policy = { operaciones: { 'rf-01': { cliente: { metodos: ['GET', 'POST', 'PATCH', 'DELETE'], alcance: 'propios' } } } };
    const ownership = require('../src/infrastructure/templates/auth/ownership');
    const records = new Map([['1', { id: '1', owner: 'a' }], ['2', { id: '2', owner: 'b' }]]);
    const store = {
      getRecord: async (_op, id, scope) => {
        const row = records.get(String(id));
        if (!row) return null;
        if (scope?.ownerId && String(row.owner) !== String(scope.ownerId)) return null;
        return row;
      },
      list: async (_op, _q, scope) => [...records.values()].filter((row) => !scope?.ownerId || String(row.owner) === String(scope.ownerId)).map((row) => ({ data: { precio: 10 } }))
    };
    const auth = {
      authenticate: async (header) => {
        if (header === 'Bearer a') return { id: 'a', rol: 'cliente' };
        if (header === 'Bearer b') return { id: 'b', rol: 'cliente' };
        throw new support.HttpError(401, 'Sesión requerida');
      },
      authorize: () => {}
    };
    const app = express();
    template('generated-extensions.js', {
      './generated-files': template('generated-files.js'),
      './generated-reports': template('generated-reports.js'),
      '../auth/policy': policy,
      '../auth/ownership': ownership
    })(app, { store, auth, contract: { operations: [{ key: 'rf-01', name: 'Clientes', schema: { properties: { precio: { type: 'number' } } } }] }, enabled: ['archivos_imagenes', 'reportes_calculos'] });
    const server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const base = `http://127.0.0.1:${server.address().port}`;
    try {
      const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6HkAAAAAASUVORK5CYII=', 'base64');
      expect((await fetch(`${base}/api/files/rf-01/2`, { method: 'POST', headers: { Authorization: 'Bearer a', 'Content-Type': 'image/png' }, body: png })).status).toBe(404);
      expect((await fetch(`${base}/api/files/rf-01/1`, { method: 'POST', headers: { Authorization: 'Bearer a', 'Content-Type': 'image/png' }, body: png })).status).toBe(201);
      const report = await (await fetch(`${base}/api/reports/rf-01`, { headers: { Authorization: 'Bearer a' } })).json();
      expect(report.count).toBe(1);
      const broken = express();
      template('generated-extensions.js', {
        './generated-files': template('generated-files.js'),
        './generated-reports': template('generated-reports.js'),
        '../auth/policy': policy,
        '../auth/ownership': { scopeOf: () => null }
      })(broken, { store, auth, contract: { operations: [{ key: 'rf-01', name: 'Clientes', schema: { properties: { precio: { type: 'number' } } } }] }, enabled: ['reportes_calculos'] });
      const leak = http.createServer(broken);
      await new Promise((resolve) => leak.listen(0, '127.0.0.1', resolve));
      try {
        const open = await (await fetch(`http://127.0.0.1:${leak.address().port}/api/reports/rf-01`, { headers: { Authorization: 'Bearer a' } })).json();
        expect(open.count).toBe(2);
      } finally {
        await new Promise((resolve) => leak.close(resolve));
      }
    } finally {
      await new Promise((resolve) => server.close(resolve));
      if (old === undefined) delete process.env.APP_DATA_DIR;
      else process.env.APP_DATA_DIR = old;
      fs.rmSync(root, { recursive: true, force: true });
    }
  }, 30000);

  test('pagos de prueba exigen getRecord con scope', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'icase-own-pay-'));
    const storage = template('integration-storage.js');
    const ledger = storage.storage(path.join(root, 'pay'));
    const records = new Map([['1', { id: '1', data: { importe: 500 }, owner: 'a' }], ['2', { id: '2', data: { importe: 500 }, owner: 'b' }]]);
    const store = {
      getRecord: async (_k, id, scope) => {
        const row = records.get(String(id));
        if (!row || (scope?.ownerId && String(row.owner) !== String(scope.ownerId))) return null;
        return row;
      }
    };
    process.env.NODE_ENV = 'test';
    process.env.STRIPE_SECRET_KEY = 'sk_test_1234567890abcdef';
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test';
    process.env.PAYMENT_RETURN_URL = 'http://localhost/return';
    process.env.PAYMENT_NAMESPACE = 'test-namespace-0123';
    process.env.PAYMENT_BINDINGS = JSON.stringify({ 'rf-01': { amountField: 'importe', currency: 'eur' } });
    process.env.STRIPE_API_BASE = 'http://127.0.0.1:9';
    const payments = template('integration-payments.js', { './integration-storage': storage }).payments({
      store,
      ledger,
      operations: [{ key: 'rf-01', schema: { properties: { importe: { type: 'integer' } } } }],
      scopeOf: (user) => ({ ownerId: String(user.id) }),
      fetcher: async () => ({ ok: true, json: async () => ({ id: 'cs_test', livemode: false, url: 'http://127.0.0.1:9/pay' }) })
    });
    await expect(payments.checkout({ id: 'a', rol: 'cliente' }, 'rf-01', '2')).rejects.toMatchObject({ status: 404 });
    const ok = await payments.checkout({ id: 'a', rol: 'cliente' }, 'rf-01', '1');
    expect(ok.reference).toMatch(/^[a-f0-9]{64}$/);
    fs.rmSync(root, { recursive: true, force: true });
  });

  test('mapas solo exponen configuración tras autorización GET', () => {
    const files = new GenericBackendGenerator().generate({
      proyecto: { nombre: 'Demo' },
      requirements,
      domainModel: new DomainModelExtractor().extract(PLANTUML),
      rules: [],
      access: control,
      stack: { backend: 'Express', base_datos: 'PostgreSQL' },
      modules: { modo: 'personalizado', modulos: [{ id: 'mapas', activo: true }, { id: 'formularios_tipados', activo: false }, { id: 'paginacion_busqueda', activo: false }, { id: 'datos_iniciales', activo: false }] }
    });
    const routes = files.find((file) => file.ruta.endsWith('integration-routes.js')).contenido;
    expect(routes).toContain("enabled.includes('mapas')");
    expect(routes).toContain('authorize(req,req.params.operation)');
  });

  test('eventos no embuten payload de registro; reconsulta usa scope CRUD', () => {
    const source = fs.readFileSync(path.join(__dirname, '../src/infrastructure/templates/auth/change-events.js'), 'utf8');
    expect(source).toContain("socket.emit('records:changed'");
    expect(source).toMatch(/emit\('records:changed',\s*\{\s*operation,\s*method\s*\}/);
    expect(source).not.toMatch(/emit\('records:changed',\s*\{[^}]*\bdata\b/);
    expect(fs.readFileSync(path.join(__dirname, '../src/infrastructure/templates/auth/ownership.js'), 'utf8')).toContain('BLOCKED_MODULES = Object.freeze([])');
  });

  test('procesos ocultan instancias con registros ajenos', async () => {
    const { engine } = template('business-process.js', {
      '../auth/ownership': require('../src/infrastructure/templates/auth/ownership'),
      './business-process-notify': { smtpConfigured: () => false, sendActionMail: async () => {} }
    });
    const policy = { operaciones: { 'rf-01': { cliente: { metodos: ['GET', 'PATCH'], alcance: 'propios' } } } };
    const store = {
      getRecord: async (_k, id, scope) => {
        if (String(id) === '1' && (!scope || scope.ownerId === 'a')) return { id: '1', data: {} };
        if (String(id) === '2' && (!scope || scope.ownerId === 'b')) return { id: '2', data: {} };
        return null;
      }
    };
    const instances = new Map();
    const repository = {
      list: async () => ({ data: [...instances.keys()].map((id) => ({ id })), has_more: false }),
      read: async (id) => instances.get(id),
      start: async (instance) => { instances.set(instance.id, instance); return { id: instance.id, state: instance.state, version: 0 }; },
      transaction: async (id, run) => {
        const instance = instances.get(id);
        const tx = { getRecord: store.getRecord, update: async () => ({}), save: async (next) => instances.set(id, next), unlock: async () => {} };
        return run(tx, instance);
      }
    };
    const definition = {
      id: 'p1',
      records: { item: 'rf-01' },
      initial: 'nuevo',
      terminal: ['fin'],
      start_roles: ['cliente'],
      actions: [{ id: 'cerrar', from: 'nuevo', to: 'fin', roles: ['cliente'], steps: [] }],
      reopen: null
    };
    const hash = require('node:crypto').createHash('sha256').update(JSON.stringify(definition)).digest('hex');
    const service = engine({ definitions: [definition], repository, authorize: () => {}, store, policy });
    const a = { id: 'a', rol: 'cliente' };
    const mine = await service.start(a, 'p1', { item: '1' });
    instances.set('foreign', {
      id: 'foreign',
      definition: 'p1',
      definition_hash: hash,
      state: 'nuevo',
      version: 0,
      records: { item: '2' },
      last_actor: 'b',
      history: []
    });
    const listed = await service.list(a, 1);
    expect(listed.data.map((item) => item.id)).toEqual([mine.id]);
    await expect(service.read(a, 'foreign')).rejects.toMatchObject({ status: 404 });
    await expect(service.start(a, 'p1', { item: '2' })).rejects.toMatchObject({ status: 404 });
  });

  test('backfill exige aprobación y no inventa dueños en dejar_null', async () => {
    expect(backfill.STRATEGIES).toContain('dejar_null');
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'icase-backfill-'));
    fs.mkdirSync(path.join(root, 'backend/src/data'), { recursive: true });
    fs.writeFileSync(path.join(root, 'backend/src/data/model.js'), "module.exports = { tables: { clientes: { columns: [{ name: '__owner', column: 'owner_id', type: 'id' }] } } };\n");
    fs.writeFileSync(path.join(root, 'backend/package.json'), JSON.stringify({ name: 'backend' }));
    await expect(backfill.planBackfill(root, { strategy: 'dejar_null', databaseUrl: null })).rejects.toThrow(/DATABASE_URL|database-url/);
    fs.rmSync(root, { recursive: true, force: true });
  });
});
