const { parse } = require('parse5');
const { kindOf } = require('./MockupVisualComposer');

// Ancho útil de cada tipo de pantalla (px); un ancho fijo mayor desborda la pantalla.
const VIEWPORT = Object.freeze({ mobile: 390, tablet: 768, web: 1440, auth: 440 });

const attr = (node, name) => node.attrs?.find((item) => item.name === name)?.value || '';
const textOf = (node) => (node.nodeName === '#text' ? node.value : (node.childNodes || []).map(textOf).join(' ')).replace(/\s+/g, ' ').trim();

// Verbos que un botón no puede tener según la operación que ejecuta: «Actualizar comanda» que solo consulta engaña a quien lo usa.
// «Actualizar lista» sobre una consulta es refrescar la vista, no modificar: «actualizar» no cuenta como verbo de escritura aquí.
const MUTA = /^(?:guardar|registrar|crear|eliminar|cancelar|anular|confirmar|marcar|editar|enviar|pagar|comprar|canjear|reasignar|cerrar)\b/i;
const SOLO_LEE = /^(?:ver|consultar|buscar|filtrar|detalle)\b/i;
// Un código largo (RES-849202) es un código de reserva pensado para mostrarse; un identificador corto (usr-101) es interno.
const INTERNAL_ID = /^(?!r(?:nf|f)-)[a-z]{2,6}-\d{2,4}$/i;
const JARGON = /\b(?:socket\.?io|websockets?|api rest|backend|frontend|endpoint|json|payload|stack trace)\b/i;
const DATE_TYPES = new Set(['date', 'datetime-local', 'time']);
const BORRA = /\b(?:eliminar|cancelar|anular|quitar|borrar|retirar|descartar)\b/i;
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

    const dateValues = new Map();
    const navs = [];
    const headers = [];
    const wide = new Set();
    let grids = 0;
    walk(document, (node) => {
      if (!node.tagName) return;
      const cls = attr(node, 'class');
      if (['button', 'a', 'input'].includes(node.tagName)) {
        const operation = /^RF-\d+\.(consultar|crear|editar|actualizar|eliminar)$/i.exec(attr(node, 'data-accion'));
        const label = (node.tagName === 'input' ? attr(node, 'value') : textOf(node)).toLowerCase();
        const verb = operation?.[1].toLowerCase();
        if (verb && label) {
          const incoherente = (verb === 'consultar' && MUTA.test(label))
            || ((verb === 'crear' || verb === 'editar' || verb === 'actualizar') && SOLO_LEE.test(label))
            || (verb === 'eliminar' && !BORRA.test(label));
          if (incoherente) add('accion_incoherente', `El botón «${textOf(node) || attr(node, 'value')}» ejecuta «${verb}» (${attr(node, 'data-accion')}) y su texto no corresponde a esa operación.`);
        }
      }
      // Identificadores internos a la vista («usr-101», columna «… ID»): son datos del sistema, no de la persona.
      if (['td', 'li', 'span', 'p', 'dd'].includes(node.tagName) && !(node.childNodes || []).some((child) => child.tagName) && INTERNAL_ID.test(textOf(node))) {
        add('id_interno', `Se muestra el identificador interno «${textOf(node)}»; enseña el nombre o la descripción del registro.`);
      }
      // Lenguaje técnico o códigos de requisito a la vista de quien usa la aplicación.
      if (node.nodeName === '#text' && node.value && JARGON.test(node.value)) add('lenguaje_tecnico', `El texto «${node.value.trim().slice(0, 50)}» usa lenguaje técnico que la persona no debe ver.`);
      if (node.nodeName === '#text' && /\[(?:RF|RNF)-\d+\]/.test(node.value || '')) add('codigo_requisito_visible', 'Hay códigos de requisito ([RF-xx]) visibles en la pantalla.');
      if (node.tagName === 'option' && /\(\s*[a-z]{2,6}-\d{1,4}\s*\)/i.test(textOf(node))) add('id_interno', `La opción «${textOf(node)}» muestra un identificador interno entre paréntesis.`);
      if (node.tagName === 'label' && /(?:^|\s)id(?:\s|\(|$)/i.test(textOf(node))) add('id_interno', `La etiqueta «${textOf(node)}» pide un identificador; ofrece una lista con el nombre del registro.`);
      if (node.tagName === 'th' && /(?:^|\s)ids?$/i.test(textOf(node))) add('id_interno', `La columna «${textOf(node)}» muestra identificadores internos; usa el nombre del registro.`);
      // Varios campos de fecha con el mismo valor suelen ser atributos de la entidad volcados al formulario.
      if (node.tagName === 'input' && DATE_TYPES.has(attr(node, 'type').toLowerCase()) && attr(node, 'value')) {
        const key = `${attr(node, 'type').toLowerCase()}|${attr(node, 'value')}`;
        dateValues.set(key, [...(dateValues.get(key) || []), attr(node, 'name') || 'sin nombre']);
      }
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

    for (const names of dateValues.values()) {
      if (names.length > 1) add('fechas_duplicadas', `Los campos ${names.map((name) => `«${name}»`).join(', ')} tienen la misma fecha y hora; pide solo los datos que la persona decide (fecha, hora, duración).`);
    }
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
