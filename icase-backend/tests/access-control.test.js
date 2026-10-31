const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const jwt = require('jsonwebtoken');
const AccessControlService = require('../src/core/services/AccessControlService');
const BackendScaffoldGenerator = require('../src/infrastructure/services/BackendScaffoldGenerator');
const GestionarPlanCodificacion = require('../src/core/use-cases/GestionarPlanCodificacion');
const CodePlanningProposalService = require('../src/core/services/CodePlanningProposalService');
const CodeGenerationWorkflowService = require('../src/core/services/CodeGenerationWorkflowService');
const { CODE_PHASE_STATES } = require('../src/core/constants/CodeGenerationPhases');
const runtime = require('../src/infrastructure/services/SamplePayload');

const rf = (identificador, nombre, actores) => ({ aprobado: true, tipo: 'RF', identificador, nombre, actores });
const requirements = [
  rf('RF-01', 'Gestionar clientes', ['Cliente', 'Administrador']),
  rf('RF-02', 'Registrar reservas', ['Mesero', 'Cliente']),
  rf('RF-03', 'Consultar reportes globales', ['Sistema de pagos'])
];
const service = new AccessControlService();

describe('AccessControlService.proponer', () => {
  const { valor, advertencias } = service.proponer({ requerimientos: requirements });

  test('un rol por actor humano, con acceso completo a los RF donde participa', () => {
    expect(valor.roles.map((item) => [item.id, item.incluir])).toEqual([['cliente', true], ['mesero', true], ['sistema-de-pagos', false]]);
    expect(valor.permisos).toEqual([
      { operacion: 'RF-01', rol: 'cliente', metodos: ['GET', 'POST', 'PATCH', 'DELETE'] },
      { operacion: 'RF-02', rol: 'mesero', metodos: ['GET', 'POST', 'PATCH', 'DELETE'] },
      { operacion: 'RF-02', rol: 'cliente', metodos: ['GET', 'POST', 'PATCH', 'DELETE'] }
    ]);
    expect(valor.operaciones.map((item) => item.id)).toEqual(['RF-01', 'RF-02', 'RF-03']);
  });

  test('el actor «Administrador» se funde con el rol del sistema y los sistemas externos se excluyen', () => {
    expect(valor.roles.some((item) => item.id === 'administrador')).toBe(false);
    expect(advertencias.join(' ')).toContain('rol administrador del sistema');
    expect(advertencias.join(' ')).toContain('Sistema de pagos');
  });

  test('por seguridad ningún rol nace con registro abierto y la sesión es JWT', () => {
    expect(valor.roles.every((item) => item.autoregistro === false)).toBe(true);
    expect(valor.autenticacion).toEqual({ metodo: 'jwt', expiracion: '8h' });
  });

  test('sin actores solo queda el administrador y se avisa', () => {
    const vacio = service.proponer({ requerimientos: [rf('RF-01', 'Algo', [])] });
    expect(vacio.valor.roles).toEqual([]);
    expect(vacio.advertencias.join(' ')).toContain('Ningún RF declara actores');
  });
});

