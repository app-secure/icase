const BackendScaffoldGenerator = require('../src/infrastructure/services/BackendScaffoldGenerator');
const GestionarArtefactosCodigo = require('../src/core/use-cases/GestionarArtefactosCodigo');
const CodeGenerationWorkflowService = require('../src/core/services/CodeGenerationWorkflowService');

const approved = ['alcance_plataforma', 'stack_tecnologico', 'arquitectura_codigo', 'estructura_carpetas', 'reglas_negocio', 'control_acceso'];
const requirement = { aprobado: true, tipo: 'RF', identificador: 'RF-01', nombre: 'Consultar reportes' };
const link = (rf, verbo, estado = 'valido') => ({ control: verbo, rf, verbo, estado, campos: [], campos_desconocidos: [] });
const mockup = (...enlaces) => ({ nombre_pantalla: 'reportes', enlaces });

function build({ mockups, estadoFase = 'mockups_aprobados', withDesign = true } = {}) {
  const plan = {
    proyecto_id: 'p1', version: 1,
    etapas: new CodeGenerationWorkflowService().crearEtapasIniciales().map((item) => approved.includes(item.etapa)
      ? { ...item, estado: 'aprobada', version: 1, propuesta: item.etapa === 'stack_tecnologico' ? { backend: 'Node.js + Express', base_datos: 'PostgreSQL' } : {} }
      : item)
  };
  let latest = null;
  const real = new BackendScaffoldGenerator();
  const backendGenerator = { generar: jest.fn((args) => real.generar(args)) };
  const useCase = new GestionarArtefactosCodigo({
    proyectoRepository: { obtenerPorId: async () => ({ id: 'p1', nombre: 'Demo', estado_fase: estadoFase }) },
    requerimientoRepository: { listarPorProyecto: async () => [requirement] },
    diagramaRepository: { listarPorProyecto: async () => [] },
    ...(withDesign ? { disenoRepository: { obtenerPorProyecto: async () => ({ mockups: mockups || [] }) } } : {}),
    planCodificacionRepository: { obtenerPorProyecto: async () => plan, guardar: async (_id, data) => Object.assign(plan, data) },
    artefactoRepository: { obtenerUltimo: async () => latest, crear: async (data) => { latest = { id: 'a1', ...data }; return latest; }, actualizar: async () => {} },
    backendGenerator
  });
  return { useCase, backendGenerator };
}
const methodsOf = ({ artefacto }) => JSON.parse(artefacto.archivos.find((file) => file.ruta === 'backend/icase.manifest.json').contenido).operations.find((operation) => operation.id === 'RF-01').methods;
const ALL = ['GET', 'POST', 'PATCH', 'DELETE'];

describe('métodos del backend según los enlaces de los mockups aprobados', () => {
  test('una pantalla que solo consulta deja la operación en GET y los enlaces inválidos no cuentan', async () => {
    const { useCase } = build({ mockups: [mockup(link('RF-01', 'consultar'), link('RF-01', 'crear', 'invalido'))] });
    expect(methodsOf(await useCase.generarBackend('p1'))).toEqual(['GET']);
  });

  test('se unen los verbos declarados por distintos mockups del mismo RF', async () => {
    const { useCase } = build({ mockups: [mockup(link('RF-01', 'consultar')), mockup(link('RF-01', 'eliminar'))] });
    expect(methodsOf(await useCase.generarBackend('p1'))).toEqual(['GET', 'DELETE']);
  });

  test.each([
    ['mockups sin enlaces', { mockups: [mockup()] }],
    ['solo controles visuales', { mockups: [mockup(link('RF-01', 'consultar', 'ui'))] }],
    ['mockups todavía no aprobados', { mockups: [mockup(link('RF-01', 'consultar'))], estadoFase: 'diagramas_aprobados' }],
    ['sin repositorio de diseño', { withDesign: false }]
  ])('comportamiento previo: %s mantiene el CRUD completo', async (_name, options) => {
    expect(methodsOf(await build(options).useCase.generarBackend('p1'))).toEqual(ALL);
  });

  test('el informe y el artefacto reciben los mismos verbos', async () => {
    const { useCase, backendGenerator } = build({ mockups: [mockup(link('RF-01', 'consultar'))] });
    await useCase.informeGeneracion('p1');
    await useCase.generarBackend('p1');
    expect(backendGenerator.generar.mock.calls.map(([args]) => args.insumos.verbosPorRf)).toEqual([{ 'RF-01': ['consultar'] }, { 'RF-01': ['consultar'] }]);
  });

  test('la huella no cambia si no hay verbos y sí cambia cuando los mockups declaran otros', async () => {
    const none = (await build({ mockups: [] }).useCase.generarBackend('p1')).artefacto.huella_entrada;
    expect((await build({ withDesign: false }).useCase.generarBackend('p1')).artefacto.huella_entrada).toBe(none);
    const read = (await build({ mockups: [mockup(link('RF-01', 'consultar'))] }).useCase.generarBackend('p1')).artefacto.huella_entrada;
    const write = (await build({ mockups: [mockup(link('RF-01', 'crear'))] }).useCase.generarBackend('p1')).artefacto.huella_entrada;
    expect(read).not.toBe(none);
    expect(read).not.toBe(write);
  });
});
