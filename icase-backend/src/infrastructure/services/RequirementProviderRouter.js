const axios = require('axios');
const { requirements: catalog } = require('./AiModelConfig');
const { RequirementProviderFailures } = require('./RequirementProviderFailures');
const { retryDelay } = require('./AiRetryPolicy');
const Execution = require('./RequirementExecutionContext');
const schemaFor = require('./RequirementStageSchema');
let localBusy = false;

class RequirementProviderRouter {
  constructor({ stateRepository, budget, env = process.env, transport = axios }) {
    this.env = env; this.budget = budget; this.transport = transport;
    this.failures = new RequirementProviderFailures(stateRepository, env);
    this.preferred = null;
    this.catalogCache = null;
    this.trace = [];
  }
  localOutput(stage, model) {
    const configured = Number(this.env.OLLAMA_REQUIREMENTS_OUTPUT_TOKENS);
    const requested = Number.isFinite(configured) && configured > 0 ? configured : 4096;
    return stage.startsWith('redaccion_lote_') || stage === 'borrador_directo'
      ? Math.max(1024, Math.min(4096, Math.floor(requested))) : model.output;
  }
  async recordTrace(entry) {
    const safe = { etapa: entry.stage, proveedor: entry.provider, modelo: entry.model,
      resultado: entry.outcome, causa: entry.cause || null,
      tokens_entrada: Number.isFinite(entry.inputTokens) ? entry.inputTokens : null,
      tokens_salida: Number.isFinite(entry.outputTokens) ? entry.outputTokens : null,
      limite_salida: entry.outputLimit || null, fin: entry.finishReason || null,
      duracion_ms: entry.durationMs ?? null };
    this.trace.push(safe);
    if (this.trace.length > 100) this.trace.shift();
    const ctx = Execution.current();
    if (ctx) await ctx.progress({ ultimo_intento: safe });
  }
  key(provider) { return this.env[`${provider.toUpperCase()}_API_KEY`] || ''; }
  localContext() { return Math.max(2048, Math.min(8192, Number(this.env.OLLAMA_CONTEXT_LENGTH) || 8192)); }
  localUrl() {
    const url = new URL(this.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434');
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('Configuración Ollama inválida.');
    return url.origin;
  }
  async eligible(provider, model) {
    if (provider === 'ollama') return this.env.OLLAMA_ENABLED === 'true';
    if (!this.key(provider)) return false;
    if (!['gemini', 'groq', 'openrouter'].includes(provider)) return false;
    if (provider !== 'openrouter') return String(this.env.AI_FREE_TIER_PROVIDERS || '').split(',').map(s => s.trim()).includes(provider);
    if (!this.catalogCache || this.catalogCache.until < Date.now()) {
      try {
        const res = await this.transport.get('https://openrouter.ai/api/v1/models', { timeout: 8000 });
        this.catalogCache = { data: res.data.data || [], until: Date.now() + 300000 };
      } catch { return false; }
    }
    const entry = this.catalogCache.data.find(m => m.id === model.id);
    return Boolean(entry && String(model.id).endsWith(':free') && Number(entry.pricing?.prompt) === 0 && Number(entry.pricing?.completion) === 0 &&
      (entry.supported_parameters || []).includes('response_format'));
  }
  async status() {
    const providers = [];
    for (const provider of catalog.order) {
      const models = [];
      for (const model of catalog.models[provider]) {
        const configured = provider === 'ollama' ? this.env.OLLAMA_ENABLED === 'true' : Boolean(this.key(provider));
        const eligible = configured && await this.eligible(provider, model);
        const blocked = eligible ? await this.failures.blocked(provider, model.id, this.key(provider)) : null;
        let localCause = null;
        if (provider === 'ollama' && eligible) {
          try {
            const tags = await this.transport.get(`${this.localUrl()}/api/tags`, { timeout: 3000 });
            if (!(tags.data.models || []).some(m => m.name === model.id || m.model === model.id)) localCause = 'modelo_local_no_instalado';
          } catch { localCause = 'ollama_no_disponible'; }
        }
        models.push({ id: model.id, configurado: configured, disponible: eligible && !blocked && !localCause,
          probado: false, estado_evaluacion: 'pendiente_de_evaluacion', causa: blocked?.cause || localCause || (!eligible ? 'politica_gratuita_no_confirmada_o_no_configurado' : null), disponible_desde: blocked?.until || null });
      }
      providers.push({ id: provider, nombre: provider === 'ollama' ? 'Ollama local' : provider, disponible: models.some(m => m.disponible), modelos: models });
    }
    return providers;
  }
  async generate(prompt, { provider = 'auto', specificModel = null, promptGroq = null, stage = 'generacion' } = {}) {
    const auto = provider === 'auto';
    const execution = Execution.current();
    const preferred = execution ? execution.preferredProvider : this.preferred;
    const order = auto ? [...new Set([preferred, ...catalog.order].filter(Boolean))] : [provider];
    const events = [];
    for (const candidate of order) {
      let calls = 0;
      for (const model of catalog.models[candidate] || []) {
        if (!auto && specificModel && model.id !== specificModel) continue;
        if (auto && calls >= 2) break; // no agotar toda la generación en un proveedor
        if (candidate !== 'ollama' && this.budget.exhausted()) break;
        if (!await this.eligible(candidate, model)) {
          events.push({ provider: candidate, model: model.id, cause: 'no_elegible_gratis' });
          await this.recordTrace({ stage, provider: candidate, model: model.id, outcome: 'omitida', cause: 'no_elegible_gratis' });
          continue;
        }
        const blocked = await this.failures.blocked(candidate, model.id, this.key(candidate));
        const ctx = Execution.current();
        const probeKey = `${candidate}:${model.id}`;
        const probe = blocked?.cause === 'cuota_diaria' && !blocked.until && ctx?.probeUnknownReset && !ctx.probed?.has(probeKey);
        if (blocked && !probe) {
          events.push({ provider: candidate, model: model.id, ...blocked });
          await this.recordTrace({ stage, provider: candidate, model: model.id, outcome: 'omitida', cause: blocked.cause });
          continue;
        }
        if (probe) { ctx.probed ||= new Set(); ctx.probed.add(probeKey); }
        const text = ['groq', 'ollama'].includes(candidate) ? (promptGroq || prompt) : prompt;
        const limit = candidate === 'ollama' ? this.localContext() : model.context;
        const output = candidate === 'ollama' ? this.localOutput(stage, model) : model.output;
        if (Math.ceil(text.length / 3) + output > limit) {
          events.push({ provider: candidate, model: model.id, cause: 'contexto_excesivo' });
          await this.recordTrace({ stage, provider: candidate, model: model.id, outcome: 'omitida', cause: 'contexto_excesivo', outputLimit: output });
          this.budget.reportProviderFailure(candidate, 'contexto_excesivo'); continue;
        }
        const maxAttempts = auto ? 1 : 2;
        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
          calls++;
          const start = Date.now();
          try {
            const response = await this.call(candidate, { ...model, output }, text, stage);
            let value;
            try { value = JSON.parse(response.text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()); }
            catch (parseError) {
              throw Object.assign(new Error('JSON inválido'), { code: 'INVALID_AI_JSON', usage: response.usage, finishReason: response.finishReason });
            }
            if (!value || Array.isArray(value) || typeof value !== 'object') throw Object.assign(new Error('Se esperaba JSON objeto.'), { code: 'INVALID_AI_JSON' });
            if ((schemaFor(stage).required || []).some(field => !Array.isArray(value[field]))) throw Object.assign(new Error('Respuesta sin contrato de etapa.'), { code: 'INVALID_AI_JSON' });
            await this.failures.clearTransient(candidate, model.id);
            if (probe) await this.failures.repo.remove(this.failures.id(candidate, model.id, 'model'));
            const metadata = { provider: candidate, model: response.model || model.id, duration_ms: Date.now() - start, usage: response.usage || null, cambios_ruta: events };
            await this.recordTrace({ stage, provider: candidate, model: metadata.model, outcome: 'valida',
              inputTokens: response.usage?.input, outputTokens: response.usage?.output,
              finishReason: response.finishReason, outputLimit: output, durationMs: metadata.duration_ms });
            this.lastResponse = metadata;
            this.lastEvents = events;
            const ctx = Execution.current();
            if (ctx) { ctx.lastProvider = metadata; await ctx.progress({ proveedor: candidate, modelo: metadata.model, cambios_ruta: events }); }
            if (ctx) ctx.preferredProvider = candidate;
            else this.preferred = candidate;
            return value;
          } catch (error) {
            const failure = await this.failures.record(candidate, model.id, this.key(candidate), error);
            await this.recordTrace({ stage, provider: candidate, model: model.id, outcome: 'fallida', cause: failure.cause,
              inputTokens: error.usage?.input, outputTokens: error.usage?.output,
              finishReason: error.finishReason, outputLimit: output, durationMs: Date.now() - start });
            events.push({ provider: candidate, model: model.id, cause: failure.cause, until: failure.until });
            this.budget.reportProviderFailure(candidate, failure.cause);
            const delay = retryDelay(error, attempt);
            if (attempt >= maxAttempts || !failure.retry || delay === null || !await this.budget.waitForRetry(delay, { allowOutsideBudget: true })) break;
          }
        }
      }
    }
    const ctx = Execution.current();
    this.lastEvents = events;
    if (ctx) { ctx.failures = events; await ctx.progress({ cambios_ruta: events }); }
    return null;
  }
  async call(provider, model, prompt, stage = 'generacion') {
    const key = this.key(provider);
    if (provider === 'ollama') {
      if (localBusy) throw Object.assign(new Error('Servidor local ocupado'), { response: { status: 503 } });
      localBusy = true;
      try {
        const base = this.localUrl();
        const tags = await this.transport.get(`${base}/api/tags`, { timeout: 5000 });
        if (!(tags.data.models || []).some(m => m.name === model.id || m.model === model.id)) throw Object.assign(new Error('Modelo local no instalado'), { code: 'OLLAMA_MODEL_MISSING', response: { status: 404 } });
        const res = await this.budget.localPost(`${base}/api/chat`, { model: model.id, stream: false, think: false,
          format: schemaFor(stage), messages: [{ role: 'user', content: prompt }], options: { num_ctx: this.localContext(), num_predict: model.output, temperature: 0.2 } });
        const usage = { input: res.data.prompt_eval_count, output: res.data.eval_count };
        if (res.data.done_reason === 'length') throw Object.assign(new Error('Salida local truncada'), { code: 'LOCAL_OUTPUT_TRUNCATED', usage, finishReason: res.data.done_reason });
        return { text: res.data.message?.content || '', model: res.data.model, usage, finishReason: res.data.done_reason };
      } finally { localBusy = false; }
    }
    if (provider === 'gemini') {
      const res = await this.budget.post(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model.id)}:generateContent`, {
        contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.2, maxOutputTokens: model.output, responseMimeType: 'application/json' }
      }, { headers: { 'x-goog-api-key': key }, timeout: 35000 });
      const candidate = res.data.candidates?.[0];
      const metadata = res.data.usageMetadata || {};
      const usage = {
        input: Number.isFinite(metadata.promptTokenCount) ? metadata.promptTokenCount : null,
        output: Number.isFinite(metadata.candidatesTokenCount) ? metadata.candidatesTokenCount : null,
        total: Number.isFinite(metadata.totalTokenCount) ? metadata.totalTokenCount : null
      };
      if (candidate?.finishReason === 'MAX_TOKENS') throw Object.assign(new Error('JSON truncado'), { code: 'INVALID_AI_JSON', usage, finishReason: candidate.finishReason });
      return { text: candidate?.content?.parts?.filter(p => !p.thought).map(p => p.text || '').join('') || '', model: res.data.modelVersion || model.id, usage, finishReason: candidate?.finishReason };
    }
    const url = provider === 'groq' ? 'https://api.groq.com/openai/v1/chat/completions' : 'https://openrouter.ai/api/v1/chat/completions';
    const res = await this.budget.post(url, { model: model.id, stream: false, temperature: 0.2, max_tokens: model.output,
      messages: [{ role: 'system', content: 'Devuelve exclusivamente el objeto JSON solicitado.' }, { role: 'user', content: prompt }],
      response_format: provider === 'groq' ? { type: 'json_schema', json_schema: { name: 'requirements_stage', strict: false, schema: schemaFor(stage) } } : { type: 'json_object' },
      ...(provider === 'openrouter' ? { provider: { require_parameters: true, max_price: { prompt: 0, completion: 0 } } } : {})
    }, { headers: { Authorization: `Bearer ${key}` }, timeout: 35000 });
    if (res.data.choices?.[0]?.finish_reason === 'length') throw Object.assign(new Error('JSON truncado'), { code: 'INVALID_AI_JSON' });
    return { text: res.data.choices?.[0]?.message?.content || '', model: res.data.model || model.id, usage: res.data.usage };
  }
}
module.exports = RequirementProviderRouter;
