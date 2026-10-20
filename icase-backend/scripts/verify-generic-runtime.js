const BackendScaffoldGenerator = require('../src/infrastructure/services/BackendScaffoldGenerator');
const FrontendScaffoldGenerator = require('../src/infrastructure/services/FrontendScaffoldGenerator');
const TestSuiteGenerator = require('../src/infrastructure/services/TestSuiteGenerator');
const SandboxRuntimeVerifier = require('../src/infrastructure/services/SandboxRuntimeVerifier');

async function main() {
  const database = process.argv[2] || 'PostgreSQL';
  const backend = process.argv[3] || 'NestJS';
  const full = process.argv[4] === 'full';
  const requirements = [
    { aprobado: true, tipo: 'RF', identificador: 'RF-01', nombre: 'Registrar préstamos' },
    { aprobado: true, tipo: 'RF', identificador: 'RF-02', nombre: 'Procesar devoluciones' }
  ];
  const backendArtifact = await new BackendScaffoldGenerator().generar({
    proyecto: { nombre: 'Biblioteca de validación' },
    insumos: { decisiones: { stack_tecnologico: { backend, base_datos: database } }, requerimientos: requirements },
    versionesOrigen: {}
  });
  let artifact = { tipo: 'codigo_backend', archivos: backendArtifact.archivos };
  if (full) {
    const screens = requirements.map((item, index) => ({ pantalla_id: `screen-${index}`, nombre: item.nombre, slug: `screen-${index}`, ruta: `/screen-${index}`, rf_trazabilidad: [item.identificador] }));
    const frontendArtifact = await new FrontendScaffoldGenerator().generar({ proyecto: { nombre: 'Biblioteca de validación' }, insumos: { decisiones: { stack_tecnologico: { frontend: 'React + Vite' } }, diseno: { manifiesto_navegacion: screens, mockups: [] } }, versionesOrigen: {} });
    const testsArtifact = await new TestSuiteGenerator().generar({ proyecto: { nombre: 'Biblioteca de validación' }, insumos: { requerimientos: requirements, backend: { ...backendArtifact, version: 1 }, frontend: { ...frontendArtifact, version: 1 } }, versionesOrigen: {} });
    artifact = { tipo: 'pruebas', archivos: [...backendArtifact.archivos, ...frontendArtifact.archivos, ...testsArtifact.archivos] };
  }
  const result = await new SandboxRuntimeVerifier().verificar(artifact);
  console.log(JSON.stringify(result, null, 2));
  if (result.estado !== 'apta') process.exitCode = 1;
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
