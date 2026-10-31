const BackendScaffoldGenerator = require('../src/infrastructure/services/BackendScaffoldGenerator');
const FrontendScaffoldGenerator = require('../src/infrastructure/services/FrontendScaffoldGenerator');
const TestSuiteGenerator = require('../src/infrastructure/services/TestSuiteGenerator');
const ArtifactVerificationService = require('../src/core/services/ArtifactVerificationService');
const SandboxRuntimeVerifier = require('../src/infrastructure/services/SandboxRuntimeVerifier');
const CiCdPipelineGenerator = require('../src/infrastructure/services/CiCdPipelineGenerator');

const names = [
  'Consulta de menú y disponibilidad', 'Reserva de mesas y sillas', 'Compra de paquetes semanales prepagados',
  'Acumulación de puntos por compras', 'Gestión de mesas asignadas para meseros', 'Toma de pedidos en sala',
  'Validación de reserva mediante código QR', 'Visualización de comandas en cocina KDS',
  'Actualización de disponibilidad de platos desde cocina', 'Procesamiento de cobros y cierre de caja',
  'Gestión de reportes globales y precios del menú', 'Control de acceso basado en roles y autenticación JWT'
];
const rf = names.map((nombre, index) => ({ aprobado: true, tipo: 'RF', identificador: `RF-${String(index + 1).padStart(2, '0')}`, nombre }));

describe('generación funcional genérica', () => {
  test('genera operaciones persistentes para cualquier conjunto de RF', async () => {
    const backend = await new BackendScaffoldGenerator().generar({ proyecto: { nombre: 'Restaurante' },
      insumos: { decisiones: { stack_tecnologico: { backend: 'NestJS', base_datos: 'PostgreSQL' } }, requerimientos: rf }, versionesOrigen: {} });
    expect(backend.generado_por).toBe('generador_backend_generico_v2');
    const paths = backend.archivos.map((item) => item.ruta);
    expect(paths).toContain('backend/src/app.controller.ts');
    expect(paths).toContain('backend/src/record.store.ts');
    expect(paths).toContain('backend/src/modules/rf-02/rf-02.module.ts');
    const manifest = JSON.parse(backend.archivos.find((item) => item.ruta === 'backend/icase.manifest.json').contenido);
    expect(manifest.operations).toHaveLength(rf.length);
    expect(manifest.operations[0].collectionPath).toBe('/api/operations/rf-01');
    expect(new ArtifactVerificationService().verificar({ tipo: 'codigo_backend', archivos: backend.archivos }).estado).toBe('apta_estructuralmente');
  });

  test('conecta pantallas React al contrato y genera pruebas CRUD sin depender del dominio', async () => {
    const backend = await new BackendScaffoldGenerator().generar({ proyecto: { nombre: 'Restaurante' },
      insumos: { decisiones: { stack_tecnologico: { backend: 'NestJS', base_datos: 'PostgreSQL' } }, requerimientos: rf }, versionesOrigen: {} });
    const screens = ['Inicio de sesión', 'Vista de menú y disponibilidad', 'Formulario de reserva de mesa o silla', 'Formulario de toma de comanda', 'Módulo de procesamiento de cobros']
      .map((nombre, index) => ({ pantalla_id: String(index), nombre, slug: `screen-${index}`, ruta: `/screen-${index}`, rf_trazabilidad: [rf[index].identificador] }));
    const frontend = await new FrontendScaffoldGenerator().generar({ proyecto: { nombre: 'Restaurante' },
      insumos: { decisiones: { stack_tecnologico: { frontend: 'React + Vite' } }, diseno: { manifiesto_navegacion: screens, mockups: [] } }, versionesOrigen: {} });
    expect(frontend.generado_por).toBe('generador_frontend_generico_v2');
    const source = (ruta) => frontend.archivos.find((item) => item.ruta === ruta).contenido;
    expect(source('frontend/src/OperationScreen.jsx')).toContain('useSession');
    expect(source('frontend/src/session.jsx')).toContain('fetch(path');
    expect(new ArtifactVerificationService().verificar({ tipo: 'codigo_frontend', archivos: frontend.archivos }).estado).toBe('apta_estructuralmente');
    const mobile = await new FrontendScaffoldGenerator().generar({ proyecto: { nombre: 'Restaurante' },
      insumos: { decisiones: { stack_tecnologico: { frontend: 'React + Vite' }, alcance_plataforma: { plataformas: ['web', 'móvil'] } },
        diseno: { manifiesto_navegacion: screens, mockups: [] } }, versionesOrigen: {} });
    expect(mobile.archivos.map((item) => item.ruta)).toContain('mobile/package.json');
    expect(new ArtifactVerificationService().verificar({ tipo: 'codigo_frontend', archivos: mobile.archivos }).estado).toBe('apta_estructuralmente');
    const tests = await new TestSuiteGenerator().generar({ proyecto: { nombre: 'Restaurante' },
      insumos: { requerimientos: rf, backend: { ...backend, version: 1 }, frontend: { ...frontend, version: 1 } }, versionesOrigen: {} });
    expect(tests.archivos.map((item) => item.ruta)).toContain('tests/integration/contract-flow.test.js');
    expect(new ArtifactVerificationService().verificar({ tipo: 'pruebas', archivos: tests.archivos }).estado).toBe('apta_estructuralmente');
  });

  test('el mismo generador funciona para un dominio no relacionado con restaurantes', async () => {
    const libraryRf = [
      { aprobado: true, tipo: 'RF', identificador: 'RF-01', nombre: 'Registrar préstamos de libros' },
      { aprobado: true, tipo: 'RF', identificador: 'RF-02', nombre: 'Gestionar devoluciones' }
    ];
    const backend = await new BackendScaffoldGenerator().generar({ proyecto: { nombre: 'Biblioteca' },
      insumos: { decisiones: { stack_tecnologico: { backend: 'Node.js + Express', base_datos: 'MongoDB' } }, requerimientos: libraryRf }, versionesOrigen: {} });
    const manifest = JSON.parse(backend.archivos.find((item) => item.ruta === 'backend/icase.manifest.json').contenido);
    expect(manifest.project).toBe('Biblioteca');
    expect(manifest.database).toBe('mongodb');
    expect(manifest.operations.map((item) => item.id)).toEqual(['RF-01', 'RF-02']);
    expect(new ArtifactVerificationService().verificar({ tipo: 'codigo_backend', archivos: backend.archivos }).estado).toBe('apta_estructuralmente');
  });

  test('la verificación aislada informa un fallo de Docker sin declarar apto el artefacto', async () => {
    const verifier = new SandboxRuntimeVerifier({ run: jest.fn().mockRejectedValue(new Error('Docker no disponible')) });
    const result = await verifier.verificar({ tipo: 'codigo_frontend', archivos: [{ ruta: 'frontend/package.json', contenido: '{}' }] });
    expect(result.estado).toBe('fallida');
    expect(result.errores[0]).toMatch(/Docker no disponible/);
  });

  test('el pipeline incluye el bundle móvil cuando el alcance lo requiere', async () => {
    const result = await new CiCdPipelineGenerator().generar({ proyecto: { nombre: 'Restaurante' },
      insumos: { tests: { version: 1, trazabilidad_rf: [] }, infrastructure: { version: 1, trazabilidad_rf: [] },
        decisiones: { alcance_plataforma: { plataformas: ['web', 'móvil'] } } }, versionesOrigen: {} });
    expect(result.archivos.find((item) => item.ruta === '.github/workflows/ci-cd.yml').contenido).toContain('npm run export:android');
  });
});
