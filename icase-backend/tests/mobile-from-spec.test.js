const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { EventEmitter } = require('node:events');
const esbuild = require('esbuild');
const FrontendScaffoldGenerator = require('../src/infrastructure/services/FrontendScaffoldGenerator');
const InfrastructureGenerator = require('../src/infrastructure/services/InfrastructureGenerator');
const ApplicationContractBuilder = require('../src/infrastructure/services/ApplicationContractBuilder');
const ApplicationSpecService = require('../src/infrastructure/services/ApplicationSpecService');
const DomainModelExtractor = require('../src/infrastructure/services/DomainModelExtractor');
const LocalRunService = require('../src/infrastructure/services/LocalRunService');

const PLANTUML = `@startuml
enum EstadoMesa {
  LIBRE
  OCUPADA
}
class Mesa {
  +String id
  +int numero
  +EstadoMesa estado
}
@enduml`;
const dominio = { tipo: 'clases_dominio', aprobado: true, estado: 'aprobado', desactualizado: false, codigo_plantuml: PLANTUML };
const rf = [{ aprobado: true, tipo: 'RF', identificador: 'RF-04', nombre: 'Consulta de mesas', descripcion: 'Mesas', actores: ['Cliente'] }];
const decision = {
  version: 1,
  operaciones: [
    { nombre: 'listarMesas', rf: 'RF-04', tipo: 'consulta', entidad: 'Mesa', estado_decision: 'confirmado', origen: 'ia', filtros: [], entradas: [], salida: ['numero', 'estado'] },
    { nombre: 'ocuparMesa', rf: 'RF-04', tipo: 'transicion', entidad: 'Mesa', estado_decision: 'confirmado', origen: 'ia', filtros: [], entradas: [], salida: [], transicion: { campo: 'estado', de: ['LIBRE'], a: 'OCUPADA' } }
  ],
  pantallas: [{ id: 'mesas-movil', componentes: [{ tipo: 'tarjetas', operacion: 'listarMesas', campos: ['numero', 'estado'], acciones: [{ etiqueta: 'Ocupar', operacion: 'ocuparMesa' }] }] }]
};
const diseno = {
  manifiesto_navegacion: [
    { pantalla_id: 'mesas-movil', slug: 'mesas-movil', nombre: 'Mesas', ruta: '/mesas', plataforma: 'mobile', roles: ['Cliente'], rf_trazabilidad: ['RF-04'] },
    { pantalla_id: 'panel', slug: 'panel', nombre: 'Panel', ruta: '/panel', plataforma: 'web', rf_trazabilidad: ['RF-04'] }
  ],
  mockups: [{ pantalla_id: 'panel', rf_trazabilidad: ['RF-04'], preview_code: '<main><h1>Panel</h1></main>' }, { pantalla_id: 'mesas-movil', rf_trazabilidad: ['RF-04'], preview_code: '<main><h1>Mesas</h1></main>' }],
  sistema_diseno: {}
};

const generar = async () => {
  const especificacion = ApplicationSpecService.confirmada(decision);
  const contrato = new ApplicationContractBuilder().build({ proyecto: { nombre: 'Demo' }, requerimientos: rf, domainModel: new DomainModelExtractor().fromDiagrams([dominio]), spec: especificacion });
  const acciones = contrato.operations.flatMap((operation) => operation.actions || []);
  return new FrontendScaffoldGenerator().generar({
    proyecto: { nombre: 'Demo' }, versionesOrigen: {},
    insumos: { decisiones: { stack_tecnologico: { plataformas: ['web', 'móvil'] } }, diseno, requerimientos: rf, especificacion, acciones }
  });
};

describe('app móvil construida desde la especificación', () => {
  test('la pantalla móvil lleva sus bloques y operaciones; la web no la incluye', async () => {
    const { archivos } = await generar();
    const app = archivos.find((item) => item.ruta === 'mobile/App.js').contenido;
    expect(app).toContain("import SpecScreen from './SpecScreen'");
    expect(app).toContain('/api/actions/listar-mesas');
    expect(app).toContain('/api/actions/ocupar-mesa/:id');
    expect(archivos.find((item) => item.ruta === 'frontend/src/App.jsx').contenido).not.toContain('/mesas');
    const manifest = JSON.parse(archivos.find((item) => item.ruta === 'mobile/icase.manifest.json').contenido);
    expect(manifest.pantallas).toEqual([expect.objectContaining({ id: 'mesas-movil', origen: 'especificacion', componentes: 1 })]);
  });

  test('el JavaScript de la app y de la pantalla compila', async () => {
    const { archivos } = await generar();
    for (const ruta of ['mobile/App.js', 'mobile/SpecScreen.js']) {
      expect(() => esbuild.transformSync(archivos.find((item) => item.ruta === ruta).contenido, { loader: 'jsx' })).not.toThrow();
    }
  });

  test('sin especificación la app móvil conserva el listado genérico', async () => {
    const { archivos } = await new FrontendScaffoldGenerator().generar({
      proyecto: { nombre: 'Demo' }, versionesOrigen: {},
      insumos: { decisiones: { stack_tecnologico: { plataformas: ['web', 'móvil'] } }, diseno, requerimientos: rf }
    });
    const app = archivos.find((item) => item.ruta === 'mobile/App.js').contenido;
    expect(app).not.toContain('"blocks"');
    expect(JSON.parse(archivos.find((item) => item.ruta === 'mobile/icase.manifest.json').contenido).pantallas[0].origen).toBeUndefined();
  });
});

