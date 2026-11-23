// Las tablas del mockup traen filas de ejemplo: aquí se sustituyen por los registros reales de la consulta de la pantalla.
// Se conserva el diseño (clases, insignias, botones y campos de cada fila) y solo cambia el contenido.
import { lineRows } from './mockupActions';
const plain = (value) => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const LABELS = ['nombre', 'numero', 'titulo', 'codigo', 'descripcion'];
const YES = /^(si|sí|disponible|activo|activa|habilitado|abierto|abierta|true)$/;
const NO = /^(no|agotado|agotada|inactivo|inactiva|deshabilitado|cerrado|cerrada|false)$/;

/** Campo de la consulta que corresponde al encabezado de una columna; null si no hay uno claro. */
export function matchField(header, fields, entity, types = {}) {
  const key = plain(header);
  if (!key) return null;
  const compact = key.replace(/ /g, '');
  const candidates = fields.map((name) => ({ name, key: plain(name.replace(/_id$/, '')).replace(/ /g, '') }));
  const exact = candidates.find((item) => item.key === compact);
  if (exact) return exact.name;
  // «Estado» de algo que solo tiene un campo sí/no (disponible, activo): es ese campo.
  if (/^(estado|situacion)$/.test(compact)) {
    const flag = fields.find((name) => types[name] === 'boolean' || /^(disponible|activ[oa]|habilitad[oa])$/.test(plain(name).replace(/ /g, '')));
    if (flag) return flag;
  }
  const partial = candidates.find((item) => item.key.length >= 4 && (compact.includes(item.key) || (compact.length >= 4 && item.key.includes(compact))));
  if (partial) return partial.name;
  // «Disponibilidad» ↔ «disponible», «Precio actual» ↔ «precio»: comparten la raíz de la palabra.
  const root = candidates.find((item) => item.key.length >= 5 && compact.length >= 5 && item.key.slice(0, 5) === compact.slice(0, 5));
  if (root) return root.name;
  // «Vendedor», «Cajero», «Registrado por»: la persona que registró el dato es la cuenta referenciada (usuario_id).
  const account = fields.find((name) => /^(usuario|cuenta|user)_?id$/i.test(name));
  if (account && /^(vendedor|vendedora|cajero|cajera|mesero|mesera|responsable|empleado|empleada|operador|operadora|atendidopor|registradopor|creadopor|usuario)/.test(compact)) return account;
  // «Plato», «Mesa»: la columna que nombra al registro muestra su nombre o número.
  if (entity && compact.startsWith(plain(entity).replace(/ /g, '').slice(0, 4))) return LABELS.find((label) => fields.includes(label)) || null;
  return null;
}

const display = (row, name) => {
  const label = row[`${name}__etiqueta`];
  if (label !== undefined && label !== null) return String(label);
  const value = row[name];
  if (value === null || value === undefined) return '';
  if (typeof value === 'boolean') return value ? 'Sí' : 'No';
  if (typeof value === 'object') return JSON.stringify(value);
  if (/^\d{4}-\d{2}-\d{2}T/.test(String(value))) { const date = new Date(value); if (!Number.isNaN(date.getTime())) return date.toLocaleString('es-PE', { dateStyle: 'short', timeStyle: 'short' }); }
  return String(value);
};

/** Escribe el texto en la celda sin perder su estructura (por ejemplo, el punto de color de una insignia). */
function setText(cell, text) {
  const walker = cell.ownerDocument.createTreeWalker(cell, 4);
  const nodes = [];
  while (walker.nextNode()) if (walker.currentNode.nodeValue.trim()) nodes.push(walker.currentNode);
  if (nodes.length) {
    const lead = /^\s/.test(nodes[0].nodeValue) ? ' ' : '';
    nodes[0].nodeValue = lead + text;
    nodes.slice(1).forEach((node) => { node.nodeValue = ''; });
  } else cell.append(text);
}

/** Fila de ejemplo cuyo contenido se parece más al registro (un «Agotado» conserva su punto rojo). */
function pickTemplate(samples, cells, row, mapping) {
  let best = samples[0];
  let bestScore = -1;
  for (const sample of samples) {
    let score = 0;
    mapping.forEach((name, index) => {
      if (!name) return;
      const sampleText = plain(sample.cells[index]?.textContent);
      const value = row[`${name}__etiqueta`] ?? row[name];
      const mine = plain(typeof value === 'boolean' ? (value ? 'si' : 'no') : value);
      if (sampleText && sampleText === mine) score += 2;
      else if (typeof value === 'boolean' && ((value && YES.test(sampleText)) || (!value && NO.test(sampleText)))) score += 2;
    });
    if (score > bestScore) { best = sample; bestScore = score; }
  }
  return best;
}

