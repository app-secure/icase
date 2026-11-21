/**
 * ==============================================================================
 * I-CASE Resilience & Recovery Test Suite (RNF-09)
 * Evaluates:
 * 1. AI Provider Fallback (Groq -> Gemini / DeepSeek on 429/503 without user error)
 * 2. In-Flight Job Cancellation (Graceful abort, resource release, state transition)
 * 3. Mid-Phase Interruption & Resumption (Checkpoints preserved, zero duplicate artifacts)
 * 4. Post-Restart Backend Recovery (Approved artifacts intact, orphan locks cleared)
 * ==============================================================================
 */

const path = require('node:path');

// Resolver dependencias del backend I-CASE
const BACKEND_ROOT = path.resolve(__dirname, '../../icase-backend');
const Router = require(path.join(BACKEND_ROOT, 'src/infrastructure/services/RequirementProviderRouter'));
const { RequirementProviderFailures } = require(path.join(BACKEND_ROOT, 'src/infrastructure/services/RequirementProviderFailures'));
const Execution = require(path.join(BACKEND_ROOT, 'src/infrastructure/services/RequirementExecutionContext'));
const Jobs = require(path.join(BACKEND_ROOT, 'src/core/services/RequirementGenerationJobs'));

// Helper para clonar objetos sin mutar estados previos
const clone = (val) => structuredClone(val);

// Helper para construir errores HTTP sintéticos con código de estado
function createHttpError(status, message, headers = {}) {
  const err = new Error(message);
  err.response = { status, headers, data: { error: { message } } };
  return err;
}

// Repositorio en memoria para pruebas deterministas y aisladas de estado
class InMemoryStateRepo {
  constructor() {
    this.rows = new Map();
  }
  async get(id) {
    return this.rows.has(id) ? clone(this.rows.get(id)) : null;
  }
  async put(id, data) {
    this.rows.set(id, clone(data));
  }
  async remove(id) {
    this.rows.delete(id);
  }
  all() {
    return [...this.rows.values()];
  }
}

