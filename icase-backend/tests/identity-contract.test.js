const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const { transformSync } = require('esbuild');
const ApplicationContractBuilder = require('../src/infrastructure/services/ApplicationContractBuilder');
const DomainModelExtractor = require('../src/infrastructure/services/DomainModelExtractor');
const MockupBindingService = require('../src/infrastructure/services/MockupBindingService');
const MockupBindingValidator = require('../src/infrastructure/services/MockupBindingValidator');
const GenericFrontendGenerator = require('../src/infrastructure/services/GenericFrontendGenerator');
const HtmlToJsxTransformer = require('../src/infrastructure/services/HtmlToJsxTransformer');

const plantuml = '@startuml\nclass Usuario {\n+String id\n+String correo\n+String passwordHash\n+String rol\n}\nclass Mesa {\n+String id\n+int numero\n}\n@enduml';
const requerimientos = [
  { identificador: 'RF-01', tipo: 'RF', aprobado: true, nombre: 'Autenticar usuarios mediante tokens JWT' },
  { identificador: 'RF-02', tipo: 'RF', aprobado: true, nombre: 'Gestionar usuarios' },
  { identificador: 'RF-03', tipo: 'RF', aprobado: true, nombre: 'Visualizar mesas' }
];
const build = (model = plantuml, reqs = requerimientos) => new ApplicationContractBuilder().build({ proyecto: { nombre: 'Demo' }, requerimientos: reqs, domainModel: new DomainModelExtractor().extract(model) });

describe('el contrato distingue la identidad de los datos', () => {
  test('el RF de autenticación es login y el de cuentas es usuarios', () => {
    const contract = build();
    const byId = Object.fromEntries(contract.operations.map((operation) => [operation.id, operation.identity]));
    expect(byId).toEqual({ 'RF-01': 'login', 'RF-02': 'usuarios', 'RF-03': undefined });
    expect(contract.identity).toEqual({ login: ['RF-01'], usuarios: ['RF-02'] });
  });

  test('"Gestionar usuarios" sin una entidad con contraseña no es identidad (por ejemplo, socios de un gimnasio)', () => {
    const contract = build('@startuml\nclass Socio {\n+String id\n+String nombre\n}\n@enduml', [{ identificador: 'RF-01', tipo: 'RF', aprobado: true, nombre: 'Gestionar usuarios del gimnasio' }]);
    expect(contract.identity).toEqual({ login: [], usuarios: [] });
  });

  test('el prompt de mockups indica no enlazar la autenticación', () => {
    const service = new MockupBindingService();
    const text = service.describirOperaciones({ requerimientos, contrato: build() });
    expect(text).toMatch(/\[RF-01\] autenticación: no la enlaces[^\n]*data-accion="ui"/);
    expect(text).toMatch(/\[RF-02\] campos[^\n]*correo/);
  });

  test('el validador rechaza enlazar el RF de login y acepta el de cuentas', () => {
    const html = '<main><form><input name="correo"><input name="passwordHash"><button data-accion="RF-01.crear">Ingresar</button></form><form><input name="correo"><button data-accion="RF-02.crear">Guardar</button></form></main>';
    const result = new MockupBindingValidator().validar({ html, requerimientos, contrato: build() });
    expect(result.enlaces[0]).toMatchObject({ rf: 'RF-01', estado: 'invalido' });
    expect(result.enlaces[0].motivo).toContain('autenticación');
    expect(result.enlaces[1]).toMatchObject({ rf: 'RF-02', estado: 'valido' });
  });

  test('comportamiento previo: sin identidad el validador sigue aceptando un RF aprobado', () => {
    const result = new MockupBindingValidator().validar({ html: '<main><button data-accion="RF-03.consultar">Ver</button></main>', requerimientos, contrato: build() });
    expect(result.enlaces[0]).toMatchObject({ rf: 'RF-03', estado: 'valido' });
  });
});

