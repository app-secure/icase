const Approval = require('../src/core/services/RequirementApprovalService');
const AprobarFase = require('../src/core/use-cases/AprobarFase');
const Controller = require('../src/interface-adapters/controllers/ProyectoController');

const inventory = [
  { id: 'N-01', objetivo_id: 'O-01', tipo: 'RF', necesidad: 'Consultar registros', estado: 'confirmado' },
  { id: 'N-02', objetivo_id: 'O-01', tipo: 'RF', necesidad: 'Mostrar estados', estado: 'confirmado' },
  { id: 'N-03', tipo: 'restriccion_tecnica', necesidad: 'Usar tabletas', estado: 'confirmado' },
  { id: 'N-04', tipo: 'pregunta', necesidad: 'Confirmar retención', estado: 'pendiente' }
];
const audit = { version: 2, inventario: inventory };
const complete = { id: 'req', identificador: 'RF-01', tipo: 'RF', nombre: 'Consulta', descripcion: 'Consultar registros y sus estados.', necesidades_origen: ['N-01', 'N-02'], criterios_aceptacion: [{ descripcion: 'Consulta y estados visibles', necesidades_origen: ['N-01', 'N-02'] }] };

test('un objetivo consolidado con criterios completos se aprueba sin convertir plataformas en funciones', () => {
  expect(new Approval().evaluate([complete], audit)).toMatchObject({ bloqueado: false, necesidades_evaluadas: 2 });
});
test('omitir una necesidad o un criterio bloquea; tener una métrica pendiente no bloquea por sí solo', () => {
  const service = new Approval();
  expect(service.evaluate([{ ...complete, necesidades_origen: ['N-01'] }], audit).errores_criticos.some((item) => item.codigo === 'NECESIDAD_NO_CUBIERTA')).toBe(true);
  expect(service.evaluate([{ ...complete, criterios_aceptacion: [] }], audit).errores_criticos.some((item) => item.codigo === 'CRITERIO_NO_CUBIERTO')).toBe(true);
  const result = service.evaluate([{ ...complete, requiere_confirmacion: true }], audit);
  expect(result.bloqueado).toBe(false);
  expect(result.advertencias.join(' ')).toContain('pendientes');
});
test('el control se calcula con el contenido actual, no con una advertencia almacenada', () => {
  expect(new Approval().evaluate([complete], { ...audit, control_aprobacion: { bloqueado: true } }).bloqueado).toBe(false);
});
test('mantiene compatibilidad con análisis anteriores e identifica contenido inválido', () => {
  const service = new Approval();
  expect(service.evaluate([complete], null).bloqueado).toBe(false);
  expect(service.evaluate([], audit).bloqueado).toBe(true);
  expect(service.evaluate([complete, complete], audit).errores_criticos.some((item) => item.codigo === 'IDENTIFICADOR_INVALIDO')).toBe(true);
});

test('una métrica por confirmar no impide aprobar un RNF trazado', () => {
  const need = { id: 'N-RNF', tipo: 'RNF', necesidad: 'Recuperación', estado: 'pendiente' };
  const req = { ...complete, tipo: 'RNF', identificador: 'RNF-01', metrica_medible: 'Por confirmar con el usuario', requiere_confirmacion: true, necesidades_origen: [need.id], criterios_aceptacion: [] };
  const control = new Approval().evaluate([req], { version: 2, inventario: [need] });
  expect(control.bloqueado).toBe(false);
  expect(control.advertencias.join(' ')).toContain('pendientes');
});
test('no realiza escrituras ni aprueba parcialmente cuando falta cobertura', async () => {
  const proyectoRepository = { obtenerPorId: jest.fn().mockResolvedValue({ id: 'p', estado_fase: 'analisis_pendiente', auditoria_requisitos: audit }), actualizarEstadoFase: jest.fn() };
  const requerimientoRepository = { listarPorProyecto: jest.fn().mockResolvedValue([{ ...complete, necesidades_origen: ['N-01'] }]), actualizar: jest.fn() };
  const useCase = new AprobarFase({ proyectoRepository, requerimientoRepository });
  await expect(useCase.ejecutar({ proyectoId: 'p', fase: 'analisis', aprobarTodosLosElementos: true })).rejects.toMatchObject({ code: 'REQUIREMENTS_COVERAGE_BLOCKED' });
  expect(proyectoRepository.actualizarEstadoFase).not.toHaveBeenCalled();
  expect(requerimientoRepository.actualizar).not.toHaveBeenCalled();
});
test('la API devuelve el diagnóstico estructurado para mostrarlo en la interfaz', async () => {
  const control = new Approval().evaluate([], audit);
  const controller = new Controller({ aprobarFaseUseCase: { ejecutar: jest.fn().mockRejectedValue(Object.assign(new Error('Falta cobertura'), { code: 'REQUIREMENTS_COVERAGE_BLOCKED', controlRequisitos: control })) } });
  const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
  await controller.aprobarFase({ params: { id: 'p' }, body: { fase: 'analisis' } }, res);
  expect(res.status).toHaveBeenCalledWith(400);
  expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ codigo: 'REQUIREMENTS_COVERAGE_BLOCKED', control_requisitos: control }));
});
