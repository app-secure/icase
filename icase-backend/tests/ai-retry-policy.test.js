const Policy = require('../src/infrastructure/services/AiRetryPolicy');
const Budget = require('../src/infrastructure/services/AiRequestBudget');
const AI = require('../src/infrastructure/services/ModelosIaService');
const axios = require('axios');
const overloaded = () => Object.assign(new Error('High demand'), { response: { status: 503, data: { error: { message: 'High demand' } } } });
const success = { data: { candidates: [{ finishReason: 'STOP', content: { parts: [{ text: '{"ok":true}' }] } }] } };
const originalEnv = { ...process.env };
afterEach(() => { jest.restoreAllMocks(); jest.useRealTimers(); process.env = { ...originalEnv }; });

test('incrementa pausas exponencialmente con jitter acotado y límite', () => {
  expect([1, 2, 3, 4, 5].map(n => Policy.retryDelay(overloaded(), n, { env: {}, random: () => 0 }))).toEqual([2000, 4000, 8000, 15000, 15000]);
  expect(Policy.retryDelay(overloaded(), 1, { env: {}, random: () => 1 })).toBe(2400);
  expect(Policy.attempts({})).toBe(3);
  expect(Policy.attempts({ AI_TRANSIENT_RETRIES: 'NaN' })).toBe(3);
  expect(Policy.attempts({ AI_TRANSIENT_RETRIES: '99' })).toBe(4);
  expect(Policy.attempts({ AI_TRANSIENT_RETRIES: '1' })).toBe(1);
});

test('respeta Retry-After numérico y fecha, sin acortar esperas excesivas', () => {
  const error = overloaded();
  error.response.headers = { 'retry-after': '10' };
  expect(Policy.retryDelay(error, 1)).toBe(10000);
  error.response.headers['retry-after'] = new Date(20000).toUTCString();
  expect(Policy.retryDelay(error, 1, { now: 0 })).toBe(20000);
  error.response.headers['retry-after'] = '60';
  expect(Policy.retryDelay(error, 1)).toBeNull();
});

test.each([400, 401, 403, 404])('no reintenta HTTP permanente %s', status => {
  expect(Policy.retryDelay({ response: { status }, message: 'Error' }, 1)).toBeNull();
});

test('no reintenta JSON inválido ni cancelación, pero sí timeout de transporte', () => {
  expect(Policy.retryDelay(new SyntaxError('Unexpected token'), 1)).toBeNull();
  expect(Policy.retryDelay({ code: 'ERR_CANCELED' }, 1)).toBeNull();
  expect(Policy.retryDelay({ code: 'ECONNABORTED' }, 1, { env: {}, random: () => 0 })).toBe(2000);
});

test('Gemini espera antes de reintentar y limpia el circuito al responder', async () => {
  jest.useFakeTimers();
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(Math, 'random').mockReturnValue(0);
  process.env.AI_TRANSIENT_RETRIES = '3';
  const post = jest.spyOn(axios, 'post').mockRejectedValueOnce(overloaded()).mockRejectedValueOnce(overloaded()).mockResolvedValueOnce(success);
  const service = new AI(); service.geminiApiKey = 'test-only'; service.models.gemini = ['test-model'];
  const promise = service.generarConGemini('prueba');
  await jest.advanceTimersByTimeAsync(0);
  expect(post).toHaveBeenCalledTimes(1);
  await jest.advanceTimersByTimeAsync(1999);
  expect(post).toHaveBeenCalledTimes(1);
  await jest.advanceTimersByTimeAsync(1);
  expect(post).toHaveBeenCalledTimes(2);
  await jest.advanceTimersByTimeAsync(4000);
  await expect(promise).resolves.toEqual({ ok: true });
  expect(service.circuitos.has('gemini:test-model')).toBe(false);
});

test('no duerme si la espera no cabe en el presupuesto; registra la espera permitida', async () => {
  jest.useFakeTimers();
  const budget = new Budget();
  const short = await budget.run(async () => ({ waited: await budget.waitForRetry(2000) }), { AI_REQUIREMENTS_TIMEOUT_MS: 3000 });
  expect(short.waited).toBe(false);
  const promise = budget.run(async () => {
    const waited = await budget.logical('reintento', () => budget.waitForRetry(2000));
    return { waited };
  }, { AI_REQUIREMENTS_TIMEOUT_MS: 10000 });
  await jest.advanceTimersByTimeAsync(2000);
  const result = await promise;
  expect(result.waited).toBe(true);
  expect(result.auditoria_requisitos.metricas_ejecucion.etapas[0].espera_reintento_ms).toBe(2000);
});

test('no espera cuando ya consumió todos los intentos HTTP globales', async () => {
  jest.useFakeTimers();
  jest.spyOn(axios, 'post').mockResolvedValue(success);
  const budget = new Budget();
  const result = await budget.run(async () => {
    await budget.post('https://example.test', {});
    return { waited: await budget.waitForRetry(2000), exhausted: budget.exhausted() };
  }, { AI_REQUIREMENTS_MAX_ATTEMPTS: 1 });
  expect(result.waited).toBe(false);
  expect(result.exhausted).toBe(true);
});
