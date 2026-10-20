const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const BackendScaffoldGenerator = require('../src/infrastructure/services/BackendScaffoldGenerator');
const FrontendScaffoldGenerator = require('../src/infrastructure/services/FrontendScaffoldGenerator');
const TestSuiteGenerator = require('../src/infrastructure/services/TestSuiteGenerator');

const PLANTUML = `@startuml
enum EstadoReserva {
  PENDIENTE
  CONFIRMADA
}
class Cliente {
  +String id
  +String nombre
  +String email
}
class Reserva {
  +String id
  +DateTime fecha
  +int comensales
  +boolean vip
  +EstadoReserva estado
}
Cliente "1" --> "0..*" Reserva : realiza
@enduml`;

const requerimientos = [
  { aprobado: true, tipo: 'RF', identificador: 'RF-01', nombre: 'Gestionar clientes', descripcion: 'Registrar clientes' },
  { aprobado: true, tipo: 'RF', identificador: 'RF-02', nombre: 'Gestionar reservas', descripcion: 'Registrar reservas de clientes' }
];
const screens = [{ pantalla_id: 's1', nombre: 'Reservas', slug: 'reservas', ruta: '/reservas', rf_trazabilidad: ['RF-02'] }];

async function pipeline(modulos) {
  const decisiones = {
    stack_tecnologico: { backend: 'Node.js + Express', base_datos: 'PostgreSQL' },
    control_acceso: { autenticacion: { metodo: 'ninguna' } },
    ...(modulos ? { modulos } : {})
  };
  const backend = await new BackendScaffoldGenerator().generar({ proyecto: { nombre: 'Demo' }, insumos: { decisiones, requerimientos, diagramaDominio: { codigo_plantuml: PLANTUML } }, versionesOrigen: {} });
  const frontend = await new FrontendScaffoldGenerator().generar({ proyecto: { nombre: 'Demo' }, insumos: { decisiones, diseno: { manifiesto_navegacion: screens, mockups: [] } }, versionesOrigen: {} });
  const tests = await new TestSuiteGenerator().generar({ proyecto: { nombre: 'Demo' }, versionesOrigen: {}, insumos: { requerimientos, backend: { ...backend, version: 1 }, frontend: { ...frontend, version: 1 } } });
  return { backend, frontend, tests };
}
const file = (artifact, ruta) => artifact.archivos.find((item) => item.ruta === ruta);

describe('módulo de formularios tipados', () => {
  test('activo por defecto: pantalla por campo, editor JSON de reserva, estilos y manifiesto', async () => {
    const { frontend } = await pipeline();
    const screen = file(frontend, 'frontend/src/OperationScreen.jsx').contenido;
    expect(screen).toContain('Formulario de registro');
    expect(screen).toContain("from './JsonOperationScreen'");
    expect(file(frontend, 'frontend/src/JsonOperationScreen.jsx').contenido).toContain('aria-label="Datos JSON"');
    expect(file(frontend, 'frontend/src/styles.css').contenido).toContain('.form-grid');
    expect(JSON.parse(file(frontend, 'frontend/icase.manifest.json').contenido).modulos).toEqual({ formularios_tipados: true });
  });

  test('desactivado: solo el editor JSON de siempre, sin estilos ni archivos del módulo', async () => {
    const { frontend } = await pipeline({ modo: 'personalizado', modulos: [{ id: 'formularios_tipados', activo: false }] });
    expect(file(frontend, 'frontend/src/OperationScreen.jsx').contenido).toContain('aria-label="Datos JSON"');
    expect(file(frontend, 'frontend/src/OperationScreen.jsx').contenido).not.toContain('Formulario de registro');
    expect(file(frontend, 'frontend/src/JsonOperationScreen.jsx')).toBeUndefined();
    expect(file(frontend, 'frontend/src/styles.css').contenido).not.toContain('.form-grid');
    expect(JSON.parse(file(frontend, 'frontend/icase.manifest.json').contenido).modulos).toEqual({ formularios_tipados: false });
  });

  test('las sesiones conservan el estado HTTP y los detalles del error para marcar el campo', async () => {
    for (const metodo of ['ninguna', 'jwt']) {
      const decisiones = { stack_tecnologico: {}, control_acceso: { autenticacion: { metodo }, roles: [] } };
      const frontend = await new FrontendScaffoldGenerator().generar({ proyecto: { nombre: 'Demo' }, insumos: { decisiones, diseno: { manifiesto_navegacion: screens, mockups: [] } }, versionesOrigen: {} });
      expect(file(frontend, 'frontend/src/session.jsx').contenido).toContain('details: data.details');
    }
  });

  test('la prueba de navegador usa el formulario cuando el módulo está activo y el JSON cuando no', async () => {
    const on = await pipeline();
    expect(on.tests.archivos.map((item) => item.ruta)).toContain('tests/e2e/typed-forms.spec.js');
    expect(on.tests.archivos.map((item) => item.ruta)).not.toContain('tests/e2e/contract-interaction.spec.js');
    const off = await pipeline({ modo: 'personalizado', modulos: [{ id: 'formularios_tipados', activo: false }] });
    expect(off.tests.archivos.map((item) => item.ruta)).toContain('tests/e2e/contract-interaction.spec.js');
    expect(off.tests.archivos.map((item) => item.ruta)).not.toContain('tests/e2e/typed-forms.spec.js');
  });

  test('la prueba generada es JavaScript válido, apunta a la primera pantalla y usa su operación', async () => {
    const { tests } = await pipeline();
    const spec = file(tests, 'tests/e2e/typed-forms.spec.js').contenido;
    expect(spec).toContain('const route = "/reservas";');
    expect(spec).toContain('"key":"rf-02"');
    expect(spec).toContain("getByRole('form', { name: 'Formulario de registro' })");
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'typed-spec-'));
    try {
      const target = path.join(directory, 'typed-forms.spec.mjs');
      fs.writeFileSync(target, spec);
      expect(() => execFileSync(process.execPath, ['--check', target], { stdio: 'pipe' })).not.toThrow();
    } finally { fs.rmSync(directory, { recursive: true, force: true }); }
  });

  test('el contrato que consume la pantalla trae esquema y reglas por operación', async () => {
    const { backend } = await pipeline();
    const contract = JSON.parse(file(backend, 'backend/icase.manifest.json').contenido);
    const reserva = contract.operations.find((item) => item.id === 'RF-02');
    expect(Object.keys(reserva.schema.properties)).toEqual(expect.arrayContaining(['fecha', 'comensales', 'vip', 'estado', 'cliente_id']));
    expect(reserva.schema.properties.cliente_id['x-references']).toBe('Cliente');
    expect(reserva.schema.properties.fecha.format).toBe('date-time');
    expect(reserva.schema.properties.estado.enum).toEqual(['PENDIENTE', 'CONFIRMADA']);
  });
});
