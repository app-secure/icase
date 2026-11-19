const esbuild = require('esbuild');
const TestSuiteGenerator = require('../src/infrastructure/services/TestSuiteGenerator');

const accion = (name, type, path) => ({ name, type, method: type === 'consulta' ? 'GET' : 'POST', path, capability: 'rf-02', filters: [], inputs: [], output: ['codigo'] });
const manifestBackend = {
  spec: { version: 1 }, auth: { habilitada: false },
  operations: [{ id: 'RF-02', key: 'rf-02', name: 'Reservas', collectionPath: '/api/operations/rf-02', itemPath: '/api/operations/rf-02/:id', methods: ['GET', 'POST', 'PATCH', 'DELETE'], schema: { type: 'object', properties: { codigo: { type: 'string' } } }, actions: [accion('listarReservas', 'consulta', '/api/actions/listar-reservas'), accion('confirmarReserva', 'transicion', '/api/actions/confirmar-reserva/:id')] }]
};
const manifestFrontend = {
  pantallas: [
    { id: 'reservas', name: 'Reservas', route: '/reservas', operations: ['rf-02'], origen: 'especificacion', especificacion: { componentes: 1, operaciones: ['listarReservas'], bloques: [{ tipo: 'tarjetas', operacion: 'listarReservas' }] } },
    { id: 'clientes', name: 'Clientes', route: '/clientes', operations: ['rf-02'] },
    { id: 'resumen', name: 'Resumen', route: '/resumen', operations: ['rf-02'], origen: 'especificacion', especificacion: { componentes: 2, operaciones: ['listarReservas'], bloques: [{ tipo: 'tarjetas', operacion: 'listarReservas' }, { tipo: 'tabla', operacion: 'listarReservas' }] } }
  ]
};

const generar = () => new TestSuiteGenerator().generar({
  proyecto: { nombre: 'Demo' }, versionesOrigen: {},
  insumos: {
    requerimientos: [{ aprobado: true, tipo: 'RF', identificador: 'RF-02', nombre: 'Reservas' }],
    backend: { version: 1, archivos: [{ ruta: 'backend/icase.manifest.json', contenido: JSON.stringify(manifestBackend) }], trazabilidad_rf: ['RF-02'] },
    frontend: { version: 1, archivos: [{ ruta: 'frontend/icase.manifest.json', contenido: JSON.stringify(manifestFrontend) }, { ruta: 'frontend/package.json', contenido: '{}' }], trazabilidad_rf: ['RF-02'] }
  }
});

describe('pruebas de las pantallas construidas desde la especificación', () => {
  test('se genera una prueba por pantalla de la especificación y compila', async () => {
    const { archivos } = await generar();
    const spec = archivos.find((item) => item.ruta === 'tests/e2e/spec-screens.spec.js')?.contenido;
    expect(spec).toBeDefined();
    expect(spec).toContain('/api/actions/listar-reservas');
    expect(spec).toContain('"id":"reservas"');
    expect(spec).not.toContain('"id":"clientes"');
    expect(() => esbuild.transformSync(spec, { loader: 'js', format: 'esm' })).not.toThrow();
  });

  test('solo cuenta las filas si la pantalla tiene una única lista; con varias comprueba lo básico', async () => {
    const { archivos } = await generar();
    const casos = JSON.parse(/const cases = (\[.*\]);/.exec(archivos.find((item) => item.ruta === 'tests/e2e/spec-screens.spec.js').contenido)[1]);
    expect(casos.find((item) => item.id === 'reservas').single).toBe(true);
    expect(casos.find((item) => item.id === 'resumen').single).toBe(false);
  });

  test('las pantallas de la especificación no entran en las pruebas de formularios del editor de registros', async () => {
    const { archivos } = await generar();
    const forms = archivos.find((item) => item.ruta === 'tests/e2e/typed-forms.spec.js')?.contenido || '';
    expect(forms).not.toContain('/reservas');
  });

  test('se incluye también la prueba de integración de las operaciones', async () => {
    const { archivos } = await generar();
    expect(archivos.some((item) => item.ruta === 'tests/integration/actions.test.js')).toBe(true);
  });
});
