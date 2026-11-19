const crypto = require('node:crypto');
const fingerprint = key => crypto.createHash('sha256').update(key || 'local').digest('hex');
function classify(error, now = Date.now()) {
  const status = error?.response?.status;
  const text = String(error?.response?.data?.error?.message || error?.message || '');
  const headers = error?.response?.headers || {};
  const details = error?.response?.data?.error?.details || [];
  let delay = null;
  const retry = headers['retry-after'];
  if (retry != null) delay = Number.isFinite(Number(retry)) ? Number(retry) * 1000 : Date.parse(retry) - now;
  for (const name of ['x-ratelimit-reset-requests', 'x-ratelimit-reset-tokens']) {
    const value = String(headers[name] || '');
    const parts = [...value.matchAll(/([\d.]+)(ms|h|m|s)/g)];
    if (parts.length) delay = Math.max(delay || 0, parts.reduce((sum, m) => sum + Number(m[1]) * ({ ms: 1, s: 1000, m: 60000, h: 3600000 }[m[2]]), 0));
  }
  for (const detail of details) if (typeof detail.retryDelay === 'string' && /^\d+(\.\d+)?s$/.test(detail.retryDelay)) delay = Math.max(delay || 0, parseFloat(detail.retryDelay) * 1000);
  const duration = text.match(/retry in\s+(?:(\d+)h)?(?:(\d+)m)?([\d.]+)s/i);
  if (duration) delay = Math.max(delay || 0, ((Number(duration[1] || 0) * 3600) + Number(duration[2] || 0) * 60 + Number(duration[3])) * 1000);
  const timed = ms => new Date(now + Math.max(1000, ms)).toISOString();
  if (error?.code === 'OLLAMA_MODEL_MISSING') return { cause: 'modelo_local_no_instalado', scope: 'request', until: null, retry: false };
  if (error?.code === 'LOCAL_OUTPUT_TRUNCATED') return { cause: 'salida_truncada', scope: 'request', until: null, retry: false };
  if (status === 401 || /api.?key.*(?:invalid|revoked|expired)|API_KEY_INVALID|invalid.*api.?key/i.test(text)) return { cause: 'credencial_invalida', scope: 'credential', until: null, retry: false };
  if (status === 403) return { cause: 'acceso_modelo_denegado', scope: 'model', until: null, retry: false };
  if (status === 404 || /no longer available|model.*not found|retired|decommissioned/i.test(text)) return { cause: 'modelo_no_disponible', scope: 'model', until: null, retry: false };
  if (status === 402 || /insufficient balance/i.test(text)) return { cause: 'sin_saldo', scope: 'account', until: null, retry: false };
  if (/requests per day|per.day|daily|RPD|TPD/i.test(text)) return { cause: 'cuota_diaria', scope: 'model', until: Number.isFinite(delay) ? timed(delay) : null, retry: false };
  if (/context.*(?:length|window)|too many tokens|request too large|token.*limit.*input/i.test(text)) return { cause: 'contexto_excesivo', scope: 'request', until: null, retry: false };
  if (status === 429) return { cause: 'limite_frecuencia', scope: 'model', until: timed(Number.isFinite(delay) ? delay : 60000), retry: true, delay };
  if ([408, 500, 502, 503, 504].includes(status) || ['ETIMEDOUT', 'ECONNREFUSED', 'ECONNABORTED', 'ECONNRESET', 'EAI_AGAIN'].includes(error?.code) || /high demand|timeout|overloaded/i.test(text)) return { cause: 'transitorio', scope: 'model', until: timed(15000), retry: true, delay };
  return { cause: error instanceof SyntaxError || error?.code === 'INVALID_AI_JSON' ? 'respuesta_invalida' : 'solicitud_invalida', scope: 'request', until: null, retry: false };
}
class RequirementProviderFailures {
  constructor(repository, env = process.env) { this.repo = repository; this.env = env; }
  prefix(provider) { return `${provider}:${this.env[`${provider.toUpperCase()}_ACCOUNT_ID`] || 'default'}`; }
  id(provider, model, scope) { return `${this.prefix(provider)}:${scope}:${scope === 'model' ? model : '*'}`; }
  async blocked(provider, model, key) {
    for (const scope of ['credential', 'account', 'model']) {
      const id = this.id(provider, model, scope);
      const entry = await this.repo.get(id);
      if (!entry) continue;
      if ((entry.credential && entry.credential !== fingerprint(key)) || (entry.until && new Date(entry.until).getTime() <= Date.now())) { await this.repo.remove(id); continue; }
      return { cause: entry.cause, until: entry.until || null, scope };
    }
    return null;
  }
  async record(provider, model, key, error) {
    const failure = classify(error);
    if (failure.scope !== 'request') await this.repo.put(this.id(provider, model, failure.scope), {
      provider, model, ...failure, credential: failure.scope === 'credential' ? fingerprint(key) : null
    });
    return failure;
  }
  async clearTransient(provider, model) {
    const id = this.id(provider, model, 'model'); const entry = await this.repo.get(id);
    if (entry && ['transitorio', 'limite_frecuencia'].includes(entry.cause)) await this.repo.remove(id);
  }
}
module.exports = { RequirementProviderFailures, classify, fingerprint };
