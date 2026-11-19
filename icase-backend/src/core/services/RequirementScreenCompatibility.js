const PlatformPolicy = require('./PlatformPolicy');

/**
 * Un requisito solo puede asociarse a una pantalla si quien lo ejecuta puede estar en esa pantalla y la plataforma
 * coincide. Compartir una palabra («mesa», «reserva», «sesión») no basta: un mesero no usa la reserva del cliente y un
 * requisito de la interfaz web no va en una pantalla móvil.
 */
const strip = (value) => String(value || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

/** Rol canónico: «Personal de Cocina» y «Cocinero» son el mismo; el resto se compara por su nombre. */
function canonicalRole(value) {
  const text = strip(value);
  if (!text) return '';
  if (/cocin|chef|kds/.test(text)) return 'cocina';
  if (/mesero|camarer|salon/.test(text)) return 'mesero';
  if (/cajer|caja/.test(text)) return 'cajero';
  if (/admin/.test(text)) return 'administrador';
  if (/client|comensal/.test(text)) return 'cliente';
  return text;
}

const SYSTEM_ACTOR = /^(?:sistema|servicio|api|base de datos|proceso automatico|cron|scheduler)$/;

function actorsOf(requirement) {
  const raw = Array.isArray(requirement?.actores) ? requirement.actores : [requirement?.actores];
  return [...new Set(raw.flatMap((actor) => String(actor || '').split(/[,;|]/)).map(strip).filter((actor) => actor && !SYSTEM_ACTOR.test(actor)).map(canonicalRole))];
}

/** Roles de la pantalla; «Usuario» (genérico) o vacío significa que no se sabe, y entonces no restringe. */
function rolesOf(screen) {
  return [...new Set((Array.isArray(screen?.roles) ? screen.roles : []).map(canonicalRole).filter((role) => role && role !== 'usuario'))];
}

/** Plataforma que el propio requisito exige en su redacción (nombre y descripción); null si no dice o dice ambas. */
function platformOfRequirement(requirement) {
  const text = strip(`${requirement?.nombre || ''} ${requirement?.descripcion || ''}`);
  const web = /\b(?:interfaz|modulo|panel|pantalla|version|aplicacion|app)\s+web\b|\bnavegador\b|\bweb\s+(?:del|de la|interna)\b/.test(text);
  const mobile = /\b(?:aplicacion|app|interfaz|pantalla)\s+movil\b|\bdispositivo movil\b/.test(text);
  if (web && !mobile) return PlatformPolicy.WEB;
  if (mobile && !web) return PlatformPolicy.MOBILE;
  return null;
}

/** ¿Puede el requisito mostrarse en la pantalla? `motivo` explica por qué no, para los avisos. */
function check(requirement, screen) {
  const actors = actorsOf(requirement);
  const roles = rolesOf(screen);
  if (actors.length && roles.length && !actors.some((actor) => roles.includes(actor))) {
    return { compatible: false, motivo: `lo ejecuta ${actors.join(' / ')}, y esta pantalla es de ${roles.join(' / ')}` };
  }
  const wanted = platformOfRequirement(requirement);
  const actual = PlatformPolicy.declared(screen);
  if (wanted && actual && wanted !== actual) {
    return { compatible: false, motivo: `pide la plataforma ${wanted} y esta pantalla es ${actual}` };
  }
  return { compatible: true, motivo: '' };
}

module.exports = { canonicalRole, actorsOf, rolesOf, platformOfRequirement, check, compatible: (requirement, screen) => check(requirement, screen).compatible };
