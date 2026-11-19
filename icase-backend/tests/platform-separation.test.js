const PlatformPolicy = require('../src/core/services/PlatformPolicy');
const CodePlanningProposalService = require('../src/core/services/CodePlanningProposalService');
const FrontendScaffoldGenerator = require('../src/infrastructure/services/FrontendScaffoldGenerator');
const GenerationPreviewService = require('../src/infrastructure/services/GenerationPreviewService');

const html = (titulo) => `<body><main><h1>${titulo}</h1></main></body>`;
const arbol = [
  // Como en una entrega importada: sin `plataforma`, solo el módulo lo dice.
  { pantalla_id: 'menu-movil', slug: 'menu-movil', nombre: 'Menú digital', ruta: '/menu', modulo: 'Aplicación Móvil de Clientes', rf_trazabilidad: [] },
  { pantalla_id: 'mesas-web', slug: 'mesas-web', nombre: 'Mesas', ruta: '/mesas', modulo: 'Aplicación Web Interna', rf_trazabilidad: [] },
  { pantalla_id: 'caja', slug: 'caja', nombre: 'Caja', ruta: '/caja', plataforma: 'tablet', rf_trazabilidad: [] },
  { pantalla_id: 'qr', slug: 'qr', nombre: 'Lector', ruta: '/qr', plataforma: 'mobile', modulo: 'Aplicación Web Interna', rf_trazabilidad: [] }
];
const mockups = arbol.map((screen) => ({ pantalla_id: screen.pantalla_id, nombre_pantalla: screen.slug, nombre_visible: screen.nombre, preview_code: html(screen.nombre), rf_trazabilidad: [] }));
const diseno = { manifiesto_navegacion: arbol, mockups, sistema_diseno: {} };

describe('PlatformPolicy', () => {
  test('la plataforma declarada manda sobre cualquier marca del módulo', () => {
    expect(PlatformPolicy.of({ plataforma: 'mobile', modulo: 'Aplicación Web Interna' })).toBe('móvil');
    expect(PlatformPolicy.of({ plataforma: 'tablet' })).toBe('web');
    expect(PlatformPolicy.of({ plataforma: 'web', modulo: 'Aplicación Móvil' })).toBe('web');
  });

  test('sin plataforma declarada se infiere de marcas explícitas, sin confundir «mobiliario» ni «ios»', () => {
    expect(PlatformPolicy.of({ modulo: 'Aplicación Móvil de Clientes' })).toBe('móvil');
    expect(PlatformPolicy.of({ ruta: 'Sistema / Flujo Android / Pedido' })).toBe('móvil');
    expect(PlatformPolicy.of({ nombre: 'Gestión de mobiliario y servicios' })).toBe('web');
    expect(PlatformPolicy.of({ modulo: 'Aplicación Móvil y Web' })).toBe('web'); // ambiguo: no se asume móvil
    expect(PlatformPolicy.of({})).toBe('web');
  });

  test('cuenta pantallas por aplicación y detecta las que el alcance no incluye', () => {
    expect(PlatformPolicy.count(arbol)).toEqual({ web: 2, 'móvil': 2 });
    expect(PlatformPolicy.missing(arbol, ['web'])).toEqual(['móvil']);
    expect(PlatformPolicy.missing(arbol, ['web', 'móvil'])).toEqual([]);
    expect(PlatformPolicy.missing(arbol.filter((s) => PlatformPolicy.of(s) === 'web'), ['móvil'])).toEqual(['web']);
  });
});

describe('alcance propuesto', () => {
  test('una pantalla móvil del árbol agrega la plataforma móvil aunque el texto no la mencione', () => {
    const propuesta = new CodePlanningProposalService()._alcance_plataforma({ texto: 'React en el navegador', diseno });
    expect(propuesta.valor.plataformas).toEqual(['web', 'móvil']);
  });

  test('sin árbol se mantiene la detección por texto', () => {
    expect(new CodePlanningProposalService()._alcance_plataforma({ texto: 'Aplicación web' }).valor.plataformas).toEqual(['web']);
  });
});

describe('generación por aplicación', () => {
  const generar = (plataformas) => new FrontendScaffoldGenerator().generar({
    proyecto: { nombre: 'Demo' }, versionesOrigen: {},
    insumos: { decisiones: { stack_tecnologico: { plataformas } }, diseno, requerimientos: [] }
  });

  test('la aplicación web no incluye pantallas móviles y la móvil solo las suyas', async () => {
    const { archivos } = await generar(['web', 'móvil']);
    const app = archivos.find((item) => item.ruta === 'frontend/src/App.jsx').contenido;
    expect(app).toContain('/mesas');
    expect(app).toContain('/caja'); // tableta = web
    expect(app).not.toContain('/menu');
    expect(app).not.toContain('/qr');
    const movil = JSON.parse(archivos.find((item) => item.ruta === 'mobile/icase.manifest.json').contenido);
    expect(movil.pantallas.map((item) => item.id).sort()).toEqual(['menu-movil', 'qr']);
  });

  test('si el alcance no incluye móvil, se avisa de las pantallas que no se generan', async () => {
    const { archivos, advertencias } = await generar(['web']);
    expect(archivos.some((item) => item.ruta.startsWith('mobile/'))).toBe(false);
    expect(advertencias.join(' ')).toMatch(/2 pantalla\(s\) móviles.*no se generaron/);
  });
});

describe('vista previa por aplicación', () => {
  test('agrupa por aplicación e indica qué pantallas no se generarán', () => {
    const vista = new GenerationPreviewService().construir({ requerimientos: [], diagramas: [], diseno, decisiones: { stack_tecnologico: { plataformas: ['web'] } } });
    expect(vista.aplicaciones).toEqual({ web: { pantallas: 2, generadas: 2, en_alcance: true }, 'móvil': { pantallas: 2, generadas: 0, en_alcance: false } });
    expect(vista.pantallas.find((item) => item.id === 'menu-movil')).toMatchObject({ plataforma: 'móvil', generada: false });
    expect(vista.resumen.pantallas_sin_generar).toBe(2);
    expect(vista.advertencias[0]).toMatch(/móviles no se generarán/);
  });

  test('con ambas plataformas todo se genera', () => {
    const vista = new GenerationPreviewService().construir({ requerimientos: [], diagramas: [], diseno, decisiones: { stack_tecnologico: { plataformas: ['web', 'móvil'] } } });
    expect(vista.resumen.pantallas_sin_generar).toBe(0);
    expect(vista.contenedores.map((item) => item.id)).toEqual(['backend', 'base_datos', 'web', 'movil']);
  });
});
