const fs = require('node:fs');
const path = require('node:path');
const runtime = require('../src/infrastructure/services/SamplePayload');
const GenericBackendGenerator = require('../src/infrastructure/services/GenericBackendGenerator');
const TestSuiteGenerator = require('../src/infrastructure/services/TestSuiteGenerator');

const rf = (identificador, nombre) => ({ identificador, nombre, tipo: 'RF', aprobado: true });
const requirements = [rf('RF-04', 'Gestionar pedidos'), rf('RF-05', 'Consultar reportes')];
const generate = (verbosPorRf) => new GenericBackendGenerator().generate({
  proyecto: { nombre: 'Tienda' }, requirements, stack: { backend: 'Express', base_datos: 'PostgreSQL' }, verbosPorRf
});
const fileOf = (files, ruta) => JSON.parse(files.find((file) => file.ruta === ruta).contenido);

/** API en memoria que registra cada llamada y responde como el backend generado. */
function fakeApi() {
  const calls = [];
  const store = [];
  const api = async (url, method = 'GET', body) => {
    calls.push(`${method} ${url}`);
    if (method === 'POST') { const record = { id: String(store.length + 1), data: { ...body } }; store.push(record); return { status: 201, data: record }; }
    const id = url.split('/').pop();
    if (method === 'PATCH') { const record = store.find((item) => item.id === id); if (record) Object.assign(record.data, body); return { status: record ? 200 : 404, data: record || {} }; }
    if (method === 'DELETE') { const index = store.findIndex((item) => item.id === id); const found = index >= 0; if (found) store.splice(index, 1); return { status: found ? 200 : 404, data: {} }; }
    return { status: 200, data: store };
  };
  return { api, calls };
}
const verbsOf = (calls) => [...new Set(calls.map((call) => call.split(' ')[0]))];

describe('exerciseOperation respeta los métodos declarados', () => {
  const operation = (methods) => ({ id: 'RF-05', key: 'rf-05', collectionPath: '/api/operations/rf-05', schema: { type: 'object', properties: {} }, rules: [], methods });

  test('una operación solo de consulta únicamente lista y pagina', async () => {
    const { api, calls } = fakeApi();
    const op = operation(['GET']);
    await runtime.exerciseOperation(api, [op], op);
    expect(verbsOf(calls)).toEqual(['GET']);
    expect(calls).toContain('GET /api/operations/rf-05?page=1&limit=1');
  });

  test('con GET y POST crea y lista pero no modifica ni elimina', async () => {
    const { api, calls } = fakeApi();
    const op = operation(['GET', 'POST']);
    await runtime.exerciseOperation(api, [op], op);
    expect(verbsOf(calls)).toEqual(['POST', 'GET']);
  });

  test('con GET, POST y PATCH no elimina', async () => {
    const { api, calls } = fakeApi();
    const op = operation(['GET', 'POST', 'PATCH']);
    await runtime.exerciseOperation(api, [op], op);
    expect(verbsOf(calls)).toEqual(expect.arrayContaining(['POST', 'GET', 'PATCH']));
    expect(verbsOf(calls)).not.toContain('DELETE');
  });

  test('comportamiento previo: sin methods o con CRUD completo ejerce todo el ciclo', async () => {
    for (const methods of [undefined, ['GET', 'POST', 'PATCH', 'DELETE']]) {
      const { api, calls } = fakeApi();
      const op = operation(methods);
      await runtime.exerciseOperation(api, [op], op);
      expect(verbsOf(calls)).toEqual(expect.arrayContaining(['POST', 'GET', 'PATCH', 'DELETE']));
    }
  });
});

describe('exerciseOpenApi con operaciones de métodos reducidos', () => {
  const docOf = (files) => fileOf(files, 'backend/openapi.json');
  const operationsOf = (files) => fileOf(files, 'backend/icase.manifest.json').operations;
  const apiFor = (doc) => async () => ({ status: 200, data: doc });

  test('acepta una documentación que solo describe los métodos declarados', async () => {
    const files = generate({ 'RF-05': ['consultar'] });
    await expect(runtime.exerciseOpenApi(apiFor(docOf(files)), operationsOf(files), { habilitada: false })).resolves.toBeUndefined();
  });

  test('rechaza que falte documentar un método declarado', async () => {
    const files = generate({ 'RF-05': ['consultar'] });
    const doc = docOf(generate());
    delete doc.paths['/api/operations/rf-04'].post;
    await expect(runtime.exerciseOpenApi(apiFor(doc), operationsOf(files).filter((op) => op.id === 'RF-04').map((op) => ({ ...op, methods: ['GET', 'POST', 'PATCH', 'DELETE'] })), { habilitada: false })).rejects.toThrow(/crear/);
  });

  test('rechaza que se documente un método que la operación no declara', async () => {
    const files = generate({ 'RF-05': ['consultar'] });
    await expect(runtime.exerciseOpenApi(apiFor(docOf(generate())), operationsOf(files), { habilitada: false })).rejects.toThrow(/rf-05|RF-05/);
  });
});

