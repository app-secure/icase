// Controles de interfaz del diseño (data-accion="ui"): Volver, Cancelar, Nuevo, Editar, Ver y Limpiar no guardan datos, pero deben hacer
// algo. Se resuelven con el árbol de pantallas: el formulario de alta, edición o detalle del mismo dato. Las pantallas de detalle y
// edición abiertas con ?id= cargan ese registro en lugar de mostrar los valores de ejemplo del diseño.
import { fillFields } from './mockupActions';

const plain = (value) => String(value ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const PREFIX = /^(?:pantalla de |listado de |lista de |catalogo de |historial de |gestion de |detalle de |formulario de (?:registro|creacion|alta|edicion|modificacion) de |formulario de |registro de |edicion de |mis |nuevo |nueva |editar |ver )+/;
const singular = (word) => word.replace(/([lrndzj])es$/, '$1').replace(/s$/, '');
/** Dato principal de una pantalla o de un botón: «Listado de clientes» y «Nuevo cliente» → «cliente». */
export const nounOf = (name) => singular(plain(name).replace(PREFIX, '').split(' ')[0] || '');
/** Qué papel cumple una pantalla por su nombre. */
export function kindOf(name) {
  const text = plain(name);
  if (/^(?:formulario de )?(?:edicion|editar|modificar|modificacion)\b/.test(text)) return 'editar';
  if (/^(?:formulario de )?(?:registro|creacion|alta|nuevo|nueva|registrar|crear)\b/.test(text)) return 'crear';
  if (/^detalle\b/.test(text)) return 'detalle';
  // «Formulario de Producto» sin «registro/edición»: un solo formulario sirve para el alta y, con ?id=, para la edición.
  if (/^formulario de\b/.test(text)) return 'formulario';
  if (/^(?:listado|lista|catalogo|historial|gestion)\b/.test(text)) return 'lista';
  return 'otra';
}
const find = (views, kind, noun) => (noun ? views.find((view) => kindOf(view.name) === kind && nounOf(view.name) === noun)
  || (['crear', 'editar'].includes(kind) ? views.find((view) => kindOf(view.name) === 'formulario' && nounOf(view.name) === noun) : null) : null);
const labelOf = (control) => plain(control.textContent) || plain(control.getAttribute('aria-label') || control.getAttribute('title') || '');

/** Adónde lleva un control de interfaz, o null si no se reconoce. */
export function uiTarget(control, { views, current, search = '' }) {
  const label = labelOf(control);
  const view = views.find((item) => item.route === current);
  const noun = nounOf(label.replace(/^\+ /, '')) || (view ? nounOf(view.name) : '');
  const pageNoun = view ? nounOf(view.name) : '';
  const id = control.closest('[data-id]')?.getAttribute('data-id') || new URLSearchParams(search).get('id') || '';
  const withId = (target) => (target ? target.route + (id ? `?id=${encodeURIComponent(id)}` : '') : null);
  if (/^(?:volver|regresar|atras|cancelar|cerrar|descartar)\b/.test(label)) {
    const list = find(views, 'lista', pageNoun);
    return { back: true, fallback: list && list.route !== current ? list.route : null };
  }
  if (/^limpiar\b/.test(label)) return { reset: true };
  if (/^(?:\+ )?(?:nuevo|nueva|registrar|crear|agregar|anadir)\b/.test(label)) { const target = find(views, 'crear', noun) || find(views, 'crear', pageNoun); return target && target.route !== current ? { to: target.route } : null; }
  if (/^(?:editar|modificar)\b/.test(label)) { const target = find(views, 'editar', noun) || find(views, 'editar', pageNoun); return target && id ? { to: withId(target) } : null; }
  if (/^(?:ver|detalle|abrir)\b/.test(label)) { const target = find(views, 'detalle', noun) || find(views, 'detalle', pageNoun); return target && id ? { to: withId(target) } : null; }
  return null;
}

/** Atiende un clic en un control de interfaz que ningún otro manejador atendió (los que guardan datos llaman a preventDefault). */
export function handleUiClick(event, { views, current, search, navigate }) {
  if (event.defaultPrevented || event.button > 0) return;
  const control = event.target && event.target.closest ? event.target.closest('button, a') : null;
  if (!control || !control.closest('.mockup-content')) return;
  const declared = (control.getAttribute('data-accion') || '').trim().toLowerCase();
  if (declared && declared !== 'ui') return;
  if (control.tagName === 'A' && !/^(#.*)?$/.test(control.getAttribute('href') || '')) return; // un enlace real navega solo
  if (control.tagName === 'BUTTON' && !declared && control.type === 'submit') return;
  const target = uiTarget(control, { views, current, search });
  if (!target) return;
  event.preventDefault();
  if (target.back) {
    if (target.fallback && !(globalThis.history && globalThis.history.state && globalThis.history.state.idx > 0)) navigate(target.fallback);
    else navigate(-1);
  } else if (target.reset) {
    // El bloque de filtros (con o sin <form>): el contenedor más cercano con campos. Se vacían y se vuelve a buscar, así la lista
    // muestra otra vez todos los registros.
    let scope = control.parentElement;
    while (scope && !scope.classList.contains('mockup-content') && !scope.querySelector('input, select, textarea')) scope = scope.parentElement;
    if (!scope) return;
    for (const field of scope.querySelectorAll('input, select, textarea')) {
      if (['checkbox', 'radio'].includes(field.type)) field.checked = false;
      else if (field.tagName === 'SELECT') field.selectedIndex = 0;
      else if (!['button', 'submit', 'reset', 'hidden'].includes(field.type)) field.value = '';
    }
    const search = Array.from(scope.querySelectorAll('button')).find((button) => button !== control && /^(buscar|filtrar|aplicar|consultar)/.test(labelOf(button)));
    if (search) search.click();
  } else if (target.to) navigate(target.to);
}

/**
 * «Ver» o «Editar» en una fila de un listado real (tr[data-id]): si existe la pantalla de detalle o edición de ese dato, se abre con
 * su id. Va en fase de captura para adelantarse a la consulta genérica del botón; sin esa pantalla, el botón sigue como estaba.
 */
export function handleRowClick(event, { views, current, search, navigate }) {
  if (event.button > 0) return;
  const control = event.target && event.target.closest ? event.target.closest('button, a') : null;
  if (!control || !control.closest('.mockup-content tr[data-id]')) return;
  if (!/^(?:ver|detalle|abrir|editar|modificar)\b/.test(labelOf(control))) return;
  const target = uiTarget(control, { views, current, search });
  if (!target || !target.to) return;
  event.preventDefault();
  event.stopPropagation();
  navigate(target.to);
}

/** Textos cortos (valores e insignias, no párrafos) fuera de tablas, botones y menús. */
function shortTexts(scope) {
  const walker = scope.ownerDocument.createTreeWalker(scope, 4);
  const found = [];
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = node.nodeValue.trim();
    if (text && text.length < 30 && !node.parentElement?.closest('table, button, select, nav, label')) found.push(node);
  }
  return found;
}

const heading = (name) => plain(String(name).replace(/_id$/, '').replace(/([a-z0-9])([A-Z])/g, '$1 $2'));
const MONEY_FIELD = /total|precio|subtotal|igv|monto|importe|costo/i;
function format(name, value, currency) {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'number' && MONEY_FIELD.test(name)) return `${currency}${value.toFixed(2)}`;
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value)) return new Date(value).toLocaleString('es');
  return typeof value === 'object' ? JSON.stringify(value) : String(value);
}

