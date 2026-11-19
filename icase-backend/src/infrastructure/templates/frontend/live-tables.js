// Las tablas del mockup traen filas de ejemplo: aquí se sustituyen por los registros reales de la consulta de la pantalla.
// Se conserva el diseño (clases, insignias, botones y campos de cada fila) y solo cambia el contenido.
const plain = (value) => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const LABELS = ['nombre', 'numero', 'titulo', 'codigo', 'descripcion'];
const YES = /^(si|sí|disponible|activo|activa|habilitado|abierto|abierta|true)$/;
const NO = /^(no|agotado|agotada|inactivo|inactiva|deshabilitado|cerrado|cerrada|false)$/;

/** Campo de la consulta que corresponde al encabezado de una columna; null si no hay uno claro. */
export function matchField(header, fields, entity) {
  const key = plain(header);
  if (!key) return null;
  const compact = key.replace(/ /g, '');
  const candidates = fields.map((name) => ({ name, key: plain(name.replace(/_id$/, '')).replace(/ /g, '') }));
  const exact = candidates.find((item) => item.key === compact);
  if (exact) return exact.name;
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
function wireRow(tr, onAction) {
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
    run(event, control, action);
  });
}

/** Sustituye las filas de cada tabla del mockup por los registros de la consulta de su bloque (la n-ésima tabla ↔ el n-ésimo listado). */
export async function bindLiveTables({ root, blocks, actions, api, can, onAction, onShowOperations }) {
  const lists = blocks.filter((block) => ['tabla', 'tarjetas'].includes(block.tipo) && actions[block.operacion]?.type === 'consulta' && actions[block.operacion].capability);
  const tables = Array.from(root.querySelectorAll('table')).filter((table) => table.tBodies[0]?.rows.length);
  let bound = 0;
  for (let index = 0; index < Math.min(lists.length, tables.length); index += 1) {
    const action = actions[lists[index].operacion];
    if (can && !can(action.capability, 'GET')) continue;
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
    const samples = table.__samples;
    const fields = [...new Set([...(lists[index].campos || []), ...(action.output || []), ...Object.keys(rows[0] || {}).filter((key) => key !== 'id' && !key.endsWith('__etiqueta'))])];
    const headers = Array.from(table.tHead?.rows[0]?.cells || []).map((cell) => cell.textContent);
    const mapping = headers.map((header, position) => {
      const sampleCell = samples[0].cells[position];
      if (sampleCell?.querySelector('form, button, a, input, select')) return null; // columna de acciones
      return matchField(header, fields, action.entity);
    });
    body.replaceChildren();
    if (!rows.length) {
      const empty = body.ownerDocument.createElement('tr');
      const cell = body.ownerDocument.createElement('td');
      cell.colSpan = Math.max(headers.length, 1);
      cell.className = samples[0].cells[0]?.className || '';
      cell.textContent = 'No hay registros para mostrar.';
      empty.append(cell);
      body.append(empty);
      continue;
    }
    for (const row of rows) {
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
      wireRow(tr, onAction);
      body.append(tr);
    }
  }
  notifySamples(root, lists.length - bound, onShowOperations);
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
