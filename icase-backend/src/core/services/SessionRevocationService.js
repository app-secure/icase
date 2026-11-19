const { createHash } = require('node:crypto');

class SessionRevocationService {
  constructor(repository) { this.repository = repository; }
  hash(token) { return createHash('sha256').update(token).digest('hex'); }
  async estaRevocada(token) {
    return Boolean(await this.repository.obtenerPorId(this.hash(token)));
  }
  async revocar(token, claims) {
    if (!Number.isFinite(claims.exp)) throw new Error('No se puede revocar una sesión sin caducidad.');
    await this.repository.revocar({ id: this.hash(token), usuario_id: claims.id, expira_en: new Date(claims.exp * 1000) });
  }
}

module.exports = SessionRevocationService;
