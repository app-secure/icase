const path = require('node:path');
const DomainModelExtractor = require('../src/infrastructure/services/DomainModelExtractor');
const ApplicationContractBuilder = require('../src/infrastructure/services/ApplicationContractBuilder');
const BackendDataLayerGenerator = require('../src/infrastructure/services/BackendDataLayerGenerator');
const BackendScaffoldGenerator = require('../src/infrastructure/services/BackendScaffoldGenerator');
const TestSuiteGenerator = require('../src/infrastructure/services/TestSuiteGenerator');
const samplePayload = require('../src/infrastructure/services/SamplePayload');
// Las plantillas son JavaScript real, de modo que su lógica pura se prueba directamente.
const support = require(path.join('..', 'src', 'infrastructure', 'templates', 'data-layer', 'store-support.js'));

const PLANTUML = `@startuml
enum EstadoReserva {
  PENDIENTE
  CONFIRMADA
}
class Cliente {
  +String id
  +String nombre
  +float saldo
  +boolean activo
  +DateTime creadoEn
  +String extra
}
class Mesa {
  +String id
  +int capacidad
}
class Reserva {
  +String id
  +Date fecha
  +int comensales
  +EstadoReserva estado
  +List<String> etiquetas
}
Cliente "1" --> "0..*" Reserva : realiza
Mesa "1" -- "0..*" Reserva
@enduml`;

const rf = (identificador, nombre) => ({ aprobado: true, tipo: 'RF', identificador, nombre });
const requirements = [rf('RF-01', 'Gestionar clientes'), rf('RF-02', 'Registrar reservas'), rf('RF-03', 'Consultar reportes globales')];
const contract = new ApplicationContractBuilder().build({
  proyecto: { nombre: 'Demo' }, requerimientos: requirements, domainModel: new DomainModelExtractor().extract(PLANTUML)
});
const build = (database) => new BackendDataLayerGenerator().build({ contract, database });

describe('modelo físico', () => {
  const { model } = build('postgres');

  test('crea una tabla por entidad y una genérica solo para operaciones sin entidad', () => {
    expect(Object.keys(model.tables).sort()).toEqual(['cliente', 'icase_records', 'mesa', 'reserva']);
    expect(model.operations).toEqual({ 'rf-01': 'cliente', 'rf-02': 'reserva', 'rf-03': 'icase_records' });
    expect(model.tables.icase_records.generic).toBe(true);
  });

  test('traduce tipos y renombra columnas que colisionan con las del sistema', () => {
    const columns = Object.fromEntries(model.tables.cliente.columns.map((column) => [column.name, column]));
    expect(columns.saldo.type).toBe('number');
    expect(columns.activo.type).toBe('boolean');
    expect(columns.creadoEn).toMatchObject({ column: 'creado_en', type: 'datetime' });
    expect(columns.extra.column).toBe('extra_campo');
    const reserva = Object.fromEntries(model.tables.reserva.columns.map((column) => [column.name, column]));
    expect(reserva.fecha.type).toBe('date');
    expect(reserva.estado).toMatchObject({ type: 'string', enum: ['PENDIENTE', 'CONFIRMADA'] });
    expect(reserva.etiquetas.type).toBe('json');
  });

  test('solo exige la clave foránea cuando la entidad destino es alcanzable por la API', () => {
    const reserva = Object.fromEntries(model.tables.reserva.columns.map((column) => [column.name, column]));
    expect(reserva.cliente_id).toMatchObject({ type: 'id', references: 'cliente', enforced: true });
    expect(reserva.mesa_id).toMatchObject({ type: 'id', references: 'mesa', enforced: false });
    expect(model.tables.reserva.references).toEqual([{ column: 'cliente_id', table: 'cliente' }]);
  });
});

describe('migraciones', () => {
  test('PostgreSQL: tablas tipadas, índices y claves foráneas al final', () => {
    const { statements } = build('postgres').migration;
    const sql = statements.join('\n');
    expect(sql).toContain('"saldo" DOUBLE PRECISION');
    expect(sql).toContain('"fecha" DATE');
    expect(sql).toContain('"etiquetas" JSONB');
    expect(sql).toContain('"extra" JSONB NOT NULL');
    expect(statements[statements.length - 1]).toContain('FOREIGN KEY ("cliente_id") REFERENCES "cliente" ("id")');
    expect(statements.filter((item) => item.startsWith('ALTER TABLE')).length).toBe(1);
    expect(statements.findIndex((item) => item.startsWith('ALTER'))).toBeGreaterThan(statements.findIndex((item) => item.includes('"cliente" (')));
  });

  test('MySQL: sintaxis propia del motor', () => {
    const sql = build('mysql').migration.statements.join('\n');
    expect(sql).toContain('`activo` TINYINT(1)');
    expect(sql).toContain('`creado_en` DATETIME(3)');
    expect(sql).toContain('ON UPDATE CURRENT_TIMESTAMP(3)');
    expect(sql).toContain('`capability` VARCHAR(191) NOT NULL');
    expect(sql).not.toContain('IF NOT EXISTS `idx_');
  });

  test('MongoDB: colecciones e índices sobre las referencias', () => {
    const { migration } = build('mongodb');
    expect(migration.collections.sort()).toEqual(['cliente', 'icase_records', 'mesa', 'reserva']);
    expect(migration.indexes).toEqual(expect.arrayContaining([
      { collection: 'reserva', keys: { cliente_id: 1 } },
      { collection: 'icase_records', keys: { capability: 1 } }
    ]));
  });

  test('sin modelo de dominio todas las operaciones usan solo la tabla genérica', () => {
    const plain = new ApplicationContractBuilder().build({ proyecto: { nombre: 'Demo' }, requerimientos: requirements });
    const { model, migration } = new BackendDataLayerGenerator().build({ contract: plain, database: 'postgres' });
    expect(Object.keys(model.tables)).toEqual(['icase_records']);
    expect(migration.statements.some((statement) => statement.startsWith('ALTER'))).toBe(false);
  });
});