describe('el frontend generado con identidad', () => {
  const login = '<main><h1>Iniciar Sesión</h1><form><input name="correo"><input type="password" name="password"><button data-accion="RF-01.crear">Ingresar</button></form></main>';
  const reserva = '<main><h1>Mesas</h1><form><input name="numero"><button data-accion="RF-03.crear">Crear</button></form></main>';
  const screens = [
    { nombre: 'Pantalla de Inicio de Sesion', slug: 'inicio-de-sesion', ruta: '/Flujo / Pantalla de Inicio de Sesion', rf_trazabilidad: ['RF-01'], mockup: { preview_code: `<html><body>${login}</body></html>` } },
    { nombre: 'Mesas', slug: 'mesas', ruta: '/mesas', rf_trazabilidad: ['RF-03'], mockup: { preview_code: `<html><body>${reserva}</body></html>` } }
  ];
  const control = { autenticacion: { metodo: 'jwt', expiracion: '1h' }, roles: [], permisos: [] };
  const generate = (decisiones, extra = {}) => new GenericFrontendGenerator().generate({ proyecto: { nombre: 'Demo' }, screens, decisiones, requerimientos, ...extra });
  const file = (files, ruta) => files.find((item) => item.ruta === ruta)?.contenido;

  test('con sesión real no genera la pantalla de login diseñada y la primera ruta es otra', () => {
    const files = generate({ control_acceso: control });
    expect(file(files, 'frontend/src/pages/inicio-de-sesion.jsx')).toBeUndefined();
    expect(file(files, 'frontend/src/pages/mesas.jsx')).toBeDefined();
    const manifest = JSON.parse(file(files, 'frontend/icase.manifest.json'));
    expect(manifest.pantallas.map((screen) => screen.name)).toEqual(['Mesas']);
    expect(manifest.identidad.login).toEqual(['RF-01']);
  });

  test('sin sesión la pantalla se conserva pero su botón no se conecta a una tabla de datos', () => {
    const files = generate({});
    const page = file(files, 'frontend/src/pages/inicio-de-sesion.jsx');
    expect(page).toBeDefined();
    expect(page).not.toContain('handleAction');
    expect(file(files, 'frontend/src/pages/mesas.jsx')).toContain('handleAction');
  });

  test('un RF de cuentas se conecta a /api/users mediante el mapa de identidad', () => {
    const accountScreen = { nombre: 'Usuarios', slug: 'cuentas', ruta: '/cuentas', rf_trazabilidad: ['RF-02'], mockup: { preview_code: '<html><body><main><form><input name="correo"><button data-accion="RF-02.crear">Guardar</button></form></main></body></html>' } };
    const files = new GenericFrontendGenerator().generate({ proyecto: { nombre: 'Demo' }, screens: [accountScreen], decisiones: {}, requerimientos, identidad: { login: ['RF-01'], usuarios: ['RF-02'] } });
    expect(file(files, 'frontend/src/pages/cuentas.jsx')).toContain('identidad: {"rf-02":"usuarios"}');
  });
});

describe('mockup-actions con cuentas de usuario', () => {
  const source = fs.readFileSync(path.join(__dirname, '../src/infrastructure/templates/frontend/mockup-actions.js'), 'utf8');
  const runtime = (() => {
    const module = { exports: {} };
    new Function('module', 'exports', transformSync(source, { format: 'cjs' }).code)(module, module.exports);
    return module.exports;
  })();
  const button = () => new JSDOM('<body><main><form><input name="correo" value="a@b.co"><input name="passwordHash" value="Clave-12345"><input name="rol" value="cliente"><input name="ruido" value="x"><button id="b">Guardar</button></form></main></body>').window.document.getElementById('b');

  test('crear envía a /api/users con los nombres de la API de cuentas', async () => {
    const api = jest.fn().mockResolvedValue({ id: 5 });
    const results = [];
    await runtime.runAction({ event: { preventDefault() {}, currentTarget: button() }, operation: 'rf-02', verb: 'crear', api, identidad: { 'rf-02': 'usuarios' }, onResult: (result) => results.push(result) });
    expect(api).toHaveBeenCalledWith('/api/users', { method: 'POST', body: JSON.stringify({ email: 'a@b.co', password: 'Clave-12345', rol: 'cliente' }) });
    expect(results.at(-1)).toEqual({ estado: 'ok', mensaje: 'Registro creado' });
  });

  test('comportamiento previo: sin mapa de identidad usa la operación de datos', async () => {
    const api = jest.fn().mockResolvedValue({});
    await runtime.runAction({ event: { preventDefault() {}, currentTarget: button() }, operation: 'rf-02', verb: 'crear', api, onResult: () => {} });
    expect(api.mock.calls[0][0]).toBe('/api/operations/rf-02');
  });
});

