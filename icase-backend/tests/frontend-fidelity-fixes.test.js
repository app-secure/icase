const { transformSync } = require('esbuild');
const HtmlToJsxTransformer = require('../src/infrastructure/services/HtmlToJsxTransformer');
const Frontend = require('../src/infrastructure/services/GenericFrontendGenerator');
const GestionarArtefactosCodigo = require('../src/core/use-cases/GestionarArtefactosCodigo');
const CodeGenerationWorkflowService = require('../src/core/services/CodeGenerationWorkflowService');

const compiles = (jsx) => transformSync(`const x = (<div>${jsx}</div>);`, { loader: 'jsx' });

describe('HtmlToJsxTransformer: atributos', () => {
  test('un atributo con comillas internas produce JSX que compila y conserva el texto', () => {
    const jsx = HtmlToJsxTransformer.transform('<body><input placeholder="Dijo &quot;hola&quot;"></body>');
    expect(() => compiles(jsx)).not.toThrow();
    expect(jsx).toContain('Dijo \\"hola\\"');
  });

  test('un atributo con ampersand o salto de línea también compila', () => {
    const jsx = HtmlToJsxTransformer.transform('<body><a href="/x?a=1&amp;b=2" title="uno\ndos">ir</a></body>');
    expect(() => compiles(jsx)).not.toThrow();
  });

  test('value de un input de ejemplo no lo vuelve de solo lectura', () => {
    const jsx = HtmlToJsxTransformer.transform('<body><input type="text" value="Ana"><textarea>x</textarea></body>');
    expect(jsx).toContain('defaultValue="Ana"');
    expect(jsx).not.toMatch(/\svalue=/);
  });

  test('checked pasa a defaultChecked sin perder el estado marcado', () => {
    const jsx = HtmlToJsxTransformer.transform('<body><input type="checkbox" value="a" checked></body>');
    expect(jsx).toContain('defaultChecked');
    expect(jsx).toContain('value="a"');
    expect(jsx).not.toMatch(/\schecked/);
  });

  test('comportamiento previo: class, for, style y eventos on* no cambian', () => {
    const jsx = HtmlToJsxTransformer.transform('<body><label for="a" class="x" style="font-size:12px" onclick="x()">T</label><button value="ok">B</button></body>');
    expect(jsx).toContain('htmlFor="a"');
    expect(jsx).toContain('className="x"');
    expect(jsx).toContain('style={{"fontSize":"12px"}}');
    expect(jsx).not.toContain('onclick');
    expect(jsx).toContain('value="ok"');
  });
});

describe('GenericFrontendGenerator: asociación pantalla a RF', () => {
  const requerimientos = [
    { identificador: 'RF-01', tipo: 'RF', titulo: 'Ver menú del día', descripcion: 'Consultar el menú' },
    { identificador: 'RF-03', tipo: 'RF', titulo: 'Reservar sala', descripcion: 'El cliente reserva una sala' },
    { identificador: 'RNF-01', tipo: 'RNF', titulo: 'Rendimiento de reservar sala', descripcion: 'Reservar sala responde rápido' }
  ];
  const menu = { nombre: 'Menú', rf_trazabilidad: ['RF-01'] };
  const infer = (screen) => new Frontend()._inferScreenRfs(screen, [menu, screen], requerimientos);

  test('encuentra el requisito real por su campo identificador y excluye los RNF', () => {
    expect(infer({ nombre: 'Reservar sala' })).toEqual(['RF-03']);
  });

  test('sin coincidencia deja la asociación pendiente en lugar de heredar el RF de otra pantalla', () => {
    expect(infer({ nombre: 'Respaldos' })).toEqual([]);
  });

  test('comportamiento previo: una pantalla de detalle se conecta con su pantalla hermana por nombre', () => {
    const sibling = { nombre: 'Gestión de Plato', rf_trazabilidad: ['RF-10'] };
    const detail = { nombre: 'Detalle de Plato' };
    expect(new Frontend()._inferScreenRfs(detail, [sibling, detail], [])).toEqual(['RF-10']);
  });
});

describe('GenericFrontendGenerator: enlace de procesos', () => {
  const ModuleService = require('../src/core/services/ModuleService');
  beforeEach(() => jest.spyOn(ModuleService.prototype, 'activos').mockReturnValue(['procesos_negocio']));
  afterEach(() => jest.restoreAllMocks());
  const generate = () => new Frontend().generate({
    proyecto: { nombre: 'Prueba' }, screens: [{ nombre: 'Libros', rf_trazabilidad: ['RF-01'] }],
    decisiones: { control_acceso: { autenticacion: { metodo: 'jwt' } }, modulos: { modo: 'personalizado', modulos: [{ id: 'procesos_negocio', activo: true }], procesos: [] } }
  });

  test('la cabecera con sesión muestra el enlace a /procesos junto a la ruta', () => {
    const app = generate().find((file) => file.ruta === 'frontend/src/App.jsx').contenido;
    expect(app).toContain('path="/procesos"');
    expect(app).toContain('<Link to="/procesos"');
  });
});

describe('generarFrontend: huella de entrada', () => {
  const approvedStages = ['alcance_plataforma', 'stack_tecnologico', 'arquitectura_codigo', 'estructura_carpetas', 'reglas_negocio', 'control_acceso'];
  const build = (requirements) => {
    const plan = {
      proyecto_id: 'p1', version: 1,
      etapas: new CodeGenerationWorkflowService().crearEtapasIniciales().map((item) => approvedStages.includes(item.etapa) ? { ...item, estado: 'aprobada', version: 1, propuesta: {} } : item)
    };
    let latest = null;
    const artefactoRepository = { obtenerUltimo: async () => latest, crear: async (data) => { latest = { id: 'a1', ...data }; return latest; }, actualizar: async () => {} };
    return new GestionarArtefactosCodigo({
      proyectoRepository: { obtenerPorId: async () => ({ id: 'p1', nombre: 'Demo', estado_fase: 'mockups_aprobados' }) },
      planCodificacionRepository: { obtenerPorProyecto: async () => plan, guardar: async (_id, data) => Object.assign(plan, data) },
      disenoRepository: { obtenerPorProyecto: async () => ({ manifiesto_navegacion: [], mockups: [] }) },
      requerimientoRepository: { listarPorProyecto: async () => requirements },
      artefactoRepository,
      frontendGenerator: { generar: async () => ({ archivos: [] }) }
    });
  };
  const rf = (titulo) => [{ identificador: 'RF-01', tipo: 'RF', titulo, descripcion: 'd', aprobado: true }];

  test('cambiar solo los requisitos aprobados cambia la huella y no reutiliza el artefacto', async () => {
    const [a, b] = [await build(rf('Reservar sala')).generarFrontend('p1'), await build(rf('Consultar menú')).generarFrontend('p1')];
    expect(a.artefacto.huella_entrada).not.toBe(b.artefacto.huella_entrada);
  });

  test('los mismos requisitos mantienen la misma huella', async () => {
    const [a, b] = [await build(rf('Reservar sala')).generarFrontend('p1'), await build(rf('Reservar sala')).generarFrontend('p1')];
    expect(a.artefacto.huella_entrada).toBe(b.artefacto.huella_entrada);
  });
});
