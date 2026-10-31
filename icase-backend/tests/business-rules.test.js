const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const DomainModelExtractor = require('../src/infrastructure/services/DomainModelExtractor');
const BusinessRuleService = require('../src/core/services/BusinessRuleService');
const BackendScaffoldGenerator = require('../src/infrastructure/services/BackendScaffoldGenerator');
const BackendDataLayerGenerator = require('../src/infrastructure/services/BackendDataLayerGenerator');
const ApplicationContractBuilder = require('../src/infrastructure/services/ApplicationContractBuilder');
const samplePayload = require('../src/infrastructure/services/SamplePayload');

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

const rf = (identificador, nombre, descripcion = '') => ({ aprobado: true, tipo: 'RF', identificador, nombre, descripcion });
const requirements = [
  rf('RF-01', 'Gestionar clientes', 'El sistema DEBE registrar clientes con un correo electrónico válido.'),
  rf('RF-02', 'Registrar reservas', 'El sistema DEBE permitir reservas de 1 a 20 comensales; la fecha de fin no puede ser anterior a la de inicio.')
];
const model = new DomainModelExtractor().extract(PLANTUML);

const base = { entidad: 'Reserva', rf: ['RF-02'], origen: 'inferido', estado_decision: 'confirmado' };
const RULES = [
  { ...base, id: 'RN-01', tipo: 'requerido', campo: 'cliente_id', mensaje: 'Toda reserva debe tener un cliente.' },
  { ...base, id: 'RN-02', tipo: 'rango', campo: 'comensales', min: 1, max: 20, mensaje: 'Las reservas admiten de 1 a 20 comensales.', origen: 'explicito', evidencia: 'reservas de 1 a 20 comensales' },
  { ...base, id: 'RN-03', tipo: 'comparacion', campo: 'fechaFin', operador: '>=', con_campo: 'fechaInicio', mensaje: 'La fecha de fin no puede ser anterior a la de inicio.' },
  { ...base, id: 'RN-04', tipo: 'maquina_estados', campo: 'estado', inicial: 'PENDIENTE', mensaje: 'Transición de estado no permitida.',
    transiciones: [{ de: 'PENDIENTE', a: 'CONFIRMADA' }, { de: 'PENDIENTE', a: 'CANCELADA' }, { de: 'CONFIRMADA', a: 'CANCELADA' }] },
  { ...base, id: 'RN-05', tipo: 'unico', campos: ['codigo'], mensaje: 'El código de reserva debe ser único.' },
  { ...base, id: 'RN-06', tipo: 'inmutable', campo: 'codigo', mensaje: 'El código de reserva no puede modificarse.' },
  { ...base, id: 'RN-07', tipo: 'longitud', campo: 'notas', max: 20, mensaje: 'Las notas admiten hasta 20 caracteres.' },
  { ...base, id: 'RN-08', entidad: 'Cliente', rf: ['RF-01'], tipo: 'formato', campo: 'email', formato: 'email', mensaje: 'El correo electrónico no es válido.' },
  { ...base, id: 'RN-09', entidad: 'Cliente', rf: ['RF-01'], tipo: 'valor_por_defecto', campo: 'activo', valor: true, mensaje: 'Los clientes nuevos están activos.' }
];
const service = new BusinessRuleService();
const validar = (reglas) => service.validar(reglas, { entidades: model.entities, requerimientos: requirements });

