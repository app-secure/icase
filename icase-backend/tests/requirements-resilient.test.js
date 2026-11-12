const { classify, RequirementProviderFailures } = require('../src/infrastructure/services/RequirementProviderFailures');
const Router = require('../src/infrastructure/services/RequirementProviderRouter');
const Execution = require('../src/infrastructure/services/RequirementExecutionContext');
const Jobs = require('../src/core/services/RequirementGenerationJobs');
const clone = value => structuredClone(value);
class StateRepo {
  constructor() { this.rows = new Map(); }
  async get(id) { return this.rows.get(id); }
  async put(id, data) { this.rows.set(id, clone(data)); }
  async remove(id) { this.rows.delete(id); }
}
const error = (status, message, headers = {}) => Object.assign(new Error(message), { response: { status, headers, data: { error: { message } } } });
test('cuota diaria sobrevive una instancia nueva y no se borra al cambiar clave', async () => {
  const repo = new StateRepo();
  const first = new RequirementProviderFailures(repo, {});
  await first.record('gemini', 'model', 'key-one', error(429, 'Requests per day exceeded. Please retry in 2h3m4s.'));
  const next = new RequirementProviderFailures(repo, {});
  const blocked = await next.blocked('gemini', 'model', 'key-two');
  expect(blocked.cause).toBe('cuota_diaria');
  expect(new Date(blocked.until).getTime()).toBeGreaterThan(Date.now() + 7200000);
});
test('credencial inválida bloquea todos los modelos hasta sustituirla; 403 solo el modelo', async () => {
  const repo = new StateRepo(), state = new RequirementProviderFailures(repo, {});
  await state.record('groq', 'a', 'old', error(401, 'Unauthorized'));
  expect((await state.blocked('groq', 'b', 'old')).cause).toBe('credencial_invalida');
  expect(await state.blocked('groq', 'b', 'new')).toBeNull();
  await state.record('groq', 'a', 'new', error(403, 'No access'));
  expect(await state.blocked('groq', 'b', 'new')).toBeNull();
  expect((await state.blocked('groq', 'a', 'new')).cause).toBe('acceso_modelo_denegado');
});
test('distingue errores sin guardar mensajes ni claves en bloqueos', async () => {
  const repo = new StateRepo(), state = new RequirementProviderFailures(repo, {});
  await state.record('gemini', 'a', 'secret-only', error(429, 'daily quota secret-only'));
  expect(JSON.stringify([...repo.rows.values()])).not.toContain('secret-only');
  expect(classify(error(400, 'context length exceeded')).cause).toBe('contexto_excesivo');
  expect(classify(new SyntaxError('bad JSON')).cause).toBe('respuesta_invalida');
  expect(classify(error(429, 'daily quota')).until).toBeNull();
});
const router = (env = {}) => new Router({ stateRepository: new StateRepo(), env,
  budget: { exhausted: () => false, reportProviderFailure: jest.fn(), waitForRetry: jest.fn(async () => false) }, transport: { get: jest.fn(async () => ({ data: { data: [] } })) } });
test('fallback cambia de proveedor sin propagar un modelo Gemini a Groq', async () => {
  const service = router({ AI_FREE_TIER_PROVIDERS: 'gemini,groq', GEMINI_API_KEY: 'test', GROQ_API_KEY: 'test' });
  service.call = jest.fn(async (provider, model) => {
    if (provider === 'gemini') throw error(503, 'High demand');
    return { text: '{"ok":true}', model: model.id };
  });
  expect(await service.generate('JSON', { specificModel: 'gemini-3.8-flash' })).toEqual({ ok: true });
  expect(service.call.mock.calls.map(c => c[0])).toEqual(['gemini', 'gemini', 'groq']);
  expect(service.call.mock.calls[2][1].id).toBe('openai/gpt-oss-120b');
});
test('selección explícita no usa otros proveedores y pago/no confirmado no se llama', async () => {
  const service = router({ OPENAI_API_KEY: 'test', GEMINI_API_KEY: 'test', OLLAMA_ENABLED: 'true' });
  service.call = jest.fn();
  expect(await service.generate('JSON', { provider: 'openai' })).toBeNull();
  expect(await service.generate('JSON', { provider: 'gemini' })).toBeNull();
  expect(service.call).not.toHaveBeenCalled();
});
test('OpenRouter solo acepta precio cero verificado, no versiones pagadas', async () => {
  const service = router({ OPENROUTER_API_KEY: 'test' });
  service.transport.get.mockResolvedValue({ data: { data: [
    { id: 'nvidia/nemotron-3.5-super-vl:free', pricing: { prompt: '0', completion: '0' }, supported_parameters: [] },
    { id: 'openai/gpt-oss-120b:free', pricing: { prompt: '1', completion: '1' }, supported_parameters: ['response_format'] }
  ] } });
  service.call = jest.fn(async () => ({ text: '{"ok":true}' }));
  await service.generate('JSON', { provider: 'openrouter' });
  expect(service.call).toHaveBeenCalledTimes(1);
  expect(service.call.mock.calls[0][1].id).toBe('nvidia/nemotron-3.5-super-vl:free');
});
test('Ollama rechaza contexto excesivo sin truncar el prompt', async () => {
  const service = router({ OLLAMA_ENABLED: 'true' });
  service.call = jest.fn();
  expect(await service.generate('a'.repeat(30000), { provider: 'ollama' })).toBeNull();
  expect(service.call).not.toHaveBeenCalled();
});