describe('contenedor móvil', () => {
  const base = (archivosFrontend) => ({
    proyecto: { nombre: 'Demo' }, versionesOrigen: {},
    insumos: {
      decisiones: { stack_tecnologico: { backend: 'Node.js + Express', base_datos: 'PostgreSQL' } },
      requerimientos: [], diagramas: [{ aprobado: true, estado: 'aprobado', tipo: 'arquitectura_sistema', version: 1, descripcion: 'Servidor y PostgreSQL' }],
      backend: { version: 1, trazabilidad_rf: [] }, frontend: { version: 2, trazabilidad_rf: [], archivos: archivosFrontend }
    }
  });

  test('con app móvil se agrega un compose aparte que exporta Expo como web, sin tocar el despliegue base', async () => {
    const { archivos } = await new InfrastructureGenerator().generar(base([{ ruta: 'frontend/package.json' }, { ruta: 'mobile/package.json' }]));
    const file = (ruta) => archivos.find((item) => item.ruta === ruta)?.contenido;
    expect(file('ops/docker-compose.yml')).not.toContain('mobile:');
    expect(file('ops/docker-compose.mobile.yml')).toContain('mobile:');
    expect(file('ops/docker-compose.mobile.yml')).toContain('MOBILE_PORT:-8082');
    expect(file('ops/docker-compose.mobile.yml')).toContain('CORS_ORIGINS');
    expect(file('ops/docker/mobile.Dockerfile')).toContain('expo export --platform web');
    expect(file('ops/.env.example')).toContain('MOBILE_PORT=8082');
  });

  test('sin app móvil no se agrega nada', async () => {
    const { archivos } = await new InfrastructureGenerator().generar(base([{ ruta: 'frontend/package.json' }]));
    expect(archivos.some((item) => /mobile/.test(item.ruta))).toBe(false);
  });

  test('el script de vista previa incluye el compose móvil cuando existe', () => {
    const script = fs.readFileSync(path.join(__dirname, '../src/infrastructure/templates/verification/preview-local.cjs'), 'utf8');
    expect(script).toContain("'ops/docker-compose.mobile.yml'");
    expect(script).toContain("['-f', mobileCompose]");
    expect(script).toContain('App móvil (vista web)');
  });

  test('la ejecución local publica la URL móvil y consulta ambos compose', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'icase-mobile-run-'));
    try {
      const llamadas = [];
      const docker = jest.fn(async (args) => { llamadas.push(args); return args[0] === 'version' ? { error: null, stdout: '27', stderr: '' } : { error: null, stdout: [JSON.stringify({ Service: 'backend', State: 'running' }), JSON.stringify({ Service: 'mobile', State: 'running' })].join('\n'), stderr: '' }; });
      const spawnProcess = () => { const child = new EventEmitter(); child.stdout = new EventEmitter(); child.stderr = new EventEmitter(); setImmediate(() => child.emit('close', 0)); return child; };
      const servicio = new LocalRunService({ root, spawnProcess, docker });
      await servicio.iniciar({ proyectoId: 'p1', archivos: [
        { ruta: 'ops/docker-compose.yml', contenido: '' }, { ruta: 'ops/docker-compose.mobile.yml', contenido: '' }, { ruta: 'tools/preview-local.cjs', contenido: '' }, { ruta: 'mobile/package.json', contenido: '{}' }
      ] });
      await new Promise((resolve) => setImmediate(() => setImmediate(resolve)));
      fs.writeFileSync(path.join(root, 'p1/ops/.env'), 'API_PORT=3000\nMOBILE_PORT=8099\n');
      const estado = await servicio.estado('p1');
      expect(estado.accesos.movil).toMatchObject({ url: 'http://localhost:8099', disponible: true });
      const ps = llamadas.find((args) => args.includes('ps'));
      expect(ps.filter((item) => item === '-f')).toHaveLength(2);
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
  });
});