describe('la verificación del frontend vigila la identidad', () => {
  const ArtifactVerificationService = require('../src/core/services/ArtifactVerificationService');
  const verify = (identidad, acciones) => new ArtifactVerificationService().verificar({
    tipo: 'codigo_frontend',
    archivos: [
      { ruta: 'frontend/package.json', contenido: '{}' }, { ruta: 'frontend/src/App.jsx', contenido: 'export default () => null;' },
      { ruta: 'frontend/src/pages/acceso.jsx', contenido: 'handleAction(event); export default () => null;' },
      { ruta: 'frontend/src/OperationScreen.jsx', contenido: 'await api(path);' },
      { ruta: 'frontend/icase.manifest.json', contenido: JSON.stringify({ identidad, pantallas: [{ id: 'acceso', name: 'Acceso', route: '/acceso', operations: ['rf-01'], enlaces: { validos: 1, invalidos: 0, ui: 0, sin_enlace: [], cableados: 1, acciones } }] }) }
    ]
  });

  test('un enlace cableado a un RF de autenticación es un error', () => {
    const result = verify({ login: ['RF-01'], usuarios: [] }, [{ operacion: 'rf-01', verbo: 'crear', control: 'Ingresar' }]);
    expect(result.errores.join(' ')).toContain('RF de autenticación');
  });

  test('comportamiento previo: sin RF de login declarado no hay ese error', () => {
    const result = verify({ login: [], usuarios: [] }, [{ operacion: 'rf-01', verbo: 'crear', control: 'Crear' }]);
    expect(result.errores.join(' ')).not.toContain('RF de autenticación');
  });
});

describe('rutas y README de la entrega', () => {
  const TestSuiteGenerator = require('../src/infrastructure/services/TestSuiteGenerator');
  const screens = [
    { nombre: 'Formulario de Reserva', slug: 'formulario-de-reserva', ruta: '/Sistema de Gestion / Flujo de Cliente / Formulario de Reserva', rf_trazabilidad: ['RF-03'], mockup: { preview_code: '<html><body><main>Hola</main></body></html>' } },
    { nombre: 'Otra', slug: 'otra', ruta: '/mesas', rf_trazabilidad: ['RF-03'], mockup: { preview_code: '<html><body><main>Hola</main></body></html>' } },
    { nombre: 'Otra bis', slug: 'otra-bis', ruta: '/mesas', rf_trazabilidad: ['RF-03'], mockup: { preview_code: '<html><body><main>Hola</main></body></html>' } }
  ];
  const manifest = () => JSON.parse(new GenericFrontendGenerator().generate({ proyecto: { nombre: 'Demo' }, screens, decisiones: {}, requerimientos }).find((file) => file.ruta === 'frontend/icase.manifest.json').contenido);

  test('la ruta del árbol de navegación no se usa como URL: la pantalla recibe una ruta corta', () => {
    expect(manifest().pantallas.map((screen) => screen.route)).toEqual(['/formulario-de-reserva', '/mesas', '/mesas-2']);
  });

  test('el README de pruebas explica los límites de peticiones y el origen CORS', () => {
    const readme = new TestSuiteGenerator()._readme(1, 1);
    expect(readme).toContain('HTTP_RATE_MAX');
    expect(readme).toContain('CORS_ORIGINS');
    expect(readme).toContain('npm run test:e2e');
  });
});

describe('el menú agrupa por flujo', () => {
  const html = '<html><body><main>Hola</main></body></html>';
  const screens = ['Reservas', 'Mesas', 'Cobros'].map((nombre, index) => ({ nombre, slug: nombre.toLowerCase(), ruta: `/${nombre.toLowerCase()}`, rf_trazabilidad: ['RF-03'], modulo: `Pantalla de ${nombre}`, flujo: index < 2 ? 'Flujo de Cliente' : 'Flujo de Cajero', mockup: { preview_code: html } }));

  test('las pantallas de un mismo flujo comparten grupo en lugar de formar uno cada una', () => {
    const manifest = JSON.parse(new GenericFrontendGenerator().generate({ proyecto: { nombre: 'Demo' }, screens, decisiones: {}, requerimientos }).find((file) => file.ruta === 'frontend/icase.manifest.json').contenido);
    expect(manifest.pantallas.map((screen) => screen.modulo)).toEqual(['Flujo de Cliente', 'Flujo de Cliente', 'Flujo de Cajero']);
  });
});

