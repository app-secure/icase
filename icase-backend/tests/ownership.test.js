const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const AccessControlService = require('../src/core/services/AccessControlService');
const BackendScaffoldGenerator = require('../src/infrastructure/services/BackendScaffoldGenerator');
const GenericBackendGenerator = require('../src/infrastructure/services/GenericBackendGenerator');
const IncrementalMigrationGenerator = require('../src/infrastructure/services/IncrementalMigrationGenerator');
const DomainModelExtractor = require('../src/infrastructure/services/DomainModelExtractor');
const runtime = require('../src/infrastructure/services/SamplePayload');

const rf = (identificador, nombre, actores) => ({ aprobado: true, tipo: 'RF', identificador, nombre, actores });
const requirements = [rf('RF-01', 'Gestionar clientes', ['Cliente']), rf('RF-02', 'Registrar reservas', ['Cliente'])];
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
Cliente "*" -- "*" Reserva : etiquetas
@enduml`;
const reglas = [
  { id: 'RN-01', entidad: 'Reserva', rf: ['RF-02'], origen: 'inferido', estado_decision: 'confirmado', tipo: 'requerido', campo: 'cliente_id', mensaje: 'La reserva necesita un cliente.' }
];
const control = {
  autenticacion: { metodo: 'jwt', expiracion: '1h' },
  roles: [{ id: 'cliente', nombre: 'Cliente', incluir: true, autoregistro: false }],
  permisos: [
    { operacion: 'RF-01', rol: 'cliente', metodos: ['GET', 'POST', 'PATCH', 'DELETE'], alcance: 'propios' },
    { operacion: 'RF-02', rol: 'cliente', metodos: ['GET', 'POST', 'PATCH', 'DELETE'], alcance: 'propios' }
  ]
};
const env = { JWT_SECRET: 'secreto-de-pruebas-0123456789', ADMIN_EMAIL: 'admin@example.test', ADMIN_PASSWORD: 'Admin-Passw0rd', NODE_ENV: 'test' };

describe('ownership por registro', () => {
  const cleanups = [];
  const saved = {};
  beforeEach(() => { for (const key of Object.keys(env)) saved[key] = process.env[key]; Object.assign(process.env, env); });
  afterEach(async () => {
    for (const key of Object.keys(env)) { if (saved[key] === undefined) delete process.env[key]; else process.env[key] = saved[key]; }
    while (cleanups.length) await cleanups.pop()();
  });

  async function arrancar({ mutar = (file) => file.contenido, access = control } = {}) {
    const generado = await new BackendScaffoldGenerator().generar({
      proyecto: { nombre: 'Demo' },
      insumos: {
        decisiones: { stack_tecnologico: { backend: 'Express', base_datos: 'PostgreSQL' }, reglas_negocio: { reglas }, control_acceso: access },
        requerimientos: requirements, diagramaDominio: { codigo_plantuml: PLANTUML }
      },
      versionesOrigen: {}
    });
    const dir = fs.mkdtempSync(path.join(__dirname, '.generated-'));
    cleanups.push(async () => fs.rmSync(dir, { recursive: true, force: true }));
    for (const file of generado.archivos.filter((item) => item.ruta.startsWith('backend/src/'))) {
      const destination = path.join(dir, file.ruta.replace('backend/src/', ''));
      fs.mkdirSync(path.dirname(destination), { recursive: true });
      fs.writeFileSync(destination, mutar(file));
    }
    fs.copyFileSync(path.join(__dirname, 'helpers', 'memory-record-store.js'), path.join(dir, 'record.store.js'));
    const app = require(path.join(dir, 'app.js'));
    await app.locals.init();
    const server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    cleanups.push(() => new Promise((resolve) => server.close(resolve)));
    const manifest = JSON.parse(generado.archivos.find((item) => item.ruta === 'backend/icase.manifest.json').contenido);
    return { base: `http://127.0.0.1:${server.address().port}`, manifest, generado };
  }

  test('aísla a dos clientes del mismo rol y rechaza propietario falsificado', async () => {
    const booted = await arrancar();
    expect(booted.generado.archivos.find((item) => item.ruta === 'backend/src/data/model.js').contenido).toContain('owner_id');
    expect(JSON.stringify(JSON.parse(booted.generado.archivos.find((item) => item.ruta === 'backend/openapi.json').contenido))).not.toContain('owner_id');
    const access = await runtime.setupAccess(booted.base, {
      base: booted.base, adminEmail: env.ADMIN_EMAIL, adminPassword: env.ADMIN_PASSWORD,
      roles: [{ id: 'cliente', autoregistro: false }]
    });
    try {
      for (const operation of booted.manifest.operations) {
        await runtime.exerciseOwnership(access, booted.manifest.operations, operation, booted.manifest.auth.operaciones[operation.key], {
          base: booted.base, associations: booted.manifest.associations || [], auth: booted.manifest.auth
        });
      }
    } finally { await access.cleanup(); }
  }, 60000);

  test('sin el filtro de propietario el aislamiento falla', async () => {
    const booted = await arrancar({
      mutar: (file) => file.ruta.endsWith('auth/ownership.js')
        ? file.contenido.replace('return { ownerId: String(user.id) };', 'return null;')
        : file.contenido
    });
    const access = await runtime.setupAccess(booted.base, {
      base: booted.base, adminEmail: env.ADMIN_EMAIL, adminPassword: env.ADMIN_PASSWORD,
      roles: [{ id: 'cliente', autoregistro: false }]
    });
    try {
      const operation = booted.manifest.operations.find((item) => item.id === 'RF-01');
      await expect(runtime.exerciseOwnership(access, booted.manifest.operations, operation, booted.manifest.auth.operaciones[operation.key], {
        base: booted.base, associations: booted.manifest.associations || [], auth: booted.manifest.auth
      })).rejects.toThrow(/ajeno|propio/);
    } finally { await access.cleanup(); }
  }, 60000);

  test('Spring y módulos laterales aceptan ownership', () => {
    const domainModel = new DomainModelExtractor().extract(PLANTUML);
    const generator = new GenericBackendGenerator();
    const spring = generator.generate({
      proyecto: { nombre: 'Demo' }, requirements, domainModel, rules: [], access: control,
      stack: { backend: 'Spring Boot', base_datos: 'PostgreSQL' }
    });
    expect(spring.find((file) => file.ruta.endsWith('RecordStore.java')).contenido).toContain('owner_id');
    expect(spring.find((file) => file.ruta.endsWith('OperationsController.java')).contenido).toContain('ownerScope');
    expect(spring.find((file) => file.ruta.endsWith('Auth.java')).contenido).toContain('ownerScope');
    expect(spring.find((file) => file.ruta.endsWith('OwnershipAuthTest.java')).contenido).toContain('associationRejectsOwnedScope');
    const withReports = generator.generate({
      proyecto: { nombre: 'Demo' }, requirements, domainModel, rules: [], access: control,
      stack: { backend: 'Express', base_datos: 'PostgreSQL' },
      modules: { modo: 'personalizado', modulos: [
        { id: 'reportes_calculos', activo: true }, { id: 'archivos_imagenes', activo: true },
        { id: 'formularios_tipados', activo: false }, { id: 'paginacion_busqueda', activo: false }, { id: 'datos_iniciales', activo: false }
      ] }
    });
    expect(withReports.find((file) => file.ruta.endsWith('generated-extensions.js')).contenido).toContain('scopeOf');
    expect(withReports.find((file) => file.ruta.endsWith('generated-reports.js')).contenido).toContain('scope');
  });

  test('la migración incremental añade owner_id e índice al activar ownership', async () => {
    const domainModel = new DomainModelExtractor().extract(PLANTUML);
    const previous = new GenericBackendGenerator().generate({
      proyecto: { nombre: 'Demo' }, requirements, domainModel, rules: [],
      access: { ...control, permisos: control.permisos.map((item) => ({ ...item, alcance: 'todos' })) },
      stack: { backend: 'Express', base_datos: 'PostgreSQL' }, modules: []
    });
    const next = new GenericBackendGenerator().generate({
      proyecto: { nombre: 'Demo' }, requirements, domainModel, rules: [], access: control,
      stack: { backend: 'Express', base_datos: 'PostgreSQL' }, modules: []
    });
    const migrated = new IncrementalMigrationGenerator().apply(next, { version: 1, archivos: previous });
    const incremental = migrated.find((file) => /backend\/db\/migrations\/\d+_alter_/.test(file.ruta));
    expect(incremental.contenido).toContain('ADD COLUMN');
    expect(incremental.contenido).toContain('owner_id');
    expect(incremental.contenido).toContain('INDEX');
  });

  test('el script de verificación genera owner_id sin Docker', async () => {
    const { execFileSync } = require('node:child_process');
    const output = execFileSync('node', [path.join(__dirname, '../scripts/verify-ownership-runtime.js'), 'PostgreSQL', 'Express', '--generate-only'], { encoding: 'utf8' });
    expect(JSON.parse(output).estado).toBe('generado');
  }, 30000);

  test('NestJS recibe el alcance en el controlador y transpila el helper', () => {
    const files = new GenericBackendGenerator().generate({
      proyecto: { nombre: 'Demo' }, requirements, domainModel: new DomainModelExtractor().extract(PLANTUML),
      rules: [], access: control, stack: { backend: 'NestJS', base_datos: 'PostgreSQL' }, modules: []
    });
    const controller = files.find((file) => file.ruta === 'backend/src/app.controller.ts').contenido;
    expect(controller).toContain('scopeOf');
    expect(controller).toContain('scope(req.user,key)');
    expect(files.some((file) => file.ruta === 'backend/src/auth/ownership.js')).toBe(true);
  });
});

describe('AccessControlService alcance', () => {
  test('rechaza un alcance desconocido', () => {
    const service = new AccessControlService();
    const propuesta = service.proponer({ requerimientos: requirements }).valor;
    propuesta.permisos[0].alcance = 'departamento';
    expect(service.validar(propuesta, { requerimientos: requirements }).errores.join(' ')).toContain('alcance');
  });
});
