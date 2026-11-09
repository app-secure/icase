const { parse } = require('parse5');

const VOID_ELEMENTS = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr'
]);

const ATTR_MAP = {
  class: 'className',
  for: 'htmlFor',
  'stroke-width': 'strokeWidth',
  'stroke-linecap': 'strokeLinecap',
  'stroke-linejoin': 'strokeLinejoin',
  viewbox: 'viewBox',
  readonly: 'readOnly',
  tabindex: 'tabIndex',
  autocomplete: 'autoComplete',
  autofocus: 'autoFocus'
};

function parseStyleString(styleStr) {
  const obj = {};
  if (!styleStr || typeof styleStr !== 'string') return obj;
  styleStr.split(';').forEach((pair) => {
    const idx = pair.indexOf(':');
    if (idx > -1) {
      const rawProp = pair.substring(0, idx).trim();
      const val = pair.substring(idx + 1).trim();
      if (rawProp && val) {
        const prop = rawProp.startsWith('--') ? rawProp : rawProp.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
        obj[prop] = val;
      }
    }
  });
  return obj;
}

const typeAttr = (node) => (node.attrs || []).find((attr) => attr.name.toLowerCase() === 'type')?.value || '';

/** Un atributo JSX con comillas literales no admite escapes: si el valor las trae (o `\`, `&`, saltos de línea) va como expresión. */
function attrValue(val) {
  const json = JSON.stringify(val);
  return /["\\&\n\r\u2028\u2029]/.test(val) ? `{${json}}` : json;
}

function nodeToJsx(node) {
  if (node.nodeName === '#text') {
    const val = node.value || '';
    return val.replace(/([{}])/g, '{"$1"}').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  if (node.nodeName === '#comment') return '';
  const tag = node.tagName;
  if (!tag) return '';
  if (['script', 'iframe', 'meta', 'link', 'style'].includes(tag)) return '';

  const attrs = [];
  for (const attr of node.attrs || []) {
    let name = ATTR_MAP[attr.name.toLowerCase()] || attr.name;
    const val = attr.value;
    if (name.startsWith('on')) continue; // omitir scripts inline
    // Un value/checked fijo sin onChange vuelve el campo de solo lectura en React.
    if (name === 'checked') name = 'defaultChecked';
    else if (name === 'value' && ['input', 'textarea', 'select'].includes(tag)
      && !['checkbox', 'radio'].includes(String(typeAttr(node)).toLowerCase())) name = 'defaultValue';
    if (name === 'style') {
      const styleObj = parseStyleString(val);
      attrs.push(`style={${JSON.stringify(styleObj)}}`);
    } else if (name === 'disabled' || name === 'readOnly' || name === 'required' || name === 'defaultChecked') {
      attrs.push(name);
    } else {
      attrs.push(`${name}=${attrValue(val)}`);
    }
  }

  const attrStr = attrs.length ? ' ' + attrs.join(' ') : '';
  const isVoid = VOID_ELEMENTS.has(tag);
  if (isVoid) {
    return `<${tag}${attrStr} />`;
  }

  const children = (node.childNodes || []).map(nodeToJsx).join('');
  return `<${tag}${attrStr}>${children}</${tag}>`;
}

class HtmlToJsxTransformer {
  static transform(html) {
    if (!html || typeof html !== 'string') return '';
    const doc = parse(html);
    const findBody = (n) => {
      if (n.tagName === 'body') return n;
      for (const child of n.childNodes || []) {
        const b = findBody(child);
        if (b) return b;
      }
      return null;
    };
    const body = findBody(doc) || doc;
    return (body.childNodes || []).map(nodeToJsx).join('').trim();
  }
}

module.exports = HtmlToJsxTransformer;