describe('archivos generados', () => {
  const generate = async (backend, base_datos) => (await new BackendScaffoldGenerator().generar({
    proyecto: { nombre: 'Demo' },
    insumos: { decisiones: { stack_tecnologico: { backend, base_datos } }, requerimientos: requirements, diagramaDominio: { codigo_plantuml: PLANTUML } },
    versionesOrigen: {}
  })).archivos.map((file) => file.ruta);

  test('Express incorpora almacén, modelo, migraciones y la migración legible', async () => {
    const paths = await generate('Express', 'PostgreSQL');
    expect(paths).toEqual(expect.arrayContaining(['backend/src/record.store.js', 'backend/src/data/model.js', 'backend/src/data/migrations.js', 'backend/src/data/store-support.js', 'backend/db/migrations/0001_init.sql']));
  });

  test('NestJS reutiliza el almacén JavaScript y filtra errores del almacén', async () => {
    const paths = await generate('NestJS', 'MongoDB');
    expect(paths).toEqual(expect.arrayContaining(['backend/src/record.store.ts', 'backend/src/record.store.base.js', 'backend/src/store-exception.filter.ts', 'backend/db/migrations/0001_init.json']));
  });
});

describe('store-support', () => {
  const column = (type, extra = {}) => ({ name: 'campo', column: 'campo', type, ...extra });
  const status = (callback) => { try { callback(); } catch (error) { return error.status; } return null; };

  test('coerce normaliza valores válidos', () => {
    expect(support.coerce(column('integer'), '42')).toBe(42);
    expect(support.coerce(column('number'), '1.5')).toBe(1.5);
    expect(support.coerce(column('boolean'), 'false')).toBe(false);
    expect(support.coerce(column('datetime'), '2030-01-02T03:04:05Z')).toEqual(new Date('2030-01-02T03:04:05Z'));
    expect(support.coerce(column('id'), 7)).toBe('7');
    expect(support.coerce(column('integer'), null)).toBeNull();
  });

  test('coerce rechaza con 400 los valores de tipo incorrecto', () => {
    for (const [type, value] of [['integer', 1.5], ['integer', 'abc'], ['number', 'x'], ['boolean', 'si'], ['string', 5], ['datetime', 'ayer'], ['date', '02/01/2030'], ['uuid', 'x'], ['json', {}], ['id', 'abc']]) {
      expect(status(() => support.coerce(column(type), value))).toBe(400);
    }
    expect(status(() => support.coerce(column('id'), 'a'.repeat(24), { idKind: 'numeric' }))).toBe(400);
    expect(support.coerce(column('id'), 'a'.repeat(24), { idKind: 'objectid' })).toBe('a'.repeat(24));
  });

  test('split separa columnas conocidas de campos adicionales e ignora los del sistema', () => {
    const table = { columns: [column('integer', { name: 'edad', column: 'edad' })] };
    expect(support.split(table, { edad: '3', otro: 'x', id: 99, created_at: 'x' })).toEqual({ values: { edad: 3 }, extra: { otro: 'x' } });
    expect(status(() => support.split(table, []))).toBe(400);
    expect(status(() => support.split(table, null))).toBe(400);
  });

  test('toRecord conserva la forma pública { id, capability, data } y omite nulos', () => {
    const table = { columns: [column('integer', { name: 'edad', column: 'edad' }), column('json', { name: 'tags', column: 'tags' }), column('id', { name: 'cliente_id', column: 'cliente_id' })] };
    const row = { id: 5, edad: '3', tags: '["a"]', cliente_id: 8, extra: '{"marker":"m","vacio":null}', created_at: 'c', updated_at: 'u' };
    expect(support.toRecord(table, 'rf-01', row)).toEqual({ id: '5', capability: 'rf-01', data: { marker: 'm', edad: 3, tags: ['a'], cliente_id: '8' }, created_at: 'c', updated_at: 'u' });
  });

  test('withRetry reintenta errores de conexión y propaga los demás', async () => {
    const quiet = jest.spyOn(console, 'warn').mockImplementation(() => {});
    let calls = 0;
    const flaky = async () => { calls += 1; if (calls < 3) throw Object.assign(new Error('refused'), { code: 'ECONNREFUSED' }); return 'listo'; };
    await expect(support.withRetry(flaky, { attempts: 5, delayMs: 1 })).resolves.toBe('listo');
    expect(calls).toBe(3);
    let syntaxCalls = 0;
    await expect(support.withRetry(async () => { syntaxCalls += 1; throw Object.assign(new Error('sintaxis'), { code: '42601' }); }, { attempts: 5, delayMs: 1 })).rejects.toThrow('sintaxis');
    expect(syntaxCalls).toBe(1);
    await expect(support.withRetry(async () => { throw Object.assign(new Error('caída'), { code: 'ECONNREFUSED' }); }, { attempts: 2, delayMs: 1 })).rejects.toThrow('caída');
    quiet.mockRestore();
  });

  test('tableFor rechaza operaciones no declaradas, incluso con nombres del prototipo', () => {
    const model = { operations: { 'rf-01': 'cliente' }, tables: { cliente: { columns: [] } } };
    expect(support.tableFor(model, 'rf-01').name).toBe('cliente');
    expect(status(() => support.tableFor(model, 'constructor'))).toBe(404);
  });
});

