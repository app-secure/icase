/**
 * Una pantalla pertenece a exactamente una aplicación: web o móvil. Esta política es la única fuente de esa decisión,
 * para que el árbol de navegación, los mockups, el código y la vista previa no la reinterpreten cada uno por su cuenta.
 *
 * La plataforma declarada de la pantalla manda. Si falta (proyectos importados o árboles antiguos), se infiere de marcas
 * explícitas en su módulo, flujo, ruta o nombre. La tableta es una variante responsiva de la aplicación web.
 */
const MOBILE = 'móvil';
const WEB = 'web';

const strip = (value) => String(value || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const MOBILE_WORDS = /\b(?:movil|mobile|android|ios|expo|react native|smartphone)\b/;
const WEB_WORDS = /\b(?:web|escritorio|desktop|tablet|tableta)\b/;

/** Plataforma declarada ('web' | 'móvil'), o null si la pantalla no la trae. */
function declared(screen) {
  const value = strip(screen?.plataforma);
  if (!value) return null;
  if (MOBILE_WORDS.test(value)) return MOBILE;
  if (WEB_WORDS.test(value)) return WEB;
  return null;
}

/** Aplicación a la que pertenece la pantalla. */
function of(screen) {
  const explicit = declared(screen);
  if (explicit) return explicit;
  const text = strip([screen?.modulo, screen?.flujo, screen?.ruta, screen?.nombre, screen?.nombre_visible].filter(Boolean).join(' '));
  if (MOBILE_WORDS.test(text) && !WEB_WORDS.test(text)) return MOBILE;
  return WEB;
}

/** Cuántas pantallas pertenecen a cada aplicación. */
function count(screens = []) {
  return (screens || []).reduce((total, screen) => ({ ...total, [of(screen)]: total[of(screen)] + 1 }), { [WEB]: 0, [MOBILE]: 0 });
}

/** Aplicaciones que el árbol necesita y la selección de plataformas no incluye. */
function missing(screens = [], selected = [WEB]) {
  const chosen = new Set((selected || []).map((item) => (MOBILE_WORDS.test(strip(item)) ? MOBILE : WEB)));
  const needed = count(screens);
  return [WEB, MOBILE].filter((app) => needed[app] > 0 && !chosen.has(app));
}

module.exports = { WEB, MOBILE, of, declared, count, missing };
