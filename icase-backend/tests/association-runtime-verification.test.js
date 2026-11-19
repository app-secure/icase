const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const sample = require('../src/infrastructure/services/SamplePayload');
const Sandbox = require('../src/infrastructure/services/SandboxRuntimeVerifier');
const Generator = require('../src/infrastructure/services/TestSuiteGenerator');
const UseCase = require('../src/core/use-cases/GestionarArtefactosCodigo');

function fixture(database = 'postgres', self = false) {
  const operations = ['a', 'b'].map((key) => ({ id: key, key, collectionPath: '/api/operations/' + key, schema: { title: key, properties: { nombre: { type: 'string' } } }, rules: [] }));
  const association = { table: 'rel_a_b', operations: [['a'], [self ? 'a' : 'b']], endpoints_generated: true };
  const records = { a: new Map(), b: new Map() }, links = new Map();
  let count = 0;
  const api = jest.fn(async (url, method = 'GET', body) => {
    const parsed = new URL(url, 'http://test');
    const [,, resource, key, id] = parsed.pathname.split('/');
    if (resource === 'operations') {
      if (method === 'POST') {
        const next = ++count;
        const id = database === 'mongodb' ? next.toString(16).padStart(24, '0') : String(next);
        const row = { id, data: body }; records[key].set(id, row);
        return { status: 201, data: row };
      }
      if (method === 'DELETE') {
        if ([...links.values()].some((pair) => key === 'a' && pair.source_id === id || key === (self ? 'a' : 'b') && pair.target_id === id)) return { status: 409, data: {} };
        const removed = records[key].delete(id);
        return { status: removed ? 200 : 404, data: {} };
      }
      return { status: 200, data: [...records[key].values()] };
    }
    if (resource !== 'associations') return { status: 404, data: {} };
    if (method === 'GET') {
      const source = parsed.searchParams.get('source_id'), after = parsed.searchParams.get('after_target_id');
      const value = (id) => BigInt(database === 'mongodb' ? '0x' + id : id);
      const rows = [...links.values()].filter((pair) => pair.source_id === source && (!after || value(pair.target_id) > value(after))).sort((x, y) => value(x.target_id) < value(y.target_id) ? -1 : 1);
      const limit = Number(parsed.searchParams.get('limit') || 50);
      return { status: 200, data: { data: rows.slice(0, limit), has_more: rows.length > limit } };
    }
    const pattern = database === 'mongodb' ? /^[a-f0-9]{24}$/i : /^[1-9]\d*$/;
    if (!pattern.test(body.source_id) || !pattern.test(body.target_id)) return { status: 400, data: {} };
    if (!records.a.has(body.source_id) || !records[self ? 'a' : 'b'].has(body.target_id)) return { status: 404, data: {} };
    const pair = body.source_id + ':' + body.target_id;
    if (method === 'POST') links.set(pair, body);
    else links.delete(pair);
    return { status: 200, data: { ...body, associated: method === 'POST' } };
  });
  return { api, operations, association, records, links };
}

