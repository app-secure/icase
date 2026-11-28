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

/**
 * Tablas que el rol consulta completas (catálogos como clientes o productos, y las cuentas): un registro propio puede
 * referenciarlas aunque las haya creado otra persona. Una venta propia elige cualquier cliente del catálogo.
 */
function sharedTables(policy, user, model) {
  const shared = new Set(model?.identity?.table ? [model.identity.table] : []);
  for (const [key, table] of Object.entries(model?.operations || {})) {
    const entry = policy?.operaciones?.[key]?.[user.rol];
    if (methodsOf(entry).includes('GET') && alcanceOf(entry) === 'todos') shared.add(table);
  }
  return [...shared];
}

function createdTables(policy, user, model) {
  return [...new Set(Object.entries(model?.operations || {}).filter(([key]) => methodsOf(policy?.operaciones?.[key]?.[user.rol]).includes('POST')).map(([, table]) => table))];
}

function ownerScope(policy, user, operation) {
  if (!user || user.rol === ADMIN) return null;
  if (alcanceOf(policy?.operaciones?.[operation]?.[user.rol]) !== 'propios') return null;
  return { ownerId: String(user.id) };
}

function scopeOf(policy, user, operation, model) {
  const scope = ownerScope(policy, user, operation);
  if (!scope) return null;
  let data = model;
  if (!data) { try { data = require('../data/model'); } catch { data = null; } }
  const shared = sharedTables(policy, user, data);
  // Con columnas de rol («mesero_id»), «lo propio» es donde figura la persona; lo que su rol nunca registra es un catálogo que puede elegir.
  const byRole = Object.values(data?.tables || {}).some((table) => table.roles?.[user.rol]);
  const role = byRole ? { rol: user.rol, creates: createdTables(policy, user, data) } : {};
  return { ...scope, ...role, ...(shared.length ? { shared } : {}) };
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
  ADMIN, BLOCKED_MODULES, methodsOf, alcanceOf, policyUsesOwnership, scopeOf, sharedTables, associationScopes, associationForbidden, keysForTable
};