describe('BusinessRuleService', () => {
  test('acepta reglas coherentes y las normaliza', () => {
    const { reglas, errores } = validar(RULES);
    expect(errores).toEqual([]);
    expect(reglas).toHaveLength(RULES.length);
    expect(reglas.find((item) => item.id === 'RN-04').estados).toEqual(['PENDIENTE', 'CONFIRMADA', 'CANCELADA']);
    expect(reglas.find((item) => item.id === 'RN-02').evidencia_literal).toBe(true);
  });

  test('resuelve nombres de entidad y campo sin distinguir mayúsculas ni acentos', () => {
    const { reglas, errores } = validar([{ ...RULES[1], entidad: 'reserva', campo: 'COMENSALES' }]);
    expect(errores).toEqual([]);
    expect(reglas[0]).toMatchObject({ entidad: 'Reserva', campo: 'comensales' });
  });

  test.each([
    ['entidad inexistente', { entidad: 'Mesa' }, 'no existe en el modelo'],
    ['campo inexistente', { campo: 'edad' }, 'no existe en Reserva'],
    ['RF desconocido', { rf: ['RF-99'] }, 'RF inexistentes'],
    ['sin RF', { rf: [] }, 'al menos un RF'],
    ['sin mensaje', { mensaje: '' }, 'mensaje'],
    ['tipo inválido', { tipo: 'magia' }, 'no existe'],
    ['rango sobre texto', { campo: 'notas' }, 'no es numérico'],
    ['min mayor que max', { min: 30 }, 'no puede superar'],
    ['rango sin límites', { min: undefined, max: undefined }, 'min'],
    ['referencia no admitida', { campo: 'cliente_id' }, 'referencia']
  ])('rechaza una regla con %s', (_nombre, cambio, texto) => {
    const { errores, reglas } = validar([{ ...RULES[1], ...cambio }]);
    expect(errores.join(' ')).toContain(texto);
    expect(reglas).toEqual([]);
  });

  test('valida máquinas de estados, comparaciones y valores por defecto', () => {
    const machine = RULES[3];
    expect(validar([{ ...machine, inicial: 'ARCHIVADA' }]).errores.join(' ')).toContain('inicial');
    expect(validar([{ ...machine, transiciones: [{ de: 'PENDIENTE', a: 'PERDIDA' }] }]).errores.join(' ')).toContain('no pertenecen');
    expect(validar([{ ...machine, transiciones: [] }]).errores.join(' ')).toContain('al menos una transición');
    expect(validar([machine, { ...machine, id: 'RN-X' }]).errores.join(' ')).toContain('ya existe una máquina');
    expect(validar([{ ...RULES[2], con_campo: 'comensales' }]).errores.join(' ')).toContain('no son del mismo tipo');
    expect(validar([{ ...RULES[2], con_campo: undefined }]).errores.join(' ')).toContain('exactamente uno');
    expect(validar([{ ...RULES[2], operador: '=~' }]).errores.join(' ')).toContain('operador');
    expect(validar([{ ...RULES[8], valor: 'si' }]).errores.join(' ')).toContain('compatible');
  });

  test('una evidencia que no consta literalmente degrada la regla a inferida', () => {
    const { reglas, advertencias } = validar([{ ...RULES[1], origen: 'explicito', evidencia: 'texto que no aparece en ningún requisito' }]);
    expect(reglas[0].origen).toBe('inferido');
    expect(reglas[0].evidencia_literal).toBe(false);
    expect(advertencias.join(' ')).toContain('RN-02');
  });

  test('distingue reglas pendientes, confirmadas y rechazadas; el valor por omisión es pendiente', () => {
    const { reglas } = validar([{ ...RULES[0], estado_decision: undefined }, RULES[1], { ...RULES[2], estado_decision: 'rechazado' }]);
    expect(service.pendientes(reglas)).toEqual(['RN-01']);
    expect(service.confirmadas(reglas).map((item) => item.id)).toEqual(['RN-02']);
  });
});

