const StackCatalog = require('../src/core/services/StackCatalog');
const BackendScaffoldGenerator = require('../src/infrastructure/services/BackendScaffoldGenerator');
const InfrastructureGenerator = require('../src/infrastructure/services/InfrastructureGenerator');
const CiCdPipelineGenerator = require('../src/infrastructure/services/CiCdPipelineGenerator');
const ArtifactVerificationService = require('../src/core/services/ArtifactVerificationService');
const CodePlanningProposalService = require('../src/core/services/CodePlanningProposalService');
const GestionarPlanCodificacion = require('../src/core/use-cases/GestionarPlanCodificacion');
const CodeGenerationWorkflowService = require('../src/core/services/CodeGenerationWorkflowService');
const { CODE_PHASE_STATES } = require('../src/core/constants/CodeGenerationPhases');
const renderTemplate = require('../src/infrastructure/services/renderTemplate');

describe('StackCatalog', () => {
  test.each([
    [{}, { backend: 'express', database: 'mongodb', language: 'node' }],
    [{ backend: 'Node.js/Express', base_datos: 'MongoDB' }, { backend: 'express', database: 'mongodb', language: 'node' }],
    [{ backend: 'Node.js + NestJS', base_datos: 'PostgreSQL' }, { backend: 'nest', database: 'postgres', language: 'node' }],
    [{ backend: 'Node.js' }, { backend: 'express', database: 'mongodb', language: 'node' }],
    [{ backend: 'JavaScript + Express' }, { backend: 'express', database: 'mongodb', language: 'node' }],
    [{ backend: 'Java + Spring Boot', base_datos: 'MySQL' }, { backend: 'spring', database: 'mysql', language: 'java' }],
    [{ backend: 'Spring Boot' }, { backend: 'spring', database: 'postgres', language: 'java' }],
    [{ backend: 'Node.js 22 + Express 4', base_datos: 'MongoDB 8', frontend: 'React 19 + Vite 8' }, { backend: 'express', database: 'mongodb', language: 'node' }]
  ])('resuelve %j', (stack, expected) => {
    expect(StackCatalog.resolve(stack)).toEqual(expected);
  });

  test.each([
    [{ backend: 'Django' }, 'El backend «Django» no está soportado todavía'],
    [{ backend: 'Express', base_datos: 'Oracle' }, 'La base de datos «Oracle» no está soportada todavía'],
    [{ backend: 'Express', frontend: 'Vue' }, 'El frontend «Vue» no está soportado todavía'],
    [{ backend: 'Spring Boot', base_datos: 'MongoDB' }, 'solo se genera con bases de datos relacionales']
  ])('rechaza %j con un mensaje que explica qué sí hay', (stack, message) => {
    expect(() => StackCatalog.resolve(stack)).toThrow(message);
  });

  test('el mensaje de error nombra las alternativas', () => {
    expect(() => StackCatalog.resolve({ backend: 'Django' })).toThrow('Node.js + Express, Node.js + NestJS, Java + Spring Boot');
    expect(() => StackCatalog.resolve({ backend: 'Spring', base_datos: 'MongoDB' })).toThrow('Elige PostgreSQL, MySQL');
  });

  test('expone lo soportado para la interfaz', () => {
    const supported = StackCatalog.supported();
    expect(supported.backends.map((item) => item.id)).toEqual(['express', 'nest', 'spring']);
    expect(supported.combinaciones_no_soportadas[0]).toMatchObject({ backend: 'spring', database: 'mongodb' });
  });
});