test('estado local consulta modelos instalados y distingue servidor apagado', async () => {
  const service = router({ OLLAMA_ENABLED: 'true' });
  service.transport.get.mockResolvedValue({ data: { models: [] } });
  expect((await service.status()).find(p => p.id === 'ollama').modelos[0].causa).toBe('modelo_local_no_instalado');
  service.transport.get.mockRejectedValue(new Error('offline'));
  expect((await service.status()).find(p => p.id === 'ollama').modelos[0].causa).toBe('ollama_no_disponible');
});

test('Ollama usa JSON schema, pensamiento desactivado y timeout local tipificado', async () => {
  const service = router({ OLLAMA_ENABLED: 'true' });
  service.transport.get.mockResolvedValue({ data: { models: [{ name: 'qwen3:8b' }] } });
  service.budget.localPost = jest.fn(async () => ({ data: { message: { content: '{"inventario_necesidades":[]}' }, model: 'qwen3:8b' } }));
  await service.call('ollama', { id: 'qwen3:8b', output: 2048 }, 'input', 'clasificacion_consolidacion');
  expect(service.budget.localPost.mock.calls[0][1]).toMatchObject({ think: false, stream: false, options: { num_ctx: 8192 }, format: { required: ['sintesis', 'actores', 'inventario_necesidades'] } });
  expect(classify(Object.assign(new Error('timeout'), { code: 'ECONNABORTED' })).cause).toBe('transitorio');
});

test('Ollama informa truncamiento con uso y no acepta JSON incompleto', async () => {
  const service = router({ OLLAMA_ENABLED: 'true' });
  service.transport.get.mockResolvedValue({ data: { models: [{ name: 'qwen3:8b' }] } });
  service.budget.localPost = jest.fn(async () => ({ data: { model: 'qwen3:8b', message: { content: '{' }, done_reason: 'length', prompt_eval_count: 321, eval_count: 4096 } }));
  await expect(service.call('ollama', { id: 'qwen3:8b', output: 4096 }, 'input', 'redaccion_lote_1')).rejects.toMatchObject({ code: 'LOCAL_OUTPUT_TRUNCATED', usage: { input: 321, output: 4096 } });
  expect(classify({ code: 'LOCAL_OUTPUT_TRUNCATED' }).cause).toBe('salida_truncada');
});

test('Gemini normaliza uso de tokens y conserva la causa de truncamiento', async () => {
  const service = router({ GEMINI_API_KEY: 'test' });
  service.budget.post = jest.fn(async () => ({ data: {
    modelVersion: 'gemini-test', candidates: [{ finishReason: 'STOP', content: { parts: [{ text: '{"ok":true}' }] } }],
    usageMetadata: { promptTokenCount: 123, candidatesTokenCount: 45, totalTokenCount: 168 }
  } }));
  expect(await service.call('gemini', { id: 'gemini-test', output: 500 }, 'input')).toMatchObject({
    usage: { input: 123, output: 45, total: 168 }, finishReason: 'STOP'
  });
  service.budget.post.mockResolvedValueOnce({ data: {
    candidates: [{ finishReason: 'MAX_TOKENS', content: { parts: [{ text: '{' }] } }],
    usageMetadata: { promptTokenCount: 123, candidatesTokenCount: 500 }
  } });
  await expect(service.call('gemini', { id: 'gemini-test', output: 500 }, 'input')).rejects.toMatchObject({
    code: 'INVALID_AI_JSON', usage: { input: 123, output: 500 }, finishReason: 'MAX_TOKENS'
  });
});

