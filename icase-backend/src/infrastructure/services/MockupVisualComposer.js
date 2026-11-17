const { parse, serialize } = require('parse5');
const PlatformPolicy = require('../../core/services/PlatformPolicy');
const escape = value => String(value || '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
const plain = value => String(value || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
function find(node, tag) {
  if (node.tagName === tag) return node;
  for (const child of node.childNodes || []) { const match = find(child, tag); if (match) return match; }
}
function strip(node) {
  node.childNodes = (node.childNodes || []).filter(child => !['header', 'nav', 'footer', 'aside'].includes(child.tagName));
  node.childNodes.forEach(strip);
}

const SHELL_VERSION = '2';
const TAB_LIMIT = 4;

const textOf = (node) => (node.nodeName === '#text' ? node.value : (node.childNodes || []).map(textOf).join(' ')).replace(/\s+/g, ' ').trim();
const attrOf = (node, name) => (node.attrs || []).find((item) => item.name === name)?.value || '';
function eachNode(node, visit, parent = null) {
  [...(node.childNodes || [])].forEach((child) => eachNode(child, visit, node));
  visit(node, parent);
}

/**
 * Un indicador de estado es un círculo pequeño de tamaño fijo; el modelo a veces pone el texto DENTRO del círculo y la
 * etiqueta se aplasta y se superpone. Se saca el contenido del círculo y queda a su lado.
 */
function repairIndicators(root) {
  const small = /(?:^|\s)(?:w|h|size)-(?:[1-6]|\[(?:[0-9]|1[0-9]|2[0-4])px\])(?:\s|$)/;
  eachNode(root, (node, parent) => {
    if (!parent || !node.tagName || !/(?:^|\s)rounded-full(?:\s|$)/.test(attrOf(node, 'class')) || !small.test(attrOf(node, 'class'))) return;
    if (!textOf(node)) return;
    const children = node.childNodes || [];
    node.childNodes = [];
    const siblings = parent.childNodes;
    siblings.splice(siblings.indexOf(node) + 1, 0, ...children.map((child) => Object.assign(child, { parentNode: parent })));
  });
}

/**
 * En el acceso la cabecera ya muestra el nombre de la aplicación: dentro de la tarjeta sobran el nombre repetido y el
 * subtítulo que nombra el módulo o el flujo («Aplicación Móvil de Clientes»). Solo se quitan textos que coinciden exactamente.
 */
function scrubAccess(root, { brand = '', screen = {} } = {}) {
  const unwanted = new Set([brand, screen.modulo, screen.flujo].map(plain).filter(Boolean));
  if (!unwanted.size) return;
  const tags = new Set(['h1', 'h2', 'h3', 'p', 'span', 'small', 'strong', 'div']);
  eachNode(root, (node, parent) => {
    if (!parent || !tags.has(node.tagName)) return;
    const hasElements = (node.childNodes || []).some((child) => child.tagName);
    if (hasElements && node.tagName === 'div') return;
    if (unwanted.has(plain(textOf(node))) && !(node.childNodes || []).some((child) => ['input', 'button', 'form'].includes(child.tagName))) {
      parent.childNodes = parent.childNodes.filter((child) => child !== node);
    }
  });
  // Contenedores que se quedaron vacíos (el bloque centrado del título) también se quitan.
  eachNode(root, (node, parent) => {
    if (parent && node.tagName === 'div' && !textOf(node) && !(node.childNodes || []).some((child) => child.tagName)) parent.childNodes = parent.childNodes.filter((child) => child !== node);
  });
}

// Pantallas de segundo nivel: se llega a ellas desde otra y no son un destino de la barra inferior.
const SECONDARY = /\b(?:detalle|formulario|confirmacion|confirmar|editar|edicion|nuevo|nueva|crear|registro de)\b/;
const isPrimary = (item) => !SECONDARY.test(plain(item.nombre));

/** Etiqueta corta para una pestaña: sin «Vista de» / «Formulario de» y limitada en longitud. */
function shortLabel(name) {
  const text = String(name || '').replace(/^(?:vista|pantalla|formulario|listado)\s+de\s+(?:la\s+|el\s+|los\s+|las\s+)?/i, '').trim();
  let label = text.charAt(0).toUpperCase() + text.slice(1);
  // «Menú Digital con Precios y Disponibilidad» → «Menú Digital»: se corta en la primera conjunción si es larga.
  if (label.length > 16) label = label.split(/\s+(?:con|y|para|por)\s+/i)[0] || label;
  return label.length > 22 ? `${label.slice(0, 21).trim()}…` : label;
}

/**
 * Estructura de la pantalla según su tipo. La define el código, nunca el modelo:
 *  - auth: acceso y registro; sin menú ni navegación a otras pantallas, centrado.
 *  - mobile: marco de teléfono con barra de pestañas inferior.
 *  - tablet: cabecera con menú desplegable.
 *  - web: barra lateral con las pantallas del mismo flujo.
 */
function kindOf(screen = {}) {
  const text = plain([screen.shell, screen.slug, screen.nombre, screen.nombre_pantalla, screen.nombre_visible].filter(Boolean).join(' '));
  if (/(?:^|[\s-])auth(?:[\s-]|$)|iniciar sesion|inicio de sesion|\blogin\b|\bautentic\w*|recuperar contrasena|restablecer contrasena|registro de usuario|crear cuenta/.test(text)) return 'auth';
  if (PlatformPolicy.declared(screen) === PlatformPolicy.MOBILE || screen.plataforma === 'mobile') return 'mobile';
  if (screen.plataforma === 'tablet') return 'tablet';
  return 'web';
}

const STYLE = `
  *{box-sizing:border-box}html,body{margin:0;width:100%;height:100%;font-family:Inter,Arial,sans-serif;background:var(--icase-bg,#f8fafc);color:var(--icase-text,#0f172a)}
  .icase-shell{height:100dvh;display:flex;flex-direction:column;overflow:hidden}.icase-shell>header{display:flex;align-items:center;gap:12px;padding:16px 20px;background:var(--icase-surface,#fff);border-bottom:1px solid #e2e8f0;flex-shrink:0}.icase-shell>header img{object-fit:contain}
  .icase-layout{display:flex;flex:1;min-height:0}.icase-nav{width:230px;flex-shrink:0;padding:12px;border-right:1px solid #e2e8f0;background:var(--icase-surface,#fff);overflow:auto}.icase-nav a{display:block;padding:10px;border-radius:8px;overflow-wrap:anywhere}.icase-nav a[aria-current]{background:var(--icase-primary,#0b57d0);color:white}
  .icase-content{padding:20px;flex:1;min-width:0;overflow:auto;overscroll-behavior:contain}.icase-content>main{width:auto!important;height:auto!important;min-height:0!important}
  .icase-menu{padding:8px 16px;border-bottom:1px solid #e2e8f0;background:var(--icase-surface,#fff)}.icase-menu summary{cursor:pointer}.icase-menu .icase-nav{width:100%;max-height:240px;border:0}
  .icase-content input,.icase-content select,.icase-content textarea{max-width:100%}.icase-content table{display:block;max-width:100%;overflow:auto}
  .icase-content img,.icase-content svg,.icase-content video,.icase-content canvas{max-width:100%;height:auto}
  .icase-content form{max-width:100%}.icase-content .h-screen,.icase-content .min-h-screen{height:auto!important;min-height:0!important}.icase-content .w-screen{width:100%!important}
  .icase-content .fixed{position:sticky!important}
  .icase-auth .icase-content{display:grid;place-items:center;padding:24px}.icase-auth .icase-content>main{width:100%!important;max-width:440px}
  .icase-mobile{max-width:430px;margin:0 auto;border-inline:1px solid #e2e8f0;background:var(--icase-bg,#f8fafc)}.icase-mobile .icase-content{padding:16px}
  .icase-mobile .icase-content .grid{grid-template-columns:minmax(0,1fr)!important}.icase-mobile .icase-content [class*="col-span"]{grid-column:auto!important}
  .icase-tabbar{display:flex;flex-shrink:0;align-items:stretch;border-top:1px solid #e2e8f0;background:var(--icase-surface,#fff)}
  .icase-tabbar a,.icase-tabbar summary{flex:1;min-width:0;padding:10px 4px;text-align:center;font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;cursor:pointer;list-style:none}
  .icase-tabbar a[aria-current]{color:var(--icase-primary,#0b57d0);font-weight:600;box-shadow:inset 0 2px 0 var(--icase-primary,#0b57d0)}
  .icase-tabbar details{flex:1;position:relative}.icase-tabbar details[open]>div{position:absolute;bottom:100%;right:0;min-width:180px;background:var(--icase-surface,#fff);border:1px solid #e2e8f0;border-radius:8px;box-shadow:0 4px 12px rgba(0,0,0,.12)}
  .icase-tabbar details>div a{display:block;text-align:left;padding:10px 12px;font-size:13px;white-space:normal}
  .icase-back{font-size:22px;line-height:1;text-decoration:none;padding:2px 10px 2px 0;color:var(--icase-primary,#0b57d0)}
`;

const link = (item, current) => `<a href="#${escape(item.slug)}" data-accion="ui" ${item.slug === current ? 'aria-current="page"' : ''}>${escape(item.nombre)}</a>`;

/**
 * Hasta cuatro pestañas: solo los destinos de primer nivel del flujo. El resto de pantallas se alcanza desde botones
 * dentro de las pantallas (un flujo no es un menú), y las de segundo nivel traen botón «volver».
 */
function tabs(items, current) {
  const primary = items.filter(isPrimary);
  const visible = primary.slice(0, TAB_LIMIT);
  if (!visible.some(item => item.slug === current)) { const active = primary.find(item => item.slug === current); if (active) visible[visible.length - 1] = active; }
  return visible.map(item => `<a href="#${escape(item.slug)}" data-accion="ui" ${item.slug === current ? 'aria-current="page"' : ''}>${escape(shortLabel(item.nombre))}</a>`).join('');
}

/** Destino del botón «volver» de una pantalla de segundo nivel: el destino de primer nivel anterior en el flujo. */
function backTarget(items, current) {
  const index = items.findIndex(item => item.slug === current);
  const before = items.slice(0, index < 0 ? 0 : index).filter(isPrimary);
  return before[before.length - 1] || items.find(isPrimary) || null;
}

exports.kindOf = kindOf;
exports.SHELL_VERSION = SHELL_VERSION;

exports.compose = function(html, { screen = {}, manifest = [], identity = {}, name = '' } = {}) {
  if (!html || !String(html).trim()) return '';
  const document = parse(String(html));
  const main = find(document, 'main');
  const content = main || find(document, 'body');
  strip(content);
  repairIndicators(content);
  const kind = kindOf(screen);
  if (kind === 'auth') scrubAccess(content, { brand: identity.nombre_aplicacion || name, screen });
  const fragment = serialize(content);
  const styles = [];
  function collect(node) { if (node.tagName === 'style' && !(node.attrs || []).some(attr => attr.name === 'data-icase-shell')) styles.push(serialize(node)); (node.childNodes || []).forEach(collect); }
  collect(document);
  const siblings = manifest.filter(item => item.shell === screen.shell && kindOf(item) !== 'auth');
  const brand = escape(identity.nombre_aplicacion || name);
  const logo = identity.logo ? `<img src="${escape(identity.logo)}" alt="" width="32" height="32">` : '';
  // En móvil, las pantallas de segundo nivel traen un botón «volver» al destino anterior del flujo.
  const back = kind === 'mobile' && !isPrimary(screen) ? backTarget(siblings, screen.slug) : null;
  const backLink = back ? `<a class="icase-back" href="#${escape(back.slug)}" data-accion="ui" aria-label="Volver">‹</a>` : '';
  const header = `<header>${backLink}${logo}<strong>${brand}</strong></header>`;
  const body = {
    auth: `${header}<main class="icase-content">${fragment}</main>`,
    mobile: `${header}<main class="icase-content">${fragment}</main><nav class="icase-tabbar" aria-label="Navegación principal">${tabs(siblings, screen.slug)}</nav>`,
    tablet: `${header}<details class="icase-menu"><summary>Menú</summary><nav class="icase-nav">${siblings.map(item => link(item, screen.slug)).join('')}</nav></details><div class="icase-layout"><main class="icase-content">${fragment}</main></div>`,
    web: `${header}<div class="icase-layout"><nav class="icase-nav">${siblings.map(item => link(item, screen.slug)).join('')}</nav><main class="icase-content">${fragment}</main></div>`
  }[kind];
  return `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><script src="https://cdn.tailwindcss.com"></script><style>${styles.join('\n')}</style><style data-icase-shell>${STYLE}</style></head><body><div class="icase-shell${kind === 'auth' ? ' icase-auth' : kind === 'mobile' ? ' icase-mobile' : ''}" data-icase-shell-version="${SHELL_VERSION}" data-icase-kind="${kind}">${body}</div></body></html>
`;
};

exports.interfaceContext = function(requirements, screen = {}) {
  const roles = (screen.roles || []).map(r => r.toLowerCase());
  return requirements.filter(r => {
    if (String(r.tipo).toUpperCase() !== 'RNF') return false;
    const text = `${r.nombre || ''} ${r.descripcion || ''} ${r.metrica_medible || ''}`;
    if (!/interfaz|usabilidad|accesib|pantalla|bot[oó]n|estado.*visib|dispositivo/i.test(text)) return false;
    return !r.actores?.length || r.actores.some(actor => roles.includes(String(actor).toLowerCase()));
  }).map(r => `[${r.identificador}] ${r.nombre || ''}: ${r.descripcion || ''} ${r.metrica_medible || ''}`).join('\n');
};