describe('propuesta y validación de la etapa de stack', () => {
  const propose = (texto) => new CodePlanningProposalService().generar({
    etapa: 'stack_tecnologico', proyecto: {}, diagramas: [], plan: { etapas: [] },
    requerimientos: [{ aprobado: true, tipo: 'RF', identificador: 'RF-01', nombre: 'Algo', descripcion: texto }]
  });

  test('detecta Java/Spring y propone una base relacional en lugar de MongoDB', () => {
    const { propuesta, advertencias } = propose('El sistema usará Spring Boot con MongoDB.');
    expect(propuesta).toMatchObject({ backend: 'Java + Spring Boot', base_datos: 'PostgreSQL', gestor_paquetes: 'Maven' });
    expect(advertencias.join(' ')).toContain('solo se genera con PostgreSQL o MySQL');
  });

  test('avisa por su nombre de las tecnologías que los requisitos piden y no están soportadas', () => {
    const { advertencias } = propose('La API se hará con Django y la interfaz con Angular sobre Oracle.');
    const text = advertencias.join(' ');
    expect(text).toContain('Python');
    expect(text).toContain('Vue / Angular / Svelte');
    expect(text).toContain('esa base de datos');
    expect(text).toContain('que todavía no está soportado');
  });

  test('sin mención de tecnologías no soportadas no hay avisos extra', () => {
    expect(propose('Sistema con Express, React y PostgreSQL.').advertencias).toEqual([]);
  });

  const entorno = async () => {
    let plan = null;
    const repo = {
      obtenerPorProyecto: async () => plan,
      crear: async ({ proyecto_id, etapas }) => { plan = { proyecto_id, version: 1, etapas }; return plan; },
      guardar: async (_id, cambios) => { plan = { ...plan, ...cambios }; return plan; }
    };
    const useCase = new GestionarPlanCodificacion({ proyectoRepository: { obtenerPorId: async () => ({ id: 'p1', nombre: 'Demo', estado_fase: 'mockups_aprobados' }) }, planCodificacionRepository: repo });
    await useCase.obtener('p1');
    const workflow = new CodeGenerationWorkflowService();
    await repo.guardar('p1', { etapas: workflow.sincronizarBloqueos(workflow.crearEtapasIniciales().map((item) => (item.etapa === 'alcance_plataforma' ? { ...item, estado: CODE_PHASE_STATES.APPROVED, version: 1, propuesta: { ok: true } } : item))) });
    return useCase;
  };

  test('un stack no soportado se rechaza al proponerlo, no al generar', async () => {
    const useCase = await entorno();
    await expect(useCase.proponer({ proyectoId: 'p1', etapa: 'stack_tecnologico', propuesta: { backend: 'Java + Spring Boot', base_datos: 'Oracle' } }))
      .rejects.toThrow('La base de datos «Oracle» no está soportada');
    await expect(useCase.proponer({ proyectoId: 'p1', etapa: 'stack_tecnologico', propuesta: { backend: 'Spring Boot', base_datos: 'MongoDB' } }))
      .rejects.toThrow('solo se genera con bases de datos relacionales');
    await expect(useCase.proponer({ proyectoId: 'p1', etapa: 'stack_tecnologico', propuesta: { backend: 'Java + Spring Boot', base_datos: 'MySQL' } })).resolves.toBeDefined();
  });
});

describe('backend Java + Spring Boot generado', () => {
  const PLANTUML = `@startuml
class Cliente {
  +String id
  +String email
}
class Reserva {
  +String id
  +int comensales
}
Cliente "1" --> "0..*" Reserva
@enduml`;
  const requirements = [
    { aprobado: true, tipo: 'RF', identificador: 'RF-01', nombre: 'Gestionar clientes', actores: ['Cliente'] },
    { aprobado: true, tipo: 'RF', identificador: 'RF-02', nombre: 'Registrar reservas', actores: ['Mesero'] }
  ];
  const acceso = { autenticacion: { metodo: 'jwt', expiracion: '1h' }, roles: [{ nombre: 'Cliente', incluir: true }], permisos: [{ operacion: 'RF-01', rol: 'cliente', metodos: ['GET'] }] };
  const generate = async (base_datos, control = acceso) => new BackendScaffoldGenerator().generar({
    proyecto: { nombre: 'Demo Java' },
    insumos: { decisiones: { stack_tecnologico: { backend: 'Java + Spring Boot', base_datos }, control_acceso: control }, requerimientos: requirements, diagramaDominio: { codigo_plantuml: PLANTUML } },
    versionesOrigen: {}
  });
  const file = (result, ruta) => result.archivos.find((item) => item.ruta === ruta)?.contenido;

  test('produce un proyecto Maven completo con el código fijo y los datos del contrato como recursos', async () => {
    const result = await generate('PostgreSQL');
    const paths = result.archivos.map((item) => item.ruta);
    expect(paths).toEqual(expect.arrayContaining([
      'backend/pom.xml', 'backend/README.md', 'backend/openapi.json', 'backend/src/main/resources/application.properties',
      'backend/src/main/java/app/Application.java', 'backend/src/main/java/app/RecordStore.java', 'backend/src/main/java/app/Auth.java',
      'backend/src/main/resources/icase/contract.json', 'backend/src/main/resources/icase/model.json', 'backend/src/main/resources/icase/rules.json',
      'backend/src/main/resources/icase/policy.json', 'backend/src/main/resources/icase/openapi.json',
      'backend/src/main/resources/db/migration/V1__init.sql', 'backend/src/main/resources/db/migration/V2__auth.sql'
    ]));
    expect(paths.some((item) => item.endsWith('package.json'))).toBe(false);
    expect(result.archivos.every((item) => item.huella.length === 64)).toBe(true);
    const manifest = JSON.parse(file(result, 'backend/icase.manifest.json'));
    expect(manifest.stack).toEqual({ backend: 'spring', lenguaje: 'java' });
    expect(manifest.database).toBe('postgres');
    expect(JSON.parse(file(result, 'backend/src/main/resources/icase/policy.json')).habilitada).toBe(true);
    expect(JSON.parse(file(result, 'backend/src/main/resources/icase/model.json')).tables.reserva).toBeDefined();
  });

  test('el pom declara el controlador y el módulo de Flyway del motor elegido, y ningún marcador queda sin rellenar', async () => {
    const postgres = file(await generate('PostgreSQL'), 'backend/pom.xml');
    expect(postgres).toContain('<artifactId>demo-java-backend</artifactId>');
    expect(postgres).toContain('org.postgresql');
    expect(postgres).toContain('flyway-database-postgresql');
    expect(postgres).not.toContain('mysql');
    const mysql = file(await generate('MySQL'), 'backend/pom.xml');
    expect(mysql).toContain('mysql-connector-j');
    expect(mysql).toContain('flyway-mysql');
    expect(mysql).not.toContain('org.postgresql');
    expect(postgres + mysql).not.toMatch(/__[A-Z_]+__/);
  });

  test('las migraciones usan el formato de Flyway y no se genera la de usuarios sin autenticación', async () => {
    const withAuth = await generate('PostgreSQL');
    expect(file(withAuth, 'backend/src/main/resources/db/migration/V1__init.sql')).toContain('CREATE TABLE IF NOT EXISTS "cliente"');
    expect(file(withAuth, 'backend/src/main/resources/db/migration/V2__auth.sql')).toContain('"icase_users"');
    const without = await generate('MySQL', { ...acceso, autenticacion: { metodo: 'ninguna', expiracion: '1h' } });
    expect(without.archivos.map((item) => item.ruta)).not.toContain('backend/src/main/resources/db/migration/V2__auth.sql');
    expect(JSON.parse(file(without, 'backend/src/main/resources/icase/policy.json'))).toEqual({ habilitada: false });
    expect(file(without, 'backend/src/main/resources/db/migration/V1__init.sql')).toContain('`cliente`');
  });

  test('MongoDB con Java se rechaza al generar con un mensaje claro', async () => {
    await expect(generate('MongoDB')).rejects.toThrow('solo se genera con bases de datos relacionales');
  });

  test('pasa la verificación estructural y esta detecta un controlador de base de datos ausente', async () => {
    const result = await generate('PostgreSQL');
    const verify = (archivos) => new ArtifactVerificationService().verificar({ tipo: 'codigo_backend', archivos });
    expect(verify(result.archivos)).toMatchObject({ estado: 'apta_estructuralmente', errores: [] });
    const broken = result.archivos.map((item) => (item.ruta === 'backend/pom.xml' ? { ...item, contenido: item.contenido.replace(/org\.postgresql/g, 'org.otro') } : item));
    expect(verify(broken).errores.join(' ')).toContain('el pom.xml no incluye su controlador');
    expect(verify(result.archivos.filter((item) => item.ruta !== 'backend/pom.xml')).errores.join(' ')).toContain('Falta el archivo backend/pom.xml');
  });

  test('el Java fijo declara los comportamientos que verifica el contrato HTTP', async () => {
    const java = (name) => file(result, `backend/src/main/java/app/${name}.java`);
    const result = await generate('PostgreSQL');
    expect(java('Auth')).toContain('Algorithm.HMAC256');
    expect(java('Auth')).toContain('Debe existir al menos un administrador activo.');
    expect(java('RulesEngine')).toContain('"maquina_estados"');
    expect(java('RecordStore')).toContain('JSON_MERGE_PATCH');
    expect(java('AuthFilter')).toContain('auth.authorize');
  });
});

