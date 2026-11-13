const { startInitialPlatform, analysis } = require('./helpers/initial-analysis-fixture');
const { token, ids } = require('./helpers/platform-fixture');
const AI = require('../src/infrastructure/services/ModelosIaService');
let platform, spy;
const path = `/proyectos/${ids.projectA}`;
const call = (method, suffix, body, auth = token(ids.userA)) => platform.request(method, path + suffix, { auth, body });
async function done(id) { for (let i = 0; i < 100; i++) { const row = (await platform.request('GET', `/proyectos/trabajos-requisitos/${id}`, { auth: token(ids.userA) })).json; if (!['encolado', 'procesando'].includes(row.estado)) return row; await new Promise(r => setTimeout(r, 5)); } throw new Error('El trabajo no terminó.'); }
beforeEach(async () => {
  spy = jest.spyOn(AI.prototype, 'procesar').mockImplementation(async payload => payload.initialAnalysisOnly ? analysis() : ({ nombre_proyecto: 'Prueba', requerimientos: [{ tipo: 'RF', identificador: 'RF-01', nombre: 'Consultar expedientes', descripcion: 'El sistema DEBE permitir consultar expedientes.', prioridad: 'Media', actores: ['Operador'], necesidades_origen: ['N-01'], evidencias: analysis().inventario[0].evidencias, criterios_aceptacion: [{ descripcion: 'El operador visualiza los expedientes.', necesidades_origen: ['N-01'] }], aprobado: false }], diagramas: [], auditoria_requisitos: { inventario: analysis().inventario, actores: analysis().actores, referencia_analisis_inicial: payload.approvedInitialAnalysis?.referencia, revision_semantica: { estado: 'completada', hallazgos: [] } } }));
  platform = await startInitialPlatform();
});
afterEach(async () => { await platform.close(); spy.mockRestore(); });
async function extract() { const response = await call('POST', '/trabajos-requisitos', { provider: 'gemini' }); expect(response.status).toBe(202); const job = await done(response.json.id); expect(job.estado).toBe('completado'); return (await call('GET', '/analisis-inicial')).json.borrador; }
test('reprocesar crea otra versión sin pasar el análisis anterior a la IA ni borrar artefactos', async () => {
  const draft = await extract(); const diagrams = structuredClone(platform.data.diagrama);
  const response = await call('POST', '/trabajos-requisitos', { operacion: 'analisis_inicial', analisis_id: draft.id, regenerar: true, desde_cero: true, provider: 'gemini' });
  expect(response.status).toBe(202); expect((await done(response.json.id)).estado).toBe('completado');
  expect(spy.mock.calls.at(-1)[0].initialAnalysisPrevious).toBeNull();
  expect((await call('GET', '/analisis-inicial')).json.borrador.version).toBe(2);
  expect((await platform.versions.get(draft.id)).estado).toBe('borrador');
  expect(platform.data.diagrama).toEqual(diagrams);
});
test('extrae sin requisitos, aprueba y redacta sin otra extracción; navegar no consume IA', async () => {
  const before = structuredClone(platform.data.diagrama);
  const draft = await extract(); expect(platform.data.requerimiento).toHaveLength(0); expect(platform.data.diagrama).toEqual(before);
  const denied = await call('POST', '/trabajos-requisitos', { operacion: 'redaccion_requisitos' }); expect(denied.status).toBe(409);
  const approved = await call('POST', '/analisis-inicial/aprobar', { version_esperada: draft.id, aceptar_advertencias: true, provider: 'gemini' });
  expect(approved.status).toBe(202); expect((await done(approved.json.trabajo.id)).estado).toBe('completado');
  expect(platform.data.requerimiento).toHaveLength(1);
  expect(spy.mock.calls.filter(([p]) => p.initialAnalysisOnly)).toHaveLength(1);
  expect(spy.mock.calls.filter(([p]) => p.approvedInitialAnalysis)).toHaveLength(1);
  const calls = spy.mock.calls.length; await call('GET', '/analisis-inicial'); await call('GET', ''); expect(spy).toHaveBeenCalledTimes(calls);
  expect(platform.data.diagrama).toHaveLength(before.length);
});
test('regenerar reemplaza el borrador desde el análisis aprobado', async () => {
  const draft = await extract();
  const approved = await call('POST', '/analisis-inicial/aprobar', { version_esperada: draft.id, aceptar_advertencias: true, provider: 'gemini' });
  expect(approved.status).toBe(202);
  await done(approved.json.trabajo.id);
  const refused = await call('POST', '/trabajos-requisitos', { operacion: 'redaccion_requisitos', analisis_id: (await call('GET', '/analisis-inicial')).json.aprobado.id, provider: 'gemini' });
  expect(refused.status).toBe(409);
  const again = await call('POST', '/trabajos-requisitos', { operacion: 'redaccion_requisitos', analisis_id: (await call('GET', '/analisis-inicial')).json.aprobado.id, regenerar: true, provider: 'gemini' });
  expect(again.status).toBe(202);
  expect((await done(again.json.id)).estado).toBe('completado');
  expect(platform.data.requerimiento).toHaveLength(1);
  const drafting = spy.mock.calls.filter(([payload]) => payload.approvedInitialAnalysis);
  expect(drafting.at(-1)[0].approvedInitialAnalysis.requisitos_previos).toEqual([]);
});
test('ediciones concurrentes no sobrescriben; preguntas abiertas no bloquean', async () => {
  const draft = await extract();
  const content = structuredClone(draft.contenido); content.inventario.push({ id: 'N-02', tipo: 'pregunta', necesidad: '¿Qué filtros?', estado: 'pendiente', evidencia: 'El operador consulta expedientes.' });
  const saved = await call('PATCH', '/analisis-inicial', { accion: 'guardar', version_esperada: draft.id, contenido: content, justificacion: 'Revisión' }); expect(saved.status).toBe(200);
  expect((await call('PATCH', '/analisis-inicial', { accion: 'guardar', version_esperada: draft.id, contenido: content, justificacion: 'Otra pestaña' })).status).toBe(409);
  expect((await call('POST', '/analisis-inicial/aprobar', { version_esperada: saved.json.analisis_inicial.id, aceptar_advertencias: true })).status).toBe(202);
  await done((await platform.jobs.requirementsLatest(ids.projectA)).id);
});

