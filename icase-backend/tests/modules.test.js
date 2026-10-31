const ModuleService = require('../src/core/services/ModuleService');
const CodeGenerationWorkflowService = require('../src/core/services/CodeGenerationWorkflowService');
const GestionarPlanCodificacion = require('../src/core/use-cases/GestionarPlanCodificacion');
const { CODE_PHASE_STATES } = require('../src/core/constants/CodeGenerationPhases');

const service = new ModuleService();
const workflow = new CodeGenerationWorkflowService();
const state = (etapas, id) => etapas.find((item) => item.etapa === id).estado;

describe('servicio de módulos', () => {
  test('el modo automático activa los módulos recomendados', () => {
    const { valor } = service.proponer();
    expect(valor.modo).toBe('automatico');
    expect(valor.modulos).toEqual(expect.arrayContaining([expect.objectContaining({ id: 'formularios_tipados', activo: true })]));
  });

  test('en modo automático ignora lo que el usuario mande', () => {
    const { propuesta, errores } = service.validar({ modo: 'automatico', modulos: [{ id: 'formularios_tipados', activo: false }] });
    expect(errores).toEqual([]);
    expect(propuesta.modulos[0].activo).toBe(true);
  });

  test('en modo personalizado respeta la elección y completa lo omitido con el valor recomendado', () => {
    const off = service.validar({ modo: 'personalizado', modulos: [{ id: 'formularios_tipados', activo: false }] });
    expect(off.errores).toEqual([]);
    expect(off.propuesta.modulos).toEqual(expect.arrayContaining([expect.objectContaining({ id: 'formularios_tipados', activo: false, motivo: 'Desactivado por ti.' })]));
    const omitted = service.validar({ modo: 'personalizado', modulos: [] });
    expect(omitted.propuesta.modulos[0].activo).toBe(true);
    expect(omitted.advertencias.join(' ')).toMatch(/valor recomendado para: formularios_tipados/);
  });

  test.each([
    [null, /debe ser un objeto/],
    [[], /debe ser un objeto/],
    [{ modo: 'magico' }, /Modo de módulos no válido/],
    [{ modo: 'personalizado' }, /"modulos" debe ser una lista/],
    [{ modo: 'personalizado', modulos: [{ id: 'blockchain', activo: true }] }, /Módulo desconocido/],
    [{ modo: 'personalizado', modulos: [{ id: 'autenticacion', activo: false }] }, /lo decide otra etapa/],
    [{ modo: 'personalizado', modulos: [{ id: 'formularios_tipados', activo: 'si' }] }, /verdadero o falso/],
    [{ modo: 'personalizado', modulos: [{ id: 'formularios_tipados', activo: true }, { id: 'formularios_tipados', activo: false }] }, /repetido/]
  ])('rechaza una propuesta no válida %#', (propuesta, mensaje) => {
    const { errores, propuesta: normalizada } = service.validar(propuesta);
    expect(errores.join(' ')).toMatch(mensaje);
    expect(normalizada).toBeNull();
  });

  test('sin etapa aprobada o con una propuesta inválida rige el modo automático', () => {
    expect(service.activos(undefined)).toEqual(['formularios_tipados', 'paginacion_busqueda', 'datos_iniciales']);
    expect(service.activos({ modo: 'magico' })).toEqual(['formularios_tipados', 'paginacion_busqueda', 'datos_iniciales']);
    expect(service.activos({ modo: 'personalizado', modulos: [{ id: 'formularios_tipados', activo: false }] })).toEqual(['paginacion_busqueda', 'datos_iniciales']);
  });

  test('los módulos incluidos salen de las decisiones aprobadas', () => {
    const find = (list, id) => list.find((item) => item.id === id);
    const none = service.incluidos({});
    expect(find(none, 'datos').activo).toBe(true);
    expect(find(none, 'autenticacion').activo).toBe(false);
    expect(find(none, 'reglas').activo).toBe(false);
    expect(find(none, 'app_movil').activo).toBe(false);
    const all = service.incluidos({
      control_acceso: { autenticacion: { metodo: 'jwt' } },
      reglas_negocio: { reglas: [{ estado_decision: 'confirmado' }, { estado_decision: 'rechazado' }] },
      alcance_plataforma: { plataformas: ['web', 'móvil'] }
    });
    expect(find(all, 'autenticacion').activo).toBe(true);
    expect(find(all, 'reglas')).toMatchObject({ activo: true, motivo: '1 reglas confirmadas en la etapa «Reglas de negocio».' });
    expect(find(all, 'app_movil').activo).toBe(true);
  });
});

