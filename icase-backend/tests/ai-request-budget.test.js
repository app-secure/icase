const axios = require('axios');
const Budget = require('../src/infrastructure/services/AiRequestBudget');
const ModelosIaService = require('../src/infrastructure/services/ModelosIaService');
afterEach(() => { jest.restoreAllMocks(); jest.useRealTimers(); });
test('reserva revisión inicial y después verificación sin multiplicar solicitudes', async () => {
  const post = jest.spyOn(axios, 'post').mockResolvedValue({ data: {} });
  const budget = new Budget();
  await budget.run(async () => {
    budget.reserveStage('revision_analisis_inicial');
    await budget.logical('extraccion', () => budget.post('https://example.test', {}));
    await budget.logical('reparacion_estructura', () => budget.post('https://example.test', {}));
    expect(await budget.logical('otro_reintento', () => budget.post('https://example.test', {}))).toBeNull();
    expect(await budget.logical('revision_analisis_inicial', () => budget.post('https://example.test', {}))).not.toBeNull();
    return {};
  }, { AI_REQUIREMENTS_MAX_ATTEMPTS: 3 });
  expect(post).toHaveBeenCalledTimes(3);
});
test('reserva la última solicitud para auditoría sin ampliar el presupuesto', async () => {
  const post = jest.spyOn(axios, 'post').mockResolvedValue({ data: {} });
  const budget = new Budget();
  await budget.run(async () => {
    await budget.logical('extraccion', () => budget.post('https://example.test', {}));
    await budget.logical('redaccion', () => budget.post('https://example.test', {}));
    budget.reserveAudit();
    expect(await budget.logical('reparacion', () => budget.post('https://example.test', {}))).toBeNull();
    expect(await budget.logical('revision_semantica', () => budget.post('https://example.test', {}))).not.toBeNull();
    return {};
  }, { AI_REQUIREMENTS_MAX_ATTEMPTS: 3 });
  expect(post).toHaveBeenCalledTimes(3);
});

