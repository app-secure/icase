// Acciones de los controles del mockup enlazados con data-accion="RF-xx.verbo". Sin dependencias.
const METHODS = { consultar: 'GET', crear: 'POST', editar: 'PATCH', eliminar: 'DELETE' };
const NOT_FIELDS = new Set(['submit', 'button', 'reset', 'file', 'image']);

const scopeOf = (control) => control.closest('form') || control.closest('main') || control.ownerDocument.body;
const recordId = (control) => control.closest('[data-id]')?.getAttribute('data-id') || '';

/** Campos con `name` del formulario del control; sin formulario, los de la pantalla. Los vacíos se omiten. */
export function collectFields(control) {
  const fields = {};
  for (const field of scopeOf(control).querySelectorAll('input[name], select[name], textarea[name]')) {
    const name = field.getAttribute('name');
    const type = field.tagName === 'INPUT' ? (field.getAttribute('type') || 'text').toLowerCase() : '';
    if (field.disabled || NOT_FIELDS.has(type)) continue;
    if (type === 'checkbox') { fields[name] = field.checked; continue; }
    if (type === 'radio') { if (field.checked) fields[name] = field.value; continue; }
    if (field.tagName === 'SELECT' && field.multiple) {
      fields[name] = Array.from(field.selectedOptions).map((option) => option.value);
      continue;
    }
    if (field.value === '') continue;
    fields[name] = type === 'number' || type === 'range' ? (Number.isNaN(Number(field.value)) ? field.value : Number(field.value)) : field.value;
  }
  return fields;
}

/** Vuelca los datos de un registro en los campos con `name` del contenedor; las claves sin campo se ignoran. */
export function fillFields(container, data) {
  const source = data || {};
  for (const field of container.querySelectorAll('input[name], select[name], textarea[name]')) {
    const name = field.getAttribute('name');
    if (!Object.prototype.hasOwnProperty.call(source, name)) continue;
    const value = source[name];
    const type = field.tagName === 'INPUT' ? (field.getAttribute('type') || 'text').toLowerCase() : '';
    if (NOT_FIELDS.has(type)) continue;
    if (type === 'checkbox') field.checked = Boolean(value);
    else if (type === 'radio') field.checked = String(field.value) === String(value);
    else if (field.tagName === 'SELECT' && field.multiple) {
      const chosen = new Set((Array.isArray(value) ? value : [value]).map(String));
      for (const option of field.options) option.selected = chosen.has(option.value);
    } else field.value = value === null || value === undefined ? '' : (typeof value === 'object' ? JSON.stringify(value) : String(value));
  }
}

/**
 * Ejecuta la operación del control y entrega el resultado a `onResult`: nunca lanza.
 * `editar` y `eliminar` actúan sobre el registro seleccionado (`selected`, elegido en la tabla de `consultar`),
 * o, si no hay selección, sobre un `data-id` declarado a mano. El id de un mockup generado es de ejemplo y no se usa.
 */
export async function runAction({ event, operation, verb, api, can, onResult, confirmar, selected, onSelect }) {
  if (event && typeof event.preventDefault === 'function') event.preventDefault();
  const method = METHODS[verb];
  if (!method) return onResult({ estado: 'error', mensaje: `Acción desconocida: ${verb}` });
  if (can && !can(operation, method)) return onResult({ estado: 'error', mensaje: 'No tienes permiso para esta acción.' });
  const control = event && event.currentTarget;
  const base = `/api/operations/${encodeURIComponent(operation)}`;
  const ask = confirmar || ((message) => (typeof globalThis.confirm === 'function' ? globalThis.confirm(message) : true));
  try {
    if (verb === 'consultar') {
      const fields = control ? collectFields(control) : {};
      const params = new URLSearchParams({ limit: '20' });
      const term = fields.search !== undefined ? fields.search : fields.buscar;
      if (term !== undefined && String(term).trim()) params.set('search', String(term).trim());
      const response = await api(`${base}?${params.toString()}`);
      const registros = Array.isArray(response) ? response : (response && response.data) || [];
      return onResult({ estado: 'ok', mensaje: `${registros.length} ${registros.length === 1 ? 'registro' : 'registros'}`, registros, operacion: operation });
    }
    if (verb === 'crear') {
      await api(base, { method, body: JSON.stringify(control ? collectFields(control) : {}) });
      return onResult({ estado: 'ok', mensaje: 'Registro creado' });
    }
    const chosen = selected && selected.operation === operation && selected.id ? selected : null;
    const id = chosen ? String(chosen.id) : (control ? recordId(control) : '');
    if (!id) return onResult({ estado: 'aviso', mensaje: 'Selecciona primero un registro: usa Consultar y luego Seleccionar en la tabla.' });
    const target = `${base}/${encodeURIComponent(id)}`;
    if (verb === 'editar') {
      await api(target, { method, body: JSON.stringify(collectFields(control)) });
      return onResult({ estado: 'ok', mensaje: 'Registro actualizado' });
    }
    if (!ask(`¿Eliminar el registro ${(chosen && chosen.etiqueta) || id}?`)) return undefined;
    await api(target, { method });
    if (chosen && onSelect) onSelect(null);
    return onResult({ estado: 'ok', mensaje: 'Registro eliminado' });
  } catch (error) {
    return onResult({ estado: 'error', mensaje: (error && error.message) || 'Solicitud fallida', ...(error && error.details ? { detalles: error.details } : {}) });
  }
}
