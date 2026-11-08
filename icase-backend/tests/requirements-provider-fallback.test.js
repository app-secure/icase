const axios = require('axios');
const AI = require('../src/infrastructure/services/ModelosIaService');
const Budget = require('../src/infrastructure/services/AiRequestBudget');
const Coverage = require('../src/infrastructure/services/RequirementCoverageService');
const compact = require('../src/infrastructure/services/RequirementCompactPrompts');
const source = `El operador consulta registros. ${'Antecedentes de la operación. '.repeat(240)}`;
const inventory = [{ id: 'N-1', tipo: 'RF', objetivo_id: 'O-1', necesidad: 'Consultar registros', estado: 'confirmado', evidencia: 'El operador consulta registros.' }];
const requirement = { identificador: 'RF-1', tipo: 'RF', nombre: 'Consulta', descripcion: 'El sistema DEBE consultar registros.', evidencia: 'El operador consulta registros.', necesidades_origen: ['N-1'], criterios_aceptacion: [{ descripcion: 'Consulta visible', necesidades_origen: ['N-1'] }] };
afterEach(() => { jest.restoreAllMocks(); jest.useRealTimers(); });

test('los prompts compactos conservan todo el insumo y el contrato sin recortes', () => {
  for (const prompt of [compact.extraction(source), compact.draft(source, inventory)]) {
    expect(prompt).toContain(source);
    expect(Math.ceil(prompt.length / 4)).toBeLessThan(3000);
    expect(prompt).toContain('sin cuotas');
  }
  expect(compact.draft(source, inventory)).toContain('N-1');
});

test('auto usa Groq compacto cuando Gemini está saturado y DeepSeek no tiene saldo', async () => {
  const ai = new AI();
  ai.geminiApiKey = 'synthetic'; ai.deepseekApiKey = 'synthetic'; ai.groqApiKey = 'synthetic';
  ai.providerOrder = ['gemini', 'deepseek', 'groq'];
  ai.generarConGemini = jest.fn().mockResolvedValue(null);
  ai.generarConDeepSeek = jest.fn().mockResolvedValue(null);
  ai.generarConGroq = jest.fn().mockImplementation(async prompt => {
    if (prompt.includes('Clasifica y consolida antes de redactar')) return { inventario_necesidades: inventory };
    if (prompt.includes('Redacta ISO/IEC/IEEE')) return { requerimientos: [requirement] };
    return null; // La revisión amplia puede no caber: no se finge completada.
  });
  const result = await ai.procesar({ objetivo: 'requisitos', provider: 'auto', insumo_bruto: source });
  expect(result.requerimientos).toHaveLength(1);
  const prompts = ai.generarConGroq.mock.calls.map(call => call[0]);
  expect(prompts[0]).toContain(source);
  expect(prompts[1]).toContain(source);
  expect(Math.ceil(prompts[1].length / 4)).toBeLessThan(3000);
  expect(result.auditoria_requisitos.revision_semantica.estado).toBe('no_completada');
});

test('lotes respetan presupuesto de entrada sin dividir un objetivo ni cortar fuentes', async () => {
  const items = Array.from({ length: 12 }, (_, index) => ({ ...inventory[0], id: `N-${index + 1}`, objetivo_id: `O-${index + 1}`, necesidad: 'Consultar un conjunto distinto de registros '.repeat(8) }));
  const prompts = [];
  const request = jest.fn().mockImplementation(async (_text, options) => {
    if (options.etapa === 'clasificacion_consolidacion') return { inventario_necesidades: items };
    if (!options.etapa.startsWith('redaccion_lote')) return null;
    prompts.push(options.promptGroq);
    const batch = JSON.parse(options.promptGroq.split('OBJETIVOS DEL LOTE:\n')[1].split('\nINSUMO COMPLETO:')[0]);
    return { requerimientos: batch.map(item => ({ ...requirement, identificador: `RF-${item.id}`, necesidades_origen: [item.id], criterios_aceptacion: [{ descripcion: 'Consulta visible', necesidades_origen: [item.id] }] })) };
  });
  const result = await new Coverage().generate({ input: source, prompt: source, request, groqInputBudget: 3000 });
  expect(prompts.length).toBeGreaterThan(1);
  expect(prompts.every(prompt => Math.ceil(prompt.length / 4) <= 3000 && prompt.includes(source))).toBe(true);
  expect(result.requerimientos).toHaveLength(12);
});

