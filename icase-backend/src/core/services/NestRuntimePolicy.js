// Base autorizada del generador; los stacks que fijan otra versión requieren revisión, no sustitución silenciosa.
class NestRuntimePolicy {
  static version = '12.3.2';
  static node = '^22.12.0 || >=24.0.0';
  static label = 'Node.js 22.12+ + NestJS 12.3.2';

  static validate(text) {
    const requested = String(text || '');
    const match = /\bnest(?:js)?\s*(?:version|versi[oó]n)?[\s(@:v]*[~^]?(\d+(?:\.\d+){0,2})(-[\w.-]+)?/i.exec(requested);
    if (match && (match[2] || !this.version.startsWith(match[1] + '.') && this.version !== match[1])) {
      throw new Error(`El stack fija NestJS ${match[1]}, pero la base validada del generador es NestJS ${this.version}. Revisa y aprueba la etapa de tecnologías antes de regenerar; no se migra silenciosamente.`);
    }
    const node = /\bnode(?:\.?js)?\s*(?:@|v|:)?\s*(\d+)(?:\.(\d+))?/i.exec(requested);
    if (node && (Number(node[1]) < 22 || Number(node[1]) === 23 || Number(node[1]) === 22 && node[2] !== undefined && Number(node[2]) < 12)) {
      throw new Error(`NestJS ${this.version} se genera para Node.js 22.12+ o 24+. Revisa la versión de Node.js aprobada.`);
    }
  }
}

module.exports = NestRuntimePolicy;