describe('protocolo de ejecución N:M', () => {
  test.each(['postgres', 'mysql', 'mongodb'])('ejercita el ciclo completo y limpia solo sus datos (%s)', async (database) => {
    const f = fixture(database);
    expect(await sample.exerciseAssociation(f.api, f.operations, f.association)).toEqual({ table: 'rel_a_b', estado: 'correcta' });
    expect(f.links.size).toBe(0);
    expect(f.records.a.size + f.records.b.size).toBe(0);
    expect(f.api.mock.calls.some(([url]) => url.includes('after_target_id'))).toBe(true);
  });
  test('admite autorrelaciones con registros diferentes', async () => {
    const f = fixture('postgres', true);
    await expect(sample.exerciseAssociation(f.api, f.operations, f.association)).resolves.toMatchObject({ estado: 'correcta' });
    expect(f.records.a.size).toBe(0);
  });
  test('no omite una relación sin operaciones o sin API', async () => {
    const f = fixture();
    await expect(sample.exerciseAssociation(f.api, [], f.association)).rejects.toThrow('faltan operaciones');
    await expect(sample.exerciseAssociation(f.api, f.operations, { ...f.association, endpoints_generated: false })).rejects.toThrow('no hay API');
  });
  test('detecta un backend que no protege el borrado del origen', async () => {
    const f = fixture();
    const api = async (url, method, body) => method === 'DELETE' && url.startsWith('/api/operations/a/') ? { status: 200, data: {} } : f.api(url, method, body);
    await expect(sample.exerciseAssociation(api, f.operations, f.association)).rejects.toThrow('proteger origen vinculado');
  });
  test('verifica lectores, editores, anónimos y permisos en un solo extremo', async () => {
    const f = fixture();
    const matrix = { a: { lector: ['GET'], editor: ['GET', 'PATCH'], parcial: ['GET'] }, b: { lector: ['GET'], editor: ['GET', 'PATCH'] } };
    const roleApi = (read, write) => jest.fn((url, method = 'GET', body) => (method === 'GET' ? read : write) ? f.api(url, method, body) : Promise.resolve({ status: 403 }));
    const access = { anonymous: async () => ({ status: 401 }), invalid: async () => ({ status: 401 }), roles: { lector: { api: roleApi(true, false) }, editor: { api: roleApi(true, true) }, parcial: { api: roleApi(false, false) } } };
    await expect(sample.exerciseAssociation(f.api, f.operations, f.association, access, { operaciones: matrix })).resolves.toMatchObject({ estado: 'correcta' });
    expect(access.roles.lector.api).toHaveBeenCalledTimes(3);
  });
  test('smoke siempre se ejecuta, también al verificar el paquete integrado', async () => {
    const f = fixture();
    const run = jest.fn(async () => ({ stdout: '', stderr: '' }));
    const verifier = new Sandbox({ run });
    const result = await verifier.verificar({ tipo: 'pruebas', archivos: [
      { ruta: 'backend/icase.manifest.json', contenido: JSON.stringify({ operations: f.operations, associations: [f.association] }) },
      { ruta: 'tests/package.json', contenido: '{}' }
    ] });
    expect(result.protocolo).toBe('runtime-v2-associations');
    const executions = run.mock.calls.map(([, args]) => args.join(' '));
    expect(executions.some((cmd) => cmd.endsWith('run --rm smoke'))).toBe(true);
    expect(executions.some((cmd) => cmd.endsWith('run --rm tests'))).toBe(true);
  });
  test('la suite exportada incluye el mismo protocolo y JavaScript válido', async () => {
    const f = fixture();
    const suite = new Generator()._contractIntegrationTest({ operations: f.operations, associations: [f.association] });
    expect(suite).toContain("test('N:M '");
    expect(suite).toContain('await exerciseAssociation(api, operations, association, access, auth)');
    const root = fs.mkdtempSync(path.join(__dirname, '.generated-association-suite-'));
    try {
      const target = path.join(root, 'suite.mjs'); fs.writeFileSync(target, suite);
      expect(() => execFileSync(process.execPath, ['--check', target], { stdio: 'pipe' })).not.toThrow();
      const browser = new Generator()._associationsE2eTest({ contract: { operations: f.operations, associations: [{ ...f.association, entities: ['A', 'B'] }] }, screens: [{ route: '/a', operations: ['a'] }], auth: { habilitada: false } });
      expect(browser).toContain("name: 'Asociar'");
      expect(browser).toContain("name: 'Desasociar #'");
      expect(browser).not.toContain('test.skip');
      const browserTarget = path.join(root, 'browser.mjs'); fs.writeFileSync(browserTarget, browser);
      expect(() => execFileSync(process.execPath, ['--check', browserTarget], { stdio: 'pipe' })).not.toThrow();
    } finally {
      if (path.dirname(root) !== __dirname || !path.basename(root).startsWith('.generated-association-suite-')) throw new Error('Ruta no segura');
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
  test('una evidencia anterior no permite aprobar un backend N:M', () => {
    const useCase = new UseCase({});
    useCase.verifier.verificar = () => ({ estado: 'apta_estructuralmente', huella: 'actual' });
    const artifact = { tipo: 'codigo_backend', archivos: [{ ruta: 'backend/icase.manifest.json', contenido: JSON.stringify({ associations: [{}] }) }], verificacion: { estado: 'apta', nivel: 'ejecucion_aislada', huella: 'actual' } };
    expect(() => useCase._exigirVerificacion(artifact)).toThrow('protocolo N:M');
    artifact.verificacion.protocolo = 'runtime-v2-associations';
    expect(() => useCase._exigirVerificacion(artifact)).not.toThrow();
  });
  test('no certifica un inventario vacío que contradiga las asociaciones físicas', async () => {
    const run = jest.fn(async () => ({ stdout: '', stderr: '' }));
    const result = await new Sandbox({ run }).verificar({ tipo: 'codigo_backend', archivos: [{ ruta: 'backend/icase.manifest.json', contenido: JSON.stringify({ associations: [], storage: { associations: [{ table: 'oculta' }] } }) }] });
    expect(result.estado).toBe('fallida');
    expect(result.errores.join(' ')).toContain('inventario N:M');
    expect(run.mock.calls.some(([, args]) => args[0] === 'compose' && args.includes('run'))).toBe(false);
  });
  test('detecta una desasociación que devuelve éxito pero no elimina el vínculo', async () => {
    const f = fixture();
    const api = (url, method, body) => method === 'DELETE' && url.startsWith('/api/associations/') ? Promise.resolve({ status: 200, data: {} }) : f.api(url, method, body);
    await expect(sample.exerciseAssociation(api, f.operations, f.association)).rejects.toThrow('desasociación no persistida');
  });
  test('conserva el error de TypeScript aunque BuildKit añada una traza larga', async () => {
    const run = jest.fn(async (_command, args) => {
      if (args.includes('build')) throw Object.assign(new Error('Build failed'), { stderr: 'src/main.ts(1): error TS7016: Missing declaration\n' + 'traza BuildKit\n'.repeat(1000) });
      return { stdout: '', stderr: '' };
    });
    const result = await new Sandbox({ run }).verificar({ tipo: 'codigo_backend', archivos: [] });
    expect(result.estado).toBe('fallida');
    expect(result.errores.join(' ')).toContain('error TS7016');
  });
});
