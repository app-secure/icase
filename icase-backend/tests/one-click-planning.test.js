const GestionarPlanCodificacion = require('../src/core/use-cases/GestionarPlanCodificacion');
const CodePlanningProposalService = require('../src/core/services/CodePlanningProposalService');
const CodeGenerationWorkflowService = require('../src/core/services/CodeGenerationWorkflowService');

describe('Modo de un clic (planificación automática con valores seguros)', () => {
  const crearRepoPlan = (inicial = null) => {
    let current = inicial;
    return {
      obtenerPorProyecto: jest.fn(async () => current),
      crear: jest.fn(async (datos) => {
        current = { id: 'plan-1', ...datos };
        return current;
      }),
      guardar: jest.fn(async (_id, datos) => {
        current = { ...current, ...datos };
        return current;
      })
    };
  };

  const proyectoValido = {
    id: 'p1',
    nombre: 'Gestión Biblioteca',
    estado_fase: 'mockups_aprobados'
  };

  const requerimientos = [
    {
      id: 'req-1',
      aprobado: true,
      tipo: 'RF',
      identificador: 'RF-01',
      nombre: 'Registrar libro',
      descripcion: 'El bibliotecario registra un libro con isbn único y páginas mayor a cero',
      actores: ['Bibliotecario'],
      evidencia: 'isbn único y páginas mayor a cero'
    },
    {
      id: 'req-2',
      aprobado: true,
      tipo: 'RF',
      identificador: 'RF-02',
      nombre: 'Consultar catálogo',
      descripcion: 'El lector busca libros por título',
      actores: ['Lector'],
      evidencia: 'búsqueda por título'
    }
  ];

  const diagramas = [
    {
      id: 'diag-1',
      aprobado: true,
      estado: 'aprobado',
      tipo: 'clases_dominio',
      titulo: 'Modelo de Dominio',
      codigo_plantuml: `@startuml
class Libro {
  +String isbn
  +String titulo
  +Integer paginas
}
@enduml`
    },
    {
      id: 'diag-2',
      aprobado: true,
      estado: 'aprobado',
      tipo: 'arquitectura_software',
      titulo: 'Arquitectura',
      codigo_plantuml: '@startuml\nnode Sistema\n@enduml'
    }
  ];

  test('falla si los mockups no están aprobados', async () => {
    const useCase = new GestionarPlanCodificacion({
      proyectoRepository: { obtenerPorId: async () => ({ id: 'p1', estado_fase: 'requisitos_aprobados' }) },
      planCodificacionRepository: crearRepoPlan()
    });

    await expect(useCase.ejecutarModoUnClic({ proyectoId: 'p1' })).rejects.toThrow(
      'Debes aprobar los mockups antes de iniciar la planificación del código.'
    );
  });

  test('falla si falta el generador de propuestas', async () => {
    const useCase = new GestionarPlanCodificacion({
      proyectoRepository: { obtenerPorId: async () => proyectoValido },
      planCodificacionRepository: crearRepoPlan(),
      proposalService: null
    });

    await expect(useCase.ejecutarModoUnClic({ proyectoId: 'p1' })).rejects.toThrow(
      'El generador de propuestas de codificación no está configurado.'
    );
  });

  test('ejecuta las 7 etapas con valores seguros y produce informe con dudas', async () => {
    const fakeRuleInference = {
      inferir: jest.fn(async () => ({
        reglas: [
          {
            id: 'RN-01',
            entidad: 'Libro',
            tipo: 'requerido',
            campo: 'isbn',
            mensaje: 'El ISBN es obligatorio',
            rf: ['RF-01'],
            origen: 'explicito',
            evidencia: 'isbn único y páginas mayor a cero',
            evidencia_literal: true
          },
          {
            id: 'RN-02',
            entidad: 'Libro',
            tipo: 'rango',
            campo: 'paginas',
            min: 1,
            mensaje: 'El libro debe tener al menos una página',
            rf: ['RF-01'],
            origen: 'inferido',
            evidencia: 'deducido por lógica de negocio',
            evidencia_literal: false
          }
        ],
        advertencias: ['Regla RN-02 inferida sin texto explícito en RF.']
      }))
    };

    const proposalService = new CodePlanningProposalService({
      ruleInferenceService: fakeRuleInference
    });

    const repoPlan = crearRepoPlan();

    const useCase = new GestionarPlanCodificacion({
      proyectoRepository: { obtenerPorId: async () => proyectoValido },
      planCodificacionRepository: repoPlan,
      requerimientoRepository: { listarPorProyecto: async () => requerimientos },
      diagramaRepository: { listarPorProyecto: async () => diagramas },
      proposalService
    });

    const resultado = await useCase.ejecutarModoUnClic({ proyectoId: 'p1', aprobadoPor: 'usr-123' });

    expect(resultado.proyecto.id).toBe('p1');
    expect(resultado.informe).toBeDefined();
    expect(resultado.informe.etapas_aprobadas).toHaveLength(7);
    expect(resultado.informe.valores_seguros.autenticacion).toBe('jwt');
    expect(resultado.informe.valores_seguros.autoregistro).toBe('desactivado');
    expect(resultado.informe.valores_seguros.reglas_confirmadas).toBe(1);
    expect(resultado.informe.valores_seguros.reglas_descartadas).toBe(1);

    // Debe existir duda sobre la regla descartada por falta de evidencia literal
    const dudaRegla = resultado.informe.dudas.find(
      (d) => d.etapa === 'reglas_negocio' && d.id === 'RN-02'
    );
    expect(dudaRegla).toBeDefined();

    // Las etapas en el plan deben estar aprobadas
    const etapas = resultado.plan.etapas;
    for (const etapaId of [
      'alcance_plataforma',
      'stack_tecnologico',
      'arquitectura_codigo',
      'estructura_carpetas',
      'reglas_negocio',
      'control_acceso',
      'modulos'
    ]) {
      const item = etapas.find((e) => e.etapa === etapaId);
      expect(item.estado).toBe('aprobada');
      expect(item.propuesta).toBeDefined();
    }

    // Backend y frontend deben quedar habilitados
    const backend = etapas.find((e) => e.etapa === 'generacion_backend');
    const frontend = etapas.find((e) => e.etapa === 'generacion_frontend');
    expect(backend.habilitada).toBe(true);
    expect(frontend.habilitada).toBe(true);

    // Control de acceso no tiene autoregistro abierto
    const acceso = etapas.find((e) => e.etapa === 'control_acceso').propuesta;
    expect(acceso.autenticacion.metodo).toBe('jwt');
    expect(acceso.roles.every((r) => r.autoregistro === false)).toBe(true);

    // Reglas de negocio solo confirma las explícitas literales
    const reglas = etapas.find((e) => e.etapa === 'reglas_negocio').propuesta.reglas;
    expect(reglas.find((r) => r.id === 'RN-01').estado_decision).toBe('confirmado');
    expect(reglas.find((r) => r.id === 'RN-02').estado_decision).toBe('rechazado');

    // Se guardó el informe en el repositorio
    expect(repoPlan.guardar).toHaveBeenCalledWith(
      'p1',
      expect.objectContaining({
        modo_un_clic: expect.objectContaining({
          total_dudas: expect.any(Number)
        })
      })
    );
  });
});