describe('la prueba de contrato elige una pantalla con operación', () => {
  const TestSuiteGenerator = require('../src/infrastructure/services/TestSuiteGenerator');
  const contract = { operations: [{ id: 'RF-01', key: 'rf-01', methods: ['GET', 'POST', 'PATCH', 'DELETE'], schema: { properties: {} }, rules: [] }] };
  const screens = [
    { id: 'detalle', route: '/detalle', operations: [] },
    { id: 'mesas', route: '/mesas', operations: ['rf-01'] }
  ];

  test('si la primera ruta no tiene operación se usa la primera que sí la tiene', () => {
    const text = new TestSuiteGenerator()._contractE2eTest(['/detalle', '/mesas'], { habilitada: false }, { screens, contract });
    expect(text).toContain('page.goto("/mesas")');
    expect(text).toContain('item.key === "rf-01"');
  });
});

describe('campos que el formulario no cubre', () => {
  const contrato = build();
  const html = (fields) => `<main><form>${fields}<button data-accion="RF-02.crear">Guardar</button></form></main>`;

  test('avisa de los campos de la operación sin control en un formulario de crear', () => {
    const result = new MockupBindingValidator().validar({ html: html('<input name="correo">'), requerimientos, contrato });
    expect(result.enlaces[0].campos_faltantes).toEqual(expect.arrayContaining(['passwordHash', 'rol']));
    expect(result.advertencias.join(' ')).toMatch(/no tiene control para: [^)]*rol/);
  });

  test('con todos los campos presentes no hay aviso', () => {
    const result = new MockupBindingValidator().validar({ html: html('<input name="correo"><input name="passwordHash"><input name="rol">'), requerimientos, contrato });
    expect(result.enlaces[0].campos_faltantes).toEqual([]);
    expect(result.advertencias.join(' ')).not.toContain('no tiene control');
  });

  test('comportamiento previo: consultar no exige campos', () => {
    const result = new MockupBindingValidator().validar({ html: '<main><button data-accion="RF-02.consultar">Ver</button></main>', requerimientos, contrato });
    expect(result.enlaces[0].campos_faltantes).toEqual([]);
  });
});

describe('select de referencias con registros reales', () => {
  const plantuml = '@startuml\nclass Cliente {\n+String id\n+String nombre\n}\nclass Reserva {\n+String id\n+String estado\n}\nCliente "1" --> "0..*" Reserva\n@enduml';
  const reqs = [
    { identificador: 'RF-01', tipo: 'RF', aprobado: true, nombre: 'Gestionar clientes' },
    { identificador: 'RF-02', tipo: 'RF', aprobado: true, nombre: 'Gestionar reservas' }
  ];
  const contrato = () => new ApplicationContractBuilder().build({ proyecto: { nombre: 'Demo' }, requerimientos: reqs, domainModel: new DomainModelExtractor().extract(plantuml) });
  const form = '<html><body><main><form><select name="cliente_id"><option>Ana</option><option>Luis</option></select><input name="estado"><button data-accion="RF-02.crear">Guardar</button></form></main></body></html>';

  test('el contrato indica qué operación alimenta cada campo de referencia', () => {
    expect(contrato().references).toEqual({ cliente_id: 'rf-01' });
  });

  test('el transformador sustituye las opciones del mockup por ReferenceOptions', () => {
    const jsx = HtmlToJsxTransformer.transform(form, { operaciones: new Set(['rf-02']), referencias: { cliente_id: 'rf-01' } });
    expect(jsx).toContain('<select name="cliente_id" data-ref-options="rf-01"><ReferenceOptions operation="rf-01" /></select>');
    expect(jsx).not.toContain('Luis');
  });

  test('sin referencias el select conserva las opciones del mockup (comportamiento previo)', () => {
    const jsx = HtmlToJsxTransformer.transform(form, { operaciones: new Set(['rf-02']) });
    expect(jsx).toContain('Luis');
    expect(jsx).not.toContain('ReferenceOptions');
  });

  test('la página generada importa ReferenceOptions y el archivo existe', () => {
    const files = new GenericFrontendGenerator().generate({ proyecto: { nombre: 'Demo' }, screens: [{ nombre: 'Reservas', slug: 'reservas', ruta: '/reservas', rf_trazabilidad: ['RF-02'], mockup: { preview_code: form } }], decisiones: {}, requerimientos: reqs, referencias: { cliente_id: 'rf-01' } });
    expect(files.find((file) => file.ruta === 'frontend/src/pages/reservas.jsx').contenido).toContain("import ReferenceOptions from '../ReferenceOptions';");
    expect(files.some((file) => file.ruta === 'frontend/src/ReferenceOptions.jsx')).toBe(true);
  });
});