function fillInputs(element, row) {
  for (const input of element.querySelectorAll('input[name], select[name], textarea[name]')) {
    const name = input.getAttribute('name');
    if (!(name in row)) continue;
    if (input.type === 'checkbox') input.checked = Boolean(row[name]);
    else input.value = row[`${name}__etiqueta`] !== undefined && input.tagName === 'SELECT' ? input.value : String(row[name] ?? '');
  }
}

const ACTION = /^(RF-\d+)\.(consultar|crear|editar|eliminar)$/i;
const parseAction = (element) => { const match = ACTION.exec(String(element?.getAttribute('data-accion') || '').trim()); return match ? { operation: match[1].toLowerCase(), verb: match[2].toLowerCase() } : null; };

/**
 * Las filas se copian del diseño y React no les conoce los manejadores: se atienden aquí. El envío de un formulario con `data-accion`
 * (o un botón con la suya) ejecuta esa acción sobre el registro de la fila; nunca navega.
 */
function wireRow(tr, onAction, context = null) {
  const run = (event, control, action) => onAction && action && onAction({ preventDefault() {}, stopPropagation() {}, currentTarget: control }, action.operation, action.verb);
  tr.addEventListener('submit', (event) => {
    event.preventDefault();
    const form = event.target.closest('form');
    const control = event.submitter || form.querySelector('button[type="submit"], button:not([type]), input[type="submit"]');
    run(event, control, parseAction(form) || parseAction(control));
  });
  tr.addEventListener('click', (event) => {
    const control = event.target.closest('[data-accion]');
    if (!control || control.tagName === 'FORM' || control.getAttribute('data-accion') === 'ui') return;
    const action = parseAction(control);
    if (!action) return;
    event.preventDefault();
    // «Ver» en la fila de un registro muestra sus datos ahí mismo: no lanza otra consulta ni abre un listado aparte.
    if (action.verb === 'consultar' && context && context.row) { toggleDetail(tr, context.row); return; }
    run(event, control, action);
  });
}

/** Datos completos del registro de una fila o tarjeta, desplegados debajo de ella; un segundo clic los oculta. */
function toggleDetail(element, row) {
  if (element.__detail) { element.__detail.remove(); element.__detail = null; return; }
  const document = element.ownerDocument;
  const list = document.createElement('dl');
  list.style.cssText = 'display:grid;grid-template-columns:auto 1fr;gap:2px 12px;font-size:.85rem;margin:0;padding:10px 12px;text-align:left;font-weight:400;background:#f8fafc;border-radius:6px';
  for (const name of Object.keys(row).filter((key) => key !== 'id' && !key.endsWith('__etiqueta'))) {
    const term = document.createElement('dt');
    term.style.color = '#64748b';
    term.textContent = humanize(name);
    const detail = document.createElement('dd');
    detail.style.margin = '0';
    detail.textContent = display(row, name) || '—';
    list.append(term, detail);
  }
  if (element.tagName === 'TR') {
    const tr = document.createElement('tr');
    tr.setAttribute('data-icase-detail', '');
    const cell = document.createElement('td');
    cell.colSpan = Math.max(element.cells.length, 1);
    cell.append(list);
    tr.append(cell);
    element.after(tr);
    element.__detail = tr;
  } else {
    element.append(list);
    element.__detail = list;
  }
}

/**
 * Filtra, sin volver al servidor, las listas del diseño ya llenadas (tablas y tarjetas) con lo escrito en los campos de búsqueda.
 * Cada campo busca en la columna del mismo nombre y, si no existe, en todo el registro. Devuelve false si la pantalla no tiene listas vivas.
 */
export function filterLive(root, given = {}) {
  const lists = root && root.__live;
  if (!lists || !lists.length) return false;
  const terms = Object.entries(given).filter(([, value]) => String(value).trim() && !/^(todos?|todas?|all)$/i.test(String(value).trim())).map(([key, value]) => [key, plain(value)]);
  const key = (name) => plain(String(name).replace(/_id$/, '')).replace(/ /g, '');
  for (const list of lists) {
    const rows = !terms.length ? list.rows : list.rows.filter((row) => terms.every(([name, term]) => {
      const field = list.fields.find((item) => key(item) === key(name));
      const texts = field ? [display(row, field), String(row[field] ?? '')] : Object.keys(row).filter((item) => item !== 'id' && !item.endsWith('__etiqueta')).map((item) => display(row, item));
      return texts.some((text) => plain(text).includes(term));
    }));
    list.render(rows, true);
  }
  return true;
}

/**
 * Pie de paginación del diseño junto a la tabla: el texto «Mostrando 5 de 18 usuarios» y los botones Anterior / 1 / 2 / Siguiente.
 * Devuelve null si el diseño no trae uno. `size` es el número de filas de ejemplo del diseño (lo que cabe en una página).
 */