describe('AccessControlService.validar', () => {
  const base = () => JSON.parse(JSON.stringify(service.proponer({ requerimientos: requirements }).valor));
  const validar = (propuesta) => service.validar(propuesta, { requerimientos: requirements });

  test('acepta la propuesta inicial y recompone las operaciones desde los RF', () => {
    const resultado = validar({ ...base(), operaciones: [{ id: 'RF-99', nombre: 'inventado' }] });
    expect(resultado.errores).toEqual([]);
    expect(resultado.propuesta.operaciones.map((item) => item.id)).toEqual(['RF-01', 'RF-02', 'RF-03']);
  });

  test.each([
    ['método de autenticación', (p) => { p.autenticacion.metodo = 'oauth'; }, 'método de autenticación'],
    ['expiración', (p) => { p.autenticacion.expiracion = '10 años'; }, 'expiración'],
    ['rol reservado', (p) => { p.roles.push({ nombre: 'Administrador', incluir: true }); }, 'reservado'],
    ['rol repetido', (p) => { p.roles.push({ nombre: 'Mesero', incluir: true }); }, 'repetido'],
    ['rol sin nombre', (p) => { p.roles.push({ nombre: '  ' }); }, 'nombre'],
    ['operación desconocida', (p) => { p.permisos.push({ operacion: 'RF-77', rol: 'mesero', metodos: ['GET'] }); }, 'no corresponde a un RF'],
    ['rol no declarado', (p) => { p.permisos.push({ operacion: 'RF-01', rol: 'fantasma', metodos: ['GET'] }); }, 'no está declarado'],
    ['método inválido', (p) => { p.permisos.push({ operacion: 'RF-01', rol: 'mesero', metodos: ['PUT'] }); }, 'subconjunto'],
    ['sin métodos', (p) => { p.permisos.push({ operacion: 'RF-01', rol: 'mesero', metodos: [] }); }, 'subconjunto'],
    ['roles que no son lista', (p) => { p.roles = 'todos'; }, 'lista']
  ])('rechaza %s', (_nombre, mutar, texto) => {
    const propuesta = base();
    mutar(propuesta);
    expect(validar(propuesta).errores.join(' ')).toContain(texto);
  });

  test('ignora con aviso los permisos de roles no incluidos y fusiona permisos repetidos', () => {
    const propuesta = base();
    propuesta.roles.find((item) => item.id === 'mesero').incluir = false;
    propuesta.permisos.push({ operacion: 'RF-01', rol: 'cliente', metodos: ['get'] });
    const { propuesta: normalizada, advertencias } = validar(propuesta);
    expect(normalizada.permisos.some((item) => item.rol === 'mesero')).toBe(false);
    expect(advertencias.join(' ')).toContain('«mesero»');
    expect(normalizada.permisos.filter((item) => item.rol === 'cliente' && item.operacion === 'RF-01')).toHaveLength(1);
  });

  test('avisa de operaciones solo administrables y de roles con registro abierto que escriben', () => {
    const propuesta = base();
    propuesta.roles.find((item) => item.id === 'cliente').autoregistro = true;
    const { advertencias } = validar(propuesta);
    expect(advertencias.join(' ')).toContain('Solo el administrador podrá operar: RF-03');
    expect(advertencias.join(' ')).toContain('autoregistro pueden escribir datos');
  });

  test('sin autenticación advierte que la API queda pública', () => {
    const propuesta = base();
    propuesta.autenticacion.metodo = 'ninguna';
    expect(validar(propuesta).advertencias.join(' ')).toContain('Sin autenticación');
  });

  test('la política resultante solo contiene roles incluidos y usa las claves del contrato', () => {
    const propuesta = base();
    propuesta.roles.find((item) => item.id === 'cliente').autoregistro = true;
    const politica = service.politica(validar(propuesta).propuesta, [{ id: 'RF-01', key: 'rf-01' }, { id: 'RF-02', key: 'rf-02' }, { id: 'RF-03', key: 'rf-03' }]);
    expect(politica.habilitada).toBe(true);
    expect(politica.roles).toEqual({ cliente: { nombre: 'Cliente', autoregistro: true }, mesero: { nombre: 'Mesero', autoregistro: false } });
    expect(politica.operaciones['rf-03']).toEqual({});
    expect(politica.operaciones['rf-02'].mesero).toEqual(['GET', 'POST', 'PATCH', 'DELETE']);
    expect(service.politica({ autenticacion: { metodo: 'ninguna' } }, [])).toEqual({ habilitada: false });
    expect(service.politica(null, [])).toEqual({ habilitada: false });
  });
});

