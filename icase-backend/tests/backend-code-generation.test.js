const BackendScaffoldGenerator = require('../src/infrastructure/services/BackendScaffoldGenerator');
const GestionarArtefactosCodigo = require('../src/core/use-cases/GestionarArtefactosCodigo');
const CodeGenerationWorkflowService = require('../src/core/services/CodeGenerationWorkflowService');

const approvedPlan = () => ({
  proyecto_id: 'p1', version: 4,
  etapas: new CodeGenerationWorkflowService().crearEtapasIniciales().map((item) =>
    ['alcance_plataforma', 'stack_tecnologico', 'arquitectura_codigo', 'estructura_carpetas'].includes(item.etapa)
      ? { ...item, estado: 'aprobada', version: 1, propuesta: item.etapa === 'stack_tecnologico'
        ? { backend: 'Node.js + NestJS', base_datos: 'PostgreSQL' }
        : item.etapa === 'arquitectura_codigo' ? { estilo: 'Clean Architecture' } : {} }
      : item)
});

describe('generación persistente del backend', () => {
  test('genera un proyecto NestJS trazable y con huellas por archivo', async () => {
    const result = await new BackendScaffoldGenerator().generar({
      proyecto: { nombre: 'Gourmet Flow' },
      insumos: { decisiones: { stack_tecnologico: { backend: 'NestJS' }, arquitectura_codigo: { estilo: 'Clean Architecture' } }, requerimientos: [
        { aprobado: true, tipo: 'RF', identificador: 'RF-01', nombre: 'Gestionar reservas' }
      ] },
      versionesOrigen: { stack_tecnologico: 1 }
    });
    expect(result.archivos.some((item) => item.ruta === 'backend/src/main.ts')).toBe(true);
    expect(result.archivos.some((item) => item.ruta.includes('rf-01.module.ts'))).toBe(true);
    expect(result.archivos.every((item) => item.huella.length === 64)).toBe(true);
    expect(result.trazabilidad_rf).toEqual(['RF-01']);
  });

  test('persiste una versión y no duplica entradas idénticas', async () => {
    let latest = null;
    const plan = approvedPlan();
    const artifacts = {
      obtenerUltimo: jest.fn(async () => latest),
      crear: jest.fn(async (data) => { latest = { id: 'a1', ...data }; return latest; })
    };
    const plans = { obtenerPorProyecto: jest.fn(async () => plan), guardar: jest.fn(async (_id, data) => Object.assign(plan, data)) };
    const useCase = new GestionarArtefactosCodigo({
      proyectoRepository: { obtenerPorId: jest.fn(async () => ({ id: 'p1', nombre: 'Demo' })) },
      requerimientoRepository: { listarPorProyecto: jest.fn(async () => [{ aprobado: true, tipo: 'RF', identificador: 'RF-1', nombre: 'Reservas' }]) },
      planCodificacionRepository: plans,
      artefactoRepository: artifacts,
      backendGenerator: new BackendScaffoldGenerator()
    });
    const first = await useCase.generarBackend('p1');
    const second = await useCase.generarBackend('p1');
    expect(first.reutilizado).toBe(false);
    expect(second.reutilizado).toBe(true);
    expect(artifacts.crear).toHaveBeenCalledTimes(1);
    expect(plans.guardar).toHaveBeenCalledTimes(1);
  });
});
