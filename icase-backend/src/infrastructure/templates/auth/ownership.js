const ADMIN = 'administrador';
const BLOCKED_MODULES = Object.freeze([
  'procesos_negocio', 'eventos_replicas', 'eventos_cambios',
  'archivos_imagenes', 'reportes_calculos', 'pagos_prueba', 'mapas'
]);

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

function associationForbidden(policy, user, relation, model) {
  if (!user || user.rol === ADMIN) return false;
  const table = model.tables[relation.table];
  if (!table) return false;
  const endpoints = table.columns.map((column) => column.references).filter(Boolean);
  for (const endpoint of endpoints) {
    const keys = Object.entries(model.operations).filter(([, name]) => name === endpoint).map(([key]) => key);
    if (keys.some((key) => alcanceOf(policy?.operaciones?.[key]?.[user.rol]) === 'propios')) return true;
  }
  return false;
}

module.exports = {
  ADMIN, BLOCKED_MODULES, methodsOf, alcanceOf, policyUsesOwnership, scopeOf, associationForbidden
};
