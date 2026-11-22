const parse5 = require('parse5');
/** Conserva el diseño, elimina ejecución/redirecciones antes de entregar HTML a Chromium. */
function sanitizeMockup(source) {
  const document = parse5.parse(String(source || ''));
  const banned = new Set(['script', 'iframe', 'object', 'embed', 'base']);
  const visit = node => {
    if (node.attrs) node.attrs = node.attrs.filter(attr => !/^on/i.test(attr.name) && !(['href', 'src', 'action', 'formaction', 'xlink:href'].includes(attr.name) && /^\s*(?:javascript|vbscript|data:text\/html):/i.test(attr.value)) && !(node.tagName === 'meta' && attr.name === 'http-equiv'));
    if (node.childNodes) { node.childNodes = node.childNodes.filter(child => !banned.has(child.tagName) && !(child.tagName === 'meta' && child.attrs?.some(attr => attr.name === 'http-equiv'))); node.childNodes.forEach(visit); }
  };
  visit(document); return parse5.serialize(document);
}
module.exports = { sanitizeMockup };