describe('pruebas generadas', () => {
  test('samplePayload produce valores válidos para cada tipo y omite referencias', () => {
    const { payload, typed } = samplePayload(contract.operations.find((item) => item.id === 'RF-02').schema);
    expect(payload).toMatchObject({ fecha: '2030-01-02', comensales: 7, estado: 'PENDIENTE', etiquetas: [] });
    expect(payload.cliente_id).toBeUndefined();
    expect(payload.id).toBeUndefined();
    expect(typed.find((item) => item.name === 'comensales').type).toBe('integer');
  });

  test('la suite de integración usa el esquema y no depende de campos del dominio', async () => {
    const backend = await new BackendScaffoldGenerator().generar({
      proyecto: { nombre: 'Demo' },
      insumos: { decisiones: { stack_tecnologico: { backend: 'Express', base_datos: 'PostgreSQL' } }, requerimientos: requirements, diagramaDominio: { codigo_plantuml: PLANTUML } },
      versionesOrigen: {}
    });
    const tests = await new TestSuiteGenerator().generar({
      proyecto: { nombre: 'Demo' },
      insumos: { requerimientos: requirements, backend: { ...backend, version: 1 }, frontend: { archivos: [], trazabilidad_rf: [], version: 1 } },
      versionesOrigen: {}
    });
    const content = tests.archivos.map((file) => file.contenido).find((text) => text.includes('samplePayload'));
    expect(content).toContain('function samplePayload');
    expect(content).toContain('async function exerciseOperation');
    expect(content).not.toContain('icase_estado');
    expect(content).not.toMatch(/[{ ,]estado:\s*'creado'/);
    expect(content).toContain("'valor-que-no-corresponde'");
  });
});

describe('renderTemplate', () => {
  const renderTemplate = require('../src/infrastructure/services/renderTemplate');

  test('reemplaza todas las ocurrencias y no reinterpreta los valores insertados', () => {
    expect(renderTemplate('// __A__\nconst a = __A__; const b = __B__;', { A: '1', B: '"__A__"' })).toBe('// 1\nconst a = 1; const b = "__A__";');
  });

  test('falla con marcadores sin valor o valores que la plantilla no usa', () => {
    expect(() => renderTemplate('x = __FALTA__', {})).toThrow('__FALTA__');
    expect(() => renderTemplate('x = 1', { SOBRA: '1' })).toThrow('SOBRA');
  });

  test('las plantillas reales del frontend y del smoke se rellenan por completo', () => {
    const GenericFrontendGenerator = require('../src/infrastructure/services/GenericFrontendGenerator');
    const files = new GenericFrontendGenerator().generate({
      proyecto: { nombre: 'Demo' }, screens: [{ pantalla_id: 'p', nombre: 'Inicio', slug: 'inicio', ruta: '/inicio', rf_trazabilidad: ['RF-01'] }],
      decisiones: { control_acceso: { autenticacion: { metodo: 'jwt' }, roles: [{ id: 'cliente', nombre: 'Cliente', incluir: true, autoregistro: true }] }, alcance_plataforma: { plataformas: ['web', 'móvil'] } }
    });
    const login = files.find((file) => file.ruta === 'frontend/src/LoginScreen.jsx').contenido;
    expect(login).toContain('const OPEN_ROLES = [{"id":"cliente","nombre":"Cliente"}];');
    expect(login).not.toMatch(/__[A-Z]+__/);
    const mobile = files.find((file) => file.ruta === 'mobile/App.js').contenido;
    expect(mobile).toContain('const AUTH = true;');
    expect(mobile).toContain('const TITLE = "Demo";');
  });
});
