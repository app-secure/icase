const { AsyncLocalStorage } = require('node:async_hooks');
const axios = require('axios');
const contexts = new AsyncLocalStorage();
const bounded = (value, fallback, min, max) => value !== undefined && String(value).trim() && Number.isFinite(Number(value)) ? Math.floor(Math.min(max, Math.max(min, Number(value)))) : fallback;

class AiRequestBudget {
  async run(task, env = process.env, { allowLocal = false } = {}) {
    const controller = new AbortController();
    const state = {
      started: Date.now(), duration: bounded(env.AI_REQUIREMENTS_TIMEOUT_MS, 180000, 1000, 600000),
      requestTimeout: bounded(env.AI_REQUIREMENTS_REQUEST_TIMEOUT_MS, 35000, 100, 60000),
      maxAttempts: bounded(env.AI_REQUIREMENTS_MAX_ATTEMPTS, 8, 1, 30),
      attempts: 0, calls: [], signal: controller.signal, rejected: false, providerFailures: new Map()
    };
    state.cloudDuration = state.duration;
    if (allowLocal) state.maxAttempts = Math.min(8, state.maxAttempts);
    state.allowLocal = allowLocal;
    state.localAttempts = 0;
    if (allowLocal) state.duration += 120000;
    const timer = setTimeout(() => controller.abort(), state.duration);
    timer.unref?.();
    const metrics = () => ({ duracion_ms: Date.now() - state.started, limite_ms: state.duration,
      intentos_http: state.attempts, max_intentos_http: state.maxAttempts,
      intentos_locales: state.localAttempts,
      presupuesto_agotado: state.rejected || state.signal.aborted || state.attempts >= state.maxAttempts, etapas: state.calls, proveedores: [...state.providerFailures.values()] });
    try {
      return await contexts.run(state, async () => {
        const result = await task();
        return { ...result, auditoria_requisitos: { ...result?.auditoria_requisitos, metricas_ejecucion: metrics() } };
      });
    } catch (error) {
      error.metricasEjecucion = metrics();
      const labels = { saturacion: 'saturación temporal', sin_saldo: 'saldo insuficiente', cuota: 'cuota agotada o límite de frecuencia', autenticacion: 'credencial rechazada', modelo_no_disponible: 'modelo no disponible', limite_entrada_proveedor: 'el insumo y contrato exceden el presupuesto de entrada, incluso con prompt compacto', sin_credencial: 'sin credencial configurada' };
      const failures = [...state.providerFailures.values()];
      if (failures.length) {
        error.proveedores = failures;
        error.message += ` Proveedores: ${failures.map(item => `${item.proveedor}: ${labels[item.causa] || 'fallo de conexión o respuesta'}${item.reintentar_en_ms ? ` (reintentar en ${Math.ceil(item.reintentar_en_ms / 1000)} s)` : ''}`).join('; ')}.`;
      }
      if (state.rejected || state.signal.aborted) error.message = `Se agotó el presupuesto de generación (${state.duration / 1000} s o ${state.maxAttempts} solicitudes HTTP). ${error.message}`;
      throw error;
    } finally { clearTimeout(timer); }
  }

  exhausted() {
    const state = contexts.getStore();
    return Boolean(state && (state.signal.aborted || Date.now() - state.started >= state.cloudDuration || state.attempts >= state.maxAttempts));
  }

  reserveAudit() {
    const state = contexts.getStore();
    if (state && state.maxAttempts >= 3) state.auditReserved = true;
  }
  reserveStage(stage) {
    const state = contexts.getStore();
    if (state && state.maxAttempts >= 3) state.reservedStage = stage;
  }

  canTryLocal() {
    const state = contexts.getStore();
    return Boolean(state && state.allowLocal && !state.signal.aborted && state.localAttempts < 8 && Date.now() - state.started < state.duration);
  }

  async localPost(url, data, options = {}) {
    const state = contexts.getStore();
    if (!state) return axios.post(url, data, { ...options, timeout: Math.min(options.timeout || 120000, 120000) });
    if (!this.canTryLocal()) throw Object.assign(new Error('Presupuesto local agotado.'), { code: 'AI_BUDGET_EXHAUSTED' });
    state.localAttempts++;
    return axios.post(url, data, { ...options, signal: state.signal, timeout: Math.min(120000, state.duration - (Date.now() - state.started)) });
  }

