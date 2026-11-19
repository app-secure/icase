const bounded = (value, fallback, min, max) => value != null && String(value).trim() && Number.isFinite(Number(value))
  ? Math.floor(Math.min(max, Math.max(min, Number(value)))) : fallback;

function attempts(env = process.env) {
  // Compatibilidad: esta variable cuenta intentos totales, no reintentos adicionales.
  return bounded(env.AI_TRANSIENT_RETRIES, 3, 1, 4);
}

function retryDelay(error, attempt, { env = process.env, random = Math.random, now = Date.now() } = {}) {
  if (error?.code === 'AI_BUDGET_EXHAUSTED' || error?.code === 'ERR_CANCELED') return null;
  const status = error?.response?.status;
  const message = String(error?.response?.data?.error?.message || error?.message || '');
  if (/no longer available|not found|not supported|invalid api key|insufficient balance|per.day|daily|limit[:\s]+0/i.test(message)) return null;
  if (status && ![408, 429, 500, 502, 503, 504].includes(status)) return null;
  if (!status && !['ECONNABORTED', 'ETIMEDOUT', 'ECONNRESET', 'EAI_AGAIN'].includes(error?.code) &&
      !/high demand|overloaded|timeout|temporarily unavailable/i.test(message)) return null;
  const base = bounded(env.AI_RETRY_BASE_DELAY_MS, 2000, 100, 10000);
  const cap = bounded(env.AI_RETRY_MAX_DELAY_MS, 15000, base, 30000);
  const exponential = Math.min(cap, base * (2 ** Math.max(0, Math.min(10, attempt - 1))));
  // Jitter positivo: no adelantar el mínimo calculado ni Retry-After.
  let delay = Math.min(cap, Math.round(exponential * (1 + Math.max(0, Math.min(1, random())) * 0.2)));
  const header = error?.response?.headers?.['retry-after'];
  if (header != null) {
    const seconds = Number(header);
    const requested = Number.isFinite(seconds) ? seconds * 1000 : Date.parse(header) - now;
    if (Number.isFinite(requested)) delay = Math.max(delay, requested);
  }
  // No acortar una espera del proveedor: si excede el límite, pasar al fallback.
  return delay > 30000 ? null : Math.ceil(delay);
}

module.exports = { attempts, retryDelay };
