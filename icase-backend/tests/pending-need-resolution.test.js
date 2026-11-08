const Controller = require('../src/interface-adapters/controllers/ProyectoController');
const make = () => {
  const audit = { version: 2, inventario: [], necesidades_pendientes: [{ id: 'N-1', estado_validacion: 'pendiente', elemento: { id: 'N-1', tipo: 'RF', necesidad: 'Consultar', objetivo_id: 'O-1', estado: 'confirmado', evidencia: 'incorrecta' }, historial: [] }] };
  const repository = { obtenerPorId: jest.fn().mockResolvedValue({ auditoria_requisitos: audit, insumo_bruto: 'Consultar expedientes' }), actualizar: jest.fn().mockResolvedValue({}) };
  const requirements = { listarPorProyecto: jest.fn().mockResolvedValue([]) };
  const controller = new Controller({ proyectoRepository: repository, requerimientoRepository: requirements });
  const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
  const req = { params: { id: 'project', necesidadId: 'N-1' }, usuario: { id: 'owner' }, body: { accion: 'corregir_evidencia', justificacion: 'Cita corregida desde la entrevista', evidencias: [{ texto: 'Consultar expedientes' }] } };
  return { controller, repository, requirements, req, res };
};

test('corregir conserva original e historial y exige después cubrir la función', async () => {
  const { controller, repository, req, res } = make();
  await controller.resolverNecesidad(req, res);
  const audit = repository.actualizar.mock.calls[0][1].auditoria_requisitos;
  expect(audit.necesidades_pendientes[0]).toMatchObject({ estado_validacion: 'corregida', elemento: { evidencia: 'incorrecta' } });
  expect(audit.necesidades_pendientes[0].historial[0]).toMatchObject({ accion: 'corregir_evidencia', usuario_id: 'owner' });
  expect(audit.inventario[0].evidencias[0]).toMatchObject({ inicio: 0, fin: 21, fuente: 'insumo_directo' });
  expect(audit.control_aprobacion.errores_criticos).toEqual(expect.arrayContaining([expect.objectContaining({ codigo: 'NECESIDAD_NO_CUBIERTA' })]));
});

test('no guarda citas inventadas ni permite cambiar especificación aprobada', async () => {
  const first = make();
  first.req.body.evidencias = [{ texto: 'No solicitado' }];
  await first.controller.resolverNecesidad(first.req, first.res);
  expect(first.res.status).toHaveBeenCalledWith(400);
  expect(first.repository.actualizar).not.toHaveBeenCalled();
  const second = make();
  second.requirements.listarPorProyecto.mockResolvedValue([{ aprobado: true }]);
  await second.controller.resolverNecesidad(second.req, second.res);
  expect(second.res.status).toHaveBeenCalledWith(409);
  expect(second.repository.actualizar).not.toHaveBeenCalled();
});

test('descartar exige justificación y no borra la necesidad original', async () => {
  const { controller, repository, req, res } = make();
  req.body.accion = 'descartar';
  req.body.justificacion = '';
  await controller.resolverNecesidad(req, res);
  expect(res.status).toHaveBeenCalledWith(400);
  expect(repository.actualizar).not.toHaveBeenCalled();
  req.body.justificacion = 'Duplicado de otra necesidad revisada';
  await controller.resolverNecesidad(req, res);
  const audit = repository.actualizar.mock.calls[0][1].auditoria_requisitos;
  expect(audit.necesidades_pendientes[0].estado_validacion).toBe('descartada');
  expect(audit.necesidades_pendientes[0].elemento.evidencia).toBe('incorrecta');
});