describe('la etapa Módulos es opcional', () => {
  const approvedAll = () => workflow.crearEtapasIniciales().map((item) => ({ ...item, estado: CODE_PHASE_STATES.APPROVED }));

  test('se habilita al aprobar la estructura de carpetas, igual que reglas y acceso', () => {
    const etapas = workflow.crearEtapasIniciales();
    expect(state(etapas, 'modulos')).toBe(CODE_PHASE_STATES.BLOCKED);
    const ready = workflow.sincronizarBloqueos(etapas.map((item) => ['alcance_plataforma', 'stack_tecnologico', 'arquitectura_codigo', 'estructura_carpetas'].includes(item.etapa) ? { ...item, estado: CODE_PHASE_STATES.APPROVED } : item));
    expect(state(ready, 'modulos')).toBe(CODE_PHASE_STATES.PENDING);
  });

  test('no bloquea la generación del backend ni del frontend si no se aprueba', () => {
    const etapas = approvedAll().map((item) => item.etapa === 'modulos' ? { ...item, estado: CODE_PHASE_STATES.PENDING } : item);
    expect(() => workflow.validarDependencias({ etapas }, 'generacion_backend')).not.toThrow();
    expect(() => workflow.validarDependencias({ etapas }, 'generacion_frontend')).not.toThrow();
  });

  test('si cambia deja desactualizado el backend y el frontend ya generados, pero no las decisiones previas', () => {
    const result = workflow.invalidarDependientes(approvedAll(), 'modulos');
    expect(state(result, 'generacion_backend')).toBe(CODE_PHASE_STATES.STALE);
    expect(state(result, 'generacion_frontend')).toBe(CODE_PHASE_STATES.STALE);
    expect(state(result, 'paquete_entrega')).toBe(CODE_PHASE_STATES.STALE);
    expect(state(result, 'stack_tecnologico')).toBe(CODE_PHASE_STATES.APPROVED);
    expect(state(result, 'control_acceso')).toBe(CODE_PHASE_STATES.APPROVED);
  });

  function crearCaso() {
    let plan = null;
    const repo = {
      obtenerPorProyecto: jest.fn(async () => plan),
      crear: jest.fn(async ({ proyecto_id, etapas }) => { plan = { id: 'plan-1', proyecto_id, version: 1, etapas }; return plan; }),
      guardar: jest.fn(async (_id, cambios) => { plan = { ...plan, ...cambios }; return plan; })
    };
    const useCase = new GestionarPlanCodificacion({
      proyectoRepository: { obtenerPorId: jest.fn(async () => ({ id: 'p1', nombre: 'Demo', estado_fase: 'mockups_aprobados' })) },
      planCodificacionRepository: repo
    });
    return { useCase, repo };
  }

  test('el plan informa de los módulos incluidos, los opcionales y los activos', async () => {
    const { useCase } = crearCaso();
    const plan = await useCase.obtener('p1');
    expect(plan.etapas.find((item) => item.etapa === 'modulos')).toMatchObject({ opcional: true, tipo: 'decision' });
    expect(plan.modulos.opcionales.map((item) => item.id)).toEqual(['formularios_tipados', 'paginacion_busqueda', 'datos_iniciales']);
    expect(plan.modulos.incluidos.map((item) => item.id)).toEqual(expect.arrayContaining(['datos', 'openapi', 'reglas', 'autenticacion']));
    expect(plan.modulos.activos).toEqual(['formularios_tipados', 'paginacion_busqueda', 'datos_iniciales']);
  });

  test('guarda la propuesta normalizada, rechaza las inválidas y refleja la elección aprobada', async () => {
    const { useCase, repo } = crearCaso();
    await useCase.obtener('p1');
    for (const etapa of ['alcance_plataforma', 'stack_tecnologico', 'arquitectura_codigo', 'estructura_carpetas']) {
      await useCase.proponer({ proyectoId: 'p1', etapa, propuesta: etapa === 'stack_tecnologico' ? { backend: 'Node.js + Express', base_datos: 'PostgreSQL' } : { dato: 'x' } });
      await useCase.revisar({ proyectoId: 'p1', etapa, decision: 'aprobar' });
    }
    await expect(useCase.proponer({ proyectoId: 'p1', etapa: 'modulos', propuesta: { modo: 'personalizado', modulos: [{ id: 'blockchain', activo: true }] } }))
      .rejects.toThrow(/Módulos no válidos: Módulo desconocido/);

    await useCase.proponer({ proyectoId: 'p1', etapa: 'modulos', propuesta: { modo: 'personalizado', modulos: [{ id: 'formularios_tipados', activo: false }] } });
    const pending = await useCase.obtener('p1');
    expect(pending.modulos.activos).toEqual(['formularios_tipados', 'paginacion_busqueda', 'datos_iniciales']); // aún sin aprobar: rige el automático
    const approved = await useCase.revisar({ proyectoId: 'p1', etapa: 'modulos', decision: 'aprobar' });
    expect(approved.modulos.activos).toEqual(['paginacion_busqueda', 'datos_iniciales']);
    expect(repo.guardar).toHaveBeenCalled();
  });

  test('la sugerencia de la etapa es el modo automático', async () => {
    const CodePlanningProposalService = require('../src/core/services/CodePlanningProposalService');
    const result = await new CodePlanningProposalService().generar({ etapa: 'modulos', proyecto: { nombre: 'Demo' }, requerimientos: [], diagramas: [], plan: { etapas: [] } });
    expect(result.propuesta.modo).toBe('automatico');
    expect(result.etapa).toBe('modulos');
  });
});