function findPager(table, size) {
  let scope = table.parentElement;
  for (let depth = 0; scope && depth < 4; depth += 1, scope = scope.parentElement) {
    const info = Array.from(scope.querySelectorAll('p, span, div')).find((element) => !element.children.length && !table.contains(element) && /mostrando\s+\d+(?:\s*(?:[-–]|al?)\s*\d+)?\s+de\s+\d+/i.test(element.textContent)); // «1–4 de 18» o «1 a 4 de 18»
    if (!info) continue;
    const buttons = Array.from(scope.querySelectorAll('button')).filter((button) => !table.contains(button));
    const prev = buttons.find((button) => plain(button.textContent) === 'anterior');
    const next = buttons.find((button) => plain(button.textContent) === 'siguiente');
    const numbers = buttons.filter((button) => /^\d+$/.test(button.textContent.trim()));
    const active = numbers.find((button) => /text-white/.test(button.className)) || numbers[0];
    const inactive = numbers.find((button) => button !== active) || active;
    const bar = (next || prev || active)?.parentElement || null;
    const template = info.textContent;
    const document = table.ownerDocument;
    return {
      // Se pagina con el tamaño del diseño, salvo que traiga una sola fila de ejemplo: eso no es una página real (un cliente por página).
      size: size <= 1 ? 10 : size,
      // Una tabla que no se llenó con datos reales no pagina nada: sus botones de página del diseño quedarían sin efecto.
      hide() { info.style.display = 'none'; if (bar) bar.style.display = 'none'; },
      update({ total, shown, page, pages, go }) {
        info.textContent = template.replace(/(mostrando\s+)\d+(?:\s*(?:[-–]|al?)\s*\d+)?(\s+de\s+)\d+/i, `$1${shown}$2${total}`);
        if (!bar) return;
        bar.style.display = pages > 1 ? '' : 'none';
        numbers.forEach((button) => button.remove());
        numbers.length = 0;
        if (active) {
          for (let number = 1; number <= pages; number += 1) {
            const button = (number === page ? active : inactive).cloneNode(true);
            button.textContent = String(number);
            button.disabled = false;
            button.onclick = (event) => { event.preventDefault(); go(number); };
            numbers.push(button);
            bar.insertBefore(button, next && next.parentElement === bar ? next : null);
          }
        }
        for (const [button, target, blocked] of [[prev, page - 1, page <= 1], [next, page + 1, page >= pages]]) {
          if (!button) continue;
          button.disabled = blocked;
          button.classList.toggle('opacity-40', blocked);
          button.onclick = (event) => { event.preventDefault(); if (!blocked) go(target); };
        }
        void document;
      }
    };
  }
  return null;
}

/**
 * Filtros del diseño sobre un listado real: las fechas de ejemplo ocultarían los registros de hoy, así que se vacían; un select
 * «Todos los clientes» con nombres inventados pasa a ofrecer los valores reales de la tabla (y recibe name para poder filtrar).
 * Un select que no corresponde a ninguna columna se queda solo con «Todos». No toca formularios que guardan.
 */
function cleanFilters(root, list) {
  const saving = (element) => element.closest('form[data-accion]:not([data-accion="ui"])');
  for (const input of root.querySelectorAll('input[type="date"], input[type="datetime-local"]')) {
    if (!saving(input) && input.value) { input.value = ''; input.defaultValue = ''; }
  }
  for (const select of root.querySelectorAll('select')) {
    if (saving(select) || select.hasAttribute('data-ref-options') || !select.options.length || !/^tod[oa]s?\b/i.test(select.options[0].textContent.trim())) continue;
    const label = (select.id && root.querySelector(`label[for="${select.id}"]`)?.textContent) || select.getAttribute('name') || select.id || '';
    const field = matchField(label, list.fields, null) || null;
    const first = select.options[0];
    first.value = '';
    const values = field ? [...new Set(list.rows.map((row) => display(row, field)).filter((text) => text && text !== '—'))].sort((a, b) => a.localeCompare(b)) : [];
    select.replaceChildren(first);
    for (const value of values) {
      const option = select.ownerDocument.createElement('option');
      option.value = value;
      option.textContent = value;
      select.append(option);
    }
    if (field && !select.getAttribute('name')) select.setAttribute('name', field);
    select.value = '';
  }
}

/**
 * Contador del diseño junto a la tabla («24 clientes», «24 registros»): pasa a contar los registros reales. Devuelve una función que
 * recibe el total, o null si el diseño no trae uno.
 */
function findCounter(table) {
  let scope = table.parentElement;
  for (let depth = 0; scope && depth < 4; depth += 1, scope = scope.parentElement) {
    const found = Array.from(scope.querySelectorAll('span, p, div, small')).find((element) => !element.children.length && !table.contains(element) && /^\d+\s+[a-záéíóúñ]+$/i.test(element.textContent.trim()) && !/^\d+\s+de$/i.test(element.textContent.trim()));
    if (found) {
      const word = found.textContent.trim().replace(/^\d+\s+/, '');
      const singular = word.replace(/([lrndzj])es$/i, '$1').replace(/s$/i, '');
      return (total) => { found.textContent = `${total} ${total === 1 ? singular : word}`; };
    }
  }
  return null;
}

