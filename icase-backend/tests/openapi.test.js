const path = require('node:path');
const { execFile } = require('node:child_process');
const Ajv2020 = require('ajv/dist/2020');
const addFormats = require('ajv-formats');
const runtime = require('../src/infrastructure/services/SamplePayload');
const { boot, useEnvironment, ENV } = require('./helpers/boot-generated-app');

const PLANTUML = `@startuml
enum EstadoReserva {
  PENDIENTE
  CONFIRMADA
  CANCELADA
}
class Cliente {
  +String id
  +String nombre
  +String email
  +boolean activo
}
class Reserva {
  +String id
  +String codigo
  +Date fechaInicio
  +Date fechaFin
  +int comensales
  +EstadoReserva estado
  +String notas
}
Cliente "1" --> "0..*" Reserva
@enduml`;

const rf = (identificador, nombre, descripcion, actores) => ({ aprobado: true, tipo: 'RF', identificador, nombre, descripcion, actores });
const requirements = [
  rf('RF-01', 'Gestionar clientes', 'El sistema DEBE validar el correo del cliente.', ['Cliente']),
  rf('RF-02', 'Registrar reservas', 'El sistema DEBE aceptar reservas de 1 a 20 comensales.', ['Mesero', 'Cliente']),
  rf('RF-03', 'Consultar reportes globales', '', [])
];
const base = { entidad: 'Reserva', rf: ['RF-02'], origen: 'inferido', estado_decision: 'confirmado' };
const reglas = [
  { ...base, id: 'RN-01', tipo: 'requerido', campo: 'cliente_id', mensaje: 'Toda reserva debe tener un cliente.' },
  { ...base, id: 'RN-02', tipo: 'rango', campo: 'comensales', min: 1, max: 20, mensaje: 'Las reservas admiten de 1 a 20 comensales.' },
  { ...base, id: 'RN-03', tipo: 'comparacion', campo: 'fechaFin', operador: '>=', con_campo: 'fechaInicio', mensaje: 'La fecha de fin no puede ser anterior a la de inicio.' },
  { ...base, id: 'RN-04', tipo: 'maquina_estados', campo: 'estado', inicial: 'PENDIENTE', mensaje: 'Transición de estado no permitida.', transiciones: [{ de: 'PENDIENTE', a: 'CONFIRMADA' }, { de: 'PENDIENTE', a: 'CANCELADA' }, { de: 'CONFIRMADA', a: 'CANCELADA' }] },
  { ...base, id: 'RN-05', tipo: 'unico', campos: ['codigo'], mensaje: 'El código debe ser único.' },
  { ...base, id: 'RN-06', tipo: 'inmutable', campo: 'codigo', mensaje: 'El código no puede modificarse.' },
  { ...base, id: 'RN-07', tipo: 'longitud', campo: 'notas', max: 20, mensaje: 'Las notas admiten hasta 20 caracteres.' },
  { ...base, entidad: 'Cliente', rf: ['RF-01'], id: 'RN-08', tipo: 'formato', campo: 'email', formato: 'email', mensaje: 'El correo no es válido.' },
  { ...base, entidad: 'Cliente', rf: ['RF-01'], id: 'RN-09', tipo: 'valor_por_defecto', campo: 'activo', valor: true, mensaje: 'Los clientes nuevos están activos.' }
];
const acceso = (metodo = 'jwt') => ({
  autenticacion: { metodo, expiracion: '1h' },
  roles: [{ nombre: 'Mesero', incluir: true, autoregistro: false }, { nombre: 'Cliente', incluir: true, autoregistro: true }],
  permisos: [
    { operacion: 'RF-01', rol: 'cliente', metodos: ['GET', 'POST'] }, { operacion: 'RF-02', rol: 'mesero', metodos: ['GET', 'POST', 'PATCH', 'DELETE'] },
    { operacion: 'RF-02', rol: 'cliente', metodos: ['GET'] }
  ]
});