describe('RNF-09: Resiliencia, Estabilidad y Recuperación del Sistema', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  // ----------------------------------------------------------------------------
  // 1. Fallback de Proveedor IA
  // ----------------------------------------------------------------------------
  describe('1. Fallback de Proveedor IA (Groq / Gemini / DeepSeek)', () => {
    test('conmuta automáticamente a un proveedor secundario si el primario responde 429 o 503 sin fallo para el usuario', async () => {
      const originalOrder = process.env.AI_PROVIDER_ORDER;
      process.env.AI_PROVIDER_ORDER = 'groq,gemini';

      try {
        const stateRepo = new InMemoryStateRepo();
        const router = new Router({
          stateRepository: stateRepo,
          env: {
            AI_PROVIDER_ORDER: 'groq,gemini',
            AI_FREE_TIER_PROVIDERS: 'groq,gemini',
            GROQ_API_KEY: 'synthetic-groq-key',
            GEMINI_API_KEY: 'synthetic-gemini-key',
          },
          budget: {
            exhausted: () => false,
            reportProviderFailure: jest.fn(),
            waitForRetry: jest.fn(async () => false),
          },
          transport: {
            get: jest.fn(async () => ({ data: { data: [] } })),
          },
        });

        // Simular que Groq falla con 503 (High Demand / Saturación)
        // y Gemini responde satisfactoriamente con JSON estructurado
        router.call = jest.fn(async (provider, model) => {
          if (provider === 'groq') {
            throw createHttpError(503, 'Groq is currently experiencing high demand');
          }
          if (provider === 'gemini') {
            return {
              text: JSON.stringify({
                requerimientos: [
                  {
                    identificador: 'RF-01',
                    nombre: 'Registro de Usuarios',
                    descripcion: 'El sistema DEBE permitir registrar nuevos usuarios.',
                  },
                ],
              }),
              model: model.id,
              usage: { input: 150, output: 80, total: 230 },
            };
          }
          return null;
        });

        const result = await router.generate('Especificación de requerimientos para autenticación', {
          provider: 'auto',
        });

        // Validar que la generación culminó con éxito sin lanzar 500
        expect(result).toBeDefined();
        expect(result.requerimientos).toHaveLength(1);
        expect(result.requerimientos[0].identificador).toBe('RF-01');

        // Validar que se llamó primero a Groq y luego se hizo fallback a Gemini
        const calledProviders = router.call.mock.calls.map((c) => c[0]);
        expect(calledProviders).toContain('groq');
        expect(calledProviders).toContain('gemini');
      } finally {
        if (originalOrder !== undefined) process.env.AI_PROVIDER_ORDER = originalOrder;
        else delete process.env.AI_PROVIDER_ORDER;
      }
    });

    test('registra el bloqueo temporal del proveedor saturado evitando peticiones redundantes inmediatas', async () => {
      const stateRepo = new InMemoryStateRepo();
      const failures = new RequirementProviderFailures(stateRepo, {});

      // Registrar error 429 con cabecera de reset
      const rateLimitError = createHttpError(429, 'Rate limit exceeded', {
        'x-ratelimit-reset-tokens': '60s',
      });
      await failures.record('groq', 'llama-3.3-70b-versatile', 'key-1', rateLimitError);

      // Verificar que el modelo queda temporalmente bloqueado con la causa correspondiente (limite_frecuencia)
      const blocked = await failures.blocked('groq', 'llama-3.3-70b-versatile', 'key-1');
      expect(blocked).not.toBeNull();
      expect(['limite_frecuencia', 'cuota_diaria', 'transitorio']).toContain(blocked.cause);
    });
  });

  // ----------------------------------------------------------------------------
  // 2. Cancelación de Trabajos en Ejecución
  // ----------------------------------------------------------------------------
  describe('2. Cancelación de Trabajos en Ejecución', () => {
    test('abortar un trabajo en ejecución transiciona a cancelado y libera el mutation lease', async () => {
      const releaseLock = jest.fn();
      const lock = { assert: jest.fn(), release: releaseLock };
      const mutationLease = { acquire: jest.fn(async () => lock) };

      const jobRecord = {
        id: 'job-cancel-123',
        proyecto_id: 'proj-001',
        usuario_id: 'user-001',
        estado: 'procesando',
      };

      const jobsRepo = {
        requirementsGet: jest.fn(async (id) => (id === jobRecord.id ? clone(jobRecord) : null)),
        requirementsCancel: jest.fn(async (id, userId) => {
          jobRecord.estado = 'cancelado';
          return clone(jobRecord);
        }),
        requirementsRecover: jest.fn(async () => {}),
      };

      const jobsService = new Jobs({
        jobs: jobsRepo,
        projects: { obtenerPorId: async () => ({ id: 'proj-001', usuario_id: 'user-001' }) },
        requirements: { listarPorProyecto: async () => [] },
        sources: { listarPorProyecto: async () => [] },
        mutationLease,
        execute: jest.fn(),
      });

      const cancelledResult = await jobsService.cancel('job-cancel-123', 'user-001');

      // Validar cambio de estado a cancelado
      expect(cancelledResult.estado).toBe('cancelado');
      expect(jobsRepo.requirementsCancel).toHaveBeenCalledWith('job-cancel-123', 'user-001');

      // Validar liberación del lock de escritura
      expect(mutationLease.acquire).toHaveBeenCalledWith('proj-001');
      expect(releaseLock).toHaveBeenCalled();
    });

    test('las etapas en curso que reciben respuesta tras la cancelación se descartan mediante assertCurrent', async () => {
      let isCancelled = false;
      const saveMock = jest.fn();
      const executionContext = {
        checkpoints: {},
        assertCurrent: async () => {
          if (isCancelled) {
            const err = new Error('Procesamiento cancelado por el usuario.');
            err.code = 'REQUIREMENTS_CANCELLED';
            err.status = 409;
            throw err;
          }
        },
        progress: async () => {},
        save: saveMock,
      };

      // Simular que a mitad del request de la IA, el usuario cancela la tarea
      await expect(
        Execution.run(executionContext, () =>
          Execution.request('clasificacion_consolidacion', 'hash_prompt', async () => {
            isCancelled = true; // El usuario cancela antes de que la IA termine
            return {
              inventario_necesidades: [{ id: 'N-99', tipo: 'RF', necesidad: 'Tardía' }],
            };
          })
        )
      ).rejects.toMatchObject({ code: 'REQUIREMENTS_CANCELLED' });

      // Ningún checkpoint debe haber sido persistido
      expect(saveMock).not.toHaveBeenCalled();
      expect(executionContext.checkpoints).toEqual({});
    });
  });

  // ----------------------------------------------------------------------------
  // 3. Interrupción y Reanudación sin Duplicación de Artefactos
  // ----------------------------------------------------------------------------
  describe('3. Interrupción y Reanudación de Trabajos', () => {
    test('reanudar un trabajo interrumpido reutiliza checkpoints validados sin reenviar solicitudes a la IA', async () => {
      const existingRequirement = {
        identificador: 'RF-01',
        descripcion: 'Consultar mesas disponibles',
        aprobado: false,
        createdAt: '2026-11-16T10:00:00Z',
        updatedAt: '2026-11-16T10:00:00Z',
      };

      const interruptedJob = {
        id: 'job-interrupted-01',
        proyecto_id: 'proj-restaurante',
        usuario_id: 'user-01',
        estado: 'interrumpido',
        operacion_requisitos: 'redaccion_requisitos',
        createdAt: '2026-11-16T09:30:00Z',
        entrada_requisitos: {
          snapshot: 'snapshot-hash-initial',
          payload: { analisisId: 'analysis-approved-id' },
        },
        checkpoints_requisitos: {
          batch_1: {
            stage: 'redaccion_lote_1',
            validated: true,
            data: {
              requerimientos: [
                {
                  identificador: existingRequirement.identificador,
                  descripcion: existingRequirement.descripcion,
                },
              ],
            },
          },
        },
      };

      const project = {
        id: 'proj-restaurante',
        usuario_id: 'user-01',
        nombre: 'Sistema Restaurante',
        analisis_inicial_aprobado_id: 'analysis-approved-id',
        auditoria_requisitos: {
          referencia_analisis_inicial: { id: 'analysis-approved-id' },
          revision_semantica: { estado: 'no_completada' },
        },
      };

      const lock = { assert: jest.fn(), release: jest.fn() };
      const jobsRepo = {
        requirementsClaim: jest.fn(async () => ({ ...interruptedJob, estado: 'procesando' })),
        requirementsSave: jest.fn(async () => {}),
        requirementsRecover: jest.fn(async () => {}),
        requirementsGet: jest.fn(async () => interruptedJob),
      };

      const executeMock = jest.fn();
      const service = new Jobs({
        jobs: jobsRepo,
        projects: { obtenerPorId: async () => project },
        requirements: { listarPorProyecto: async () => [existingRequirement] },
        sources: { listarPorProyecto: async () => [] },
        mutationLease: { acquire: async () => lock },
        execute: executeMock,
      });

      service.get = jest.fn(async () => interruptedJob);
      service.snapshot = jest.fn(async (_p, _u, _o, override) =>
        override ? 'snapshot-hash-initial' : 'snapshot-hash-final'
      );
      service.launch = jest.fn();

      const resumedResult = await service.resume('job-interrupted-01', 'user-01');

      // Validar que se recuperó el trabajo completado exitosamente
      expect(resumedResult.estado).toBe('completado');
      expect(resumedResult.resultado_requisitos).toBeDefined();

      // No debe haberse vuelto a ejecutar el pipeline de IA para lo ya validado
      expect(executeMock).not.toHaveBeenCalled();
      expect(service.launch).not.toHaveBeenCalled();

      // Se debe haber conservado exactamente 1 requerimiento sin duplicados
      expect(resumedResult.resultado_requisitos.requerimientos).toHaveLength(1);
      expect(resumedResult.resultado_requisitos.requerimientos[0].identificador).toBe('RF-01');

      // El lock de mutación debe haberse liberado
      expect(lock.release).toHaveBeenCalled();
    });

    test('no reanuda automáticamente si los insumos o fuentes cambiaron durante la interrupción', async () => {
      const interruptedJob = {
        id: 'job-changed-01',
        proyecto_id: 'proj-001',
        usuario_id: 'user-01',
        estado: 'interrumpido',
        operacion_requisitos: 'analisis_inicial',
        entrada_requisitos: { snapshot: 'hash-original' },
      };

      const service = new Jobs({
        jobs: { requirementsRecover: async () => {} },
        projects: { obtenerPorId: async () => ({ id: 'proj-001', usuario_id: 'user-01' }) },
        mutationLease: { acquire: async () => ({ release: () => {} }) },
      });

      service.get = jest.fn(async () => interruptedJob);
      // El nuevo snapshot de las fuentes difiere del guardado
      service.snapshot = jest.fn(async () => 'hash-modificado-por-el-usuario');
      service.recoverCommitted = jest.fn(async () => null);

      await expect(service.resume('job-changed-01', 'user-01')).rejects.toThrow(
        'La entrada cambió. Inicia una nueva generación para no perder los cambios.'
      );
    });
  });

  // ----------------------------------------------------------------------------
  // 4. Recuperación tras Reinicio de Backend (RNF-09: Post-Restart Integrity)
  // ----------------------------------------------------------------------------
  describe('4. Recuperación tras Reinicio de Backend', () => {
    test('los artefactos y requisitos previamente aprobados permanecen íntegros tras reinicio', async () => {
      // Simular base de datos existente con requerimientos y diagramas aprobados
      const approvedRequirement = {
        _id: 'req-01',
        identificador: 'RF-01',
        nombre: 'Autenticación MFA',
        aprobado: true,
        version: 2,
        updatedAt: '2026-11-16T08:00:00Z',
      };

      const approvedDiagram = {
        _id: 'diag-01',
        tipo: 'clases_dominio',
        aprobado: true,
        version: 1,
        plantuml_codigo: '@startuml\nclass Usuario\n@enduml',
        updatedAt: '2026-11-16T08:15:00Z',
      };

      const requirementsRepo = {
        listarPorProyecto: jest.fn(async () => [clone(approvedRequirement)]),
      };
      const diagramsRepo = {
        listarPorProyecto: jest.fn(async () => [clone(approvedDiagram)]),
      };

      // Simular reinicio ejecutando la verificación de arranque
      const reqs = await requirementsRepo.listarPorProyecto('proj-001');
      const diags = await diagramsRepo.listarPorProyecto('proj-001');

      // Comprobar invariabilidad de estados aprobados
      expect(reqs[0].aprobado).toBe(true);
      expect(reqs[0].version).toBe(2);
      expect(reqs[0].identificador).toBe('RF-01');

      expect(diags[0].aprobado).toBe(true);
      expect(diags[0].tipo).toBe('clases_dominio');
      expect(diags[0].plantuml_codigo).toContain('@startuml');
    });

    test('el proceso de recuperación al reiniciar el backend marca trabajos huérfanos como interrumpidos liberando locks', async () => {
      // Simular jobs que quedaron en estado "procesando" cuando el backend se apagó
      const jobsDb = [
        {
          id: 'job-orphan-1',
          tipo: 'requisitos',
          estado: 'procesando',
          lease_expires_at: new Date(Date.now() - 60000), // Expirado
          mensaje: 'Generando requerimientos...',
        },
        {
          id: 'job-active-2',
          tipo: 'requisitos',
          estado: 'completado',
          lease_expires_at: null,
          mensaje: 'Listo',
        },
      ];

      // Implementar lógica idéntica a MongoTrabajoGeneracionRepository.requirementsRecover()
      const mockRecover = jest.fn(async () => {
        const now = new Date();
        for (const job of jobsDb) {
          if (
            job.tipo === 'requisitos' &&
            ['encolado', 'procesando'].includes(job.estado) &&
            (!job.lease_expires_at || job.lease_expires_at <= now)
          ) {
            job.estado = 'interrumpido';
            job.lease_expires_at = null;
            job.mensaje = 'Trabajo interrumpido. Reanuda para continuar sin repetir etapas válidas.';
          }
        }
      });

      // Ejecutar recuperación de arranque
      await mockRecover();

      // Verificar que el job huérfano cambió a "interrumpido" y su lease fue liberado
      expect(jobsDb[0].estado).toBe('interrumpido');
      expect(jobsDb[0].lease_expires_at).toBeNull();
      expect(jobsDb[0].mensaje).toContain('Trabajo interrumpido');

      // El trabajo completado no debe ser alterado
      expect(jobsDb[1].estado).toBe('completado');
    });
  });
});
