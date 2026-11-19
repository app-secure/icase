import React from 'react';

const NAMES = ['Lomo saltado', 'Ají de gallina', 'Chicha morada'];

// Los nombres de campo no llevan tilde; en pantalla sí.
const ACCENTS = { codigo: 'código', descripcion: 'descripción', categoria: 'categoría', telefono: 'teléfono', numero: 'número', ubicacion: 'ubicación', direccion: 'dirección', adquisicion: 'adquisición', actualizacion: 'actualización', ultima: 'última', qr: 'QR', mesero: 'mesero' };
const accent = (text) => text.split(' ').map((word) => ACCENTS[word] || word).join(' ');

/** «fechaHoraLlegadaPrevista» → «Fecha y hora llegada prevista»; «cliente_id» → «Cliente»; «codigoQr» → «Código QR». */
export function fieldLabel(name) {
  const raw = String(name || '').trim();
  const key = raw.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
  if (['passwordhash', 'password'].includes(key)) return 'Contraseña';
  if (['correo', 'email'].includes(key)) return 'Correo electrónico';
  const words = raw.replace(/(?:_|\b)id$/i, '').replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ').trim().toLowerCase().replace(/\bfecha hora\b/, 'fecha y hora');
  const label = accent(words);
  return label ? label.charAt(0).toUpperCase() + label.slice(1) : raw;
}

/** Valor de ejemplo coherente con el tipo del campo; es ilustrativo, no sale de datos reales. */
export function sampleValue(name, meta = {}, index = 0) {
  if (meta.enum?.length) return meta.enum[index % meta.enum.length];
  if (meta.entidad) return `${fieldLabel(meta.entidad)} ${index + 1}`;
  if (meta.type === 'boolean') return index % 2 === 0 ? 'Sí' : 'No';
  if (meta.format === 'date-time' || /fecha.*hora|hora/i.test(name)) return `18/11/2026 ${12 + index}:30`;
  if (meta.format === 'date' || /fecha|vigencia/i.test(name)) return `${18 + index}/11/2026`;
  if (meta.type === 'integer' || meta.type === 'number') return /precio|importe|total|monto|saldo|fondo|efectivo/i.test(name) ? (12.5 + index * 6).toFixed(2) : String(index + 1);
  if (/correo|email/i.test(name)) return `usuario${index + 1}@ejemplo.com`;
  if (/nombre|descripcion/i.test(name)) return NAMES[index % NAMES.length];
  if (/rol/i.test(name)) return ['Mesero', 'Cajero', 'Administrador'][index % 3];
  return `Ejemplo ${index + 1}`;
}

const inputClass = 'w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-500';

function Control({ name, meta = {} }) {
  const label = fieldLabel(name);
  let control;
  if (meta.enum?.length) control = <select disabled className={inputClass}>{meta.enum.map((value) => <option key={value}>{value}</option>)}</select>;
  else if (meta.entidad) control = <select disabled className={inputClass}><option>Seleccionar {fieldLabel(meta.entidad).toLowerCase()}…</option></select>;
  else if (meta.type === 'boolean') return <label className="flex items-center gap-2 text-xs text-slate-700"><input type="checkbox" disabled />{label}</label>;
  else if (meta.format === 'date-time') control = <input disabled type="datetime-local" className={inputClass} />;
  else if (meta.format === 'date') control = <input disabled type="date" className={inputClass} />;
  else if (meta.type === 'integer' || meta.type === 'number') control = <input disabled type="number" placeholder="0" className={inputClass} />;
  else if (/^password/i.test(name)) control = <input disabled type="password" placeholder="••••••••" className={inputClass} />;
  else control = <input disabled type="text" className={inputClass} />;
  return <label className="block text-xs font-medium text-slate-700">{label}<span className="mt-1 block">{control}</span></label>;
}

const Button = ({ children, primary }) => <span className={`inline-block rounded-md px-3 py-1.5 text-xs font-semibold ${primary ? 'bg-violet-600 text-white' : 'border border-slate-300 bg-white text-slate-700'}`}>{children}</span>;

