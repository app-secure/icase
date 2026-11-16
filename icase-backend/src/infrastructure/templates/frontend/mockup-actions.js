// Acciones de los controles del mockup enlazados con data-accion="RF-xx.verbo". Sin dependencias.
const METHODS = { consultar: 'GET', crear: 'POST', editar: 'PATCH', eliminar: 'DELETE' };
const NOT_FIELDS = new Set(['submit', 'button', 'reset', 'file', 'image']);

const scopeOf = (control) => control.closest('form') || control.closest('main') || control.ownerDocument.body;
const formOf = (control) => {
  if (control.tagName === 'FORM') return control;
  if (control.hasAttribute('form')) {
    const form = control.ownerDocument.getElementById(control.getAttribute('form'));
    return form?.tagName === 'FORM' ? form : null;
  }
  return control.form || control.closest('form');
};
const recordId = (control) => control.closest('[data-id]')?.getAttribute('data-id') || '';

/** Campos del formulario asociado, incluidos los externos. Solo las consultas admiten filtros de pantalla. */
export function collectFields(control, { requireForm = false } = {}) {
  const fields = {};
  const form = formOf(control);
  if (requireForm && !form) return fields;
  const controls = form ? Array.from(form.elements) : scopeOf(control).querySelectorAll('input[name], select[name], textarea[name]');
  for (const field of controls) {
    const name = field.getAttribute('name');
    if (!name || !['INPUT', 'SELECT', 'TEXTAREA'].includes(field.tagName)) continue;
    const type = field.tagName === 'INPUT' ? (field.getAttribute('type') || 'text').toLowerCase() : '';
    if (field.disabled || NOT_FIELDS.has(type)) continue;
    if (type === 'checkbox') { fields[name] = field.checked; continue; }
    if (type === 'radio') { if (field.checked) fields[name] = field.value; continue; }
    if (field.tagName === 'SELECT' && field.multiple) {
      fields[name] = Array.from(field.selectedOptions).map((option) => option.value);
      continue;
    }
    // Un campo de solo lectura vacío con placeholder es un valor que fija el sistema (estado "pendiente"): se envía ese valor.
    if (field.value === '' && field.readOnly && field.getAttribute('placeholder')) { fields[name] = field.getAttribute('placeholder'); continue; }
    if (field.value === '') continue;
    fields[name] = type === 'number' || type === 'range' ? (Number.isNaN(Number(field.value)) ? field.value : Number(field.value)) : field.value;
  }
  return fields;
}

const ACCOUNT_FIELDS = { correo: 'email', email: 'email', contrasena: 'password', 'contraseña': 'password', password: 'password', passwordhash: 'password', clave: 'password', nombre: 'nombre', rol: 'rol', activo: 'activo' };

/** Traduce los campos de un formulario de usuarios a los de la API de cuentas; los desconocidos se descartan. */
export function accountFields(fields) {
  const out = {};
  for (const [name, value] of Object.entries(fields)) {
    const target = ACCOUNT_FIELDS[String(name).replace(/[_\s-]/g, '').toLowerCase()];
    if (target && !(target in out)) out[target] = value;
  }
  return out;
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
export async function runAction({ event, operation, verb, api, can, onResult, confirmar, selected, onSelect, identidad }) {
  if (event && typeof event.preventDefault === 'function') event.preventDefault();
  if (event && typeof event.stopPropagation === 'function') event.stopPropagation();
  const control = event && event.currentTarget;
  if (control) {
    const tag = String(control.tagName || '').toUpperCase();
    const type = tag === 'INPUT' ? String(control.getAttribute('type') || 'text').toLowerCase() : '';
    if (['FORM', 'SELECT', 'TEXTAREA'].includes(tag) || (tag === 'INPUT' && !['button', 'submit', 'reset'].includes(type))) return;
  }
  const method = METHODS[verb];
  if (!method) return onResult({ estado: 'error', mensaje: `Acción desconocida: ${verb}` });
  if (can && !can(operation, method)) return onResult({ estado: 'error', mensaje: 'No tienes permiso para esta acción.' });
  // Las cuentas de usuario viven en /api/users (con la contraseña protegida), no en una tabla de datos.
  const accounts = identidad && identidad[operation] === 'usuarios';
  const base = accounts ? '/api/users' : `/api/operations/${encodeURIComponent(operation)}`;
  const read = (target) => (accounts ? accountFields(collectFields(target, { requireForm: true })) : collectFields(target, { requireForm: true }));
  const ask = confirmar || ((message) => (typeof globalThis.confirm === 'function' ? globalThis.confirm(message) : true));
  try {
    if (['crear', 'editar'].includes(verb) && (!control || !formOf(control))) {
      return onResult({ estado: 'aviso', mensaje: 'Esta acción necesita un formulario asociado antes de guardar.' });
    }
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
      await api(base, { method, body: JSON.stringify(control ? read(control) : {}) });
      return onResult({ estado: 'ok', mensaje: 'Registro creado' });
    }
    const chosen = selected && selected.operation === operation && selected.id ? selected : null;
    const id = chosen ? String(chosen.id) : (control ? recordId(control) : '');
    if (!id) return onResult({ estado: 'aviso', mensaje: 'Selecciona primero un registro: usa Consultar y luego Seleccionar en la tabla.' });
    const target = `${base}/${encodeURIComponent(id)}`;
    if (verb === 'editar') {
      await api(target, { method, body: JSON.stringify(read(control)) });
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