const labelOf = (row) => { for (const key of ['nombre', 'name', 'titulo', 'numero', 'codigo', 'descripcion']) if (row[key] !== undefined && row[key] !== null && String(row[key]).trim()) return String(row[key]); return `#${row.id}`; };

// Un importe completo («S/ 1,947.60», «7875.00», «S/ 20»): empieza donde empieza el número, no a mitad de él.
const MONEY = /(S\/\s?|\$\s?|€\s?)?(?<![\d.,])-?(?:\d{1,3}(?:[.,\s]\d{3})+|\d+)[.,]\d{2}(?!\d)|(S\/\s?|\$\s?|€\s?)\d+/;
const asMoney = (template, value) => template.replace(MONEY, (match, a, b) => `${a || b || ''}${Number(value || 0).toFixed(2)}`);

/**
 * Las líneas de una venta o pedido del diseño (un select de producto y una cantidad por fila). El select se llena con los productos
 * reales; «Agregar» y «Quitar» (también un icono con aria-label) copian y retiran filas; el precio, el stock, el importe de cada línea
 * y el total se recalculan con los datos reales (el diseño traía valores de ejemplo). El envío las recoge con `collectLines`.
 */
/**
 * Alta vinculada a un registro existente (emitir la factura de una venta): si el formulario del diseño no deja elegir ese registro, se
 * añade un selector con los que aún no tienen uno (ni están anulados), preseleccionando el de ?id=. Los campos de solo lectura que
 * calcula el sistema (número, IGV) traían valores de ejemplo: se vacían y avisan que se asignan al guardar.
 */
async function bindLinked(form, named, api) {
  if (form.__linked) return;
  form.__linked = true;
  for (const input of form.querySelectorAll('input[readonly]')) { input.value = ''; input.placeholder = 'Se asigna al guardar'; }
  // Importes de ejemplo del resumen (subtotal, total): los calcula el servidor al guardar; no se muestran cifras inventadas.
  const walker = form.ownerDocument.createTreeWalker(form, 4);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (!node.parentElement?.closest('select, option, button, label') && MONEY.test(node.nodeValue) && !/[a-z]{4,}/i.test(node.nodeValue.replace(MONEY, ''))) node.nodeValue = node.nodeValue.replace(MONEY, '—');
  }
  const { parametro, capability, campo, entidad } = named.vincula;
  if (form.querySelector(`[name="${parametro}"]`)) return;
  let rows = [];
  try { const listed = await api(`/api/operations/${encodeURIComponent(capability)}?limit=200`); rows = (Array.isArray(listed) ? listed : (listed && listed.data) || []).map((row) => ({ id: row.id, ...(row.data || row) })); } catch { rows = []; }
  const free = rows.filter((row) => !row[campo] && !/^(anul|cancel)/i.test(String(row.estado || '')));
  const document = form.ownerDocument;
  const sampleSelect = form.querySelector('select, input:not([type="hidden"]):not([readonly])');
  const sampleLabel = form.querySelector('label');
  const wrapper = document.createElement('div');
  wrapper.style.marginBottom = '1rem';
  const label = document.createElement('label');
  label.htmlFor = `icase-${parametro}`;
  label.className = sampleLabel ? sampleLabel.className : '';
  label.textContent = entidad || parametro;
  const select = document.createElement('select');
  select.id = `icase-${parametro}`;
  select.name = parametro;
  select.required = true;
  select.className = sampleSelect ? sampleSelect.className : '';
  const empty = document.createElement('option');
  empty.value = '';
  empty.textContent = free.length ? 'Selecciona…' : `No hay registros de ${String(entidad || parametro).toLowerCase()} pendientes`;
  select.append(empty);
  for (const row of free) {
    const option = document.createElement('option');
    option.value = String(row.id);
    const date = typeof row.fecha === 'string' ? ` · ${new Date(row.fecha).toLocaleDateString('es')}` : '';
    const total = typeof row.total === 'number' ? ` · ${row.total.toFixed(2)}` : '';
    option.textContent = `${entidad || ''} #${row.id}${total}${date}`.trim();
    select.append(option);
  }
  const wanted = new URLSearchParams(globalThis.location ? globalThis.location.search : '').get('id');
  if (wanted && free.some((row) => String(row.id) === wanted)) select.value = wanted;
  wrapper.append(label, select);
  form.prepend(wrapper);
}