  reportProviderFailure(provider, cause, details = {}) {
    const state = contexts.getStore();
    if (!state) return;
    const entry = { proveedor: provider, causa: cause };
    for (const field of ['tokens_estimados', 'limite_tokens', 'reintentar_en_ms']) if (Number.isFinite(details[field])) entry[field] = details[field];
    state.providerFailures.set(`${provider}:${cause}`, entry);
  }

  async waitForRetry(ms, { allowOutsideBudget = false } = {}) {
    const state = contexts.getStore();
    if (!state && allowOutsideBudget && Number.isFinite(ms) && ms > 0 && ms <= 30000) {
      await new Promise(resolve => setTimeout(resolve, ms));
      return true;
    }
    if (!state || !Number.isFinite(ms) || ms <= 0 || ms > 30000 || this.exhausted() || Date.now() + ms + 2000 >= state.started + state.duration) return false;
    const record = state.calls.at(-1);
    if (record) record.espera_reintento_ms = (record.espera_reintento_ms || 0) + ms;
    await new Promise(resolve => {
      const done = () => { clearTimeout(timer); state.signal.removeEventListener('abort', done); resolve(); };
      const timer = setTimeout(done, ms);
      state.signal.addEventListener('abort', done, { once: true });
    });
    return !this.exhausted();
  }

  async logical(stage, operation) {
    const state = contexts.getStore();
    if (!state) return operation();
    if (this.exhausted() && !this.canTryLocal()) { state.rejected = true; return null; }
    const start = Date.now();
    const previousStage = state.currentStage;
    state.currentStage = stage;
    const record = { etapa: stage, duracion_ms: 0, resultado: 'sin_respuesta' };
    state.calls.push(record);
    let onAbort;
    const aborted = new Promise((resolve) => {
      onAbort = () => resolve(null);
      state.signal.addEventListener('abort', onAbort, { once: true });
    });
    try {
      const result = await Promise.race([operation(), aborted]);
      if (!result && this.exhausted()) state.rejected = true;
      record.resultado = state.signal.aborted || (!result && state.rejected) ? 'presupuesto_agotado' : result ? 'respuesta' : 'sin_respuesta';
      return result;
    } catch (error) {
      record.resultado = error.code === 'AI_BUDGET_EXHAUSTED' || state.signal.aborted ? 'presupuesto_agotado' : 'fallo_proveedor';
      // Causas acotadas: no guardar mensajes arbitrarios, URLs ni credenciales.
      record.causa = /supera el presupuesto.*tokens|supera el presupuesto Groq/i.test(error.message || '') ? 'limite_entrada_proveedor' :
        /no está configurada/i.test(error.message || '') ? 'credencial_no_configurada' :
        error.code === 'AI_BUDGET_EXHAUSTED' || state.signal.aborted ? 'presupuesto_agotado' : 'solicitud_o_respuesta_proveedor';
      // Con presupuesto activo, el flujo puede conservar lotes anteriores y advertir los faltantes.
      return null;
    } finally { state.currentStage = previousStage; state.signal.removeEventListener('abort', onAbort); record.duracion_ms = Date.now() - start; }
  }

  async transport(method, url, data, options = {}) {
    const state = contexts.getStore();
    if (!state) return method === 'get' ? axios.get(url, options) : axios.post(url, data, options);
    const reserveAudit = state.auditReserved && !state.calls.some(call => call.etapa === 'revision_semantica') && state.currentStage !== 'revision_semantica';
    const reserveStage = state.reservedStage && !state.calls.some(call => call.etapa === state.reservedStage) && state.currentStage !== state.reservedStage;
    if (this.exhausted() || ((reserveAudit || reserveStage) && state.attempts >= state.maxAttempts - 1)) {
      state.rejected = true;
      throw Object.assign(new Error('Se agotó el presupuesto de generación de requisitos.'), { code: 'AI_BUDGET_EXHAUSTED' });
    }
    state.attempts++;
    const remaining = Math.max(1, state.duration - (Date.now() - state.started));
    const config = { ...options, signal: state.signal, timeout: Math.min(options.timeout || 60000, state.requestTimeout, remaining) };
    return method === 'get' ? axios.get(url, config) : axios.post(url, data, config);
  }
  post(url, data, options) { return this.transport('post', url, data, options); }
  get(url, options) { return this.transport('get', url, null, options); }
}
module.exports = AiRequestBudget;