/** Lee el registro de ?id= con las operaciones que consultan ese dato (la de ítem o, si no existe, su listado). */
async function loadRecord(api, operations, id) {
  for (const key of operations) {
    try {
      const item = await api(`/api/operations/${encodeURIComponent(key)}/${encodeURIComponent(id)}`);
      if (item && item.id !== undefined) return { id: item.id, ...(item.data || item) };
    } catch { /* sin ruta de ítem: se busca en el listado */ }
    try {
      const listed = await api(`/api/operations/${encodeURIComponent(key)}?limit=500`);
      const row = (Array.isArray(listed) ? listed : (listed && listed.data) || []).find((item) => String(item.id) === String(id));
      if (row) return { id: row.id, ...(row.data || row) };
    } catch { /* sin permiso: se prueba la siguiente */ }
  }
  return null;
}

/**
 * Pantalla de detalle o edición abierta con ?id=: rellena el formulario (edición) o reemplaza el valor de ejemplo que sigue a cada
 * etiqueta (detalle: «Cliente» → su nombre real). Devuelve el registro, o null si no hay ?id o no se encontró.
 */
export async function hydrateRecord(root, { api, views, current, search, registries = [] }) {
  const id = new URLSearchParams(search || '').get('id');
  const view = views.find((item) => item.route === current);
  if (!root || !id || !view || !['detalle', 'editar', 'formulario'].includes(kindOf(view.name))) return null;
  const noun = nounOf(view.name);
  const operations = registries.filter((item) => item.entity && singular(item.entity) === noun.replace(/ /g, '')).map((item) => item.key);
  const record = await loadRecord(api, operations, id);
  if (!record || !root.isConnected) return null;
  const form = root.querySelector('form');
  if (['editar', 'formulario'].includes(kindOf(view.name)) && form) { fillFields(form, record); return record; }
  const currency = /S\/\s?\d/.test(root.textContent) ? 'S/ ' : '';
  // Referencias con su nombre (cliente_id → «Ana Ríos», usuario_id → la cuenta) leyendo el dato referenciado, si el rol puede.
  const lists = new Map();
  const listOf = async (entity) => {
    if (!lists.has(entity)) lists.set(entity, (async () => { const op = registries.find((item) => item.entity === entity); if (!op) return []; try { const listed = await api(`/api/operations/${encodeURIComponent(op.key)}?limit=1000`); return (Array.isArray(listed) ? listed : (listed && listed.data) || []).map((row) => ({ id: row.id, ...(row.data || row) })); } catch { return []; } })());
    return lists.get(entity);
  };
  const nameOf = (row) => { for (const key of ['nombre', 'name', 'numero', 'codigo', 'correo', 'email']) if (row && row[key]) return String(row[key]); return null; };
  for (const key of Object.keys(record).filter((name) => /_id$/.test(name) && record[name] && record[`${name}__etiqueta`] === undefined)) {
    const found = (await listOf(key.replace(/_id$/, ''))).find((row) => String(row.id) === String(record[key]));
    if (found && nameOf(found)) record[`${key}__etiqueta`] = nameOf(found);
  }
  // Las líneas del registro (los productos de una venta) en la tabla del diseño, en lugar de las filas de ejemplo.
  const table = root.querySelector('table');
  const lineEntity = registries.find((item) => item.linea && item.entity)?.entity;
  if (table && table.tBodies[0] && lineEntity) {
    const lines = (await listOf(lineEntity)).filter((row) => String(row[`${noun}_id`]) === String(id));
    for (const line of lines) for (const key of Object.keys(line).filter((name) => /_id$/.test(name) && name !== `${noun}_id`)) {
      const found = (await listOf(key.replace(/_id$/, ''))).find((row) => String(row.id) === String(line[key]));
      if (found && nameOf(found)) line[`${key}__etiqueta`] = nameOf(found);
    }
    const headers = Array.from(table.tHead?.rows[0]?.cells || []).map((cell) => plain(cell.textContent));
    const body = table.tBodies[0];
    body.replaceChildren();
    for (const line of lines) {
      const tr = root.ownerDocument.createElement('tr');
      for (const header of headers) {
        const td = root.ownerDocument.createElement('td');
        td.style.padding = '0.6rem 1rem';
        const words = header.split(' ');
        const key = Object.keys(line).filter((name) => !name.endsWith('__etiqueta') && name !== 'id' && name !== `${noun}_id`).find((name) => { const own = heading(name).split(' '); return own.some((word) => word.length >= 4 && words.some((other) => other.slice(0, 5) === word.slice(0, 5))); })
          || (/importe|subtotal|monto/.test(header) && line.total !== undefined ? 'total' : null);
        const value = key ? (line[`${key}__etiqueta`] ?? line[key]) : (/importe|subtotal|monto/.test(header) && typeof line.cantidad === 'number' && typeof line.precioUnitario === 'number' ? line.cantidad * line.precioUnitario : undefined);
        td.textContent = value === undefined ? '' : format(key || 'importe', value, currency);
        tr.append(td);
      }
      body.append(tr);
    }
    if (!lines.length) { const tr = root.ownerDocument.createElement('tr'); const td = root.ownerDocument.createElement('td'); td.colSpan = Math.max(1, headers.length); td.textContent = 'Sin líneas registradas.'; tr.append(td); body.append(tr); }
  }
  const fields = Object.keys(record).filter((key) => key !== 'id' && !key.endsWith('__etiqueta'));
  const touched = new Set();
  const fillPairs = (scope, source) => {
    const keys = Object.keys(source).filter((key) => key !== 'id' && !key.endsWith('__etiqueta'));
    const labels = Array.from(scope.querySelectorAll('dt, th, label, span, p, div')).filter((element) => !element.children.length && element.textContent.trim() && !element.closest('table'));
    for (const label of labels) {
      const text = plain(label.textContent);
      // «Número de documento» ↔ numeroDocumento, «Correo electrónico» ↔ correo: las palabras del campo están en la etiqueta.
      const words = text.split(' ');
      const field = keys.find((key) => heading(key) === text || plain(key) === text.replace(/ /g, ''))
        || keys.find((key) => { const own = heading(key).split(' '); return words.length <= own.length + 2 && own.every((word) => words.includes(word)); })
        || (/^(vendedor|vendedora|cajero|cajera|mesero|mesera|responsable|empleado|empleada|atendido por|registrado por)$/.test(text) ? keys.find((key) => /^(usuario|cuenta)_?id$/.test(key)) : undefined)
        || (/^fecha\b/.test(text) ? keys.find((key) => key === 'fecha') : undefined);
      if (!field) continue;
      const value = label.nextElementSibling || label.parentElement?.nextElementSibling;
      if (!value || value.children.length > 1 || value.contains(label)) continue;
      value.textContent = format(field, source[`${field}__etiqueta`] !== undefined ? source[`${field}__etiqueta`] : source[field], currency);
      touched.add(value);
    }
  };
  fillPairs(root, record);
  // «Venta N.º 000184»: el número del registro, no el de ejemplo.
  for (const element of Array.from(root.querySelectorAll('*')).filter((item) => !item.children.length && /(n\.?\s?[º°o]|#)\s*\d+/i.test(item.textContent))) {
    element.textContent = element.textContent.replace(/((?:n\.?\s?[º°o]|#)\s*)\d+/i, (match, prefix) => `${prefix}${String(id).padStart(6, '0')}`);
    touched.add(element);
  }
  // Tarjeta de un documento relacionado («Factura interna»): sus datos reales o, si aún no existe, «—» en vez de los de ejemplo.
  // Un registro sin documento aún no trae la clave (factura_id): se recorren las entidades conocidas, no solo sus claves.
  const relatedEntities = [...new Set(registries.filter((item) => item.entity && !item.linea && item.entity !== noun && !/^(usuario|cuenta)$/.test(item.entity)).map((item) => item.entity))];
  let documentNumber = null;
  const cards = new Set();
  for (const entity of relatedEntities) {
    const key = `${entity}_id`;
    // Solo documentos que este dato referencia (alguna venta tiene factura_id), no cualquier entidad cuyo nombre aparezca.
    if (!(key in record) && !(await listOf(noun)).some((row) => key in row)) continue;
    // El título de la tarjeta es un encabezado («Factura interna»); una etiqueta como «Cliente» (dt) es un dato, no una tarjeta.
    const title = Array.from(root.querySelectorAll('h1, h2, h3, h4, h5')).find((element) => !element.children.length && element.textContent.trim().length < 40 && plain(element.textContent).split(' ').some((word) => word.slice(0, 5) === entity.slice(0, 5)));
    if (!title) continue;
    let card = title.parentElement;
    while (card && card !== root && card.querySelectorAll('*').length < 6) card = card.parentElement;
    if (!card || card === root || card.querySelector('table')) continue;
    const related = record[key] ? (await listOf(entity)).find((row) => String(row.id) === String(record[key])) : null;
    if (related) {
      fillPairs(card, related);
      if (related.numero) documentNumber = String(related.numero);
      // Su insignia («• Emitida») con el estado real del documento (una factura anulada dice «Anulada»).
      if (typeof related.estado === 'string' && related.estado) for (const node of shortTexts(card)) if (/^(emitid|pagad|vigent|anulad|pendient|activ)\w*$/i.test(node.nodeValue.trim())) node.nodeValue = related.estado.charAt(0).toUpperCase() + related.estado.slice(1);
      cards.add(card);
      continue;
    }
    cards.add(card);
    // Solo los valores cortos (número, fecha, insignia «• Emitida»); los párrafos explicativos se conservan.
    for (const node of shortTexts(card)) {
      if (title.contains(node)) continue;
      if (/^(emitid|pagad|vigent)/i.test(plain(node.nodeValue))) node.nodeValue = 'Sin emitir';
      else if (/\d/.test(node.nodeValue)) node.nodeValue = '—';
      else continue;
      touched.add(node.parentElement);
    }
  }
  // La insignia de estado del registro («• Activa») dice su estado real.
  if (typeof record.estado === 'string' && record.estado) {
    const estado = record.estado.charAt(0).toUpperCase() + record.estado.slice(1);
    for (const node of shortTexts(root)) if (![...cards].some((card) => card.contains(node)) && /^(activ|anulad|cancelad|inactiv)\w*$/i.test(node.nodeValue.trim()) && node.nodeValue.trim().length < 15) node.nodeValue = estado;
  }
  // Importes de ejemplo que no corresponden a ningún dato del registro (subtotales del diseño): «—».
  for (const element of Array.from(root.querySelectorAll('*')).filter((item) => !item.children.length && !item.closest('table') && !touched.has(item) && /(S\/|\$|€)\s?\d/.test(item.textContent))) element.textContent = '—';
  // «la factura F001-00128 quedará anulada»: el número real del documento, o una mención sin número si aún no existe.
  for (const element of Array.from(root.querySelectorAll('p, span, li')).filter((item) => !item.children.length && !touched.has(item) && /\b[A-Z]\d{3}-\d{4,}\b/.test(item.textContent))) {
    element.textContent = element.textContent.replace(/\s?\b[A-Z]\d{3}-\d{4,}\b/, documentNumber ? ` ${documentNumber}` : ' asociada');
  }
  // Ya no quedan datos de ejemplo: el aviso de «vista con datos de ejemplo» sobra.
  for (const element of Array.from(root.querySelectorAll('*')).filter((item) => /datos de ejemplo del dise/i.test(item.textContent) && item.textContent.length < 160 && item.children.length <= 2)) element.style.display = 'none';
  return record;
}