export async function bindLines({ root, specMap, api }) {
  for (const form of root.querySelectorAll('form')) {
    const linkedAction = (form.getAttribute('data-accion') || '').toLowerCase();
    if (specMap && specMap[linkedAction] && specMap[linkedAction].vincula) await bindLinked(form, specMap[linkedAction], api);
    // Ya enlazado: la pantalla vuelve a llamar tras guardar con éxito; se deja lista para la siguiente venta con el stock al día.
    if (form.__lines) { if (typeof form.__linesRefresh === 'function') form.__linesRefresh(); continue; }
    const declared = (form.getAttribute('data-accion') || form.querySelector('[data-accion]:not([data-accion="ui"])')?.getAttribute('data-accion') || '').toLowerCase();
    const named = specMap && specMap[declared];
    if (!named || !named.lineas) continue;
    const rows = lineRows(form, named.inputs);
    if (!rows.length) continue;
    form.__lines = true; // antes de esperar: dos montajes seguidos no deben duplicar las opciones
    let options;
    try { options = await api(named.path); } catch { form.__lines = false; continue; }
    if (!Array.isArray(options)) { form.__lines = false; continue; }
    const priceField = named.lineas.precio || ['precioVenta', 'precio', 'precioUnitario'].find((name) => options.some((row) => row[name] !== undefined));
    const stockField = named.lineas.stock || (options.some((row) => row.stock !== undefined) ? 'stock' : null);
    const byId = new Map();
    const load = (list) => { options = list; byId.clear(); for (const row of list) byId.set(String(row.id), row); };
    load(options);
    // La línea completa (producto, cantidad, precio, importe y quitar): con dos líneas de ejemplo, el contenedor más amplio con un solo
    // select de línea; su padre es la lista de líneas. Se fija antes de retirar los ejemplos, porque con una sola línea no se distingue.
    const widest = (item) => {
      const selects = lineRows(form, named.inputs).map((line) => line.select);
      let box = item.row || item.select.parentElement;
      while (box && box.parentElement && box.parentElement !== form && selects.filter((select) => box.parentElement.contains(select)).length === 1) box = box.parentElement;
      return box;
    };
    const lineList = rows.length > 1 ? widest(rows[0])?.parentElement : null;
    const boxOf = (item) => {
      if (lineList) { let element = item.select; while (element && element.parentElement !== lineList) element = element.parentElement; if (element) return element; }
      return item.row || item.select.parentElement;
    };
    const templates = new Map(); // texto original del diseño de cada nodo que se reescribe
    // Textos sueltos (no los de selects, botones ni etiquetas): «Activo · 24 unidades» puede compartir elemento con un icono.
    const textsOf = (scope) => {
      const walker = scope.ownerDocument.createTreeWalker(scope, 4);
      const found = [];
      for (let node = walker.nextNode(); node; node = walker.nextNode()) if ((node.nodeValue.trim() || templates.has(node)) && !node.parentElement?.closest('select, button, label, option')) found.push(node);
      return found;
    };
    // Si la línea del diseño no tiene dónde mostrar el precio, la opción lo lleva («Lomo — 15.50»).
    const showPrice = Boolean(priceField) && !textsOf(boxOf(rows[0])).some((node) => MONEY.test(node.nodeValue));
    const fill = (select) => {
      const keep = select.value;
      select.replaceChildren();
      const first = select.ownerDocument.createElement('option');
      first.value = '';
      first.textContent = 'Selecciona…';
      select.append(first);
      for (const row of options) {
        const option = select.ownerDocument.createElement('option');
        option.value = String(row.id);
        option.textContent = `${labelOf(row)}${showPrice && row[priceField] !== undefined ? ` — ${Number(row[priceField]).toFixed(2)}` : ''}`;
        select.append(option);
      }
      select.value = Array.from(select.options).some((option) => option.value === keep) ? keep : '';
    };
    const original = (node) => { if (!templates.has(node)) templates.set(node, node.nodeValue); return templates.get(node); };
    // Un select cuyas opciones ya pone React (ReferenceOptions) no se toca: llenarlo aquí duplicaría las opciones. Las copias sí se llenan.
    rows.forEach((item) => { if (!item.select.hasAttribute('data-ref-options')) fill(item.select); });
    const template = boxOf(rows[0]).cloneNode(true);
    // Las líneas de ejemplo del diseño se retiran: la venta empieza con una línea vacía.
    rows.slice(1).forEach((item) => boxOf(item)?.remove());
    rows[0].select.value = '';
    if (rows[0].quantity) rows[0].quantity.value = '1';
    // Totales del diseño fuera de las líneas: el importe total y «2 líneas · 3 unidades».
    const inLine = (element) => lineRows(form, named.inputs).some((item) => boxOf(item)?.contains(element));
    const totals = textsOf(form).filter((node) => !inLine(node) && MONEY.test(node.nodeValue) && !/[a-z]{4,}/i.test(node.nodeValue.replace(MONEY, '')));
    const counters = textsOf(form).filter((node) => !inLine(node) && /\d+\s+l[ií]neas?/i.test(node.nodeValue));
    const recompute = () => {
      let total = 0;
      let units = 0;
      const items = lineRows(form, named.inputs);
      for (const item of items) {
        const product = byId.get(String(item.select.value));
        const quantity = Number(item.quantity && item.quantity.value) || 0;
        const price = product && priceField ? Number(product[priceField]) || 0 : 0;
        if (product) { total += price * quantity; units += quantity; }
        const box = boxOf(item);
        if (!box) continue;
        const cells = textsOf(box);
        const prices = cells.filter((node) => MONEY.test(original(node)) && !/unidad/i.test(original(node)));
        prices.forEach((node, position) => {
          const amount = prices.length > 1 && position === prices.length - 1;
          node.nodeValue = product ? asMoney(original(node), amount ? price * quantity : price) : '—';
        });
        for (const node of cells.filter((node) => /\d+\s+unidad/i.test(original(node)))) {
          node.nodeValue = product && stockField ? original(node).replace(/\d+(\s+unidad)/i, `${product[stockField]}$1`) : ' ';
        }
        if (item.quantity) { if (product && stockField) item.quantity.max = String(product[stockField]); else item.quantity.removeAttribute('max'); }
      }
      for (const node of totals) node.nodeValue = asMoney(original(node), total);
      const chosen = items.filter((item) => item.select.value).length;
      for (const node of counters) node.nodeValue = original(node).replace(/\d+(\s+l[ií]neas?)/i, `${chosen}$1`).replace(/\d+(\s+unidad)/i, `${units}$1`);
    };
    form.addEventListener('change', recompute);
    form.addEventListener('input', recompute);
    form.addEventListener('click', (event) => {
      const button = event.target.closest('button');
      if (!button || !form.contains(button)) return;
      const label = plain(button.textContent) || plain(button.getAttribute('aria-label') || button.getAttribute('title') || '');
      const current = lineRows(form, named.inputs);
      if (/^(\+ )?(anadir|agregar|otro|nuevo)/.test(label) || /anadir otr|agregar otr/.test(label)) {
        event.preventDefault();
        const copy = template.cloneNode(true);
        const select = copy.querySelector('select');
        if (select) { fill(select); select.value = ''; }
        const quantity = copy.querySelector('input[type="number"]');
        if (quantity) quantity.value = '1';
        // Cada línea con sus propios id y etiqueta («Producto de la línea 2»), no los de la primera.
        const number = current.length + 1;
        copy.querySelectorAll('[id]').forEach((element) => { element.id = `${element.id}-${number}`; });
        copy.querySelectorAll('label[for]').forEach((label) => { label.htmlFor = `${label.htmlFor}-${number}`; label.textContent = label.textContent.replace(/\d+\s*$/, String(number)); });
        const last = current[current.length - 1];
        if (last) boxOf(last).after(copy);
        recompute();
      } else if (/^(eliminar|quitar|remover|borrar|x)\b/.test(label)) {
        const mine = current.find((item) => boxOf(item)?.contains(button));
        if (!mine) return;
        event.preventDefault();
        if (current.length > 1) boxOf(mine).remove();
        else { mine.select.value = ''; if (mine.quantity) mine.quantity.value = '1'; }
        recompute();
      }
    });
    recompute();
    form.__linesRefresh = async () => {
      try { const fresh = await api(named.path); if (Array.isArray(fresh)) load(fresh); } catch { /* se conservan las opciones anteriores */ }
      form.reset();
      const current = lineRows(form, named.inputs);
      current.slice(1).forEach((item) => boxOf(item)?.remove());
      if (current[0]) { current[0].select.value = ''; if (current[0].quantity) current[0].quantity.value = '1'; }
      recompute();
    };
  }
}