test('telemetría local de JSON inválido conserva tokens sin guardar el contenido', async () => {
  const service = router({ OLLAMA_ENABLED: 'true' });
  service.call = jest.fn(async () => ({ text: '{texto privado', model: 'qwen3:8b', finishReason: 'stop', usage: { input: 500, output: 100 } }));
  await service.generate('entrada privada', { provider: 'ollama', stage: 'redaccion_lote_1' });
  expect(service.trace[0]).toMatchObject({ etapa: 'redaccion_lote_1', causa: 'respuesta_invalida', tokens_entrada: 500, tokens_salida: 100, fin: 'stop' });
  expect(JSON.stringify(service.trace)).not.toContain('privada');
});

test('cabeceras de restablecimiento Groq se respetan', () => {
  const result = classify(error(429, 'rate limit', { 'x-ratelimit-reset-tokens': '2m3s' }));
  expect(new Date(result.until).getTime()).toBeGreaterThan(Date.now() + 122000);
});

test('JSON estructural sin validación de dominio no se recupera', async () => {
  const context = { checkpoints: {}, input: '', assertCurrent: async () => {}, progress: async () => {}, save: async () => {} };
  const fn = jest.fn(async () => ({ inventario_necesidades: [{ id: 'N-1', tipo: 'inventado', necesidad: 'x' }] }));
  for (let i = 0; i < 2; i++) await Execution.run(context, () => Execution.request('clasificacion_consolidacion', 'same', fn));
  expect(fn).toHaveBeenCalledTimes(2);
});

test('cuota sin restablecimiento solo se comprueba con reanudación explícita', async () => {
  const service = router({ GEMINI_API_KEY: 'test', AI_FREE_TIER_PROVIDERS: 'gemini' });
  await service.failures.record('gemini', 'gemini-3.5-flash-lite', 'test', error(429, 'daily quota exceeded'));
  await service.failures.record('gemini', 'gemini-3.8-flash', 'test', error(429, 'daily quota exceeded'));
  service.call = jest.fn(async () => ({ text: '{"ok":true}' }));
  expect(await service.generate('input', { provider: 'gemini' })).toBeNull();
  expect(service.call).not.toHaveBeenCalled();
  await Execution.run({ probeUnknownReset: true, progress: async () => {} }, () => service.generate('input', { provider: 'gemini' }));
  expect(service.call).toHaveBeenCalledTimes(1);
});

test('preferencia del proveedor no se comparte entre trabajos de proyectos distintos', async () => {
  const service = router({ GEMINI_API_KEY: 'test', GROQ_API_KEY: 'test', AI_FREE_TIER_PROVIDERS: 'gemini,groq' });
  service.preferred = 'groq';
  service.call = jest.fn(async () => ({ text: '{"ok":true}' }));
  await Execution.run({ progress: async () => {} }, () => service.generate('input'));
  expect(service.call.mock.calls[0][0]).toBe('gemini');
});
test('checkpoint validado se recupera sin llamada; respuesta inválida se vuelve a solicitar', async () => {
  const checkpoints = {}, fn = jest.fn(async () => ({ inventario_necesidades: [{ id: 'N-1', tipo: 'RF', necesidad: 'Consultar', estado: 'confirmado', evidencia: 'Consultar' }] }));
  const context = () => ({ checkpoints, input: 'Consultar', assertCurrent: async () => {}, progress: async () => {}, save: async () => {} });
  await Execution.run(context(), async () => { await Execution.request('clasificacion_consolidacion', 'same', fn); await Execution.confirm('clasificacion_consolidacion'); });
  await Execution.run(context(), () => Execution.request('clasificacion_consolidacion', 'same', fn));
  expect(fn).toHaveBeenCalledTimes(1);
  const invalid = jest.fn(async () => ({ requerimientos: [] }));
  for (let n = 0; n < 2; n++) await Execution.run(context(), () => Execution.request('redaccion_lote_1', 'partial', invalid));
  expect(invalid).toHaveBeenCalledTimes(2);
});