test('falta de proveedores se informa una vez con causas incluso con circuitos abiertos', async () => {
  const ai = new AI();
  ai.providerOrder = ['gemini', 'deepseek']; ai.geminiApiKey = 'synthetic'; ai.deepseekApiKey = 'synthetic'; ai.groqApiKey = '';
  ai._registrarErrorModelo('gemini:gemini-test', { response: { status: 503, data: { error: { message: 'high demand' } } } });
  ai._registrarErrorModelo('deepseek:deepseek-test', { response: { status: 402, data: { error: { message: 'Insufficient Balance' } } } });
  ai.models.gemini = ['gemini-test'];
  ai.generarConDeepSeek = jest.fn().mockImplementation(async () => { ai._modeloDisponible('deepseek:deepseek-test'); return null; });
  await expect(ai.procesar({ objetivo: 'requisitos', provider: 'auto', insumo_bruto: source })).rejects.toMatchObject({ code: 'AI_REQUIREMENTS_UNAVAILABLE', metricasEjecucion: { intentos_http: 0 } });
  try { await ai.procesar({ objetivo: 'requisitos', provider: 'auto', insumo_bruto: source }); } catch (error) {
    expect(error.message).toContain('saturación temporal'); expect(error.message).toContain('saldo insuficiente');
    expect(error.message).not.toContain('synthetic');
  }
});

test('la saturación se reintenta pronto y no se confunde con saldo insuficiente', () => {
  jest.useFakeTimers();
  const ai = new AI();
  ai._registrarErrorModelo('gemini:test', { response: { status: 503 } });
  expect(ai._modeloDisponible('gemini:test')).toBe(false);
  jest.advanceTimersByTime(15001);
  expect(ai._modeloDisponible('gemini:test')).toBe(true);
  expect(ai._clasificarError({ response: { status: 402 } })).toBe('sin_saldo');
});

test('Groq no registra éxito con una respuesta truncada', async () => {
  const ai = new AI(); ai.groqApiKey = 'synthetic'; ai.models.groq = ['test-model'];
  jest.spyOn(axios, 'post').mockResolvedValue({ data: { choices: [{ finish_reason: 'length', message: { content: '{"requerimientos":[' } }] } });
  const log = jest.spyOn(console, 'log').mockImplementation(() => {});
  await expect(ai.generarConGroq('Prompt corto', null, { allowFallback: false })).rejects.toThrow('truncada');
  expect(log.mock.calls.flat().join(' ')).not.toContain('Generación exitosa');
});

test('un 429 de Groq permite solo un reintento corto respetando el presupuesto HTTP', async () => {
  jest.useFakeTimers();
  const ai = new AI(); ai.groqApiKey = 'synthetic'; ai.models.groq = ['test-model'];
  const rate = { response: { status: 429, headers: { 'retry-after': '0.001' }, data: { error: { message: 'Rate limit reached' } } } };
  const post = jest.spyOn(axios, 'post').mockRejectedValueOnce(rate).mockResolvedValueOnce({ data: { choices: [{ finish_reason: 'stop', message: { content: '{"requerimientos":[]}' } }] } });
  const pending = ai.requestBudget.run(async () => ({ value: await ai.generarConGroq('Prompt corto', null, { allowFallback: false }) }));
  await jest.advanceTimersByTimeAsync(300);
  const result = await pending;
  expect(post).toHaveBeenCalledTimes(2);
  expect(result.value).toEqual({ requerimientos: [] });
  expect(result.auditoria_requisitos.metricas_ejecucion.intentos_http).toBe(2);
});

test('no espera indefinidamente ni reintenta fuera de un presupuesto activo', async () => {
  const budget = new Budget();
  expect(await budget.waitForRetry(1)).toBe(false);
  const result = await budget.run(async () => ({ waited: await budget.waitForRetry(31000) }));
  expect(result.waited).toBe(false);
});
