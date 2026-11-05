const BackendScaffoldGenerator = require('../src/infrastructure/services/BackendScaffoldGenerator');
const FrontendScaffoldGenerator = require('../src/infrastructure/services/FrontendScaffoldGenerator');
const TestSuiteGenerator = require('../src/infrastructure/services/TestSuiteGenerator');
const SandboxRuntimeVerifier = require('../src/infrastructure/services/SandboxRuntimeVerifier');

const database = process.argv[2] || 'PostgreSQL';
const backend = process.argv[3] || 'Express';

const PLANTUML = `@startuml
class Cliente {
  +String id
  +String email
}
@enduml`;

const requirements = [
  { aprobado: true, tipo: 'RF', identificador: 'RF-01', nombre: 'Gestionar clientes', actores: ['Cliente'] }
];

async function main() {
  const decisiones = {
    stack_tecnologico: { backend, base_datos: database, frontend: 'React + Vite' },
    control_acceso: {
      autenticacion: { metodo: 'jwt', expiracion: '1h' },
      roles: [{ id: 'cliente', nombre: 'Cliente', incluir: true, autoregistro: false }],
      permisos: [{ operacion: 'RF-01', rol: 'cliente', metodos: ['GET', 'POST', 'PATCH', 'DELETE'], alcance: 'propios' }]
    },
    reglas_negocio: { reglas: [] }
  };
  const backendArtifact = await new BackendScaffoldGenerator().generar({
    proyecto: { nombre: 'Ownership de validación' },
    insumos: { decisiones, requerimientos: requirements, diagramaDominio: { codigo_plantuml: PLANTUML } },
    versionesOrigen: {}
  });
  const screens = [{ pantalla_id: 'screen-0', nombre: 'Clientes', slug: 'clientes', ruta: '/clientes', rf_trazabilidad: ['RF-01'] }];
  const frontendArtifact = await new FrontendScaffoldGenerator().generar({
    proyecto: { nombre: 'Ownership de validación' },
    insumos: { decisiones, diseno: { manifiesto_navegacion: screens, mockups: [] } },
    versionesOrigen: {}
  });
  const testsArtifact = await new TestSuiteGenerator().generar({
    proyecto: { nombre: 'Ownership de validación' },
    insumos: { requerimientos: requirements, backend: { ...backendArtifact, version: 1 }, frontend: { ...frontendArtifact, version: 1 } },
    versionesOrigen: {}
  });
  if (process.argv.includes('--generate-only')) {
    const model = backendArtifact.archivos.find((file) => file.ruta === 'backend/src/data/model.js').contenido;
    if (!model.includes('owner_id')) throw new Error('El modelo generado no incluye owner_id');
    console.log(JSON.stringify({ estado: 'generado', archivos: backendArtifact.archivos.length + frontendArtifact.archivos.length + testsArtifact.archivos.length }));
    return;
  }
  const result = await new SandboxRuntimeVerifier().verificar({
    tipo: 'pruebas',
    archivos: [...backendArtifact.archivos, ...frontendArtifact.archivos, ...testsArtifact.archivos]
  });
  console.log(JSON.stringify(result, null, 2));
  if (result.estado !== 'apta') process.exitCode = 1;
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