describe('el informe de generación incluye los módulos', () => {
  const BackendScaffoldGenerator = require('../src/infrastructure/services/BackendScaffoldGenerator');
  const generate = (decisiones) => new BackendScaffoldGenerator().generar({
    proyecto: { nombre: 'Demo' },
    insumos: { decisiones: { stack_tecnologico: { backend: 'Node.js + Express', base_datos: 'PostgreSQL' }, ...decisiones }, requerimientos: [{ aprobado: true, tipo: 'RF', identificador: 'RF-01', nombre: 'Gestionar clientes' }] },
    versionesOrigen: {}
  });
  const report = (result) => JSON.parse(result.archivos.find((item) => item.ruta === 'backend/GENERATION-REPORT.json').contenido);

  test('sin etapa aprobada usa el modo automático', async () => {
    const { modulos } = report(await generate({}));
    expect(modulos.modo).toBe('automatico');
    expect(modulos.opcionales).toEqual(expect.arrayContaining([{ id: 'formularios_tipados', etiqueta: 'Formularios y tablas por campo', activo: true }]));
    expect(modulos.incluidos.map((item) => item.id)).toEqual(expect.arrayContaining(['datos', 'openapi', 'informe']));
  });

  test('el límite de la interfaz depende del módulo de formularios', async () => {
    const limit = (result) => report(result).limites_generales[0];
    expect(limit(await generate({}))).toMatch(/formulario por campo y una tabla/);
    expect(limit(await generate({ modulos: { modo: 'personalizado', modulos: [{ id: 'formularios_tipados', activo: false }] } }))).toMatch(/escribe como JSON en un cuadro de texto/);
  });

  test('con la etapa personalizada refleja lo desactivado', async () => {
    const result = await generate({ modulos: { modo: 'personalizado', modulos: [{ id: 'formularios_tipados', activo: false }] } });
    expect(report(result).modulos.opcionales).toEqual(expect.arrayContaining([expect.objectContaining({ id: 'formularios_tipados', activo: false })]));
    expect(result.archivos.find((item) => item.ruta === 'backend/GENERATION-REPORT.md').contenido).toMatch(/Formularios y tablas por campo — desactivado/);
  });
});