describe('infraestructura y CI/CD para Java', () => {
  test('el Dockerfile de producción compila con Maven, corre como usuario sin privilegios y exige un secreto fuerte', () => {
    const dockerfile = new InfrastructureGenerator()._backendDockerfile('Java + Spring Boot');
    expect(dockerfile).toContain('maven:3.9-eclipse-temurin-21');
    expect(dockerfile).toContain('eclipse-temurin:21-jre-alpine');
    expect(dockerfile).toContain('USER app');
    expect(dockerfile).toContain('ENV APP_ENV=production');
    expect(dockerfile).not.toContain('npm');
  });

  test('los Dockerfile de Node no cambian', () => {
    const generator = new InfrastructureGenerator();
    expect(generator._backendDockerfile('Node.js + Express')).toContain('npm install --omit=dev');
    expect(generator._backendDockerfile('NestJS')).toContain('npm run build');
  });

  test('el pipeline instala Java y valida el pom en lugar de package.json', async () => {
    const result = await new CiCdPipelineGenerator().generar({
      proyecto: { nombre: 'Demo' }, versionesOrigen: {},
      insumos: { tests: { version: 1, trazabilidad_rf: [] }, infrastructure: { version: 1, trazabilidad_rf: [] }, decisiones: { stack_tecnologico: { backend: 'Java + Spring Boot', base_datos: 'PostgreSQL' } } }
    });
    const workflow = result.archivos.find((item) => item.ruta === '.github/workflows/ci-cd.yml').contenido;
    expect(workflow).toContain('actions/setup-java@v4');
    expect(workflow).toContain('mvn -B -q -DskipTests package');
    expect(result.archivos.find((item) => item.ruta === 'ops/ci/validate-artifacts.mjs').contenido).toContain("'backend/pom.xml'");
  });
});

describe('renderTemplate con el pom', () => {
  test('falla si el pom pierde un marcador o recibe un valor que no usa', () => {
    expect(() => renderTemplate('<a>__X__</a>', {})).toThrow('__X__');
    expect(() => renderTemplate('<a/>', { X: '1' })).toThrow('no usa los valores: X');
  });
});