function jobFixture() {
  const project = { id: 'p', usuario_id: 'u', estado_fase: 'insumos_pendientes' };
  let requirements = [];
  const rows = new Map(); let counter = 0;
  const repo = {
    requirementsRecover: async () => {},
    requirementsGet: async id => rows.has(id) ? clone(rows.get(id)) : null,
    requirementsLatest: async () => clone([...rows.values()].at(-1) || null),
    requirementsStart: async data => {
      const existing = [...rows.values()].find(j => j.entrada_hash === data.entrada_hash && j.estado !== 'completado');
      if (existing) return { job: clone(existing), created: false };
      const job = { ...clone(data), id: String(++counter), estado: 'encolado' }; rows.set(job.id, job);
      return { job: clone(job), created: true };
    },
    requirementsClaim: async id => {
      const row = rows.get(id);
      if (!['encolado', 'esperando_proveedor', 'interrumpido'].includes(row.estado)) return null;
      row.estado = 'procesando'; return clone(row);
    },
    requirementsSave: async (id, change) => Object.assign(rows.get(id), clone(change))
  };
  const options = { jobs: repo, projects: { obtenerPorId: async () => clone(project) }, requirements: { listarPorProyecto: async () => clone(requirements) },
    sources: { listarPorProyecto: async () => [] }, mutationLease: { acquire: async () => ({ assert() {}, release: async () => {} }) },
    execute: async () => Execution.commit(async () => ({ requerimientos: [] })) };
  const service = new Jobs(options); service.launch = () => {};
  return { service, options, rows, project, setRequirements: values => { requirements = values; } };
}
test('trabajo pausado reanuda sin repetir etapas válidas tras recrear el servicio', async () => {
  const f = jobFixture(); let pause = true;
  const extract = jest.fn(async () => ({ inventario_necesidades: [{ id: 'N-1', tipo: 'RF', estado: 'confirmado', necesidad: 'Consultar', evidencia: 'Consultar' }] }));
  f.options.execute = async () => {
    Execution.setInput('Consultar');
    await Execution.request('clasificacion_consolidacion', 'same', extract);
    await Execution.confirm('clasificacion_consolidacion');
    const ctx = Execution.current(); ctx.pending = pause; ctx.draft = { requerimientos: ['borrador'] };
    return Execution.commit(async () => ({ requerimientos: [] }));
  };
  f.service.execute = f.options.execute;
  const job = await f.service.start('p', 'u'); await f.service.run(job.id);
  expect(f.rows.get(job.id).estado).toBe('esperando_proveedor');
  pause = false;
  const next = new Jobs(f.options); next.launch = () => {};
  await next.resume(job.id, 'u'); await next.run(job.id);
  expect(f.rows.get(job.id).estado).toBe('completado');
  expect(extract).toHaveBeenCalledTimes(1);
});
test('cambios manuales antes del commit impiden aplicar respuesta tardía', async () => {
  const f = jobFixture(), apply = jest.fn();
  f.service.execute = async () => { f.setRequirements([{ id: 'manual', descripcion: 'editado' }]); return Execution.commit(apply); };
  const job = await f.service.start('p', 'u'); await f.service.run(job.id);
  expect(f.rows.get(job.id).estado).toBe('fallido');
  expect(apply).not.toHaveBeenCalled();
});
test('aislamiento por usuario y rechazo de análisis aprobado', async () => {
  const f = jobFixture(); const job = await f.service.start('p', 'u');
  await expect(f.service.get(job.id, 'other')).rejects.toMatchObject({ status: 404 });
  f.setRequirements([{ aprobado: true }]);
  await expect(f.service.start('p', 'u')).rejects.toMatchObject({ status: 409 });
});
test('doble inicio y doble ejecución no duplican el trabajo', async () => {
  const f = jobFixture(); const run = jest.fn(async () => Execution.commit(async () => ({ requerimientos: [] })));
  f.service.execute = run;
  const first = await f.service.start('p', 'u'); const second = await f.service.start('p', 'u');
  expect(first.id).toBe(second.id);
  await Promise.all([f.service.run(first.id), f.service.run(first.id)]);
  expect(run).toHaveBeenCalledTimes(1);
});