const cleanups = [];
useEnvironment();
afterEach(async () => { while (cleanups.length) await cleanups.pop()(); });
const arrancar = (control = acceso(), extra = {}) => boot({ decisiones: { reglas_negocio: { reglas }, control_acceso: control }, requerimientos: requirements, plantuml: PLANTUML, cleanups, ...extra });
// El validador es solo ESM y Jest (CommonJS) no puede cargarlo: se ejecuta en un proceso de Node aparte.
const validar = (doc) => new Promise((resolve, reject) => {
  const child = execFile(process.execPath, ['--input-type=module', '-e', `
    import { Validator } from '@seriousme/openapi-schema-validator';
    let input = '';
    for await (const chunk of process.stdin) input += chunk;
    const result = await new Validator().validate(JSON.parse(input));
    console.log(JSON.stringify({ valid: result.valid, errors: result.errors || [] }));
  `], { cwd: path.join(__dirname, '..') }, (error, stdout, stderr) => (error ? reject(new Error(stderr || error.message)) : resolve(JSON.parse(stdout))));
  child.stdin.end(JSON.stringify(doc));
});

describe('documento OpenAPI generado', () => {
  test('es un OpenAPI 3.1 válido, con y sin autenticación', async () => {
    for (const control of [acceso(), acceso('ninguna')]) {
      const { openapi } = await arrancar(control);
      const result = await validar(openapi);
      expect(result.errors || []).toEqual([]);
      expect(result.valid).toBe(true);
      expect(openapi.openapi).toBe('3.1.0');
    }
  });

  test('documenta las cuatro rutas de cada operación con sus etiquetas y operationId únicos', async () => {
    const { openapi, manifest } = await arrancar();
    const ids = [];
    for (const operation of manifest.operations) {
      const collection = openapi.paths[operation.collectionPath];
      const item = openapi.paths[operation.itemPath.replace(':id', '{id}')];
      expect(Object.keys(collection)).toEqual(['get', 'post']);
      expect(Object.keys(item).filter((key) => key !== 'parameters')).toEqual(['patch', 'delete']);
      expect(collection.get.tags).toEqual([operation.id]);
      ids.push(collection.get.operationId, collection.post.operationId, item.patch.operationId, item.delete.operationId);
    }
    expect(new Set(ids).size).toBe(ids.length);
    expect(openapi.tags.map((tag) => tag.name)).toEqual(expect.arrayContaining(['RF-01', 'RF-02', 'RF-03', 'Sistema', 'Autenticación', 'Usuarios']));
  });

  test('las reglas de negocio se traducen a restricciones del esquema', async () => {
    const { openapi } = await arrancar();
    const reserva = openapi.components.schemas.Reserva;
    expect(reserva.required).toEqual(['cliente_id']);
    expect(openapi.components.schemas.ReservaUpdate.required).toBeUndefined();
    expect(reserva.properties.comensales).toMatchObject({ type: 'integer', minimum: 1, maximum: 20 });
    expect(reserva.properties.notas).toMatchObject({ maxLength: 20 });
    expect(reserva.properties.estado).toMatchObject({ enum: ['PENDIENTE', 'CONFIRMADA', 'CANCELADA'], default: 'PENDIENTE' });
    expect(reserva.properties.estado['x-transiciones']).toHaveLength(3);
    expect(reserva.properties.codigo).toMatchObject({ 'x-unico': ['codigo'], 'x-inmutable': true });
    expect(reserva.properties.fechaFin['x-comparacion']).toEqual({ operador: '>=', con_campo: 'fechaInicio' });
    expect(reserva.properties.cliente_id['x-references']).toBe('Cliente');
    expect(reserva['x-reglas'].map((rule) => rule.id)).toEqual(['RN-01', 'RN-02', 'RN-03', 'RN-04', 'RN-05', 'RN-06', 'RN-07']);
    expect(openapi.components.schemas.Cliente.properties.email.format).toBe('email');
    expect(openapi.components.schemas.Cliente.properties.activo.default).toBe(true);
    expect(reserva.properties.comensales.description).toContain('RN-02');
  });

  test('solo documenta las respuestas que el backend puede dar', async () => {
    const { openapi } = await arrancar();
    const statuses = (path, method) => Object.keys(openapi.paths[path][method].responses).sort();
    expect(statuses('/api/operations/rf-02', 'post')).toEqual(['201', '400', '401', '403', '409', '422']);
    expect(statuses('/api/operations/rf-01', 'post')).toEqual(['201', '400', '401', '403', '422']);
    expect(statuses('/api/operations/rf-03', 'post')).toEqual(['201', '400', '401', '403']);
    expect(statuses('/api/operations/rf-01/{id}', 'delete')).toEqual(['200', '401', '403', '404', '409']);
    expect(statuses('/api/operations/rf-03/{id}', 'delete')).toEqual(['200', '401', '403', '404']);
    expect(statuses('/api/operations/rf-02', 'get')).toEqual(['200', '401', '403']);
  });

  test('los roles con permiso figuran en cada método; el administrador siempre', async () => {
    const { openapi } = await arrancar();
    expect(openapi.paths['/api/operations/rf-02'].get['x-roles']).toEqual(['administrador', 'mesero', 'cliente']);
    expect(openapi.paths['/api/operations/rf-02'].post['x-roles']).toEqual(['administrador', 'mesero']);
    expect(openapi.paths['/api/operations/rf-03'].get['x-roles']).toEqual(['administrador']);
    expect(openapi.paths['/api/auth/login'].post.security).toEqual([]);
    expect(openapi.paths['/health'].get.security).toEqual([]);
    expect(openapi.security).toEqual([{ bearerAuth: [] }]);
  });

  test('sin autenticación no hay seguridad, rutas de sesión ni respuestas 401/403', async () => {
    const { openapi } = await arrancar(acceso('ninguna'));
    expect(openapi.security).toBeUndefined();
    expect(openapi.components.securitySchemes).toBeUndefined();
    expect(Object.keys(openapi.paths).some((path) => path.startsWith('/api/auth') || path.startsWith('/api/users'))).toBe(false);
    expect(JSON.stringify(openapi)).not.toMatch(/"(401|403)"/);
    expect(openapi.paths['/api/operations/rf-02'].post['x-roles']).toBeUndefined();
  });

  test('una entidad llamada como un esquema del sistema no lo pisa', async () => {
    const plantuml = '@startuml\nclass User {\n+String id\n+String nombre\n}\nclass Error {\n+String id\n+String causa\n}\n@enduml';
    const booted = await boot({
      decisiones: { control_acceso: acceso() }, plantuml, cleanups,
      requerimientos: [rf('RF-01', 'Gestionar user', '', ['Cliente']), rf('RF-02', 'Registrar error', '', ['Cliente'])]
    });
    const { schemas } = booted.openapi.components;
    expect(schemas.User.properties.email).toBeDefined();
    expect(schemas.UserEntidad.title).toBe('User');
    expect(schemas.Error.required).toEqual(['message']);
    expect(schemas.ErrorEntidad.title).toBe('Error');
    expect((await validar(booted.openapi)).valid).toBe(true);
  });

  test('el archivo y el endpoint sirven el mismo documento, y el endpoint exige sesión', async () => {
    const booted = await arrancar();
    expect((await fetch(`${booted.base}/api/openapi.json`)).status).toBe(401);
    const access = await runtime.setupAccess(booted.base, { base: booted.base, adminEmail: ENV.ADMIN_EMAIL, adminPassword: ENV.ADMIN_PASSWORD, roles: [] });
    expect((await access.admin('/api/openapi.json')).data).toEqual(booted.openapi);
    expect(booted.manifest.docs).toEqual({ openapi: '/api/openapi.json', archivo: 'backend/openapi.json' });
    expect(booted.files.map((file) => file.ruta)).toEqual(expect.arrayContaining(['backend/openapi.json', 'backend/src/docs/openapi.js']));
  });
});

