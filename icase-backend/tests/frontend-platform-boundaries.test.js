const GenericFrontendGenerator = require('../src/infrastructure/services/GenericFrontendGenerator');
const ArtifactVerificationService = require('../src/core/services/ArtifactVerificationService');
const { buildSync, transformSync } = require('esbuild');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const generate = () => new GenericFrontendGenerator().generate({
  proyecto: { nombre: 'Restaurante' },
  screens: [
    { nombre: 'Menú del cliente', slug: 'menu-cliente', plataforma: 'mobile', roles: ['Cliente'], rf_trazabilidad: ['RF-01'] },
    { nombre: 'Inventario interno', slug: 'inventario-interno', plataforma: 'web', roles: ['Administrador'], rf_trazabilidad: ['RF-02'] }
  ],
  decisiones: {
    stack_tecnologico: { plataformas: ['web', 'móvil'] },
    control_acceso: { autenticacion: { metodo: 'jwt' }, roles: [] }
  }
});

test('separa las pantallas de web y móvil', () => {
  const files = generate();
  const paths = files.map((file) => file.ruta);
  expect(paths).toContain('frontend/src/pages/inventario-interno.jsx');
  expect(paths).not.toContain('frontend/src/pages/menu-cliente.jsx');
  const app = files.find((file) => file.ruta === 'frontend/src/App.jsx').contenido;
  expect(app).toContain('/inventario-interno');
  expect(app).not.toContain('/menu-cliente');
  const mobile = files.find((file) => file.ruta === 'mobile/App.js').contenido;
  expect(mobile).toContain('Menú del cliente');
  expect(mobile).not.toContain('Inventario interno');
  expect(mobile).toContain('Array.isArray(response.data) ? response.data : []');
  expect(mobile).toContain('clearBusinessState();\n      setPermisos(data.permisos)');
  expect(mobile).toContain('setPermisos(null); clearBusinessState();');
  expect(JSON.parse(files.find((file) => file.ruta === 'mobile/icase.manifest.json').contenido).pantallas.map((item) => item.id)).toEqual(['menu-cliente']);
  expect(paths).toContain('mobile/README.md');
  expect(() => transformSync(app, { loader: 'jsx' })).not.toThrow();
  expect(() => transformSync(mobile, { loader: 'jsx' })).not.toThrow();
});

test('rechaza seleccionar móvil cuando no existe ninguna pantalla móvil aprobada', () => {
  expect(() => new GenericFrontendGenerator().generate({
    proyecto: { nombre: 'Demo' },
    screens: [{ nombre: 'Administración', plataforma: 'web', rf_trazabilidad: ['RF-01'] }],
    decisiones: { stack_tecnologico: { plataformas: ['web', 'móvil'] } }
  })).toThrow(/No hay pantallas móviles/);
});

test('las rutas web toman en cuenta los roles de las pantallas', () => {
  const app = generate().find((file) => file.ruta === 'frontend/src/App.jsx').contenido;
  expect(app).toContain('"roles":["administrador"]');
  expect(app).toContain('puedeAbrirPantalla');
  expect(app).toContain('Navigate to={home}');
  expect(app).toContain("'/sin-acceso'");
  expect(app).toContain('Sin pantallas disponibles');
});

test('la verificación rechaza un artefacto con pantallas web y móviles mezcladas', () => {
  const files = generate();
  const mobile = files.find((file) => file.ruta === 'mobile/icase.manifest.json');
  const manifest = JSON.parse(mobile.contenido);
  manifest.pantallas.push({ id: 'inventario-interno', name: 'Inventario interno', operations: ['rf-02'] });
  mobile.contenido = JSON.stringify(manifest);
  const result = new ArtifactVerificationService().verificar({ tipo: 'codigo_frontend', archivos: files });
  expect(result.estado).toBe('fallida');
  expect(result.errores.join(' ')).toContain('pantallas mezcladas');
});

test('la verificación rechaza una aplicación móvil sin operaciones de negocio', () => {
  const files = generate();
  const mobile = files.find((file) => file.ruta === 'mobile/icase.manifest.json');
  mobile.contenido = JSON.stringify({ pantallas: [{ id: 'menu-cliente', operations: [] }] });
  const result = new ArtifactVerificationService().verificar({ tipo: 'codigo_frontend', archivos: files });
  expect(result.estado).toBe('fallida');
  expect(result.errores.join(' ')).toContain('pantallas sin operaciones RF');
});

test('la aplicación web generada se empaqueta sin importar pantallas móviles', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'icase-platform-'));
  try {
    for (const file of generate().filter((item) => item.ruta.startsWith('frontend/'))) {
      const target = path.join(directory, file.ruta);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, file.contenido);
    }
    expect(() => buildSync({ entryPoints: [path.join(directory, 'frontend/src/main.jsx')], bundle: true, packages: 'external', write: false, outdir: path.join(directory, 'dist'), loader: { '.css': 'css' } })).not.toThrow();
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('móvil con procesos compila con navegación de pantallas independiente', () => {
  const files = new GenericFrontendGenerator().generate({
    proyecto: { nombre: 'Restaurante' },
    screens: [
      { nombre: 'Menú', plataforma: 'móvil', rf_trazabilidad: ['RF-01'] },
      { nombre: 'Caja', plataforma: 'web', rf_trazabilidad: ['RF-02'] }
    ],
    decisiones: {
      stack_tecnologico: { plataformas: ['web', 'móvil'] },
      control_acceso: { autenticacion: { metodo: 'jwt' }, roles: [] },
      modulos: { modo: 'personalizado', modulos: [{ id: 'procesos_negocio', activo: true }], procesos: [{ id: 'revision', estado_decision: 'confirmado' }] }
    }
  });
  const mobile = files.find((file) => file.ruta === 'mobile/App.js').contenido;
  expect(mobile.match(/const \[screen, setScreen\]/g)).toHaveLength(1);
  expect(mobile).toContain('const [processScreen, setProcessScreen]');
  expect(mobile).toContain('setRecords([]); setProcessScreen(false)');
  expect(mobile).toContain('title="Procesos"');
  expect(() => transformSync(mobile, { loader: 'jsx' })).not.toThrow();
});

test('la gestión integrada de usuarios sustituye la pantalla duplicada del árbol', () => {
  const files = new GenericFrontendGenerator().generate({
    proyecto: { nombre: 'Restaurante' },
    screens: [
      { nombre: 'Inventario', plataforma: 'web', rf_trazabilidad: ['RF-01'] },
      { nombre: 'Usuarios', slug: 'usuarios', ruta: '/usuarios', plataforma: 'web', rf_trazabilidad: ['RF-02'] }
    ],
    decisiones: { stack_tecnologico: { plataformas: ['web'] }, control_acceso: { autenticacion: { metodo: 'jwt' }, roles: [] } }
  });
  const app = files.find((file) => file.ruta === 'frontend/src/App.jsx').contenido;
  expect(app).toContain('<UsersScreen />');
  expect(app).not.toContain('<Usuarios/>');
  expect(files.some((file) => file.ruta === 'frontend/src/pages/usuarios.jsx')).toBe(false);
  expect(() => transformSync(app, { loader: 'jsx' })).not.toThrow();
});
