const CiCdPipelineGenerator = require('../src/infrastructure/services/CiCdPipelineGenerator');

describe('generación del pipeline CI/CD', () => {
  test('vincula pruebas e infraestructura y no despliega sin configuración', async () => {
    const result = await new CiCdPipelineGenerator().generar({
      proyecto: { nombre: 'Gourmet Flow' }, versionesOrigen: { pruebas: 2, infraestructura: 3 },
      insumos: { decisiones: {}, tests: { version: 2, trazabilidad_rf: ['RF-01'] }, infrastructure: { version: 3, trazabilidad_rf: ['RF-01'] } }
    });
    const workflow = result.archivos.find((item) => item.ruta === '.github/workflows/ci-cd.yml').contenido;
    expect(workflow).toContain('npm run test:e2e');
    expect(workflow).toContain('docker compose');
    expect(workflow).not.toContain('npm ci');
    expect(workflow).not.toMatch(/deploy-production|kubectl apply/);
    expect(result.dependencias).toEqual([{ tipo: 'pruebas', version: 2 }, { tipo: 'infraestructura', version: 3 }]);
    expect(result.advertencias[0]).toContain('GitHub Actions');
  });

  test('no advierte proveedor cuando GitHub fue decidido explícitamente', async () => {
    const result = await new CiCdPipelineGenerator().generar({
      proyecto: { nombre: 'Demo' }, versionesOrigen: {},
      insumos: { decisiones: { stack_tecnologico: { ci_cd: 'GitHub Actions' } }, tests: { version: 1 }, infrastructure: { version: 1 } }
    });
    expect(result.advertencias).toEqual([]);
  });
});
