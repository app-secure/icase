const normalize = text => String(text || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const tokens = text => normalize(text).match(/[a-z0-9]{4,}/g) || [];
module.exports = function select(requirements = [], screens = []) {
  const active = requirements.filter(r => r.aprobado !== false);
  const rf = active.filter(r => String(r.tipo).toUpperCase() === 'RF');
  if (!screens?.length) return active;
  const ids = new Set(screens.flatMap(s => s.rf_trazabilidad || []).map(id => String(id).toUpperCase()));
  const roles = new Set(screens.flatMap(s => s.roles || []).map(normalize));
  const words = new Set(screens.flatMap(s => tokens(`${s.nombre || ''} ${s.modulo || ''} ${s.ruta || ''}`)));
  const selected = rf.filter(r => ids.has(String(r.identificador).toUpperCase()) ||
    (Array.isArray(r.actores) && r.actores.some(actor => roles.has(normalize(actor)))) ||
    tokens(r.nombre).some(word => words.has(word)));
  // Ambiguous associations must not silently remove obligations from context.
  const included = new Set(selected.length ? selected : rf);
  return active.filter(r => String(r.tipo).toUpperCase() !== 'RF' || included.has(r));
};