describe('generación con reglas de negocio', () => {
  const generar = (reglas, extra = {}) => new BackendScaffoldGenerator().generar({
    proyecto: { nombre: 'Demo' },
    insumos: {
      decisiones: { stack_tecnologico: { backend: 'Express', base_datos: 'PostgreSQL' }, reglas_negocio: { reglas } },
      requerimientos: requirements,
      diagramaDominio: { codigo_plantuml: PLANTUML },
      ...extra
    },
    versionesOrigen: {}
  });

  test('solo las reglas confirmadas llegan al código y las rechazadas se cuentan', async () => {
    const result = await generar([RULES[0], { ...RULES[1], estado_decision: 'rechazado' }]);
    const rules = result.archivos.find((file) => file.ruta === 'backend/src/data/rules.js').contenido;
    expect(rules).toContain('RN-01');
    expect(rules).not.toContain('RN-02');
    expect(result.advertencias.join(' ')).toContain('Reglas de negocio aplicadas: 1; 1 rechazadas');
    expect(result.archivos.map((file) => file.ruta)).toContain('backend/src/data/rules-engine.js');
  });

  test('metadatos de revisión no se copian al backend', async () => {
    const result = await generar([RULES[1]]);
    const rules = result.archivos.find((file) => file.ruta === 'backend/src/data/rules.js').contenido;
    expect(rules).not.toContain('evidencia');
    expect(rules).not.toContain('origen');
  });

  test('falla si hay reglas pendientes, incoherentes o sin diagrama de dominio', async () => {
    await expect(generar([{ ...RULES[0], estado_decision: 'pendiente' }])).rejects.toThrow('pendientes de decisión: RN-01');
    await expect(generar([{ ...RULES[1], campo: 'inexistente' }])).rejects.toThrow('ya no son coherentes');
    await expect(generar([RULES[0]], { diagramaDominio: null })).rejects.toThrow('diagrama de dominio aprobado');
  });

  test('sin reglas el backend sigue generándose con un motor vacío', async () => {
    const result = await generar([]);
    expect(result.archivos.find((file) => file.ruta === 'backend/src/data/rules.js').contenido.trim()).toBe('module.exports = {};');
  });

  test('las reglas de unicidad se convierten en índices únicos de la migración', () => {
    const rules = new BusinessRuleService().validar([RULES[4]], { entidades: model.entities, requerimientos: requirements }).reglas;
    const contract = new ApplicationContractBuilder().build({ proyecto: { nombre: 'Demo' }, requerimientos: requirements, domainModel: model, rules });
    const postgres = new BackendDataLayerGenerator().build({ contract, database: 'postgres' }).migration.statements.join('\n');
    expect(postgres).toContain('CREATE UNIQUE INDEX IF NOT EXISTS "uq_reserva_codigo" ON "reserva" ("codigo")');
    const mysql = new BackendDataLayerGenerator().build({ contract, database: 'mysql' }).migration.statements.join('\n');
    expect(mysql).toContain('`codigo` VARCHAR(255)');
    const mongo = new BackendDataLayerGenerator().build({ contract, database: 'mongodb' }).migration.indexes.find((item) => item.options?.unique);
    expect(mongo).toMatchObject({ collection: 'reserva', keys: { codigo: 1 }, options: { partialFilterExpression: { codigo: { $type: 'string' } } } });
  });
});