/** Sustituye las filas de cada tabla del mockup por los registros de la consulta de su bloque (la n-ésima tabla ↔ el n-ésimo listado). */
export async function bindLiveTables({ root, blocks, actions, api, can, onAction, onShowOperations }) {
  const lists = blocks.filter((block) => ['tabla', 'tarjetas'].includes(block.tipo) && actions[block.operacion]?.type === 'consulta' && actions[block.operacion].capability);
  const tables = Array.from(root.querySelectorAll('table')).filter((table) => table.tBodies[0]?.rows.length);
  const live = [];
  root.__live = live;
  let bound = 0;
  let boundTables = 0;
  for (let index = 0; index < Math.min(lists.length, tables.length); index += 1) {
    const action = actions[lists[index].operacion];
    if (can && !can(action.permiso || action.capability, 'GET')) continue;
    const table = tables[index];
    const body = table.tBodies[0];
    let rows;
    try {
      const data = await api(action.path);
      rows = Array.isArray(data) ? data : [];
    } catch { continue; }
    if (!table.isConnected) return;
    if (!table.__samples) table.__samples = Array.from(body.rows).map((row) => ({ node: row.cloneNode(true), cells: Array.from(row.cells).map((cell) => cell.cloneNode(true)) }));
    table.__bound = true;
    bound += 1;
    boundTables += 1;
    const samples = table.__samples;
    const fields = [...new Set([...(lists[index].campos || []), ...(action.output || []), ...Object.keys(rows[0] || {}).filter((key) => key !== 'id' && !key.endsWith('__etiqueta'))])];
    const types = Object.fromEntries(Object.entries(action.fields || {}).map(([name, meta]) => [name, meta?.type]));
    const headers = Array.from(table.tHead?.rows[0]?.cells || []).map((cell) => cell.textContent);
    const mapping = headers.map((header, position) => {
      const sampleCell = samples[0].cells[position];
      if (sampleCell?.querySelector('form, button, a, input, select')) return null; // columna de acciones
      return matchField(header, fields, action.entity, types);
    });
    // «Mostrando 5 de 18 usuarios» y los botones de página del diseño pasan a reflejar los registros reales.
    const pager = findPager(table, samples.length);
    const counter = findCounter(table);
    const state = { page: 1 };
    let current = rows;
    const render = (all, reset = false) => {
      current = all;
      if (counter) counter(all.length);
      if (reset) state.page = 1;
      const size = pager ? pager.size : all.length || 1;
      const pages = Math.max(1, Math.ceil(all.length / size));
      state.page = Math.min(Math.max(1, state.page), pages);
      const list = pager ? all.slice((state.page - 1) * size, state.page * size) : all;
      if (pager) pager.update({ total: all.length, shown: list.length, page: state.page, pages, go: (page) => { state.page = page; render(current); } });
      body.replaceChildren();
      if (!list.length) {
        const empty = body.ownerDocument.createElement('tr');
        const cell = body.ownerDocument.createElement('td');
        cell.colSpan = Math.max(headers.length, 1);
        cell.className = samples[0].cells[0]?.className || '';
        cell.textContent = 'No hay registros para mostrar.';
        empty.append(cell);
        body.append(empty);
        return;
      }
      for (const row of list) {
        const template = pickTemplate(samples, null, row, mapping);
        const tr = template.node.cloneNode(true);
        tr.setAttribute('data-id', String(row.id));
        Array.from(tr.cells).forEach((cell, position) => {
          const name = mapping[position];
          // Un valor sí/no conserva la palabra del diseño («Disponible», «Agotado») cuando la fila elegida ya lo expresa.
          const keeps = name && typeof row[name] === 'boolean' && (row[name] ? YES : NO).test(plain(cell.textContent));
          if (keeps) return;
          if (name) setText(cell, display(row, name));
          else if (cell.querySelector('input, select, textarea')) fillInputs(cell, row);
          else if (!cell.querySelector('button, a, form')) setText(cell, '—');
        });
        wireRow(tr, onAction, { row });
        body.append(tr);
      }
    };
    render(rows);
    live.push({ rows, render, fields });
  }
  // Las listas que quedaron sin tabla se enlazan con las rejillas de tarjetas, en el orden del documento.
  const leftover = lists.slice(tables.length);
  const grids = leftover.length ? findRepeaters(root) : [];
  let boundCards = 0;
  for (let index = 0; index < Math.min(leftover.length, grids.length); index += 1) {
    const action = actions[leftover[index].operacion];
    if (can && !can(action.permiso || action.capability, 'GET')) continue;
    let rows;
    try { const data = await api(action.path); rows = Array.isArray(data) ? data : []; } catch { continue; }
    if (!grids[index].isConnected) return;
    const fields = [...new Set([...(leftover[index].campos || []), ...(action.output || [])])].filter((name) => name !== 'id');
    fillCards(grids[index], rows, fields.length ? fields : Object.keys(rows[0] || {}).filter((key) => key !== 'id' && !key.endsWith('__etiqueta')), onAction, action.relacionadas || [], live);
    bound += 1;
    boundCards += 1;
  }
  if (live.length) cleanFilters(root, live[0]);
  for (const table of tables) if (!table.__bound) { const pager = findPager(table, 1); if (pager) pager.hide(); }
  // Solo se avisa de lo que quedó con datos de ejemplo: tablas o rejillas del diseño sin llenar (una lista sin su tabla en el diseño no muestra nada de ejemplo).
  notifySamples(root, Math.max(0, tables.length - boundTables) + Math.max(0, Math.min(leftover.length, grids.length) - boundCards), onShowOperations);
}