function Component({ component }) {
  const fields = component.campos || [];
  const meta = component.campos_meta || {};
  const buttons = component.botones || [];
  const perRow = buttons.filter((button) => button.por_fila);
  const general = buttons.filter((button) => !button.por_fila);
  const filters = component.filtros || [];

  if (component.tipo === 'formulario') {
    return <div className="space-y-3 rounded-lg border border-slate-200 bg-white p-3">
      {fields.length ? fields.map((name) => <Control key={name} name={name} meta={meta[name]} />) : <p className="text-xs text-amber-700">Este formulario no tiene campos.</p>}
      <div className="flex flex-wrap gap-2 pt-1">{general.length ? general.map((button) => <Button key={button.etiqueta} primary>{button.etiqueta}</Button>) : <Button primary>Guardar</Button>}</div>
    </div>;
  }

  const toolbar = (filters.length > 0 || general.length > 0) && <div className="mb-2 flex flex-wrap items-end gap-2">
    {filters.map((name) => <label key={name} className="text-[11px] font-medium text-slate-600">{fieldLabel(name)}<input disabled type="text" className={`${inputClass} mt-0.5 w-36`} /></label>)}
    {general.map((button) => <Button key={button.etiqueta} primary>{button.etiqueta}</Button>)}
  </div>;

  if (component.tipo === 'tabla') {
    return <div className="rounded-lg border border-slate-200 bg-white p-3">
      {toolbar}
      <div className="overflow-hidden rounded-md border border-slate-200">
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-50 text-slate-600"><tr>{fields.map((name) => <th key={name} className="px-2 py-1.5 font-semibold">{fieldLabel(name)}</th>)}{perRow.length > 0 && <th className="px-2 py-1.5" />}</tr></thead>
          <tbody>{[0, 1, 2].map((row) => <tr key={row} className="border-t border-slate-100 text-slate-700">
            {fields.map((name) => <td key={name} className="px-2 py-1.5">{sampleValue(name, meta[name], row)}</td>)}
            {perRow.length > 0 && <td className="space-x-1 px-2 py-1.5 text-right">{perRow.map((button) => <Button key={button.etiqueta}>{button.etiqueta}</Button>)}</td>}
          </tr>)}</tbody>
        </table>
      </div>
    </div>;
  }

  if (component.tipo === 'tarjetas') {
    return <div className="rounded-lg border border-slate-200 bg-white p-3">
      {toolbar}
      {fields.length === 0 && <p className="text-xs text-amber-700">Estas tarjetas no tienen campos que mostrar.</p>}
      <div className="grid gap-2 sm:grid-cols-2">{[0, 1].map((card) => <div key={card} className="space-y-1 rounded-md border border-slate-200 p-2.5 text-xs">
        {fields.map((name) => <p key={name} className="flex justify-between gap-2"><span className="text-slate-500">{fieldLabel(name)}</span><span className="font-medium text-slate-800">{sampleValue(name, meta[name], card)}</span></p>)}
        {perRow.length > 0 && <div className="flex gap-1 pt-1">{perRow.map((button) => <Button key={button.etiqueta}>{button.etiqueta}</Button>)}</div>}
      </div>)}</div>
    </div>;
  }

  if (component.tipo === 'kpi') {
    return <div className="grid grid-cols-2 gap-2">{fields.slice(0, 4).map((name, index) => <div key={name} className="rounded-lg border border-slate-200 bg-white p-3">
      <p className="text-[11px] text-slate-500">{fieldLabel(name)}</p><p className="text-lg font-semibold text-slate-900">{sampleValue(name, { ...meta[name], type: meta[name]?.type || 'number' }, index + 3)}</p>
    </div>)}</div>;
  }

  // detalle
  return <div className="rounded-lg border border-slate-200 bg-white p-3">
    {toolbar}
    <dl className="space-y-1.5 text-xs">{fields.map((name) => <div key={name} className="flex justify-between gap-3 border-b border-slate-100 pb-1"><dt className="text-slate-500">{fieldLabel(name)}</dt><dd className="font-medium text-slate-800">{sampleValue(name, meta[name], 0)}</dd></div>)}</dl>
    {general.length > 0 && <div className="mt-2 flex gap-2">{general.map((button) => <Button key={button.etiqueta} primary>{button.etiqueta}</Button>)}</div>}
  </div>;
}

/**
 * Esquema de cómo se verá una pantalla con lo que se va a generar: sus componentes, campos con el control que les
 * corresponde y botones. Los datos son de ejemplo y nada funciona: sirve para revisar la forma antes de generar.
 */
export default function ScreenWireframe({ screen }) {
  const mobile = screen.plataforma === 'móvil';
  return <div className={`mx-auto ${mobile ? 'max-w-[340px]' : 'max-w-3xl'} rounded-xl border-2 border-slate-300 bg-slate-100 p-3`} aria-label={`Cómo se verá ${screen.nombre}`}>
    <div className="mb-2 flex items-center justify-between rounded-md bg-white px-3 py-2 text-xs"><strong className="text-slate-800">{screen.nombre}</strong><span className="text-slate-400">{mobile ? 'Móvil' : 'Web'}</span></div>
    <div className="space-y-2">{screen.componentes.map((component, index) => <Component key={index} component={component} />)}</div>
    <p className="mt-2 text-center text-[10px] text-slate-400">Esquema ilustrativo: los datos son de ejemplo y los botones no funcionan.</p>
  </div>;
}
