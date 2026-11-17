const { parse } = require('parse5');
const { kindOf } = require('./MockupVisualComposer');

// Ancho útil de cada tipo de pantalla (px); un ancho fijo mayor desborda la pantalla.
const VIEWPORT = Object.freeze({ mobile: 390, tablet: 768, web: 1440, auth: 440 });

const attr = (node, name) => node.attrs?.find((item) => item.name === name)?.value || '';
function walk(node, visit) {
  visit(node);
  (node.childNodes || []).forEach((child) => walk(child, visit));
}

/**
 * Revisión determinista del diseño de un mockup ya compuesto. No ejecuta el HTML: detecta los defectos de estructura
 * que luego se trasladan al frontend (menús donde no corresponden, anchos fijos que desbordan, columnas que no caben).
 * Los hallazgos son avisos: informan dónde está el problema, no bloquean la aprobación.
 */
class MockupLayoutLinter {
  analizar(html, { screen = {} } = {}) {
    if (!html || typeof html !== 'string') return [];
    const document = parse(html);
    const declared = /data-icase-kind="(auth|mobile|tablet|web)"/.exec(html)?.[1];
    const kind = declared || kindOf(screen);
    const limit = VIEWPORT[kind] || VIEWPORT.web;
    const findings = [];
    const add = (codigo, mensaje) => { if (!findings.some((item) => item.codigo === codigo && item.mensaje === mensaje)) findings.push({ codigo, mensaje }); };

    const navs = [];
    const headers = [];
    const wide = new Set();
    let grids = 0;
    walk(document, (node) => {
      if (!node.tagName) return;
      const cls = attr(node, 'class');
      if (node.tagName === 'nav') navs.push(node);
      if (node.tagName === 'header') headers.push(node);
      // Anchos fijos: clases w-[640px] / min-w-[640px] y estilos en línea.
      for (const match of cls.matchAll(/(?:^|\s)(?:min-)?w-\[(\d+)px\]/g)) if (Number(match[1]) > limit) wide.add(Number(match[1]));
      for (const match of attr(node, 'style').matchAll(/(?:^|;)\s*(?:min-)?width\s*:\s*(\d+)px/gi)) if (Number(match[1]) > limit) wide.add(Number(match[1]));
      if (['img', 'canvas', 'svg', 'video'].includes(node.tagName)) {
        for (const name of ['width', 'height']) { const value = Number(attr(node, name)); if (/^\d+$/.test(attr(node, name)) && value > limit) wide.add(value); }
      }
      // Columnas sin variante responsiva en una pantalla estrecha.
      if (kind === 'mobile') {
        for (const match of cls.matchAll(/(?:^|\s)grid-cols-(\d+)(?=\s|$)/g)) if (Number(match[1]) >= 3) grids += 1;
        if (node.tagName === 'table') {
          let heads = 0;
          walk(node, (inner) => { if (inner.tagName === 'th') heads += 1; });
          if (heads > 4) add('tabla_ancha_movil', `Una tabla con ${heads} columnas no cabe en la pantalla móvil; usa tarjetas o muestra solo las columnas esenciales.`);
        }
      }
    });

    if (kind === 'auth' && navs.length) add('menu_en_login', 'La pantalla de acceso muestra un menú de navegación; el login debe mostrar solo el formulario.');
    if (kind !== 'auth' && headers.length > 1) add('cabecera_duplicada', `Hay ${headers.length} cabeceras: la cabecera común ya la aporta la estructura de la pantalla.`);
    if (kind !== 'mobile' && navs.length > 1) add('navegacion_duplicada', `Hay ${navs.length} menús de navegación: solo debe existir el común de la pantalla.`);
    if (wide.size) add('ancho_fijo', `Anchos fijos de ${[...wide].sort((a, b) => a - b).map((value) => `${value}px`).join(', ')} superan el ancho útil de ${limit}px y desbordan la pantalla; usa anchos relativos (w-full, max-w-*).`);
    if (grids) add('columnas_en_movil', `${grids} cuadrícula(s) de 3 o más columnas sin variante responsiva; en móvil se muestran en una columna.`);
    return findings;
  }

  mensajes(html, opciones) {
    return this.analizar(html, opciones).map((item) => `Diseño: ${item.mensaje}`);
  }
}

module.exports = MockupLayoutLinter;
