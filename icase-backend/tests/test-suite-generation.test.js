const TestSuiteGenerator = require('../src/infrastructure/services/TestSuiteGenerator');

describe('generación del artefacto de pruebas', () => {
  test('crea pruebas unitarias, integración y E2E con dependencias versionadas', async () => {
    const generator = new TestSuiteGenerator();
    const result = await generator.generar({
      proyecto: { nombre: 'Gourmet Flow' },
      versionesOrigen: { codigo_backend: 2, codigo_frontend: 3 },
      insumos: {
        requerimientos: [{ aprobado: true, tipo: 'RF', identificador: 'RF-01', nombre: 'Reservar mesa' }],
        backend: { version: 2, trazabilidad_rf: ['RF-01'], archivos: [{ ruta: 'backend/icase.manifest.json', contenido: JSON.stringify({ operations: [{ id: 'RF-01', key: 'rf-01', collectionPath: '/api/operations/rf-01', methods: ['GET', 'POST', 'PATCH', 'DELETE'] }] }) }] },
        frontend: { version: 3, trazabilidad_rf: ['RF-01'], archivos: [{ ruta: 'frontend/icase.manifest.json', contenido: JSON.stringify({ pantallas: [{ ruta: '/reservas' }] }) }] }
      }
    });
    expect(result.dependencias).toEqual([{ tipo: 'codigo_backend', version: 2 }, { tipo: 'codigo_frontend', version: 3 }]);
    expect(result.archivos.map((item) => item.ruta)).toEqual(expect.arrayContaining([
      'tests/unit/traceability.test.js', 'tests/integration/api-health.test.js', 'tests/e2e/navigation.spec.js'
    ]));
    expect(result.archivos.find((item) => item.ruta.endsWith('navigation.spec.js')).contenido).toContain('/reservas');
    expect(result.archivos.map((item) => item.ruta)).toContain('tests/integration/contract-flow.test.js');
    expect(result.advertencias).not.toContain('La suite solo cubre salud, navegación y trazabilidad; faltan pruebas funcionales.');
  });

  test('reporta RF que no aparecen en ninguno de los códigos aprobados', async () => {
    const result = await new TestSuiteGenerator().generar({
      proyecto: { nombre: 'Demo' }, versionesOrigen: {},
      insumos: { requerimientos: [{ aprobado: true, tipo: 'RF', identificador: 'RF-09', nombre: 'Reporte' }], backend: { version: 1, archivos: [] }, frontend: { version: 1, archivos: [] } }
    });
    expect(result.advertencias[0]).toContain('RF-09');
  });
});