describe('etapa control_acceso', () => {
  const entorno = async () => {
    let plan = null;
    const repo = {
      obtenerPorProyecto: async () => plan,
      crear: async ({ proyecto_id, etapas }) => { plan = { proyecto_id, version: 1, etapas }; return plan; },
      guardar: async (_id, cambios) => { plan = { ...plan, ...cambios }; return plan; },
      actual: () => plan
    };
    const useCase = new GestionarPlanCodificacion({
      proyectoRepository: { obtenerPorId: async () => ({ id: 'p1', nombre: 'Demo', estado_fase: 'mockups_aprobados' }) },
      planCodificacionRepository: repo,
      requerimientoRepository: { listarPorProyecto: async () => requirements },
      diagramaRepository: { listarPorProyecto: async () => [] },
      proposalService: new CodePlanningProposalService()
    });
    await useCase.obtener('p1');
    const workflow = new CodeGenerationWorkflowService();
    await repo.guardar('p1', {
      etapas: workflow.sincronizarBloqueos(workflow.crearEtapasIniciales().map((item) =>
        ['alcance_plataforma', 'stack_tecnologico', 'arquitectura_codigo', 'estructura_carpetas'].includes(item.etapa)
          ? { ...item, estado: CODE_PHASE_STATES.APPROVED, version: 1, propuesta: { ok: true } } : item))
    });
    return { useCase, repo, workflow };
  };

  test('la propuesta es determinista, se valida y se aprueba; backend y frontend la exigen', async () => {
    const { useCase, repo, workflow } = await entorno();
    expect(() => workflow.validarDependencias(repo.actual(), 'generacion_frontend')).toThrow('control_acceso');
    expect(() => workflow.validarDependencias(repo.actual(), 'generacion_backend')).toThrow('control_acceso');

    const sugerencia = await useCase.sugerir({ proyectoId: 'p1', etapa: 'control_acceso' });
    expect(sugerencia.propuesta.roles.map((item) => item.id)).toEqual(['cliente', 'mesero', 'sistema-de-pagos']);
    await useCase.proponer({ proyectoId: 'p1', etapa: 'control_acceso', propuesta: sugerencia.propuesta });
    await useCase.revisar({ proyectoId: 'p1', etapa: 'control_acceso', decision: 'aprobar', aprobadoPor: 'u1' });
    expect(() => workflow.validarDependencias(repo.actual(), 'generacion_frontend')).not.toThrow();
    expect(() => workflow.validarDependencias(repo.actual(), 'generacion_backend')).toThrow('reglas_negocio');
  });

  test('rechaza propuestas inválidas y guarda la versión normalizada', async () => {
    const { useCase, repo } = await entorno();
    await expect(useCase.proponer({ proyectoId: 'p1', etapa: 'control_acceso', propuesta: { roles: [{ nombre: 'Administrador' }] } })).rejects.toThrow('reservado');
    const { propuesta } = await useCase.sugerir({ proyectoId: 'p1', etapa: 'control_acceso' });
    await useCase.proponer({ proyectoId: 'p1', etapa: 'control_acceso', propuesta: { ...propuesta, operaciones: [], permisos: [...propuesta.permisos, { operacion: 'rf-01', rol: 'Cliente', metodos: ['get'] }] } });
    const guardada = repo.actual().etapas.find((item) => item.etapa === 'control_acceso').propuesta;
    expect(guardada.operaciones).toHaveLength(3);
    expect(guardada.permisos.filter((item) => item.operacion === 'RF-01' && item.rol === 'cliente')).toHaveLength(1);
  });

  test('al aprobar se revalida contra los RF vigentes', async () => {
    const { useCase } = await entorno();
    const { propuesta } = await useCase.sugerir({ proyectoId: 'p1', etapa: 'control_acceso' });
    await useCase.proponer({ proyectoId: 'p1', etapa: 'control_acceso', propuesta });
    useCase.requerimientoRepository.listarPorProyecto = async () => requirements.filter((item) => item.identificador !== 'RF-02');
    await expect(useCase.revisar({ proyectoId: 'p1', etapa: 'control_acceso', decision: 'aprobar' })).rejects.toThrow('RF-02');
  });
});