test('responder registra insumo, evidencia y vínculos en una versión sin reclasificar la pregunta', async () => {
  const draft = await extract();
  const content = structuredClone(draft.contenido);
  content.inventario.push({ id: 'N-02', tipo: 'pregunta', necesidad: '¿Cuál es la frecuencia de respaldo?', estado: 'pendiente', evidencia: 'El operador consulta expedientes.' });
  const saved = await call('PATCH', '/analisis-inicial', { accion: 'guardar', version_esperada: draft.id, contenido: content, justificacion: 'Pregunta pendiente' });
  const before = saved.json.analisis_inicial;
  const body = { accion: 'responder_pregunta', version_esperada: before.id, id: 'N-02', respuesta: 'Se confirma un respaldo diario de los expedientes.', tipo_resultado: 'RNF', elementos_relacionados: ['N-01'], justificacion: 'Acuerdo del responsable' };
  const result = await call('PATCH', '/analisis-inicial', body);
  expect(result.status).toBe(200);
  const next = result.json.analisis_inicial;
  expect(next.insumo_adicional).toContain(body.respuesta);
  const question = next.contenido.inventario.find(n => n.id === 'N-02');
  expect(question.tipo).toBe('pregunta'); expect(question.estado).toBe('confirmado');
  const answer = next.contenido.inventario.find(n => n.id === question.respuesta.elemento_resultante);
  expect(answer).toMatchObject({ tipo: 'RNF', estado: 'confirmado', necesidad: body.respuesta, origenes: ['N-02'], elementos_relacionados: ['N-01'] });
  expect(answer.objetivo_id).toBeTruthy();
  expect(next.contenido.control_aprobacion.errores).toEqual([]);
  expect(next.contenido.control_aprobacion.advertencias.join(' ')).not.toContain('Hay preguntas pendientes');
  expect((await platform.versions.get(before.id)).contenido.inventario.find(n => n.id === 'N-02').estado).toBe('pendiente');
  expect((await call('PATCH', '/analisis-inicial', body)).status).toBe(409);
  expect((await call('PATCH', '/analisis-inicial', { ...body, version_esperada: next.id })).status).toBe(409);
  expect(spy).toHaveBeenCalledTimes(1);
});

