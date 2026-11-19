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
    list.render(rows);
  }
  return true;
}

const labelOf = (row) => { for (const key of ['nombre', 'name', 'titulo', 'numero', 'codigo', 'descripcion']) if (row[key] !== undefined && row[key] !== null && String(row[key]).trim()) return String(row[key]); return `#${row.id}`; };

/**
 * Las líneas de un pedido del diseño (un select de plato y una cantidad por fila): el select se llena con los platos reales, «Añadir» y
 * «Quitar» copian y retiran filas. El envío las recoge con `collectLines`.
 */
export async function bindLines({ root, specMap, api }) {
  for (const form of root.querySelectorAll('form')) {
    if (form.__lines) continue;
    const declared = (form.getAttribute('data-accion') || form.querySelector('[data-accion]:not([data-accion="ui"])')?.getAttribute('data-accion') || '').toLowerCase();
    const named = specMap && specMap[declared];
    if (!named || !named.lineas) continue;
    const rows = lineRows(form, named.inputs);
    if (!rows.length) continue;
    let options;
    try { options = await api(named.path); } catch { continue; }
    if (!Array.isArray(options)) continue;
    form.__lines = true;
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
        const price = row.precio !== undefined ? ` — ${Number(row.precio).toFixed(2)}` : '';
        option.textContent = `${labelOf(row)}${price}`;
        select.append(option);
      }
      select.value = Array.from(select.options).some((option) => option.value === keep) ? keep : '';
    };
    rows.forEach((item) => fill(item.select));
    const template = rows[0].row;
    form.addEventListener('click', (event) => {
      const button = event.target.closest('button');
      if (!button || !form.contains(button)) return;
      const label = plain(button.textContent);
      const current = lineRows(form, named.inputs);
      if (/^(\+ )?(anadir|agregar|otro|nuevo)/.test(label) || /anadir otr|agregar otr/.test(label)) {
        if (!template) return;
        event.preventDefault();
        const copy = template.cloneNode(true);
        const select = copy.querySelector('select');
        if (select) { fill(select); select.value = ''; }
        const quantity = copy.querySelector('input[type="number"]');
        if (quantity) quantity.value = '1';
        (current[current.length - 1]?.row || template).after(copy);
      } else if (/^(eliminar|quitar|remover|x)$/.test(label)) {
        const mine = current.find((item) => item.row && item.row.contains(button));
        if (mine && current.length > 1) { event.preventDefault(); mine.row.remove(); }
      }
    });
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
    const render = (list) => {
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
