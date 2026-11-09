const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const ArtifactVerificationService = require('../src/core/services/ArtifactVerificationService');
const Frontend = require('../src/infrastructure/services/GenericFrontendGenerator');
const TestSuiteGenerator = require('../src/infrastructure/services/TestSuiteGenerator');

const verify = (archivos) => new ArtifactVerificationService().verificar({ tipo: 'codigo_frontend', archivos });
const file = (ruta, contenido) => ({ ruta, contenido });
const manifestFile = (pantallas) => file('frontend/icase.manifest.json', JSON.stringify({ pantallas }));
const base = (pantallas, extra = []) => [
  file('frontend/package.json', '{}'), file('frontend/src/App.jsx', 'export default () => null;'),
  file('frontend/src/pages/reservas.jsx', 'export default function Reservas(){ return null; }'),
  file('frontend/src/session.jsx', "const r = await fetch('/api/auth/me');"), manifestFile(pantallas), ...extra
];
const screen = (enlaces) => ({ id: 'reservas', name: 'Reservas', route: '/reservas', operations: ['rf-01'], ...(enlaces ? { enlaces } : {}) });
const summary = (changes = {}) => ({ validos: 1, invalidos: 0, ui: 0, sin_enlace: [], cableados: 1, acciones: [{ operacion: 'rf-01', verbo: 'crear', control: 'Crear' }], ...changes });

describe('verificación estructural del frontend: consumo de la API', () => {
  test('el fetch del archivo de sesión no basta: debe llamar a la API otro archivo', () => {
    const result = verify(base([screen()]));
    expect(result.errores).toContain('Ninguna pantalla consume una API del backend.');
    expect(result.estado).toBe('fallida');
  });

  test.each([
    ['la pantalla genérica de operaciones', file('frontend/src/OperationScreen.jsx', 'const rows = await api(`/api/operations/${key}`);')],
    ['el runtime de acciones del mockup', file('frontend/src/mockupActions.js', "await api(base, { method: 'POST' });")],
    ['una pantalla con fetch propio', file('frontend/src/pages/otra.jsx', "fetch('/api/operations/rf-01')")]
  ])('se acepta cuando lo hace %s', (_name, extra) => {
    expect(verify(base([screen()], [extra])).errores).not.toContain('Ninguna pantalla consume una API del backend.');
  });
});

describe('verificación estructural del frontend: enlaces por pantalla', () => {
  const api = file('frontend/src/OperationScreen.jsx', 'await api(path);');

  test('una pantalla con enlaces cableados cuya página no los ejecuta es un error', () => {
    const result = verify(base([screen(summary())], [api]));
    expect(result.errores.join(' ')).toContain('Reservas');
    expect(result.errores.join(' ')).toContain('no los ejecuta');
  });

  test('con enlaces cableados y una página que los ejecuta no hay error', () => {
    const page = file('frontend/src/pages/reservas.jsx', 'const f = (e) => handleAction(e, "rf-01", "crear");');
    expect(verify([...base([screen(summary())], [api]).filter((item) => item.ruta !== 'frontend/src/pages/reservas.jsx'), page]).errores).toEqual([]);
  });

  test('una vista diseñada sin ninguna acción conectada avisa y nombra los controles sin enlace, sin bloquear', () => {
    const result = verify(base([screen(summary({ validos: 0, cableados: 0, acciones: [], sin_enlace: ['Confirmar reserva', 'Cancelar'], sin_enlace_total: 2 }))], [api]));
    expect(result.errores).toEqual([]);
    expect(result.estado).toBe('apta_estructuralmente');
    expect(result.advertencias.join('\n')).toContain('«Reservas» no ejecuta ninguna acción del backend');
    expect(result.advertencias.join('\n')).toContain('Confirmar reserva');
  });

  test('con acciones conectadas avisa solo de los controles que quedaron sin enlace y de los enlaces inválidos', () => {
    const page = file('frontend/src/pages/reservas.jsx', 'handleAction(e, "rf-01", "crear")');
    const result = verify([...base([screen(summary({ sin_enlace: ['Exportar'], sin_enlace_total: 3, invalidos: 2 }))], [api]).filter((item) => item.ruta !== 'frontend/src/pages/reservas.jsx'), page]);
    expect(result.errores).toEqual([]);
    expect(result.advertencias.join('\n')).toContain('3 controles sin enlace');
    expect(result.advertencias.join('\n')).toContain('2 enlaces inválidos');
    expect(result.advertencias.join('\n')).not.toContain('no ejecuta ninguna acción');
  });

  test('comportamiento previo: un manifiesto sin resumen de enlaces no genera avisos nuevos', () => {
    const result = verify(base([screen()], [api]));
    expect(result.errores).toEqual([]);
    expect(result.advertencias.join('\n')).not.toContain('enlace');
  });
});