test('limita llamadas acumuladas y conserva métricas sin registrar prompts ni credenciales', async () => {
  const post = jest.spyOn(axios, 'post').mockResolvedValue({ data: {} });
  const budget = new Budget();
  const result = await budget.run(async () => {
    await budget.logical('primera', () => budget.post('https://example.test', { secreto: 'no-registrar' }, { timeout: 60000 }));
    const omitted = await budget.logical('segunda', () => budget.post('https://example.test', {}));
    expect(omitted).toBeNull();
    return { requerimientos: ['válido'] };
  }, { AI_REQUIREMENTS_MAX_ATTEMPTS: 1, AI_REQUIREMENTS_REQUEST_TIMEOUT_MS: 5000 });
  expect(post).toHaveBeenCalledTimes(1);
  expect(post.mock.calls[0][2]).toMatchObject({ timeout: 5000, signal: expect.any(AbortSignal) });
  expect(result.auditoria_requisitos.metricas_ejecucion).toMatchObject({ intentos_http: 1, presupuesto_agotado: true });
  expect(JSON.stringify(result)).not.toContain('no-registrar');
});
test('cancela HTTP activo al vencer el plazo global y no deja continuar solicitudes', async () => {
  jest.useFakeTimers();
  const post = jest.spyOn(axios, 'post').mockImplementation((_url, _data, options) => new Promise((_resolve, reject) => options.signal.addEventListener('abort', () => reject(new Error('cancelado')), { once: true })));
  const budget = new Budget();
  const promise = budget.run(async () => {
    await budget.logical('lento', () => budget.post('https://example.test', {}));
    await budget.logical('omitido', () => budget.post('https://example.test', {}));
    return {};
  }, { AI_REQUIREMENTS_TIMEOUT_MS: 1000 });
  await jest.advanceTimersByTimeAsync(1001);
  const result = await promise;
  expect(post).toHaveBeenCalledTimes(1);
  expect(result.auditoria_requisitos.metricas_ejecucion.presupuesto_agotado).toBe(true);
});
test('los presupuestos son independientes en peticiones concurrentes', async () => {
  jest.spyOn(axios, 'post').mockResolvedValue({ data: {} });
  const budget = new Budget();
  const run = (attempts) => budget.run(async () => {
    await budget.logical('uno', () => budget.post('https://example.test', {}));
    await budget.logical('dos', () => budget.post('https://example.test', {}));
    return {};
  }, { AI_REQUIREMENTS_MAX_ATTEMPTS: attempts });
  const results = await Promise.all([run(1), run(2)]);
  expect(results.map((result) => result.auditoria_requisitos.metricas_ejecucion.intentos_http)).toEqual([1, 2]);
});
test('no altera los timeouts ni el comportamiento fuera de la generación de requisitos', async () => {
  const post = jest.spyOn(axios, 'post').mockResolvedValue('ok');
  await expect(new Budget().post('https://example.test', {}, { timeout: 60000 })).resolves.toBe('ok');
  expect(post.mock.calls[0][2]).toEqual({ timeout: 60000 });
});
test('las siguientes etapas conservan el orden configurado aunque responda un respaldo', async () => {
  const service = new ModelosIaService();
  service.providerOrder = ['gemini', 'openai'];
  const input = 'El usuario consulta registros.';
  const inventory = [{ id: 'N-01', tipo: 'RF', necesidad: 'Consulta', evidencia: input, estado: 'confirmado' }];
  service._ejecutarProveedor = jest.fn().mockResolvedValueOnce(null)
    .mockResolvedValueOnce({ inventario_necesidades: inventory })
    .mockResolvedValueOnce({ requerimientos: [{ identificador: 'RF-01', tipo: 'RF', nombre: 'Consulta', descripcion: input, evidencia: input, necesidades_origen: ['N-01'] }] }).mockResolvedValueOnce({ hallazgos: [] });
  const result = await service.procesar({ objetivo: 'requisitos', provider: 'auto', insumo_bruto: input });
  expect(service._ejecutarProveedor.mock.calls.map((call) => call[0])).toEqual(['gemini', 'openai', 'gemini', 'gemini']);
  expect(result.auditoria_requisitos.metricas_ejecucion.etapas.map((item) => item.etapa)).toEqual(['clasificacion_consolidacion', 'redaccion_lote_1', 'revision_semantica']);
});

test('el presupuesto HTTP conserva lotes válidos y deja bloqueada una cobertura incompleta', async () => {
  const previous = process.env.AI_REQUIREMENTS_MAX_ATTEMPTS;
  process.env.AI_REQUIREMENTS_MAX_ATTEMPTS = '2';
  try {
    const service = new ModelosIaService();
    service.geminiApiKey = 'test-only';
    service.models.gemini = ['test-model'];
    const input = 'El operador consulta registros.';
    const inventory = Array.from({ length: 6 }, (_, index) => ({ id: `N-${index + 1}`, tipo: 'RF', estado: 'confirmado', necesidad: `Consulta ${index + 1}`, evidencia: input }));
    const requirements = inventory.slice(0, 5).map((need, index) => ({ identificador: `RF-${index + 1}`, tipo: 'RF', nombre: need.necesidad, descripcion: input, evidencia: input, necesidades_origen: [need.id] }));
    const response = (json) => ({ data: { candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(json) }] } }] } });
    const post = jest.spyOn(axios, 'post').mockResolvedValueOnce(response({ inventario_necesidades: inventory })).mockResolvedValueOnce(response({ requerimientos: requirements }));
    const result = await service.procesar({ objetivo: 'requisitos', provider: 'gemini', insumo_bruto: input });
    expect(post).toHaveBeenCalledTimes(2);
    expect(result.requerimientos).toHaveLength(5);
    expect(result.auditoria_requisitos.metricas_ejecucion.presupuesto_agotado).toBe(true);
    expect(result.auditoria_requisitos.control_aprobacion.errores_criticos).toContainEqual(expect.objectContaining({ codigo: 'NECESIDAD_NO_CUBIERTA', necesidad: 'N-6' }));
  } finally {
    if (previous === undefined) delete process.env.AI_REQUIREMENTS_MAX_ATTEMPTS;
    else process.env.AI_REQUIREMENTS_MAX_ATTEMPTS = previous;
  }
});
