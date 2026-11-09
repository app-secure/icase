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

/** Destino de un enlace interno a una ruta conocida de la aplicación; `null` si debe seguir siendo un `<a>`. */
function internalLink(node, context) {
  if (!context?.routes?.size) return null;
  const attrs = node.attrs || [];
  if (attrs.some((attr) => attr.name === 'data-accion')) return null;
  const href = (attrs.find((attr) => attr.name === 'href')?.value || '').trim();
  if (!href.startsWith('/') || href.startsWith('//')) return null;
  const route = href.split(/[?#]/)[0].replace(/(.)\/$/, '$1');
  return context.routes.has(route) ? href : null;
}

const ACTION = /^(RF-\d+)\.(consultar|crear|editar|eliminar)$/i;

/** `onClick` solo para un `data-accion` válido cuya operación existe; cualquier otro control queda inerte. */
function actionHandler(node, context) {
  if (!context?.operaciones?.size) return '';
  const declared = (node.attrs || []).find((attr) => attr.name === 'data-accion')?.value.trim() || '';
  const match = ACTION.exec(declared);
  const operation = match && match[1].toLowerCase();
  return match && context.operaciones.has(operation)
    ? ` onClick={(event) => handleAction(event, ${JSON.stringify(operation)}, ${JSON.stringify(match[2].toLowerCase())})}`
    : '';
}

function nodeToJsx(node, context = null) {
  if (node.nodeName === '#text') {
    const val = node.value || '';
    return val.replace(/([{}])/g, '{"$1"}').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  if (node.nodeName === '#comment') return '';
  const tag = node.tagName;
  if (!tag) return '';
  if (['script', 'iframe', 'meta', 'link', 'style'].includes(tag)) return '';

  const linkTo = tag === 'a' ? internalLink(node, context) : null;
  const outTag = linkTo ? 'Link' : tag;
  const attrs = [];
  for (const attr of node.attrs || []) {
    let name = ATTR_MAP[attr.name.toLowerCase()] || attr.name;
    const val = attr.value;
    if (name.startsWith('on')) continue; // omitir scripts inline
    if (linkTo && name === 'href') { attrs.push(`to=${attrValue(linkTo)}`); continue; }
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

  const attrStr = (attrs.length ? ' ' + attrs.join(' ') : '') + actionHandler(node, context);
  const isVoid = VOID_ELEMENTS.has(tag);
  if (isVoid) {
    return `<${outTag}${attrStr} />`;
  }

  const children = (node.childNodes || []).map((child) => nodeToJsx(child, context)).join('');
  return `<${outTag}${attrStr}>${children}</${outTag}>`;
}

const MAX_CSS_DEPTH = 8;
const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** Cadenas CSS entre comillas, con escapes. */
const STRINGS = /"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g;

/** Quita los comentarios sin tocar los marcadores que estén dentro de una cadena. */
function stripComments(css) {
  let out = '';
  let quote = '';
  for (let i = 0; i < css.length; i += 1) {
    const ch = css[i];
    if (quote) {
      out += ch;
      if (ch === '\\') { out += css[i + 1] || ''; i += 1; } else if (ch === quote) quote = '';
      continue;
    }
    if (ch === '"' || ch === "'") { quote = ch; out += ch; continue; }
    if (ch === '/' && css[i + 1] === '*') {
      const end = css.indexOf('*/', i + 2);
      if (end === -1) break;
      i = end + 1;
      out += ' ';
      continue;
    }
    out += ch;
  }
  return out;
}

/** Índice del primer carácter de `chars` fuera de cadenas y paréntesis, a partir de `from`; -1 si no hay. */
function findTopLevel(css, from, chars) {
  let quote = '';
  let depth = 0;
  for (let i = from; i < css.length; i += 1) {
    const ch = css[i];
    if (quote) { if (ch === '\\') i += 1; else if (ch === quote) quote = ''; continue; }
    if (ch === '\\') { i += 1; continue; }
    if (ch === '"' || ch === "'") { quote = ch; continue; }
    if (ch === '(') depth += 1;
    else if (ch === ')') depth = Math.max(0, depth - 1);
    else if (depth === 0 && chars.includes(ch)) return i;
  }
  return -1;
}

/** Índice de la llave que cierra el bloque abierto en `open`; -1 si no se cierra (se descarta el resto). */
function findBlockEnd(css, open) {
  let depth = 1;
  let i = open + 1;
  while (i < css.length) {
    const next = findTopLevel(css, i, '{}');
    if (next === -1) return -1;
    depth += css[next] === '{' ? 1 : -1;
    if (depth === 0) return next;
    i = next + 1;
  }
  return -1;
}

/** Divide por `separator` fuera de cadenas y paréntesis. */
function splitTopLevel(text, separator) {
  const parts = [];
  let from = 0;
  for (;;) {
    const at = findTopLevel(text, from, separator);
    if (at === -1) { parts.push(text.slice(from)); return parts; }
    parts.push(text.slice(from, at));
    from = at + 1;
  }
}

const BLOCKED_PROPERTY = /^(?:behavior|-moz-binding)$/i;
const BLOCKED_VALUE = /(?:^|[^\w-])(?:image-set|-webkit-image-set|image|src|cross-fade|element|expression)\s*\(/i;

/** Solo se admiten declaraciones sin recursos externos: url(data:...) y url(#fragmento), sin escapes ni funciones de carga. */
function allowedDeclaration(declaration) {
  const bare = declaration.replace(STRINGS, '""');
  const colon = bare.indexOf(':');
  if (colon < 1 || bare.includes('\\')) return false;
  if (BLOCKED_PROPERTY.test(bare.slice(0, colon).trim()) || BLOCKED_VALUE.test(bare.slice(colon + 1))) return false;
  return !/url\(\s*(?!['"]?\s*(?:data:|#))/i.test(declaration);
}

function cleanDeclarations(body, rename = null) {
  return splitTopLevel(body, ';').map((item) => item.trim()).filter(Boolean).filter(allowedDeclaration)
    .map((item) => (rename && /^(?:-webkit-)?animation(?:-name)?\s*:/i.test(item) ? rename(item) : item)).join(';');
}

function scopeSelector(selector, scope) {
  if (!selector) return '';
  const root = /^(html|body|:root)(?![\w-])(.*)$/i.exec(selector);
  return root ? `${scope}${root[2]}` : `${scope} ${selector}`;
}

function sanitizeKeyframes(body) {
  let out = '';
  let i = 0;
  while (i < body.length) {
    const open = findTopLevel(body, i, '{');
    if (open === -1) break;
    const end = findBlockEnd(body, open);
    if (end === -1) break;
    const selector = body.slice(i, open).trim();
    const declarations = cleanDeclarations(body.slice(open + 1, end));
    if (selector && declarations) out += `${selector}{${declarations}}`;
    i = end + 1;
  }
  return out;
}

function scopeBlocks(css, scope, depth, names) {
  if (depth > MAX_CSS_DEPTH) return '';
  const prefix = `${scope.replace(/^\./, '')}-`;
  // Los @keyframes se renombran con el ámbito: así un mockup no pisa las animaciones del resto de la aplicación.
  const rename = (value) => names.reduce((acc, name) => acc.replace(new RegExp(`(?<![\\w-])${escapeRegExp(name)}(?![\\w-])`, 'g'), `${prefix}${name}`), value);
  let out = '';
  let i = 0;
  while (i < css.length) {
    const open = findTopLevel(css, i, '{');
    const semicolon = findTopLevel(css, i, ';');
    if (open === -1 && semicolon === -1) break;
    // Una regla @ sin bloque (@import, @charset, @namespace) se descarta.
    if (semicolon !== -1 && (open === -1 || semicolon < open)) { i = semicolon + 1; continue; }
    const end = findBlockEnd(css, open);
    if (end === -1) break; // sin cierre: se descarta el resto
    const prelude = css.slice(i, open).trim();
    const body = css.slice(open + 1, end);
    i = end + 1;
    if (prelude.startsWith('@')) {
      const name = ((/^@([\w-]+)/.exec(prelude) || [])[1] || '').toLowerCase();
      if (['media', 'supports', 'layer', 'container'].includes(name)) {
        const inner = scopeBlocks(body, scope, depth + 1, names);
        if (inner) out += `${prelude}{${inner}}`;
      } else if (name.endsWith('keyframes')) {
        out += `${prelude.replace(/^(@(?:-webkit-)?keyframes\s+)([\w-]+)/i, (_, head, keyframes) => head + prefix + keyframes)}{${sanitizeKeyframes(body)}}`;
      }
      // @font-face, @property, @page, @counter-style, @scope y demás reglas con efecto global se descartan.
      continue;
    }
    const declarations = cleanDeclarations(body, rename);
    if (!declarations || !prelude) continue;
    const selectors = [...new Set(splitTopLevel(prelude, ',').map((item) => scopeSelector(item.trim(), scope)).filter(Boolean))];
    out += `${selectors.join(',')}{${declarations}}`;
  }
  return out;
}

/**
 * Lee `tailwind.config = { ... }` como datos, sin ejecutar nada: solo objetos, arreglos, cadenas, números y booleanos.
 * Cualquier otra cosa (llamadas, accesos, código añadido después) hace que devuelva `null`.
 */
function parseTailwindConfig(source) {
  const start = /tailwind\.config\s*=\s*/.exec(source);
  if (!start) return null;
  const text = source.slice(start.index + start[0].length);
  let i = 0;
  const fail = () => { throw new Error('configuración no admitida'); };
  const skip = () => {
    for (;;) {
      while (/\s/.test(text[i] || '')) i += 1;
      if (text.startsWith('//', i)) { while (i < text.length && text[i] !== '\n') i += 1; }
      else if (text.startsWith('/*', i)) { const end = text.indexOf('*/', i + 2); if (end < 0) fail(); i = end + 2; }
      else return;
    }
  };
  const string = () => {
    const quote = text[i]; i += 1;
    let result = '';
    while (i < text.length && text[i] !== quote) {
      if (text[i] === '\\') { i += 1; const escaped = text[i]; if (escaped === 'n') result += '\n'; else if ('\\\'"/'.includes(escaped || '\0')) result += escaped; else fail(); }
      else if (text[i] === '\n') fail();
      else result += text[i];
      i += 1;
    }
    if (text[i] !== quote) fail();
    i += 1;
    return result;
  };
  const number = () => { const match = /^-?\d+(\.\d+)?/.exec(text.slice(i)); if (!match) fail(); i += match[0].length; return Number(match[0]); };
  const key = () => {
    skip();
    if (text[i] === '"' || text[i] === "'") return string();
    const match = /^[A-Za-z_$][\w$-]*|^\d+/.exec(text.slice(i));
    if (!match) fail();
    i += match[0].length;
    return match[0];
  };
  const value = () => {
    skip();
    const c = text[i];
    if (c === '{') return object();
    if (c === '[') return array();
    if (c === '"' || c === "'") return string();
    if (c !== undefined && /[-\d]/.test(c)) return number();
    for (const [word, literal] of [['true', true], ['false', false], ['null', null]]) {
      if (text.startsWith(word, i) && !/[\w$]/.test(text[i + word.length] || '')) { i += word.length; return literal; }
    }
    return fail();
  };
  const object = () => {
    i += 1;
    const result = {};
    for (;;) {
      skip();
      if (text[i] === '}') { i += 1; return result; }
      const name = key();
      if (['__proto__', 'constructor', 'prototype'].includes(name)) fail();
      skip();
      if (text[i] !== ':') fail();
      i += 1;
      result[name] = value();
      skip();
      if (text[i] === ',') { i += 1; continue; }
      if (text[i] !== '}') fail();
    }
  };
  const array = () => {
    i += 1;
    const result = [];
    for (;;) {
      skip();
      if (text[i] === ']') { i += 1; return result; }
      result.push(value());
      skip();
      if (text[i] === ',') { i += 1; continue; }
      if (text[i] !== ']') fail();
    }
  };
  try {
    skip();
    if (text[i] !== '{') return null;
    const result = object();
    skip();
    if (text[i] === ';') i += 1;
    skip();
    return i >= text.length ? result : null;
  } catch { return null; }
}

const walk = (node, predicate) => [...(predicate(node) ? [node] : []), ...(node.childNodes || []).flatMap((child) => walk(child, predicate))];
const textOf = (node) => (node.childNodes || []).map((child) => child.value || '').join('');
const attrOf = (node, name) => (node.attrs || []).find((attr) => attr.name === name)?.value || '';

class HtmlToJsxTransformer {
  /**
   * Convierte el documento del mockup. `operaciones`: claves de operación a las que se pueden cablear los `data-accion`;
   * `routes`: rutas internas cuyos `<a href>` pasan a `<Link>`. Devuelve además lo que el JSX no conserva por sí solo:
   * el CSS de los `<style>`, las clases y el estilo del `<body>`, la configuración de Tailwind (como datos) y si el
   * mockup trae su propio menú. Los scripts nunca se copian.
   */
  static analyze(html, { operaciones = null, routes = null } = {}) {
    const empty = { jsx: '', css: '', bodyClassName: '', bodyStyle: {}, tailwindConfig: null, hasShell: false };
    if (!html || typeof html !== 'string') return empty;
    const context = operaciones || routes ? { operaciones: new Set(operaciones || []), routes: new Set(routes || []) } : null;
    const doc = parse(html);
    const body = walk(doc, (node) => node.tagName === 'body')[0] || doc;
    let tailwindConfig = null;
    for (const script of walk(doc, (node) => node.tagName === 'script')) {
      const source = textOf(script);
      if (source.includes('tailwind.config')) { tailwindConfig = parseTailwindConfig(source); if (tailwindConfig) break; }
    }
    return {
      jsx: (body.childNodes || []).map((child) => nodeToJsx(child, context)).join('').trim(),
      css: walk(doc, (node) => node.tagName === 'style').map(textOf).join('\n'),
      bodyClassName: attrOf(body, 'class').replace(/\s+/g, ' ').trim(),
      bodyStyle: parseStyleString(attrOf(body, 'style')),
      tailwindConfig,
      // Menú propio: un <aside>, o un <nav> con enlaces a varias pantallas de la aplicación.
      hasShell: walk(body, (node) => node.tagName === 'aside').length > 0
        || walk(body, (node) => node.tagName === 'nav').some((nav) => walk(nav, (node) => node.tagName === 'a' && internalLink(node, context)).length >= 2)
    };
  }

  static transform(html, options = {}) {
    return HtmlToJsxTransformer.analyze(html, options).jsx;
  }

  /**
   * Antepone `scope` a cada selector del CSS (html, body y :root pasan a ser el propio contenedor), elimina los recursos
   * externos y las reglas de efecto global, y descarta lo que no esté bien cerrado.
   */
  static scopeCss(css, scope) {
    try {
      const clean = stripComments(String(css || ''));
      const names = [...new Set([...clean.matchAll(/@(?:-webkit-)?keyframes\s+([\w-]+)/gi)].map((match) => match[1]))];
      return scopeBlocks(clean, scope, 0, names);
    } catch { return ''; }
  }

  /** Configuración de Tailwind leída como datos; `null` si trae cualquier cosa que no sea un literal. */
  static parseTailwindConfig(source) {
    return parseTailwindConfig(source);
  }
}

module.exports = HtmlToJsxTransformer;