const ACTION_CONTROL = '[data-accion]:not([data-accion="ui"])';
const humanize = (name) => String(name).replace(/_id$/, '').replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ').replace(/^./, (letter) => letter.toUpperCase());

/**
 * Rejillas de tarjetas del diseño: un contenedor con varios hijos iguales (misma etiqueta y clases) que no son una tabla, un menú ni un
 * formulario, y cuyas tarjetas traen botones de acción o bastante texto (así no se confunden con los indicadores de un resumen).
 */
export function findRepeaters(root) {
  const found = [];
  for (const container of root.querySelectorAll('div, ul, section, ol')) {
    if (container.closest('table, form, nav, header, select, [data-icase-sample-notice]')) continue;
    const children = Array.from(container.children);
    if (children.length < 2) continue;
    const signature = (child) => `${child.tagName}|${child.getAttribute('class') || ''}`;
    if (!children.every((child) => signature(child) === signature(children[0]))) continue;
    const rich = children.every((child) => child.querySelector(ACTION_CONTROL) || child.querySelectorAll('*').length >= 6);
    if (!rich) continue;
    if (found.some((other) => other.contains(container) || container.contains(other))) continue;
    found.push(container);
  }
  return found;
}

/** Valor de un campo para una tarjeta: nombre legible de la referencia, sí/no, fecha corta. */
function cardValue(row, name) {
  const value = display(row, name);
  return value === '' ? '—' : value;
}

