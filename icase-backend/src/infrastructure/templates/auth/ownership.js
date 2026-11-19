const ADMIN = 'administrador';
/** Vacío: ownership se combina con los módulos listados tras la oleada 2. Se conserva el símbolo para tests. */
const BLOCKED_MODULES = Object.freeze([]);

function methodsOf(entry) {
  if (!entry) return [];
  if (Array.isArray(entry)) return entry;
  return Array.isArray(entry.metodos) ? entry.metodos : [];
}

function alcanceOf(entry) {
  if (!entry || Array.isArray(entry)) return 'todos';
  return entry.alcance === 'propios' ? 'propios' : 'todos';
}

function policyUsesOwnership(policy) {
  if (!policy || policy.habilitada !== true) return false;
  for (const byRole of Object.values(policy.operaciones || {})) {
    for (const entry of Object.values(byRole || {})) {
      if (alcanceOf(entry) === 'propios') return true;
    }
  }
  return false;
}

function scopeOf(policy, user, operation) {
  if (!user || user.rol === ADMIN) return null;
  if (alcanceOf(policy?.operaciones?.[operation]?.[user.rol]) !== 'propios') return null;
  return { ownerId: String(user.id) };
}

function keysForTable(model, tableName) {
  return Object.entries(model?.operations || {}).filter(([, name]) => name === tableName).map(([key]) => key);
}

/** Scopes de ownership para los extremos de un vínculo N:M (sin dueño en la fila intermedia). */
function associationScopes(policy, user, relation, model) {
  const table = model?.tables?.[relation?.table];
  if (!table?.columns?.length) return { sourceKey: null, targetKey: null, sourceScope: null, targetScope: null };
  const sourceTable = table.columns[0].references;
  const targetTable = table.columns[1]?.references;
  const pick = (tableName) => {
    const keys = keysForTable(model, tableName);
    if (!keys.length) return { key: null, scope: null };
    for (const key of keys) {
      const scope = scopeOf(policy, user, key);
      if (scope) return { key, scope };
    }
    return { key: keys[0], scope: null };
  };
  const source = pick(sourceTable);
  const target = pick(targetTable);
  return { sourceKey: source.key, targetKey: target.key, sourceScope: source.scope, targetScope: target.scope };
}

/** @deprecated El N:M filtra por GET con scope; ya no se bloquea la API entera. */
function associationForbidden() {
  return false;
}

module.exports = {
  ADMIN, BLOCKED_MODULES, methodsOf, alcanceOf, policyUsesOwnership, scopeOf, associationScopes, associationForbidden, keysForTable
};
