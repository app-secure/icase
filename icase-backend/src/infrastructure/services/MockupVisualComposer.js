const { parse, serialize } = require('parse5');
const escape = value => String(value || '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
function find(node, tag) {
  if (node.tagName === tag) return node;
  for (const child of node.childNodes || []) { const match = find(child, tag); if (match) return match; }
}
function strip(node) {
  node.childNodes = (node.childNodes || []).filter(child => !['header', 'nav', 'footer', 'aside'].includes(child.tagName));
  node.childNodes.forEach(strip);
}
exports.compose = function(html, { screen = {}, manifest = [], identity = {}, name = '' } = {}) {
  if (!html || !String(html).trim()) return '';
  const document = parse(String(html));
  const main = find(document, 'main');
  const content = main || find(document, 'body');
  strip(content);
  const fragment = serialize(content);
  const styles = [];
  function collect(node) { if (node.tagName === 'style') styles.push(serialize(node)); (node.childNodes || []).forEach(collect); }
  collect(document);
  const mobile = screen.plataforma === 'mobile';
  const compact = mobile || screen.plataforma === 'tablet';
  const links = manifest.filter(item => item.shell === screen.shell).map(item => `<a href="#${escape(item.slug)}" data-accion="ui" ${item.slug === screen.slug ? 'aria-current="page"' : ''}>${escape(item.nombre)}</a>`).join('');
  const brand = escape(identity.nombre_aplicacion || name);
  const logo = identity.logo ? `<img src="${escape(identity.logo)}" alt="" width="32" height="32">` : '';
  return `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><script src="https://cdn.tailwindcss.com"></script><style>${styles.join('\n')}</style><style>
  *{box-sizing:border-box}html,body{margin:0;width:100%;height:100%;font-family:Inter,Arial,sans-serif;background:var(--icase-bg,#f8fafc);color:var(--icase-text,#0f172a)}
  .icase-shell{height:100dvh;display:flex;flex-direction:column;overflow:hidden}.icase-shell>header{display:flex;align-items:center;gap:12px;padding:16px 20px;background:var(--icase-surface,#fff);border-bottom:1px solid #e2e8f0;flex-shrink:0}.icase-shell>header img{object-fit:contain}.icase-layout{display:flex;flex:1;min-height:0}.icase-nav{width:230px;flex-shrink:0;padding:12px;border-right:1px solid #e2e8f0;background:var(--icase-surface,#fff);overflow:auto}.icase-nav a{display:block;padding:10px;border-radius:8px;overflow-wrap:anywhere}.icase-nav a[aria-current]{background:var(--icase-primary,#0b57d0);color:white}.icase-content{padding:20px;flex:1;min-width:0;overflow:auto;overscroll-behavior:contain}.icase-content>main{width:auto!important;height:auto!important;min-height:0!important}.icase-menu{padding:8px 16px;border-bottom:1px solid #e2e8f0;background:var(--icase-surface,#fff)}.icase-menu summary{cursor:pointer}.icase-menu .icase-nav{width:100%;max-height:240px;border:0}.icase-content input,.icase-content select{max-width:100%}.icase-content table{display:block;max-width:100%;overflow:auto}
  </style></head><body><div class="icase-shell" data-icase-shell-version="1"><header>${logo}<strong>${brand}</strong></header>${compact ? `<details class="icase-menu"><summary>Menú</summary><nav class="icase-nav">${links}</nav></details>` : ''}<div class="icase-layout">${compact ? '' : `<nav class="icase-nav">${links}</nav>`}<main class="icase-content">${fragment}</main></div></div></body></html>`;
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
