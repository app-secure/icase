/**
 * Nombre legible de un campo o entidad del dominio para mostrarlo a una persona: «passwordHash» → «Contraseña»,
 * «fechaHoraLlegadaPrevista» → «Fecha y hora llegada prevista», «cliente_id» → «Cliente».
 * Es solo presentación: el identificador técnico no cambia.
 */
const SPECIAL = new Map([
  ['passwordhash', 'Contraseña'], ['password', 'Contraseña'], ['contrasena', 'Contraseña'],
  ['correo', 'Correo electrónico'], ['email', 'Correo electrónico']
]);

function humanize(name) {
  const raw = String(name || '').trim();
  if (!raw) return '';
  const key = raw.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
  if (SPECIAL.has(key)) return SPECIAL.get(key);
  const words = raw
    .replace(/(?:_|\b)id$/i, '')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .trim()
    .toLowerCase()
    .replace(/\bfecha hora\b/, 'fecha y hora');
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : raw;
}

module.exports = { humanize };