describe('conformidad: el backend real cumple lo que documenta', () => {
  const encode = (segment) => encodeURIComponent(segment.replace(/~/g, '~0').replace(/\//g, '~1'));

  function checker(doc) {
    const ajv = new Ajv2020({ strict: false, allErrors: true, validateSchema: false });
    addFormats(ajv);
    ajv.addSchema(doc, 'https://icase.test/openapi');
    const templates = Object.keys(doc.paths).map((template) => ({ template, pattern: new RegExp(`^${template.replace(/[.*+?^$()|[\]\\]/g, '\\$&').replace(/\{[^}]+\}/g, '[^/]+')}$`) }));
    const validate = (pointer, value) => {
      const fn = ajv.getSchema(`https://icase.test/openapi#${pointer}`);
      return fn(value) ? null : ajv.errorsText(fn.errors, { dataVar: 'cuerpo' });
    };
    return function check(records) {
      const violations = [];
      for (const record of records) {
        const found = templates.find(({ pattern }) => pattern.test(record.path));
        const label = `${record.method} ${record.path} -> ${record.status}`;
        if (!found) { violations.push(`${label}: ruta no documentada`); continue; }
        const operation = doc.paths[found.template][record.method.toLowerCase()];
        if (!operation) { violations.push(`${label}: método no documentado`); continue; }
        const response = operation.responses[String(record.status)];
        if (!response) { violations.push(`${label}: estado no documentado`); continue; }
        const [, , referenced] = response.$ref ? response.$ref.match(/^#\/components\/(responses)\/(.+)$/) || [] : [];
        const schemaPointer = response.$ref
          ? `/components/responses/${referenced}/content/application~1json/schema`
          : `/paths/${encode(found.template)}/${record.method.toLowerCase()}/responses/${record.status}/content/application~1json/schema`;
        const hasSchema = response.$ref ? doc.components.responses[referenced].content : response.content;
        if (hasSchema && record.response !== undefined) {
          const problem = validate(schemaPointer, record.response);
          if (problem) violations.push(`${label}: la respuesta incumple su esquema (${problem})`);
        }
        if (record.status < 300 && record.request && operation.requestBody) {
          const problem = validate(`/paths/${encode(found.template)}/${record.method.toLowerCase()}/requestBody/content/application~1json/schema`, record.request);
          if (problem) violations.push(`${label}: la petición enviada incumple el esquema documentado (${problem})`);
        }
      }
      return violations;
    };
  }

  async function exerciseAndRecord(booted) {
    const records = [];
    const original = global.fetch;
    global.fetch = async (url, options = {}) => {
      const response = await original(url, options);
      const copy = response.clone();
      const path = new URL(url).pathname;
      if (path.startsWith('/api/') || path === '/health') {
        records.push({ method: options.method || 'GET', path, status: response.status, request: options.body ? JSON.parse(options.body) : undefined, response: await copy.json().catch(() => undefined) });
      }
      return response;
    };
    const config = {
      base: booted.base, adminEmail: ENV.ADMIN_EMAIL, adminPassword: ENV.ADMIN_PASSWORD,
      roles: Object.entries(booted.manifest.auth.roles).map(([id, role]) => ({ id, autoregistro: role.autoregistro === true }))
    };
    try {
      const access = await runtime.setupAccess(booted.base, config);
      try {
        await runtime.exerciseOpenApi(access.admin, booted.manifest.operations, booted.manifest.auth);
        for (const operation of booted.manifest.operations) {
          await runtime.exerciseOperation(access.admin, booted.manifest.operations, operation);
          await runtime.exerciseAccess(access, booted.manifest.operations, operation, booted.manifest.auth.operaciones[operation.key] || {});
        }
        await runtime.exerciseAuth(access, config);
      } finally { await access.cleanup(); }
    } finally { global.fetch = original; }
    return records;
  }

  test('todas las respuestas y peticiones reales están documentadas y cumplen su esquema', async () => {
    const booted = await arrancar();
    const records = await exerciseAndRecord(booted);
    expect(records.length).toBeGreaterThan(100);
    expect(checker(booted.openapi)(records)).toEqual([]);
    // La cobertura es real: aparecen los estados difíciles de acertar.
    const seen = new Set(records.map((record) => record.status));
    for (const status of [200, 201, 400, 401, 403, 404, 409, 422, 429]) expect(seen.has(status)).toBe(true);
  }, 120000);

  test('el comprobador detecta una documentación incompleta o incorrecta', async () => {
    const booted = await arrancar();
    const records = await exerciseAndRecord(booted);
    const withoutRule = JSON.parse(JSON.stringify(booted.openapi));
    delete withoutRule.paths['/api/operations/rf-02'].post.responses['422'];
    expect(checker(withoutRule)(records).join('\n')).toContain('POST /api/operations/rf-02 -> 422: estado no documentado');

    const wrongType = JSON.parse(JSON.stringify(booted.openapi));
    wrongType.components.schemas.ReservaUpdate.properties.comensales.type = 'string';
    expect(checker(wrongType)(records).join('\n')).toContain('incumple su esquema');

    const wrongBound = JSON.parse(JSON.stringify(booted.openapi));
    wrongBound.components.schemas.Reserva.properties.comensales.maximum = 5;
    expect(checker(wrongBound)(records).join('\n')).toContain('la petición enviada incumple el esquema documentado');
  }, 120000);
});