describe('motor de reglas y ejercitador sobre el código generado', () => {
  const cargar = async (reglas, { vaciarMotor = false } = {}) => {
    const result = await new BackendScaffoldGenerator().generar({
      proyecto: { nombre: 'Demo' },
      insumos: { decisiones: { stack_tecnologico: { backend: 'Express', base_datos: 'PostgreSQL' }, reglas_negocio: { reglas } }, requerimientos: requirements, diagramaDominio: { codigo_plantuml: PLANTUML } },
      versionesOrigen: {}
    });
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'icase-rules-'));
    for (const file of result.archivos.filter((item) => item.ruta.startsWith('backend/src/data/'))) {
      const destination = path.join(dir, path.basename(file.ruta));
      fs.writeFileSync(destination, vaciarMotor && file.ruta.endsWith('/rules.js') ? 'module.exports = {};\n' : file.contenido);
    }
    const load = (name) => require(path.join(dir, name));
    const manifest = JSON.parse(result.archivos.find((file) => file.ruta === 'backend/icase.manifest.json').contenido);
    return { support: load('store-support.js'), engine: load('rules-engine.js'), model: load('model.js'), operations: manifest.operations };
  };

  // API en memoria que reproduce el comportamiento de los almacenes (motor, unicidad y referencias) sin base de datos.
  const apiEnMemoria = ({ support, engine, model: physical }) => {
    const rows = {};
    let sequence = 1;
    const fail = (status, message) => { throw new support.HttpError(status, message); };
    const duplicated = (table, name, values, ownId) => (table.unique || []).some((unique) => (rows[name] || []).some((row) =>
      row.id !== ownId && unique.columns.every((column) => values[column] !== undefined && values[column] !== null && JSON.stringify(row[column]) === JSON.stringify(values[column]))));
    const dangling = (table, values) => (table.references || []).some((ref) => values[ref.column] != null && !(rows[ref.table] || []).some((row) => String(row.id) === String(values[ref.column])));
    return async (route, method = 'GET', body) => {
      try {
        const [, key, id] = route.match(/^\/api\/operations\/([^/]+)(?:\/(.+))?$/);
        const { name, table } = support.tableFor(physical, key);
        const list = (rows[name] = rows[name] || []);
        if (method === 'GET') return { status: 200, data: list.map((row) => support.toRecord(table, key, row)) };
        if (method === 'POST') {
          const { values, extra } = support.split(table, engine.prepare(name, body));
          engine.check(name, 'create', support.viewOf(table, values, extra), null);
          if (duplicated(table, name, values)) fail(409, 'duplicado');
          if (dangling(table, values)) fail(409, 'referencia inexistente');
          const row = { id: sequence++, ...values, extra, created_at: new Date(), updated_at: new Date() };
          list.push(row);
          return { status: 201, data: support.toRecord(table, key, row) };
        }
        const row = list.find((item) => String(item.id) === String(id));
        if (!row) fail(404, 'Registro inexistente');
        if (method === 'DELETE') {
          if (Object.values(physical.tables).some((other) => (other.references || []).some((ref) => ref.table === name && (rows[other.name] || []).length))) fail(409, 'referenciado');
          list.splice(list.indexOf(row), 1);
          return { status: 200, data: { deleted: true } };
        }
        const previous = support.toRecord(table, key, row).data;
        const { values, extra } = support.split(table, body);
        engine.check(name, 'update', { ...previous, ...support.viewOf(table, values, extra) }, previous);
        if (duplicated(table, name, values, row.id)) fail(409, 'duplicado');
        Object.assign(row, values, { extra: { ...row.extra, ...extra } });
        return { status: 200, data: support.toRecord(table, key, row) };
      } catch (error) {
        return { status: error.status || 500, data: { message: error.message, ...(error.details ? { details: error.details } : {}) } };
      }
    };
  };

  test('cada tipo de regla se cumple y se viola con la respuesta esperada', async () => {
    const loaded = await cargar(RULES);
    const api = apiEnMemoria({ ...loaded, model: { ...loaded.model, tables: Object.fromEntries(Object.entries(loaded.model.tables).map(([name, table]) => [name, { ...table, name }])) } });
    for (const operation of loaded.operations) await samplePayload.exerciseOperation(api, loaded.operations, operation);
  });

  test('las operaciones del contrato llevan sus reglas y el ejercitador genera un caso por regla', async () => {
    const { operations } = await cargar(RULES);
    const reserva = operations.find((item) => item.id === 'RF-02');
    expect(reserva.rules.map((item) => item.id)).toEqual(['RN-01', 'RN-02', 'RN-03', 'RN-04', 'RN-05', 'RN-06', 'RN-07']);
    const sample = samplePayload(reserva.schema, reserva.rules, 'abc');
    expect(sample.payload).toMatchObject({ comensales: 7, estado: 'PENDIENTE' });
    expect(Date.parse(sample.payload.fechaFin)).toBeGreaterThanOrEqual(Date.parse(sample.payload.fechaInicio));
    expect(sample.parents).toEqual([{ campo: 'cliente_id', entidad: 'Cliente' }]);
    expect(sample.cases.map((item) => item.regla)).toEqual(expect.arrayContaining(['RN-01', 'RN-02', 'RN-03', 'RN-04', 'RN-05', 'RN-06', 'RN-07']));
    expect(sample.cases[sample.cases.length - 1]).toMatchObject({ regla: 'RN-04', esperado: 200 });
  });

  test('el ejercitador detecta un backend que no aplica las reglas', async () => {
    const loaded = await cargar(RULES, { vaciarMotor: true });
    const physical = { ...loaded.model, tables: Object.fromEntries(Object.entries(loaded.model.tables).map(([name, table]) => [name, { ...table, name }])) };
    const reserva = loaded.operations.find((item) => item.id === 'RF-02');
    await expect(samplePayload.exerciseOperation(apiEnMemoria({ ...loaded, model: physical }), loaded.operations, reserva)).rejects.toThrow(/RF-02: regla RN-/);
  });

  test('las respuestas de error detallan qué reglas se incumplen', async () => {
    const loaded = await cargar(RULES);
    const api = apiEnMemoria({ ...loaded, model: { ...loaded.model, tables: Object.fromEntries(Object.entries(loaded.model.tables).map(([name, table]) => [name, { ...table, name }])) } });
    const response = await api('/api/operations/rf-01', 'POST', { email: 'no-es-un-correo' });
    expect(response.status).toBe(422);
    expect(response.data.details).toEqual([{ regla: 'RN-08', mensaje: 'El correo electrónico no es válido.', rf: ['RF-01'] }]);
    const created = await api('/api/operations/rf-01', 'POST', { nombre: 'Ana', email: 'ana@example.com' });
    expect(created.data.data.activo).toBe(true);
  });
});
