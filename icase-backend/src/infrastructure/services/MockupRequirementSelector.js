const normalize = text => String(text || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const tokens = text => normalize(text).match(/[a-z0-9]{4,}/g) || [];
const Compatibility = require('../../core/services/RequirementScreenCompatibility');
const isAccess = screen => /inicio.*sesion|iniciar sesion|login|autentic|recuperar contrasena|registro de usuario/.test(normalize(`${screen.nombre || ''} ${screen.slug || ''} ${screen.pantalla_id || ''}`));
const isAuthRequirement = r => /autentic|inicio.*sesion|iniciar sesion|login|control de acceso/.test(normalize(r.nombre));
module.exports = function select(requirements = [], screens = []) {
  const active = requirements.filter(r => r.aprobado !== false);
  const rf = active.filter(r => String(r.tipo).toUpperCase() === 'RF');
  if (!screens?.length) return active;
  const ids = new Set(screens.flatMap(s => s.rf_trazabilidad || []).map(id => String(id).toUpperCase()));
  const roles = new Set(screens.flatMap(s => s.roles || []).map(normalize));
  const words = new Set(screens.flatMap(s => tokens(`${s.nombre || ''} ${s.modulo || ''} ${s.ruta || ''}`)));
  // Una pantalla de acceso solo necesita los requisitos de autenticación: nada de lo que hace cada rol después.
  if (screens.length && screens.every(isAccess)) {
    const auth = rf.filter(isAuthRequirement);
    if (auth.length) return active.filter(r => String(r.tipo).toUpperCase() !== 'RF' || auth.includes(r));
  }
  const fits = r => screens.some(s => Compatibility.compatible(r, s));
  // Un RF entra por trazabilidad explícita o por palabras en común, pero solo si quien lo ejecuta puede estar en la pantalla:
  // coincidir en el rol por sí solo ya no incluye todos los RF de ese rol.
  const selected = rf.filter(r => fits(r) && (ids.has(String(r.identificador).toUpperCase()) ||
    tokens(r.nombre).some(word => words.has(word))));
  // Sin coincidencias no se descarta nada, pero se conservan solo los compatibles con la pantalla.
  const compatible = rf.filter(fits);
  const included = new Set(selected.length ? selected : (compatible.length ? compatible : rf));
  return active.filter(r => String(r.tipo).toUpperCase() !== 'RF' || included.has(r));
};
