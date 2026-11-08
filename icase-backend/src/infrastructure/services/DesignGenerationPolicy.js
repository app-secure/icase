// Contexto derivado exclusivamente del proyecto; no es un catálogo de módulos.
class DesignGenerationPolicy {
  checklist(requirements = []) {
    const functional = requirements.filter(item => String(item.tipo).toUpperCase() === 'RF');
    if (!functional.length) return '';
    return '\nPLAN DE COBERTURA INICIAL DE CLASES DE DISEÑO:\n' +
      functional.map(item => `- ${item.identificador}: ${item.nombre || item.descripcion || 'Consultar declaración aprobada'}`).join('\n') +
      '\nDistribuye TODOS estos resultados entre módulos antes de detallar clases. ' +
      'Genera primero cobertura horizontal completa, después detalla DTO y puertos. ' +
      'No entregues solo los primeros módulos. Comparte servicios y repositorios sin eliminar operaciones. ' +
      'Cada resultado debe tener una operación concreta o una nota localizada que explique su realización transversal o decisión pendiente; citar RF no demuestra implementación. ' +
      'Conserva el dominio aprobado completo. Reduce comentarios repetidos, nunca alcance, para ahorrar salida.\n';
  }

  members(code) {
    const members = new Set();
    const pattern = /^\s*(?:abstract\s+)?(?:class|interface|entity)\s+(?:"[^"]+"\s+as\s+(\w+)|([\w.]+))[^\n{]*(?:\{([^}]*))?/gm;
    for (const match of String(code || '').matchAll(pattern)) {
      const name = match[1] || match[2];
      members.add(name);
      for (const method of (match[3] || '').matchAll(/^\s*[+\-#~]?\s*(\w+)\s*\(/gm)) members.add(`${name}.${method[1]}`);
    }
    return members;
  }

  lostMembers(before, after) {
    const next = this.members(after);
    return [...this.members(before)].filter(member => !next.has(member));
  }
}
module.exports = DesignGenerationPolicy;
