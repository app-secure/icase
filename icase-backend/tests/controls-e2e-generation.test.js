const { transformSync } = require('esbuild');
const TestSuiteGenerator = require('../src/infrastructure/services/TestSuiteGenerator');

const generate = (manifest) => new TestSuiteGenerator().generar({
  proyecto: { nombre: 'Ventas' }, versionesOrigen: {},
  insumos: {
    requerimientos: [],
    backend: { version: 1, archivos: [] },
    frontend: { version: 1, archivos: [{ ruta: 'frontend/icase.manifest.json', contenido: JSON.stringify(manifest) }] }
  }
});

const controlsSpec = (result) => result.archivos.find((file) => file.ruta === 'tests/e2e/controls.spec.js');

describe('prueba e2e de controles visibles', () => {
  test('con sesión: recorre el menú de cada rol, pulsa cada control del mockup y compila', async () => {
    const result = await generate({
      auth: { habilitada: true },
      pantallas: [{ id: 'pedidos', route: '/pedidos', roles: ['vendedor'] }, { id: 'caja', route: '/caja', roles: ['cajero', 'vendedor'] }]
    });
    const spec = controlsSpec(result);
    expect(spec).toBeDefined();
    const code = spec.contenido;
    expect(code).toContain('const roles = ["administrador","vendedor","cajero"]');
    expect(code).toContain('async function tokenFor(role)');
    expect(code).toContain('.mockup-content button');
    expect(code).toContain('window.confirm = ');
    expect(code).toContain('window.prompt = ');
    expect(code).toContain("request.url().includes('/api/')");
    expect(code).toContain('[data-icase-result]');
    expect(code).toContain('MutationObserver');
    expect(code).toMatch(/cerrar sesi\[oó\]n/);
    expect(code).toContain('el.disabled');
    expect(() => transformSync(code, { loader: 'js', format: 'esm' })).not.toThrow();
  });

  test('sin sesión: una sola pasada sin login, también compila', async () => {
    const code = controlsSpec(await generate({ pantallas: [{ id: 'inicio', route: '/' }] })).contenido;
    expect(code).toContain('const roles = [null]');
    expect(code).not.toContain('async function tokenFor');
    expect(() => transformSync(code, { loader: 'js', format: 'esm' })).not.toThrow();
  });

  test('la función de sonda corre en un navegador: su fuente sin plantilla es JavaScript válido', async () => {
    const code = controlsSpec(await generate({ pantallas: [] })).contenido;
    const source = code.slice(code.indexOf('function probe('), code.indexOf('async function settle('));
    // eslint-disable-next-line no-new-func
    const probe = new Function(source + '; return probe;')();
    expect(typeof probe).toBe('function');
    expect(source).toContain('/\\s+/g');
  });
});
