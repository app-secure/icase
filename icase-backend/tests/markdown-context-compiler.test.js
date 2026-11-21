const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const MarkdownContextCompilerService = require('../src/infrastructure/services/MarkdownContextCompilerService');
const GestionarPlanCodificacion = require('../src/core/use-cases/GestionarPlanCodificacion');
const CodePlanningProposalService = require('../src/core/services/CodePlanningProposalService');

describe('MarkdownContextCompilerService (MD-Driven Context Checkpointing)', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'icase-ctx-test-'));
  });

  afterEach(() => {
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test('compila los 6 artefactos Markdown correctamente', async () => {
    const compiler = new MarkdownContextCompilerService({ baseDir: tmpDir });

    const requerimientos = [
      {
        id: 'req-1',
        identificador: 'RF-01',
        tipo: 'RF',
        nombre: 'Registrar Paciente',
        descripcion: 'Permite dar de alta a un paciente con datos básicos.',
        actores: ['Recepcionista', 'Médico'],
        precondiciones: 'Usuario autenticado.',
        poscondiciones: 'Paciente registrado en el sistema.',
        prioridad: 'Alta',
        criterios_aceptacion: ['Validar DNI único', 'Validar formato de email']
      },
      {
        id: 'req-2',
        identificador: 'RNF-01',
        tipo: 'RNF',
        nombre: 'Tiempo de respuesta',
        descripcion: 'El registro debe procesarse de forma ágil.',
        metrica_medible: '< 500ms al 95% de las solicitudes'
      }
    ];

    const reglas = [
      {
        id: 'RN-01',
        entidad: 'Paciente',
        tipo: 'requerido',
        campo: 'dni',
        mensaje: 'El DNI es obligatorio',
        origen: 'explicito',
        evidencia_literal: true
      },
      {
        id: 'RN-02',
        entidad: 'Paciente',
        tipo: 'formato',
        campo: 'email',
        mensaje: 'Debe ser un email válido'
      },
      {
        id: 'RN-03',
        entidad: 'Cita',
        tipo: 'maquina_estados',
        campo: 'estado',
        mensaje: 'Transición válida: pendiente -> confirmada -> atendida'
      }
    ];

    const modeloDominio = {
      entities: [
        {
          name: 'Paciente',
          key: 'paciente',
          attributes: [
            { name: 'dni', type: 'string', format: null },
            { name: 'nombre', type: 'string', format: null }
          ]
        }
      ],
      relations: [],
      enums: []
    };

    const resultado = await compiler.compilarContexto('p-123', {
      proyecto: { nombre: 'Sistema Clínico' },
      requerimientos,
      decisiones: {
        reglas,
        stack: { backend: 'Node.js + Express', base_datos: 'PostgreSQL', frontend: 'React + Vite' },
        control_acceso: {
          autenticacion: { metodo: 'jwt', expiracion: '8h' },
          roles: [{ id: 'admin', nombre: 'Administrador', autoregistro: false }]
        }
      },
      modeloDominio
    });

    expect(resultado.proyecto_id).toBe('p-123');
    expect(resultado.archivos).toHaveLength(6);

    // Verificar que los archivos existen físicamente en tmpDir
    const reqContent = fs.readFileSync(path.join(tmpDir, '01-REQUIREMENTS.md'), 'utf8');
    expect(reqContent).toContain('RF-01: Registrar Paciente');
    expect(reqContent).toContain('Recepcionista, Médico');
    expect(reqContent).toContain('Permite dar de alta a un paciente con datos básicos.');
    expect(reqContent).toContain('RNF-01: Tiempo de respuesta');
    expect(reqContent).toContain('< 500ms al 95% de las solicitudes');

    const rulesContent = fs.readFileSync(path.join(tmpDir, '03-BUSINESS-RULES.md'), 'utf8');
    expect(rulesContent).toContain('## Entidad: Paciente');
    expect(rulesContent).toContain('## Entidad: Cita');
    expect(rulesContent).toContain('### Tipo de validación: `requerido`');
    expect(rulesContent).toContain('### Tipo de validación: `formato`');
    expect(rulesContent).toContain('### Tipo de validación: `maquina_estados`');
    expect(rulesContent).toContain('El DNI es obligatorio');
  });

  test('se invoca compilarContexto al completar modo de un clic si el servicio está inyectado', async () => {
    const fakeCompiler = {
      compilarContexto: jest.fn(async () => ({ ok: true }))
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
        descripcion: 'El bibliotecario registra un libro',
        actores: ['Bibliotecario'],
        evidencia: 'registro de libros'
      }
    ];

    const diagramas = [
      {
        id: 'diag-1',
        aprobado: true,
        estado: 'aprobado',
        tipo: 'clases_dominio',
        titulo: 'Modelo de Dominio',
        codigo_plantuml: '@startuml\nclass Libro {\n  +String isbn\n}\n@enduml'
      }
    ];

    let currentPlan = null;
    const planRepo = {
      obtenerPorProyecto: jest.fn(async () => currentPlan),
      crear: jest.fn(async (datos) => {
        currentPlan = { id: 'plan-1', ...datos };
        return currentPlan;
      }),
      guardar: jest.fn(async (_id, datos) => {
        currentPlan = { ...currentPlan, ...datos };
        return currentPlan;
      })
    };

    const proposalService = new CodePlanningProposalService({
      ruleInferenceService: {
        inferir: jest.fn(async () => ({ reglas: [], advertencias: [] }))
      }
    });

    const useCase = new GestionarPlanCodificacion({
      proyectoRepository: { obtenerPorId: async () => proyectoValido },
      planCodificacionRepository: planRepo,
      requerimientoRepository: { listarPorProyecto: async () => requerimientos },
      diagramaRepository: { listarPorProyecto: async () => diagramas },
      proposalService,
      contextCheckpointService: fakeCompiler
    });

    await useCase.ejecutarModoUnClic({ proyectoId: 'p1' });

    expect(fakeCompiler.compilarContexto).toHaveBeenCalledTimes(1);
    const [pId, data] = fakeCompiler.compilarContexto.mock.calls[0];
    expect(pId).toBe('p1');
    expect(data.proyecto).toEqual(proyectoValido);
    expect(data.requerimientos).toHaveLength(1);
  });

  test('se invoca compilarContexto en revisión manual cuando se aprueba la última etapa requerida', async () => {
    const fakeCompiler = {
      compilarContexto: jest.fn(async () => ({ ok: true }))
    };

    const proyectoValido = {
      id: 'p1',
      nombre: 'Gestión Biblioteca',
      estado_fase: 'mockups_aprobados'
    };

    const requerimientos = [
      { id: 'req-1', aprobado: true, tipo: 'RF', identificador: 'RF-01', nombre: 'Registrar libro' }
    ];

    const workflow = new (require('../src/core/services/CodeGenerationWorkflowService'))();
    const etapas = workflow.crearEtapasIniciales().map((e) => {
      // Dejar todas las fases requeridas aprobadas salvo control_acceso
      if (['alcance_plataforma', 'stack_tecnologico', 'arquitectura_codigo', 'estructura_carpetas', 'reglas_negocio'].includes(e.etapa)) {
        return { ...e, estado: 'aprobada', propuesta: { desc: 'ok' } };
      }
      if (e.etapa === 'control_acceso') {
        return { ...e, estado: 'en_revision', propuesta: { autenticacion: { metodo: 'jwt' } } };
      }
      return e;
    });

    let currentPlan = { id: 'plan-1', proyecto_id: 'p1', version: 1, etapas };
    const planRepo = {
      obtenerPorProyecto: jest.fn(async () => currentPlan),
      crear: jest.fn(),
      guardar: jest.fn(async (_id, datos) => {
        currentPlan = { ...currentPlan, ...datos };
        return currentPlan;
      })
    };

    const useCase = new GestionarPlanCodificacion({
      proyectoRepository: { obtenerPorId: async () => proyectoValido },
      planCodificacionRepository: planRepo,
      requerimientoRepository: { listarPorProyecto: async () => requerimientos },
      diagramaRepository: { listarPorProyecto: async () => [] },
      contextCheckpointService: fakeCompiler
    });

    await useCase.revisar({
      proyectoId: 'p1',
      etapa: 'control_acceso',
      decision: 'aprobar'
    });

    expect(fakeCompiler.compilarContexto).toHaveBeenCalledTimes(1);
    const [pId, data] = fakeCompiler.compilarContexto.mock.calls[0];
    expect(pId).toBe('p1');
    expect(data.decisiones).toBeDefined();
  });
});
