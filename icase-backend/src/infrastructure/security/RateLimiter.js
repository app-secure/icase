/** Limita los intentos fallidos por clave dentro de una ventana de tiempo (en memoria, por proceso). */
class RateLimiter {
  constructor({ max, windowMs, now = Date.now }) {
    Object.assign(this, { max, windowMs, now, entries: new Map() });
  }

  /** Segundos que faltan para poder reintentar; 0 si no está bloqueada. */
  blockedFor(key) {
    const entry = this.entries.get(key);
    if (!entry) return 0;
    if (this.now() - entry.since > this.windowMs) {
      this.entries.delete(key);
      return 0;
    }
    return entry.count >= this.max ? Math.ceil((entry.since + this.windowMs - this.now()) / 1000) : 0;
  }

  fail(key) {
    const current = this.entries.get(key);
    if (current && this.now() - current.since <= this.windowMs) current.count += 1;
    else this.entries.set(key, { count: 1, since: this.now() });
    if (this.entries.size > 10000) {
      for (const [stored, entry] of this.entries) if (this.now() - entry.since > this.windowMs) this.entries.delete(stored);
    }
  }

  reset(key) {
    this.entries.delete(key);
  }
}

module.exports = RateLimiter;