describe('campos de referencia como texto o ocultos', () => {
  const doc = (controls) => `<html><body><main><form>${controls}<button data-accion="RF-02.crear">Guardar</button></form></main></body></html>`;
  const opts = { operaciones: new Set(['rf-02']), referencias: { cliente_id: 'rf-01' } };

  test('un input de texto con un id de ejemplo se vuelve un select con registros reales', () => {
    const jsx = HtmlToJsxTransformer.transform(doc('<input type="text" name="cliente_id" class="w-full" placeholder="CLI-1" required>'), opts);
    expect(jsx).toContain('<select name="cliente_id" className="w-full" required data-ref-options="rf-01"><ReferenceOptions operation="rf-01" /></select>');
  });

  test('un input oculto con un id inventado también', () => {
    const jsx = HtmlToJsxTransformer.transform(doc('<input type="hidden" name="cliente_id" value="CLI-8923">'), opts);
    expect(jsx).toContain('<select name="cliente_id" data-ref-options="rf-01"><ReferenceOptions operation="rf-01" /></select>');
  });

  test('comportamiento previo: un campo de solo lectura de una vista de detalle no se toca', () => {
    const jsx = HtmlToJsxTransformer.transform(doc('<input type="text" name="cliente_id" value="CLI-8923" readonly>'), opts);
    expect(jsx).not.toContain('ReferenceOptions');
    expect(jsx).toContain('readOnly');
  });

  test('un campo que no es referencia no se toca', () => {
    expect(HtmlToJsxTransformer.transform(doc('<input type="text" name="nombre">'), opts)).not.toContain('ReferenceOptions');
  });
});

describe('campos de solo lectura con placeholder', () => {
  const source = fs.readFileSync(path.join(__dirname, '../src/infrastructure/templates/frontend/mockup-actions.js'), 'utf8');
  const runtime = (() => { const module = { exports: {} }; new Function('module', 'exports', transformSync(source, { format: 'cjs' }).code)(module, module.exports); return module.exports; })();
  const page = (html) => new JSDOM(`<body><main><form>${html}<button id="b">Ok</button></form></main></body>`).window.document.getElementById('b');

  test('el placeholder de un campo de solo lectura vacío se envía como valor del sistema', () => {
    expect(runtime.collectFields(page('<input name="estado" readonly placeholder="pendiente"><input name="otro" placeholder="x">'))).toEqual({ estado: 'pendiente' });
  });

  test('un campo editable vacío con placeholder sigue omitiéndose', () => {
    expect(runtime.collectFields(page('<input name="nota" placeholder="Escribe">'))).toEqual({});
  });
});

describe('la prueba de la vista diseñada crea el registro padre de un select de referencia', () => {
  test('un select de referencia sin padre en el payload también recibe un registro creado', () => {
    const TestSuiteGenerator = require('../src/infrastructure/services/TestSuiteGenerator');
    const text = new TestSuiteGenerator()._designedUiE2eTest({
      screens: [{ id: 'reservas', route: '/reservas', operations: ['rf-02'], enlaces: { acciones: [{ operacion: 'rf-02', verbo: 'crear', control: 'Guardar' }] } }],
      contract: { operations: [{ id: 'RF-02', key: 'rf-02', methods: ['GET', 'POST'], collectionPath: '/api/operations/rf-02', schema: { title: 'Reserva', properties: { cliente_id: { type: 'string', 'x-references': 'Cliente' } } }, rules: [] }] },
      auth: { habilitada: false }
    });
    expect(text).toContain("element.tagName === 'SELECT'");
  });
});
