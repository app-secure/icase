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
  if (/^(?:listado|lista|catalogo|historial|gestion)\b/.test(text)) return 'lista';
  return 'otra';
}
const find = (views, kind, noun) => (noun ? views.find((view) => kindOf(view.name) === kind && nounOf(view.name) === noun) : null);
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
    const form = control.closest('form') || control.closest('.mockup-content').querySelector('form');
    if (form) form.reset();
    const search = form && Array.from(form.querySelectorAll('button')).find((button) => /^(buscar|filtrar|aplicar)/.test(labelOf(button)));
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
  if (!root || !id || !view || !['detalle', 'editar'].includes(kindOf(view.name))) return null;
  const noun = nounOf(view.name);
  const operations = registries.filter((item) => item.entity && singular(item.entity) === noun.replace(/ /g, '')).map((item) => item.key);
  const record = await loadRecord(api, operations, id);
  if (!record || !root.isConnected) return null;
  const form = root.querySelector('form');
  if (kindOf(view.name) === 'editar' && form) { fillFields(form, record); return record; }
  const currency = /S\/\s?\d/.test(root.textContent) ? 'S/ ' : '';
  const fields = Object.keys(record).filter((key) => key !== 'id' && !key.endsWith('__etiqueta'));
  const labels = Array.from(root.querySelectorAll('dt, th, label, span, p, div')).filter((element) => !element.children.length && element.textContent.trim());
  for (const label of labels) {
    const text = plain(label.textContent);
    // «Número de documento» ↔ numeroDocumento, «Correo electrónico» ↔ correo: las palabras del campo están en la etiqueta.
    const words = text.split(' ');
    const field = fields.find((key) => heading(key) === text || plain(key) === text.replace(/ /g, ''))
      || fields.find((key) => { const own = heading(key).split(' '); return words.length <= own.length + 2 && own.every((word) => words.includes(word)); });
    if (!field) continue;
    const value = label.nextElementSibling || label.parentElement?.nextElementSibling;
    if (!value || value.children.length > 1 || value.contains(label)) continue;
    value.textContent = format(field, record[`${field}__etiqueta`] !== undefined ? record[`${field}__etiqueta`] : record[field], currency);
  }
  return record;
}