test('responder rechaza respuestas vacías y vínculos inexistentes sin crear versiones', async () => {
  const draft = await extract();
  const content = structuredClone(draft.contenido);
  content.inventario.push({ id: 'N-02', tipo: 'pregunta', necesidad: '¿Qué filtros?', estado: 'pendiente', evidencia: 'El operador consulta expedientes.' });
  const saved = await call('PATCH', '/analisis-inicial', { accion: 'guardar', version_esperada: draft.id, contenido: content, justificacion: 'Pregunta pendiente' });
  const body = { accion: 'responder_pregunta', version_esperada: saved.json.analisis_inicial.id, id: 'N-02', respuesta: '', tipo_resultado: 'decision', justificacion: 'Respuesta' };
  expect((await call('PATCH', '/analisis-inicial', body)).status).toBe(400);
  expect((await call('PATCH', '/analisis-inicial', { ...body, respuesta: 'Sin filtros adicionales.', elementos_relacionados: ['N-99'] })).status).toBe(400);
  expect((await call('GET', '/analisis-inicial')).json.borrador.id).toBe(body.version_esperada);
});

test('guarda varios elementos de una respuesta sin mezclar categorías ni reutilizar objetivos pendientes', async () => {
  const draft = await extract();
  const content = structuredClone(draft.contenido);
  content.inventario.push({ id: 'N-02', tipo: 'pregunta', necesidad: '¿Seguridad y facilidad de uso?', estado: 'pendiente', evidencia: 'El operador consulta expedientes.' });
  content.necesidades_pendientes = [{ id: 'N-16', elemento: { id: 'N-16', objetivo_id: 'O-10' }, estado_validacion: 'pendiente' }];
  const saved = await call('PATCH', '/analisis-inicial', { accion: 'guardar', version_esperada: draft.id, contenido: content, justificacion: 'Pregunta' });
  const body = { accion: 'responder_pregunta', version_esperada: saved.json.analisis_inicial.id, id: 'N-02', respuesta: 'Usaremos JWT. Aprender las tareas básicas en una hora guiada.', elementos: [{ tipo: 'restriccion_tecnica', necesidad: 'Autenticación mediante JWT', evidencia: 'Usaremos JWT.', estado: 'confirmado' }, { tipo: 'RNF', necesidad: 'Aprender tareas básicas en una hora guiada', evidencia: 'Aprender las tareas básicas en una hora guiada.', estado: 'confirmado' }], confirmar_elementos: true, justificacion: 'Acuerdo explícito' };
  const result = await call('PATCH', '/analisis-inicial', body);
  expect(result.status).toBe(200);
  const next = result.json.analisis_inicial;
  const question = next.contenido.inventario.find(n => n.id === 'N-02');
  expect(question.respuesta.elementos_resultantes).toHaveLength(2);
  const items = next.contenido.inventario.filter(n => question.respuesta.elementos_resultantes.includes(n.id));
  expect(items.map(n => n.tipo)).toEqual(['restriccion_tecnica', 'RNF']);
  expect(items[1].objetivo_id).toBe('O-11');
  expect(next.insumo_adicional).toContain(body.respuesta);
  expect((await call('PATCH', '/analisis-inicial', body)).status).toBe(409);
});

