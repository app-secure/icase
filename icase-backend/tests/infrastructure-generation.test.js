const InfrastructureGenerator = require('../src/infrastructure/services/InfrastructureGenerator');

describe('generación de infraestructura', () => {
  const base = {
    proyecto: { nombre: 'Gourmet Flow' }, versionesOrigen: { codigo_backend: 1, codigo_frontend: 2 },
    insumos: {
      decisiones: { stack_tecnologico: { backend: 'Node.js + NestJS', base_datos: 'PostgreSQL' } },
      requerimientos: [{ aprobado: true, tipo: 'RNF', nombre: 'Rendimiento', descripcion: 'Respuesta menor a un segundo' }],
      diagramas: [{ aprobado: true, estado: 'aprobado', tipo: 'arquitectura_sistema', version: 1, descripcion: 'Servidor de aplicación y PostgreSQL' }],
      backend: { version: 1, trazabilidad_rf: ['RF-01'] }, frontend: { version: 2, trazabilidad_rf: ['RF-01'] }
    }
  };

  test('crea contenedores y persistencia según el stack aprobado', async () => {
    const result = await new InfrastructureGenerator().generar(base);
    const compose = result.archivos.find((item) => item.ruta === 'ops/docker-compose.yml').contenido;
    const dockerfile = result.archivos.find((item) => item.ruta === 'ops/docker/backend.Dockerfile').contenido;
    expect(compose).toContain('postgres:16-alpine');
    expect(compose).toContain('/var/lib/postgresql/data');
    expect(dockerfile).toContain('npm run build');
    expect(result.dependencias).toEqual([{ tipo: 'codigo_backend', version: 1 }, { tipo: 'codigo_frontend', version: 2 }]);
  });

  test('no inventa alta disponibilidad y solo crea el override cuando fue solicitada', async () => {
    const normal = await new InfrastructureGenerator().generar(base);
    expect(normal.archivos.some((item) => item.ruta === 'ops/docker-compose.ha.yml')).toBe(false);
    const ha = await new InfrastructureGenerator().generar({ ...base, insumos: { ...base.insumos, requerimientos: [{ aprobado: true, tipo: 'RNF', nombre: 'Alta disponibilidad', descripcion: 'Dos réplicas y failover' }] } });
    expect(ha.archivos.some((item) => item.ruta === 'ops/docker-compose.ha.yml')).toBe(true);
  });
});
