const { startPlatform, token, ids } = require('./helpers/platform-fixture');
let platform;
beforeAll(async () => { platform = await startPlatform(); });
afterAll(async () => { await platform.close(); });
beforeEach(() => {
  const project = platform.data.proyecto[0];
  project.insumo_bruto = 'Consultar expedientes. Autorizar solicitudes.';
  project.auditoria_requisitos = { version: 2, inventario: [{ id: 'N-1', tipo: 'RF', objetivo_id: 'O-1', necesidad: 'Consultar expedientes', estado: 'confirmado', evidencia: 'Consultar expedientes.' }],
    necesidades_pendientes: [{ id: 'N-2', estado_validacion: 'pendiente', elemento: { id: 'N-2', tipo: 'RF', objetivo_id: 'O-2', necesidad: 'Autorizar solicitudes', estado: 'confirmado', evidencia: 'Cita incorrecta' }, historial: [] }] };
  Object.assign(platform.data.requerimiento[0], { tipo: 'RF', identificador: 'RF-1', nombre: 'Consulta', descripcion: 'Consultar expedientes', aprobado: false, necesidades_origen: ['N-1'], criterios_aceptacion: [{ descripcion: 'Consulta visible', necesidades_origen: ['N-1'] }] });
});
const review = (auth, body) => platform.request('POST', `/proyectos/${ids.projectA}/revision-requisitos`, { auth, body });
test('actores: añadir, editar, fusionar y confirmar; actualizar asociaciones y bloquear tras aprobación', async () => {
  const project = platform.data.proyecto[0]; project.estado_fase = 'insumos_pendientes';
  platform.data.requerimiento[0].actores = ['Operador'];
  const auth = token(ids.userA);
  const send = body => review(auth, { justificacion: 'Revisión humana de actores', ...body });
  const created = await send({ accion: 'agregar_actor', cambios: { nombre: 'Supervisor', descripcion: 'Supervisa', tipo: 'persona' } });
  expect(created.status).toBe(200);
  const actors = created.json.auditoria_requisitos.actores;
  const operator = actors.find(a => a.nombre === 'Operador');
  const supervisor = actors.find(a => a.nombre === 'Supervisor');
  expect((await send({ accion: 'editar_actor', id: operator.id, cambios: { nombre: 'Asistente', descripcion: 'Consulta', tipo: 'persona' } })).status).toBe(200);
  expect(platform.data.requerimiento[0].actores).toEqual(['Asistente']);
  expect((await send({ accion: 'fusionar_actor', id: operator.id, destino_id: supervisor.id })).status).toBe(200);
  expect(platform.data.requerimiento[0].actores).toEqual(['Supervisor']);
  expect((await send({ accion: 'confirmar_actor', id: supervisor.id })).status).toBe(200);
  platform.data.requerimiento[0].aprobado = true;
  expect((await send({ accion: 'confirmar_actor', id: supervisor.id })).status).toBe(409);
});

test('HTTP real: sesión, propietario y proyecto distinto no pueden acceder a revisión', async () => {
  expect((await review(null, { accion: 'validar' })).status).toBe(401);
  expect([403, 404]).toContain((await review(token(ids.userB), { accion: 'validar' })).status);
  expect((await review(token(ids.userA), { accion: 'validar' })).json.auditoria_requisitos.control_aprobacion.bloqueado).toBe(true);
});

test('HTTP real: corregir evidencia conserva original y no aprueba una función todavía omitida', async () => {
  const response = await platform.request('POST', `/proyectos/${ids.projectA}/necesidades/N-2/resolver`, { auth: token(ids.userA), body: { accion: 'corregir_evidencia', justificacion: 'Fragmento correcto del insumo', evidencias: [{ texto: 'Autorizar solicitudes.' }] } });
  expect(response.status).toBe(200);
  const audit = response.json.auditoria_requisitos;
  expect(audit.necesidades_pendientes[0].elemento.evidencia).toBe('Cita incorrecta');
  expect(audit.necesidades_pendientes[0].estado_validacion).toBe('corregida');
  expect(audit.control_aprobacion.errores_criticos.some(item => item.codigo === 'NECESIDAD_NO_CUBIERTA')).toBe(true);
  expect(platform.data.requerimiento[0].aprobado).toBe(false);
});

test('HTTP real: una evidencia de otro proyecto no se admite ni borra el pendiente', async () => {
  platform.data.proyecto[1].insumo_bruto = 'Texto privado del proyecto B';
  const response = await platform.request('POST', `/proyectos/${ids.projectA}/necesidades/N-2/resolver`, { auth: token(ids.userA), body: { accion: 'corregir_evidencia', justificacion: 'Prueba de aislamiento', evidencias: [{ texto: 'Texto privado del proyecto B' }] } });
  expect(response.status).toBe(400);
  expect(platform.data.proyecto[0].auditoria_requisitos.necesidades_pendientes[0].estado_validacion).toBe('pendiente');
});

test('HTTP real: token expirado no modifica el análisis', async () => {
  const before = structuredClone(platform.data.proyecto[0].auditoria_requisitos);
  expect((await review(token(ids.userA, { expiresIn: -1 }), { accion: 'validar' })).status).toBe(401);
  expect(platform.data.proyecto[0].auditoria_requisitos).toEqual(before);
});
