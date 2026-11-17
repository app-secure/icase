const VerificationDiagnosisService = require('../src/core/services/VerificationDiagnosisService');

const archivos = ['backend/src/auth.service.ts', 'backend/src/actions/actions.js', 'backend/src/modules/rf-04/rf-04.module.ts', 'frontend/src/App.jsx', 'frontend/src/pages/mesas-asignadas.jsx', 'tests/e2e/navigation.spec.js', 'tests/integration/actions.test.js'].map((ruta) => ({ ruta }));
const servicio = new VerificationDiagnosisService();
const diagnosticar = (errores, extra = {}) => servicio.diagnosticar({ errores, archivos, ...extra });

describe('diagnóstico de verificaciones fallidas', () => {
  test('ubica un error de TypeScript por archivo, línea y columna', () => {
    const { ubicados } = diagnosticar(['src/auth.service.ts(12,5): error TS2322: Type string is not assignable to type number.']);
    expect(ubicados).toEqual([expect.objectContaining({ archivo: 'backend/src/auth.service.ts', linea: 12, columna: 5, categoria: 'compilacion', mensaje: 'TS2322: Type string is not assignable to type number.', corregible_aqui: true })]);
  });

  test('ubica errores de esbuild y de Vite y dice qué pantalla afectan', () => {
    const resultado = diagnosticar([
      'frontend/src/pages/mesas-asignadas.jsx:30:7: ERROR: Unexpected "}"',
      '[vite]: Rollup failed to resolve import. src/App.jsx (8:19): "./Falta" no se puede resolver'
    ]);
    expect(resultado.ubicados.map((item) => [item.archivo, item.linea])).toEqual([['frontend/src/pages/mesas-asignadas.jsx', 30], ['frontend/src/App.jsx', 8]]);
    expect(resultado.ubicados[0].afecta).toEqual({ tipo: 'pantalla', id: 'mesas-asignadas' });
  });

  test('ubica fallos de pruebas y trazas de Node con rutas del contenedor', () => {
    const resultado = diagnosticar([
      'Error: expect(received).toBeVisible()\n    at tests/e2e/navigation.spec.js:44:18',
      'TypeError: x is not a function\n    at run (/app/src/actions/actions.js:57:11)'
    ]);
    expect(resultado.ubicados.map((item) => [item.archivo, item.linea, item.categoria])).toEqual([['tests/e2e/navigation.spec.js', 44, 'prueba'], ['backend/src/actions/actions.js', 57, 'ejecucion']]);
    expect(resultado.ubicados[1].afecta.tipo).toBe('operaciones');
  });

  test('lo que no se puede ubicar se devuelve aparte y no se inventa una ubicación', () => {
    const resultado = diagnosticar(['Cannot connect to the Docker daemon', 'src/inexistente.ts(1,1): error TS1: x']);
    expect(resultado.ubicados).toEqual([]);
    expect(resultado.sin_ubicacion).toHaveLength(2);
  });

  test('marca si el archivo pertenece al artefacto que se está corrigiendo', () => {
    const { ubicados } = diagnosticar(['src/auth.service.ts(1,1): error TS1: x', 'tests/e2e/navigation.spec.js:5:1 falló'], { editables: ['tests/e2e/navigation.spec.js'] });
    expect(ubicados.find((item) => item.archivo.startsWith('backend/')).corregible_aqui).toBe(false);
    expect(ubicados.find((item) => item.archivo.startsWith('tests/')).corregible_aqui).toBe(true);
  });

  test('no repite el mismo hallazgo y limita la cantidad', () => {
    const repetido = Array.from({ length: 3 }, () => 'src/auth.service.ts(12,5): error TS1: igual');
    expect(diagnosticar(repetido).ubicados).toHaveLength(1);
    const muchos = Array.from({ length: 50 }, (_, index) => `src/auth.service.ts(${index + 1},1): error TS1: distinto ${index}`);
    const resultado = diagnosticar(muchos);
    expect(resultado.ubicados).toHaveLength(30);
    expect(resultado.total).toBe(50);
  });

  test('sin errores no produce nada', () => {
    expect(diagnosticar([])).toEqual({ ubicados: [], sin_ubicacion: [], total: 0 });
  });
});