describe('backend Express generado con autenticación (HTTP real, almacén en memoria)', () => {
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
  const reglas = [
    { id: 'RN-01', entidad: 'Reserva', rf: ['RF-02'], origen: 'inferido', estado_decision: 'confirmado', tipo: 'requerido', campo: 'cliente_id', mensaje: 'La reserva necesita un cliente.' },
    { id: 'RN-02', entidad: 'Reserva', rf: ['RF-02'], origen: 'inferido', estado_decision: 'confirmado', tipo: 'rango', campo: 'comensales', min: 1, max: 20, mensaje: 'De 1 a 20 comensales.' },
    { id: 'RN-03', entidad: 'Cliente', rf: ['RF-01'], origen: 'inferido', estado_decision: 'confirmado', tipo: 'unico', campos: ['email'], mensaje: 'El correo ya existe.' }
  ];
  const acceso = (autoregistro = true, metodo = 'jwt') => ({
    autenticacion: { metodo, expiracion: '1h' },
    roles: [{ nombre: 'Mesero', incluir: true, autoregistro: false }, { nombre: 'Cliente', incluir: true, autoregistro }],
    permisos: [
      { operacion: 'RF-01', rol: 'cliente', metodos: ['GET', 'POST'] }, { operacion: 'RF-01', rol: 'mesero', metodos: ['GET'] },
      { operacion: 'RF-02', rol: 'mesero', metodos: ['GET', 'POST', 'PATCH', 'DELETE'] }, { operacion: 'RF-02', rol: 'cliente', metodos: ['GET', 'POST'] }
    ]
  });
  const env = { JWT_SECRET: 'secreto-de-pruebas-0123456789', ADMIN_EMAIL: 'admin@example.test', ADMIN_PASSWORD: 'Admin-Passw0rd', NODE_ENV: 'test' };
  const cleanups = [];
  const saved = {};

  beforeEach(() => { for (const key of Object.keys(env)) saved[key] = process.env[key]; Object.assign(process.env, env); });
  afterEach(async () => {
    for (const key of Object.keys(env)) { if (saved[key] === undefined) delete process.env[key]; else process.env[key] = saved[key]; }
    while (cleanups.length) await cleanups.pop()();
  });

  async function arrancar({ control = acceso(), mutar = (file) => file.contenido, init = true } = {}) {
    const generado = await new BackendScaffoldGenerator().generar({
      proyecto: { nombre: 'Demo' },
      insumos: {
        decisiones: { stack_tecnologico: { backend: 'Express', base_datos: 'PostgreSQL' }, reglas_negocio: { reglas }, control_acceso: control },
        requerimientos: requirements.slice(0, 2), diagramaDominio: { codigo_plantuml: PLANTUML }
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
    if (init) await app.locals.init();
    const server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    cleanups.push(() => new Promise((resolve) => server.close(resolve)));
    const manifest = JSON.parse(generado.archivos.find((item) => item.ruta === 'backend/icase.manifest.json').contenido);
    return { app, base: `http://127.0.0.1:${server.address().port}`, manifest, paths: generado.archivos.map((item) => item.ruta), dir };
  }

  const configOf = (booted) => ({
    base: booted.base, adminEmail: env.ADMIN_EMAIL, adminPassword: env.ADMIN_PASSWORD,
    roles: Object.entries(booted.manifest.auth.roles).map(([id, role]) => ({ id, autoregistro: role.autoregistro === true }))
  });

  test.each([[true], [false]])('cumple CRUD, reglas, matriz de permisos y flujos de autenticación (registro abierto: %s)', async (abierto) => {
    const booted = await arrancar({ control: acceso(abierto) });
    const config = configOf(booted);
    const access = await runtime.setupAccess(booted.base, config);
    try {
      for (const operation of booted.manifest.operations) {
        await runtime.exerciseOperation(access.admin, booted.manifest.operations, operation);
        await runtime.exerciseAccess(access, booted.manifest.operations, operation, booted.manifest.auth.operaciones[operation.key] || {});
      }
      await runtime.exerciseAuth(access, config);
    } finally { await access.cleanup(); }
  }, 60000);

  test('el ejercitador detecta una política aplicada con más permisos de los aprobados', async () => {
    const booted = await arrancar({
      mutar: (file) => {
        if (!file.ruta.endsWith('auth/policy.js')) return file.contenido;
        const policy = JSON.parse(file.contenido.replace(/^module\.exports = /, '').replace(/;\s*$/, ''));
        policy.operaciones['rf-01'].mesero = ['GET', 'DELETE'];
        return `module.exports = ${JSON.stringify(policy)};`;
      }
    });
    const access = await runtime.setupAccess(booted.base, configOf(booted));
    try {
      const operation = booted.manifest.operations.find((item) => item.id === 'RF-01');
      await expect(runtime.exerciseAccess(access, booted.manifest.operations, operation, booted.manifest.auth.operaciones['rf-01']))
        .rejects.toThrow(/rol mesero eliminar sin permiso respondió 200/);
    } finally { await access.cleanup(); }
  }, 30000);

  test('rechaza tokens manipulados, caducados, firmados con otra clave o sin algoritmo', async () => {
    const booted = await arrancar();
    const get = (token) => fetch(`${booted.base}/api/users`, { headers: token ? { Authorization: `Bearer ${token}` } : {} }).then((response) => response.status);
    const claims = { rol: 'administrador' };
    const forged = (header, signature = '') => `${Buffer.from(JSON.stringify(header)).toString('base64url')}.${Buffer.from(JSON.stringify({ sub: '1', ...claims })).toString('base64url')}.${signature}`;
    expect(await get(forged({ alg: 'none', typ: 'JWT' }))).toBe(401);
    expect(await get(jwt.sign(claims, 'otra-clave-distinta-0123456789', { subject: '1', algorithm: 'HS256' }))).toBe(401);
    expect(await get(jwt.sign(claims, env.JWT_SECRET, { subject: '1', algorithm: 'HS256', expiresIn: -10 }))).toBe(401);
    expect(await get(jwt.sign(claims, env.JWT_SECRET, { subject: '999', algorithm: 'HS256' }))).toBe(401);
    expect(await get(jwt.sign(claims, env.JWT_SECRET, { subject: '1', algorithm: 'HS512' }))).toBe(401);
    expect(await get('no-es-un-token')).toBe(401);
    expect(await get(null)).toBe(401);
  });

  test('el rol se lee de la base en cada petición: cambiarlo o desactivar al usuario surte efecto inmediato', async () => {
    const booted = await arrancar();
    const access = await runtime.setupAccess(booted.base, configOf(booted));
    try {
      const mesero = access.roles.mesero;
      const crear = () => mesero.api('/api/operations/rf-01', 'POST', { email: `x-${Date.now()}@example.test` });
      expect((await crear()).status).toBe(403);
      expect((await access.admin(`/api/users/${mesero.userId}`, 'PATCH', { rol: 'cliente' })).status).toBe(200);
      expect((await crear()).status).toBe(201);
      expect((await access.admin(`/api/users/${mesero.userId}`, 'PATCH', { activo: false })).status).toBe(200);
      expect((await crear()).status).toBe(401);
    } finally { await access.cleanup(); }
  });

  test('las contraseñas se guardan con scrypt y nunca en claro', async () => {
    const booted = await arrancar();
    const [admin] = await booted.app.locals.store.listUsers();
    expect(admin.password_hash).toMatch(/^scrypt\$16384\$8\$1\$/);
    expect(admin.password_hash).not.toContain(env.ADMIN_PASSWORD);
    expect(admin.rol).toBe('administrador');
  });

  test('rechaza un secreto débil en producción y exige JWT_SECRET', async () => {
    process.env.NODE_ENV = 'production';
    process.env.JWT_SECRET = 'change-me';
    await expect(arrancar()).rejects.toThrow('JWT_SECRET es inseguro');
    process.env.JWT_SECRET = 'corto';
    await expect(arrancar()).rejects.toThrow('JWT_SECRET es inseguro');
    delete process.env.JWT_SECRET;
    await expect(arrancar()).rejects.toThrow('JWT_SECRET no está definido');
  });

  test('la credencial inicial débil impide arrancar y es idempotente al reiniciar', async () => {
    process.env.ADMIN_PASSWORD = 'corta';
    await expect(arrancar()).rejects.toThrow('contraseña');
    process.env.ADMIN_PASSWORD = env.ADMIN_PASSWORD;
    const booted = await arrancar();
    await booted.app.locals.init();
    expect((await booted.app.locals.store.listUsers()).filter((user) => user.rol === 'administrador')).toHaveLength(1);
  });

  test('con autenticación «ninguna» no se generan archivos de sesión y la API es pública', async () => {
    const booted = await arrancar({ control: acceso(false, 'ninguna') });
    expect(booted.paths.some((item) => /auth|policy/.test(item))).toBe(false);
    expect(booted.manifest.auth).toEqual({ habilitada: false });
    expect((await fetch(`${booted.base}/api/operations/rf-01`)).status).toBe(200);
    expect((await fetch(`${booted.base}/api/auth/login`, { method: 'POST' })).status).toBe(404);
  });

  test('si la política aprobada deja de ser coherente con los RF, la generación falla', async () => {
    await expect(arrancar({ control: { ...acceso(), permisos: [{ operacion: 'RF-77', rol: 'mesero', metodos: ['GET'] }] } })).rejects.toThrow('ya no es coherente');
  });
});
