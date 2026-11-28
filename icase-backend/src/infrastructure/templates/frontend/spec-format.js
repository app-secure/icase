// Presentación compartida por la web y la app móvil: nombres legibles, formatos y qué puede hacerse con cada registro.
const WORDS = {
  numero: 'Número', categoria: 'Categoría', descripcion: 'Descripción', codigo: 'Código', codigoReserva: 'Código de reserva', cantidadSillas: 'Sillas',
  fechaHora: 'Fecha y hora', fechaInicio: 'Inicio', fechaFin: 'Fin', fecha: 'Fecha', metodo: 'Método de pago', passwordHash: 'Contraseña', password: 'Contraseña',
  correo: 'Correo electrónico', email: 'Correo electrónico', rol: 'Rol', montoPagado: 'Monto pagado', montoEfectivo: 'Efectivo', montoTransferencia: 'Transferencia',
  totalVendido: 'Total vendido', cantidadVendida: 'Cantidad vendida', precioUnitario: 'Precio unitario', desde: 'Desde', hasta: 'Hasta', codigo_reserva: 'Código de reserva'
};
const MONEY = /precio|total|monto|saldo|importe/i;

export const label = (name) => {
  if (WORDS[name]) return WORDS[name];
  const text = String(name).replace(/_id$/, '').replace(/^numero(?=[A-Z])/, 'Número de ').replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ').toLowerCase();
  return text.charAt(0).toUpperCase() + text.slice(1);
};

/** «MESA_COMPLETA» → «Mesa completa». */
export const enumLabel = (value) => {
  const text = String(value ?? '').replace(/_/g, ' ').toLowerCase();
  return text.charAt(0).toUpperCase() + text.slice(1);
};

export const isMoney = (name, meta = {}) => MONEY.test(name) && !/cantidad|numero/i.test(name) && (!meta.type || meta.type === 'number' || meta.type === 'integer');
export const money = (value) => `USD ${(Number(value) || 0).toFixed(2)}`;

const two = (value) => String(value).padStart(2, '0');
export const dateText = (value) => { const [year, month, day] = String(value).slice(0, 10).split('-'); return day ? `${day}/${month}/${year}` : String(value); };
export const dateTimeText = (value) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : `${two(date.getDate())}/${two(date.getMonth() + 1)}/${date.getFullYear()} ${two(date.getHours())}:${two(date.getMinutes())}`;
};

/** Texto con el que se muestra un dato; una referencia se muestra con el nombre del registro. */
export function display(row, name, meta = {}) {
  const value = row[`${name}__etiqueta`] !== undefined ? row[`${name}__etiqueta`] : row[name];
  if (value === null || value === undefined || value === '') return '—';
  if (row[`${name}__etiqueta`] !== undefined) return String(value);
  if (typeof value === 'boolean') return value ? 'Sí' : 'No';
  if (name === 'id') return `#${value}`;
  if (meta.enum || /^(estado|disponibilidad|rol|tipo|metodo|categoria)$/.test(name)) return enumLabel(value);
  if (meta.format === 'date-time' || /^\d{4}-\d{2}-\d{2}T/.test(String(value))) return dateTimeText(value);
  if (meta.format === 'date') return dateText(value);
  if (isMoney(name, meta) && Number.isFinite(Number(value))) return money(value);
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

export const pathOf = (action, id, query) => {
  const base = action.path.replace(':id', encodeURIComponent(id ?? ''));
  const params = Object.entries(query || {}).filter(([, value]) => value !== undefined && value !== null && value !== '')
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`).join('&');
  return params ? `${base}?${params}` : base;
};
/** Ruta de las opciones que la persona puede elegir en un campo (sus mesas, los pedidos listos, las cuentas de un rol). */
export const optionsPath = (action, field) => `${action.path.replace('/:id', '')}?opciones=${encodeURIComponent(field)}`;

/** Parámetros que la persona puede escribir para filtrar la consulta. */
export const queryParams = (action) => (action.filters || []).filter((filter) => filter.origen === 'parametro').map((filter) => String(filter.valor));
export const isDateParam = (name) => /^(desde|hasta|fecha|inicio|fin)/i.test(name);

/** Un botón de estado solo se ofrece si el registro está en un estado desde el que puede cambiar. */
export function buttonVisible(def, row) {
  const from = def.transition?.de;
  if (def.type !== 'transicion' || !from?.length || row[def.transition.campo] === undefined) return true;
  return from.includes(row[def.transition.campo]);
}

/** Campos que pide un formulario, sin los que ya vienen dados (el pedido de la fila que se cobra). */
export const formFields = (action, fields, initial = {}, fixed = []) => (fields?.length ? fields : action.inputs || [])
  .concat((action.inputs || []).filter((name) => fields?.length && !fields.includes(name)))
  .filter((name, index, all) => all.indexOf(name) === index && !(fixed.includes(name) && initial[name] !== undefined));

export const isOptional = (action, name) => (action.opcionales || []).includes(name) || action.type === 'actualizar';

/** Cuerpo de la petición con cada valor en el tipo que espera el servidor. */
export function buildBody(action, names, values) {
  return Object.fromEntries(names.filter((name) => values[name] !== undefined && values[name] !== '').map((name) => {
    const meta = action.fields?.[name] || {};
    const value = values[name];
    if (meta.type === 'integer' || meta.type === 'number') return [name, Number(value)];
    if (meta.format === 'date-time') { const date = new Date(value); return [name, Number.isNaN(date.getTime()) ? value : date.toISOString()]; }
    return [name, value];
  }));
}

export function submitLabel(action, preferred) {
  if (preferred) return preferred;
  if (action.liquida) return 'Registrar cobro';
  if (action.lineas) return 'Registrar pedido';
  if (action.type === 'actualizar') return 'Guardar cambios';
  return action.type === 'crear' ? 'Guardar' : label(action.name);
}

/** Mensaje de lo que acaba de ocurrir, con el dato que la persona necesita (código, total). */
export function successMessage(action, result = {}) {
  const code = Object.keys(result || {}).find((key) => /^codigo/i.test(key));
  if (action.cuenta) return action.type === 'crear' ? 'Usuario creado.' : 'Usuario actualizado.';
  if (action.liquida) return `Cobro registrado: ${money(result.monto)}.`;
  if (action.lineas) return `Pedido #${result.id} registrado. Total: ${money(result.total)}.`;
  if (code && result[code]) return `Registrado. Tu código es ${result[code]}`;
  if (action.periodo) return 'Solicitud registrada. Paga en caja para activarla.';
  return action.type === 'crear' ? 'Registro guardado.' : 'Cambio guardado.';
}
