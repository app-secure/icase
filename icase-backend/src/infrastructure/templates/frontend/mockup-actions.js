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

/** Ejecuta la operación del control y entrega el resultado a `onResult`: nunca lanza. */
export async function runAction({ event, operation, verb, api, can, onResult, confirmar }) {
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
      return onResult({ estado: 'ok', mensaje: `${registros.length} ${registros.length === 1 ? 'registro' : 'registros'}`, registros });
    }
    if (verb === 'crear') {
      await api(base, { method, body: JSON.stringify(control ? collectFields(control) : {}) });
      return onResult({ estado: 'ok', mensaje: 'Registro creado' });
    }
    const id = control ? recordId(control) : '';
    if (!id) return onResult({ estado: 'aviso', mensaje: 'Este control no indica qué registro modificar (falta data-id).' });
    const target = `${base}/${encodeURIComponent(id)}`;
    if (verb === 'editar') {
      await api(target, { method, body: JSON.stringify(collectFields(control)) });
      return onResult({ estado: 'ok', mensaje: 'Registro actualizado' });
    }
    if (!ask('¿Eliminar el registro?')) return undefined;
    await api(target, { method });
    return onResult({ estado: 'ok', mensaje: 'Registro eliminado' });
  } catch (error) {
    return onResult({ estado: 'error', mensaje: (error && error.message) || 'Solicitud fallida', ...(error && error.details ? { detalles: error.details } : {}) });
  }
}