describe('GenericFrontendGenerator: resumen de enlaces en el manifiesto', () => {
  const html = (body) => `<!DOCTYPE html><html><body><main>${body}</main></body></html>`;
  const requerimientos = [{ identificador: 'RF-03', tipo: 'RF', aprobado: true, nombre: 'Reservar sala' }];
  const screens = [
    { nombre: 'Reservas', slug: 'reservas', ruta: '/reservas', rf_trazabilidad: ['RF-03'], mockup: { preview_code: html('<form><input name="sala"><button data-accion="RF-03.crear">Confirmar reserva</button><button data-accion="RF-99.crear">Mala</button><button data-accion="ui">Cerrar</button><button>Exportar</button></form>') } },
    { nombre: 'Mesas', slug: 'mesas', ruta: '/mesas', rf_trazabilidad: ['RF-03'] }
  ];
  const manifest = () => JSON.parse(new Frontend().generate({ proyecto: { nombre: 'Salas' }, screens, decisiones: {}, requerimientos }).find((item) => item.ruta === 'frontend/icase.manifest.json').contenido);

  test('cada pantalla con mockup resume sus enlaces', () => {
    const reservas = manifest().pantallas.find((item) => item.id === 'reservas');
    expect(reservas.enlaces).toEqual({
      validos: 1, invalidos: 1, ui: 1, sin_enlace: ['Exportar'], sin_enlace_total: 1, cableados: 1,
      acciones: [{ operacion: 'rf-03', verbo: 'crear', control: 'Confirmar reserva' }]
    });
  });

  test('una pantalla sin mockup no lleva resumen y el resto del manifiesto no cambia', () => {
    const result = manifest();
    expect(result.pantallas.find((item) => item.id === 'mesas').enlaces).toBeUndefined();
    expect(result.mode).toBe('generic_contract_v1');
    expect(result.pantallas[0]).toEqual(expect.objectContaining({ id: 'reservas', route: '/reservas', operations: ['rf-03'] }));
  });
});

describe('prueba de navegador sobre la interfaz diseñada', () => {
  const operation = (id, key) => ({ id, key, entity: null, collectionPath: `/api/operations/${key}`, itemPath: `/api/operations/${key}/:id`, methods: ['GET', 'POST', 'PATCH', 'DELETE'], schema: { type: 'object', properties: { sala: { type: 'string' } } }, rules: [] });
  const build = (pantallas, { auth, operations = [operation('RF-03', 'rf-03')] } = {}) => new TestSuiteGenerator().generar({
    proyecto: { nombre: 'Salas' }, versionesOrigen: {},
    insumos: {
      requerimientos: [{ aprobado: true, tipo: 'RF', identificador: 'RF-03', nombre: 'Reservar sala' }],
      backend: { version: 1, trazabilidad_rf: ['RF-03'], archivos: [{ ruta: 'backend/icase.manifest.json', contenido: JSON.stringify({ operations }) }] },
      frontend: { version: 1, trazabilidad_rf: ['RF-03'], archivos: [{ ruta: 'frontend/icase.manifest.json', contenido: JSON.stringify({ auth: auth || { habilitada: false }, pantallas }) }] }
    }
  });
  const withLinks = (acciones) => ({ id: 'reservas', name: 'Reservas', route: '/reservas', operations: ['rf-03'], enlaces: summary({ acciones }) });
  const spec = (result) => result.archivos.find((item) => item.ruta === 'tests/e2e/designed-ui.spec.js')?.contenido;

  test('se genera una prueba por acción crear y consultar de la vista diseñada', async () => {
    const text = spec(await build([withLinks([{ operacion: 'rf-03', verbo: 'crear', control: 'Confirmar reserva' }, { operacion: 'rf-03', verbo: 'consultar', control: 'Buscar' }])]));
    expect(text).toContain('RF-03.crear');
    expect(text).toContain('RF-03.consultar');
    expect(text).toContain('data-accion');
    expect(text).toContain('Registro creado');
    expect(text).toContain('[data-icase-result]');
    expect(text).toContain('"route":"/reservas"');
    expect(text).toMatch(/registros\?/);
  });

  test('comprueba que el registro quedó persistido y lo elimina al terminar', async () => {
    const text = spec(await build([withLinks([{ operacion: 'rf-03', verbo: 'crear', control: 'Confirmar reserva' }])]));
    expect(text).toContain('el formulario del mockup debe crear exactamente un registro');
    expect(text).toContain("'DELETE'");
  });

  test('con sesión usa la cabecera de la sesión de las pruebas de navegador', async () => {
    const text = spec(await build([withLinks([{ operacion: 'rf-03', verbo: 'crear', control: 'Crear' }])], { auth: { habilitada: true, registro: [] } }));
    expect(text).toContain('icase_token');
  });

  test('es JavaScript válido', async () => {
    const text = spec(await build([withLinks([{ operacion: 'rf-03', verbo: 'crear', control: 'Crear' }, { operacion: 'rf-03', verbo: 'consultar', control: 'Buscar' }])]));
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'designed-spec-'));
    try {
      const target = path.join(directory, 'designed-ui.spec.mjs');
      fs.writeFileSync(target, text);
      expect(() => execFileSync(process.execPath, ['--check', target], { stdio: 'pipe' })).not.toThrow();
    } finally { fs.rmSync(directory, { recursive: true, force: true }); }
  });

  test.each([
    ['sin resumen de enlaces', [{ id: 'reservas', name: 'Reservas', route: '/reservas', operations: ['rf-03'] }]],
    ['solo acciones de editar o eliminar', [withLinks([{ operacion: 'rf-03', verbo: 'eliminar', control: 'Eliminar' }])]],
    ['una operación que el contrato no tiene', [withLinks([{ operacion: 'rf-77', verbo: 'crear', control: 'Crear' }])]]
  ])('no se genera la prueba: %s', async (_name, pantallas) => {
    expect(spec(await build(pantallas))).toBeUndefined();
  });

  test('no se prueba la creación en una operación que ya no admite POST', async () => {
    const narrowed = { ...operation('RF-03', 'rf-03'), methods: ['GET'] };
    expect(spec(await build([withLinks([{ operacion: 'rf-03', verbo: 'crear', control: 'Crear' }])], { operations: [narrowed] }))).toBeUndefined();
  });
});