test('la propuesta de respuesta y revisión de calidad usan trabajos sin generar ni aplicar requisitos', async () => {
  const draft = await extract();
  const content = structuredClone(draft.contenido);
  content.inventario.push({ id: 'N-02', tipo: 'pregunta', necesidad: '¿Qué filtro?', estado: 'pendiente', evidencia: 'El operador consulta expedientes.' });
  const saved = await call('PATCH', '/analisis-inicial', { accion: 'guardar', version_esperada: draft.id, contenido: content, justificacion: 'Pregunta' });
  const current = saved.json.analisis_inicial;
  const old = spy.getMockImplementation();
  spy.mockImplementation(async payload => payload.initialAnalysisTask === 'analisis_respuesta' ? { elementos: [{ tipo: 'decision', necesidad: payload.answerText, evidencia: payload.answerText, estado: 'confirmado' }], respuesta_hash: require('../src/infrastructure/services/RequirementExecutionContext').hash(payload.answerText), pregunta_id: payload.questionId } : payload.initialAnalysisTask === 'revision_calidad' ? { ...payload.initialAnalysisPrevious, revision_inventario: { estado: 'completa', hallazgos: [] } } : old(payload));
  const started = await call('POST', '/trabajos-requisitos', { operacion: 'analisis_respuesta', analisis_id: current.id, pregunta_id: 'N-02', respuesta: 'Filtrar por estado.' });
  expect(started.status).toBe(202);
  const job = await done(started.json.id);
  expect(job.estado).toBe('completado'); expect(job.resultado_analisis_inicial.elementos).toHaveLength(1);
  expect(platform.data.requerimiento).toHaveLength(0);
  expect((await call('GET', '/analisis-inicial')).json.borrador.id).toBe(current.id);
  const review = await call('POST', '/trabajos-requisitos', { operacion: 'revision_calidad', analisis_id: current.id });
  const reviewed = await done(review.json.id);
  expect(reviewed.resultado_analisis_inicial.propuesta.revision_inventario.estado).toBe('completa');
  expect((await call('GET', '/analisis-inicial')).json.borrador.id).toBe(current.id);
  expect((await call('POST', '/trabajos-requisitos', { operacion: 'analisis_respuesta', analisis_id: 'obsoleto', pregunta_id: 'N-02', respuesta: 'Algo' })).status).toBe(409);
});