/**
 * Sustituye las tarjetas de ejemplo por los registros reales conservando el aspecto de la tarjeta (sus clases) y sus botones: el contenido
 * es el título del registro y sus campos como «Etiqueta: valor». Los textos de ejemplo no se reutilizan: no se sabe a qué campo corresponden.
 */
function fillCards(container, rows, fields, onAction, related = [], live = []) {
  // «pedido_mesa_id» → «Mesa»; «pedido_items» → «Platos»: el prefijo es el del registro relacionado.
  const label = (name) => {
    for (const rel of related) {
      if (name === `${rel.clave}_items`) return 'Platos';
      if (name.startsWith(`${rel.clave}_`)) return humanize(name.slice(rel.clave.length + 1));
    }
    return humanize(name);
  };
  const document = container.ownerDocument;
  if (!container.__samples) container.__samples = Array.from(container.children).map((child) => child.cloneNode(true));
  const template = container.__samples[0];
  const title = LABELS.find((label) => fields.includes(label)) || fields[0];
  const body = fields.filter((name) => name !== title);
  const footer = Array.from(template.children).find((child) => child.matches(ACTION_CONTROL) || child.querySelector(ACTION_CONTROL)) || null;
  const render = (list) => {
  container.replaceChildren();
  if (!list.length) {
    const empty = document.createElement('p');
    empty.textContent = 'No hay registros para mostrar.';
    empty.style.cssText = 'grid-column:1/-1;padding:12px;color:#64748b';
    container.append(empty);
    return;
  }
  for (const row of list) {
    const card = template.cloneNode(false);
    card.setAttribute('data-id', String(row.id));
    const head = document.createElement('div');
    head.style.cssText = 'font-weight:700;font-size:1.05rem;margin-bottom:6px';
    head.textContent = title ? cardValue(row, title) : `#${row.id}`;
    card.append(head);
    if (body.length) {
      const list = document.createElement('dl');
      list.style.cssText = 'display:grid;grid-template-columns:auto 1fr;gap:2px 10px;font-size:.85rem;margin:0 0 8px';
      for (const name of body) {
        const term = document.createElement('dt');
        term.style.color = '#64748b';
        term.textContent = label(name);
        const detail = document.createElement('dd');
        detail.style.margin = '0';
        detail.textContent = cardValue(row, name);
        list.append(term, detail);
      }
      card.append(list);
    }
    if (footer) card.append(footer.cloneNode(true));
    wireRow(card, onAction, { row });
    container.append(card);
  }
  };
  render(rows);
  live.push({ rows, render, fields });
}

/** Si alguna lista del diseño no se pudo llenar con registros reales, se avisa: lo que se ve en ella es de ejemplo. */
function notifySamples(root, unbound, onShowOperations) {
  const existing = root.querySelector('[data-icase-sample-notice]');
  if (unbound <= 0) { existing?.remove(); return; }
  if (existing) return;
  const notice = root.ownerDocument.createElement('div');
  notice.setAttribute('data-icase-sample-notice', '');
  notice.setAttribute('role', 'note');
  notice.style.cssText = 'margin:8px 0;padding:8px 12px;border:1px solid #fcd34d;background:#fffbeb;color:#92400e;border-radius:8px;font-size:13px;display:flex;gap:8px;align-items:center;flex-wrap:wrap';
  notice.append('Parte de esta vista muestra datos de ejemplo del diseño. ');
  if (onShowOperations) {
    const button = root.ownerDocument.createElement('button');
    button.type = 'button';
    button.textContent = 'Ver los datos reales';
    button.style.cssText = 'font-weight:600;text-decoration:underline;background:none;border:0;cursor:pointer;color:inherit';
    button.addEventListener('click', onShowOperations);
    notice.append(button);
  }
  root.prepend(notice);
}