describe('suite de pruebas generada con operaciones de métodos reducidos', () => {
  const op = (id, methods) => ({ id, key: id.toLowerCase(), entity: null, collectionPath: `/api/operations/${id.toLowerCase()}`, itemPath: `/api/operations/${id.toLowerCase()}/:id`, methods, schema: { type: 'object', properties: {} }, rules: [] });
  const ALL = ['GET', 'POST', 'PATCH', 'DELETE'];
  const build = (operations, { typed = true } = {}) => new TestSuiteGenerator().generar({
    proyecto: { nombre: 'Tienda' }, versionesOrigen: {},
    insumos: {
      requerimientos: [{ aprobado: true, tipo: 'RF', identificador: 'RF-01', nombre: 'A' }, { aprobado: true, tipo: 'RF', identificador: 'RF-02', nombre: 'B' }],
      backend: { version: 1, trazabilidad_rf: ['RF-01', 'RF-02'], archivos: [{ ruta: 'backend/icase.manifest.json', contenido: JSON.stringify({ operations }) }] },
      frontend: { version: 1, trazabilidad_rf: ['RF-01', 'RF-02'], archivos: [{ ruta: 'frontend/icase.manifest.json', contenido: JSON.stringify({
        modulos: { formularios_tipados: typed },
        pantallas: [{ route: '/uno', operations: ['rf-01'] }, { route: '/dos', operations: ['rf-02'] }]
      }) }] }
    }
  });
  const spec = (result, name) => result.archivos.find((file) => file.ruta === `tests/e2e/${name}`)?.contenido || '';

  test('el formulario tipado se prueba en la primera pantalla cuya operación admite el ciclo completo', async () => {
    const result = await build([op('RF-01', ['GET']), op('RF-02', ALL)]);
    expect(spec(result, 'typed-forms.spec.js')).toContain('const route = "/dos";');
    expect(spec(result, 'typed-forms.spec.js')).toContain('"key":"rf-02"');
  });

  test('si ninguna operación admite el ciclo completo la prueba del formulario se omite', async () => {
    const result = await build([op('RF-01', ['GET']), op('RF-02', ['GET'])]);
    expect(spec(result, 'typed-forms.spec.js')).toContain("test.skip('ninguna pantalla tiene una operación con el ciclo completo'");
  });

  test('la pantalla muestra el formulario de su primera operación: si esa está reducida no sirve aunque otra sea completa', async () => {
    const operations = [op('RF-01', ['GET']), op('RF-02', ALL)];
    const multi = (typed) => new TestSuiteGenerator().generar({
      proyecto: { nombre: 'Tienda' }, versionesOrigen: {},
      insumos: {
        requerimientos: [{ aprobado: true, tipo: 'RF', identificador: 'RF-01', nombre: 'A' }],
        backend: { version: 1, trazabilidad_rf: ['RF-01'], archivos: [{ ruta: 'backend/icase.manifest.json', contenido: JSON.stringify({ operations }) }] },
        frontend: { version: 1, trazabilidad_rf: ['RF-01'], archivos: [{ ruta: 'frontend/icase.manifest.json', contenido: JSON.stringify({ modulos: { formularios_tipados: typed }, pantallas: [{ route: '/uno', operations: ['rf-01', 'rf-02'] }] }) }] }
      }
    });
    expect(spec(await multi(true), 'typed-forms.spec.js')).toContain("test.skip('ninguna pantalla tiene una operación con el ciclo completo'");
    expect(spec(await multi(false), 'contract-interaction.spec.js')).toContain("test.skip('ninguna pantalla tiene una operación que admita crear'");
  });

  test('comportamiento previo: con CRUD completo se usa la primera pantalla', async () => {
    const result = await build([op('RF-01', ALL), op('RF-02', ALL)]);
    expect(spec(result, 'typed-forms.spec.js')).toContain('const route = "/uno";');
  });

  test('la prueba de interacción del contrato usa una ruta cuya operación admite crear, u omite la prueba', async () => {
    const narrowed = await build([op('RF-01', ['GET']), op('RF-02', ALL)], { typed: false });
    expect(spec(narrowed, 'contract-interaction.spec.js')).toContain('page.goto("/dos")');
    const none = await build([op('RF-01', ['GET']), op('RF-02', ['GET'])], { typed: false });
    expect(spec(none, 'contract-interaction.spec.js')).toContain("test.skip('ninguna pantalla tiene una operación que admita crear'");
    const full = await build([op('RF-01', ALL), op('RF-02', ALL)], { typed: false });
    expect(spec(full, 'contract-interaction.spec.js')).toContain('page.goto("/uno")');
  });
});

describe('advertencia de operaciones reducidas', () => {
  const BackendScaffoldGenerator = require('../src/infrastructure/services/BackendScaffoldGenerator');
  const run = (verbosPorRf) => new BackendScaffoldGenerator().generar({
    proyecto: { nombre: 'Tienda' }, versionesOrigen: {},
    insumos: { decisiones: { stack_tecnologico: { backend: 'Node.js + Express', base_datos: 'PostgreSQL' } }, requerimientos: requirements, verbosPorRf }
  });

  test('el artefacto avisa qué RF quedaron con métodos reducidos por los mockups', async () => {
    const result = await run({ 'RF-05': ['consultar'] });
    expect(result.advertencias.join('\n')).toContain('RF-05 (GET)');
    expect(result.advertencias.join('\n')).not.toContain('RF-04 (');
  });

  test('sin reducciones no hay aviso', async () => {
    expect((await run(null)).advertencias.join('\n')).not.toContain('métodos reducidos');
  });
});

describe('verificación en sandbox', () => {
  test('la comprobación de integridad referencial del smoke omite una hija que no admite POST y DELETE', () => {
    const source = fs.readFileSync(path.join(__dirname, '../src/infrastructure/templates/verification/smoke.mjs'), 'utf8');
    expect(source).toMatch(/allows\(child, 'POST', 'DELETE'\)/);
  });

  test('la configuración del smoke incluye los métodos de cada operación', () => {
    const source = fs.readFileSync(path.join(__dirname, '../src/infrastructure/services/SandboxRuntimeVerifier.js'), 'utf8');
    expect(source).toMatch(/operations: operations\.map\(\(item\) => \(\{[^}]*methods: item\.methods/);
  });
});