test('corregir una necesidad pendiente elimina el bloqueo solo si la evidencia se valida', async () => {
  const draft = await extract();
  const content = structuredClone(draft.contenido);
  const missing = { id: 'N-02', objetivo_id: 'O-02', tipo: 'RF', necesidad: 'Consultar datos', estado: 'confirmado', evidencias: [{ texto: 'Cita inexistente', fuente: 'a.txt' }] };
  content.necesidades_pendientes = [{ id: missing.id, elemento: missing, estado_validacion: 'pendiente' }];
  const initial = await call('PATCH', '/analisis-inicial', { accion: 'guardar', version_esperada: draft.id, contenido: content, justificacion: 'Registrar pendiente' });
  const invalidContent = structuredClone(initial.json.analisis_inicial.contenido);
  invalidContent.inventario.push(missing);
  const invalid = await call('PATCH', '/analisis-inicial', { accion: 'guardar', version_esperada: initial.json.analisis_inicial.id, contenido: invalidContent, justificacion: 'Intento sin cita válida' });
  expect(invalid.json.analisis_inicial.contenido.necesidades_pendientes[0].estado_validacion).toBe('pendiente');
  const corrected = structuredClone(invalid.json.analisis_inicial.contenido);
  corrected.inventario.find(n => n.id === missing.id).evidencias = [{ texto: 'El operador consulta expedientes.', fuente: 'a.txt' }];
  const result = await call('PATCH', '/analisis-inicial', { accion: 'guardar', version_esperada: invalid.json.analisis_inicial.id, contenido: corrected, justificacion: 'Cita contrastada' });
  expect(result.status).toBe(200);
  expect(result.json.analisis_inicial.contenido.necesidades_pendientes[0].estado_validacion).toBe('corregida');
  expect(result.json.analisis_inicial.contenido.control_aprobacion.errores).not.toContain('N-02: evidencia pendiente.');
});
test('aceptar una cita corta que sí está en la fuente quita el bloqueo', async () => {
  platform.data.fuente[0].texto_transcrito = 'El operador consulta expedientes. Más tarde el operador consulta expedientes de nuevo.';
  const draft = await extract();
  const content = structuredClone(draft.contenido);
  const item = { id: 'N-02', objetivo_id: 'O-02', tipo: 'RF', necesidad: 'Consultar expedientes', estado: 'confirmado', evidencias: [{ texto: 'frase que no existe', fuente: 'a.txt' }] };
  content.necesidades_pendientes = [{ id: 'N-02', elemento: item, estado_validacion: 'pendiente', errores: ['evidencia_no_localizada'] }];
  const saved = await call('PATCH', '/analisis-inicial', { accion: 'guardar', version_esperada: draft.id, contenido: content, justificacion: 'Registrar cita ausente' });
  const refused = await call('PATCH', '/analisis-inicial', { accion: 'aceptar_cita', id: 'N-02', version_esperada: saved.json.analisis_inicial.id, justificacion: 'Intentar una cita ausente' });
  expect(refused.status).toBe(400);
  const ready = structuredClone(saved.json.analisis_inicial.contenido);
  ready.necesidades_pendientes[0].elemento.evidencias = [{ texto: 'consulta expedientes', fuente: 'a.txt' }];
  ready.necesidades_pendientes[0].errores = ['evidencia_ambigua'];
  const prepared = await call('PATCH', '/analisis-inicial', { accion: 'guardar', version_esperada: saved.json.analisis_inicial.id, contenido: ready, justificacion: 'Registrar cita repetida' });
  expect(prepared.json.analisis_inicial.contenido.control_aprobacion.errores.some(error => error.startsWith('N-02: evidencia pendiente'))).toBe(true);
  const accepted = await call('PATCH', '/analisis-inicial', { accion: 'aceptar_cita', id: 'N-02', version_esperada: prepared.json.analisis_inicial.id, justificacion: 'La cita está en la fuente.' });
  expect(accepted.status).toBe(200);
  expect(accepted.json.analisis_inicial.contenido.necesidades_pendientes[0].estado_validacion).toBe('corregida');
  expect(accepted.json.analisis_inicial.contenido.control_aprobacion.errores.some(error => error.includes('N-02: evidencia pendiente'))).toBe(false);
  expect(accepted.json.analisis_inicial.contenido.inventario.find(entry => entry.id === 'N-02').evidencias[0].texto).toMatch(/consulta expedientes/i);
});
test('propiedad, citas falsas, fuentes modificadas y aprobación inicial no equivalen a requisitos aprobados', async () => {
  expect((await call('GET', '/analisis-inicial', undefined, token(ids.userB))).status).toBe(404);
  const draft = await extract();
  platform.data.fuente[0].texto_transcrito = 'Fuente nueva';
  expect((await call('POST', '/analisis-inicial/aprobar', { version_esperada: draft.id, aceptar_advertencias: true })).status).toBe(409);
  expect((await call('POST', '/aprobar-fase', { fase: 'analisis', aprobarTodos: true })).status).not.toBe(200);
  expect(spy).toHaveBeenCalledTimes(1);
});
test('fallar encolado conserva aprobación y reintentar no repite extracción', async () => {
  const draft = await extract();
  const original = platform.jobs.requirementsStart.bind(platform.jobs);
  platform.jobs.requirementsStart = async () => { throw new Error('Cola no disponible'); };
  const result = await call('POST', '/analisis-inicial/aprobar', { version_esperada: draft.id, aceptar_advertencias: true });
  expect(result.status).toBe(200); expect(result.json.generacion_pendiente).toBe(true);
  expect(platform.data.proyecto[0].analisis_inicial_aprobado_id).toBe(draft.id);
  platform.jobs.requirementsStart = original;
  const retry = await call('POST', '/analisis-inicial/aprobar', { version_esperada: draft.id, aceptar_advertencias: true });
  expect(retry.status).toBe(202); await done(retry.json.trabajo.id);
  expect(spy.mock.calls.filter(([p]) => p.initialAnalysisOnly)).toHaveLength(1);
  expect((await call('PATCH', '/analisis-inicial', { accion: 'guardar', version_esperada: draft.id, contenido: draft.contenido, justificacion: 'Modificar versión aprobada' })).status).toBe(409);
});
test('la propuesta no altera actores no seleccionados ni se aplica automáticamente', async () => {
  const draft = await extract();
  const changed = analysis(); changed.inventario[0].necesidad = 'Consultar expedientes con información visible'; changed.actores[0].nombre = 'Actor que no se pidió cambiar';
  spy.mockResolvedValueOnce(changed);
  const response = await call('POST', '/trabajos-requisitos', { operacion: 'correccion_analisis_inicial', instruccion: 'Aclarar el resultado', elementos_ids: ['N-01'] });
  expect(response.status).toBe(202); const job = await done(response.json.id);
  expect(job.estado).toBe('completado');
  expect(job.resultado_analisis_inicial.propuesta.actores[0].nombre).toBe('Operador');
  expect((await call('GET', '/analisis-inicial')).json.borrador.id).toBe(draft.id);
  const applied = await call('PATCH', '/analisis-inicial', { accion: 'aplicar_propuesta', trabajo_id: job.id, version_esperada: draft.id, justificacion: 'Revisado' });
  expect(applied.status).toBe(200); expect(applied.json.analisis_inicial.id).not.toBe(draft.id);
  expect((await call('PATCH', '/analisis-inicial', { accion: 'aplicar_propuesta', trabajo_id: job.id, version_esperada: applied.json.analisis_inicial.id, justificacion: 'Aplicar versión antigua' })).status).toBe(409);
});
test('evidencia inválida bloquea sin borrar; solo metadatos no revocan una base aprobada', async () => {
  const draft = await extract(); const bad = structuredClone(draft.contenido);
  bad.inventario[0].evidencias[0].texto = 'Cita que no existe';
  const save = await call('PATCH', '/analisis-inicial', { accion: 'guardar', version_esperada: draft.id, contenido: bad, justificacion: 'Prueba de validación' }); expect(save.status).toBe(200);
  expect((await call('POST', '/analisis-inicial/aprobar', { version_esperada: save.json.analisis_inicial.id, aceptar_advertencias: true })).status).toBe(400);
  expect(platform.data.requerimiento).toHaveLength(0);
  const good = await call('PATCH', '/analisis-inicial', { accion: 'guardar', version_esperada: save.json.analisis_inicial.id, contenido: draft.contenido, justificacion: 'Restituir cita válida' });
  const approved = await call('POST', '/analisis-inicial/aprobar', { version_esperada: good.json.analisis_inicial.id, aceptar_advertencias: true }); await done(approved.json.trabajo.id);
  platform.data.fuente[0].descripcion = 'Descripción sugerida diferente';
  expect((await call('GET', '/analisis-inicial')).json.vigente).toBe(true);
  const before = structuredClone(platform.data.diagrama);
  expect((await call('POST', '/analisis-inicial/reabrir', {})).status).toBe(200);
  expect(platform.data.diagrama).toEqual(before);
});
test('reanudar redacción fallida no vuelve a extraer ni a aprobar', async () => {
  const draft = await extract();
  spy.mockRejectedValueOnce(new Error('Proveedor temporalmente no disponible'));
  const response = await call('POST', '/analisis-inicial/aprobar', { version_esperada: draft.id, aceptar_advertencias: true });
  expect((await done(response.json.trabajo.id)).estado).toBe('esperando_proveedor');
  const resume = await platform.request('POST', `/proyectos/trabajos-requisitos/${response.json.trabajo.id}/reanudar`, { auth: token(ids.userA), body: {} });
  expect(resume.status).toBe(202); await new Promise(r => setTimeout(r, 20));
  expect((await done(response.json.trabajo.id)).estado).toBe('completado');
  expect(spy.mock.calls.filter(([p]) => p.initialAnalysisOnly)).toHaveLength(1);
  expect(platform.data.proyecto[0].analisis_inicial_aprobado_id).toBe(draft.id);
});
test('duplicar aprobación no duplica redacción', async () => {
  const draft = await extract();
  const responses = await Promise.all([0, 1].map(() => call('POST', '/analisis-inicial/aprobar', { version_esperada: draft.id, aceptar_advertencias: true })));
  expect(responses.every(r => [200, 202].includes(r.status))).toBe(true);
  const last = await platform.jobs.requirementsLatest(ids.projectA, 'redaccion_requisitos'); await done(last.id);
  expect(platform.jobs.rows.filter(r => r.operacion_requisitos === 'redaccion_requisitos')).toHaveLength(1);
});
test('cambios de nombre o presentación no invalidan huellas; los metadatos solo afectan extracción', async () => {
  const Jobs = require('../src/core/services/RequirementGenerationJobs');
  const worker = new Jobs({ projects: platform.repositories.proyecto, requirements: platform.repositories.requerimiento, sources: platform.repositories.fuente });
  const before = await worker.snapshot(ids.projectA, ids.userA, 'analisis_inicial');
  platform.data.proyecto[0].nombre = 'Otro título'; platform.data.proyecto[0].updatedAt = 'fecha';
  expect(await worker.snapshot(ids.projectA, ids.userA, 'analisis_inicial')).toBe(before);
  const drafting = await worker.snapshot(ids.projectA, ids.userA, 'redaccion_requisitos');
  platform.data.fuente[0].descripcion = 'Cambió solo una pista';
  expect(await worker.snapshot(ids.projectA, ids.userA, 'redaccion_requisitos')).toBe(drafting);
  expect(await worker.snapshot(ids.projectA, ids.userA, 'analisis_inicial')).not.toBe(before);
});
test('reaprobar un borrador no reemplaza requisitos; la actualización explícita archiva el contenido anterior', async () => {
  const draft = await extract();
  const approve = await call('POST', '/analisis-inicial/aprobar', { version_esperada: draft.id, aceptar_advertencias: true }); await done(approve.json.trabajo.id);
  platform.data.requerimiento[0].nombre = 'Nombre manual que debe conservarse en historial';
  const before = structuredClone(platform.data.requerimiento[0]);
  const reopened = await call('POST', '/analisis-inicial/reabrir', {});
  const content = reopened.json.analisis_inicial.contenido; content.inventario[0].necesidad = 'Consultar expedientes y mostrar su información';
  const edited = await call('PATCH', '/analisis-inicial', { accion: 'guardar', version_esperada: reopened.json.analisis_inicial.id, contenido: content, justificacion: 'Aclaración del resultado' });
  const reapproved = await call('POST', '/analisis-inicial/aprobar', { version_esperada: edited.json.analisis_inicial.id, aceptar_advertencias: true });
  expect(reapproved.status).toBe(200); expect(reapproved.json.generacion_pendiente).toBe(true);
  expect(platform.data.requerimiento[0].nombre).toBe(before.nombre);
  const refresh = await call('POST', '/trabajos-requisitos', { operacion: 'redaccion_requisitos', analisis_id: edited.json.analisis_inicial.id, actualizar_ids: ['RF-01'] }); expect(refresh.status).toBe(202);
  expect((await done(refresh.json.id)).estado).toBe('completado');
  expect(platform.data.requerimiento[0].historial_versiones[0].contenido.nombre).toBe(before.nombre);
  expect(platform.data.diagrama).toHaveLength(1);
});
