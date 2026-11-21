// Componentes de pantalla generados desde la especificación aprobada de la aplicación.
// Cada componente llama a una operación de negocio con nombre (/api/actions/...) y muestra datos reales del backend.
import React, { useCallback, useEffect, useState } from 'react';
import { useSession } from './session';
import ReferenceOptions from './ReferenceOptions';

const METHOD_FOR_PERMISSION = { consulta: 'GET', resumen: 'GET', crear: 'POST', actualizar: 'PATCH', transicion: 'PATCH', eliminar: 'DELETE' };
const humanize = (name) => String(name).replace(/_id$/, '').replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ').replace(/^./, (letter) => letter.toUpperCase());
const pathOf = (action, id, query) => {
  const base = action.path.replace(':id', encodeURIComponent(id ?? ''));
  const params = new URLSearchParams(Object.entries(query || {}).filter(([, value]) => value !== undefined && value !== ''));
  return params.toString() ? `${base}?${params}` : base;
};
const cell = (row, name) => (row[`${name}__etiqueta`] !== undefined ? row[`${name}__etiqueta`] : row[name]);
const shown = (value) => (value === null || value === undefined ? '' : typeof value === 'boolean' ? (value ? 'Sí' : 'No') : typeof value === 'object' ? JSON.stringify(value) : String(value));

/** Parámetros que la persona puede escribir para filtrar la consulta. */
const queryParams = (action) => (action.filters || []).filter((filter) => filter.origen === 'parametro').map((filter) => String(filter.valor));

function usePermission() {
  const { can } = useSession();
  return (action) => can(action.permiso || action.capability, METHOD_FOR_PERMISSION[action.type]);
}

function useRows(action, query) {
  const { api } = useSession();
  const [rows, setRows] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const key = JSON.stringify(query || {});
  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api(pathOf(action, undefined, JSON.parse(key)));
      setRows(Array.isArray(data) ? data : []);
      setError('');
    } catch (failure) { setError(failure.message); } finally { setLoading(false); }
  }, [api, action, key]);
  useEffect(() => { reload(); }, [reload]);
  return { rows, error, loading, reload };
}

function FieldInput({ name, meta = {}, value, onChange }) {
  const common = { name, id: `campo-${name}`, className: 'input', value: value ?? '', onChange: (event) => onChange(name, event.target.value) };
  if (meta.referencia) return <select {...common}><ReferenceOptions operation={meta.referencia} /></select>;
  if (meta.enum) return <select {...common}><option value="">Selecciona…</option>{meta.enum.map((item) => <option key={item} value={item}>{item}</option>)}</select>;
  if (meta.type === 'boolean') return <input type="checkbox" name={name} id={`campo-${name}`} checked={Boolean(value)} onChange={(event) => onChange(name, event.target.checked)} />;
  if (meta.type === 'integer' || meta.type === 'number') return <input {...common} type="number" step={meta.type === 'integer' ? '1' : 'any'} />;
  if (meta.format === 'date-time') return <input {...common} type="datetime-local" />;
  if (meta.format === 'date') return <input {...common} type="date" />;
  return <input {...common} type="text" />;
}

const LABEL_KEYS = ['nombre', 'name', 'titulo', 'numero', 'codigo', 'descripcion'];
const rowLabel = (row) => { for (const key of LABEL_KEYS) if (row[key] !== undefined && row[key] !== null && String(row[key]).trim()) return String(row[key]); return `#${row.id}`; };
const money = (value) => (Number.isFinite(value) ? value.toFixed(2) : '0.00');

/** Líneas de un alta compuesta (los platos de un pedido): elige el registro y la cantidad; el servidor pone el precio y suma el total. */
function LinesEditor({ action, lines, setLines }) {
  const { api } = useSession();
  const [options, setOptions] = useState([]);
  const [error, setError] = useState('');
  useEffect(() => {
    let alive = true;
    api(action.path).then((data) => { if (alive) setOptions(Array.isArray(data) ? data : []); }).catch((failure) => { if (alive) setError(failure.message); });
    return () => { alive = false; };
  }, [api, action.path]);
  const spec = action.lineas;
  const priceOf = (ref) => Number(options.find((row) => String(row.id) === String(ref))?.[spec.precio]);
  const total = lines.reduce((sum, line) => sum + (line.ref ? (Number.isFinite(priceOf(line.ref)) ? priceOf(line.ref) : 0) * (Number(line.qty) || 0) : 0), 0);
  const change = (index, patch) => setLines((old) => old.map((line, position) => (position === index ? { ...line, ...patch } : line)));
  return <fieldset className="lines" aria-label="Líneas">
    <legend>{humanize(spec.destino)}s del pedido</legend>
    {error && <p role="alert" className="error">{error}</p>}
    {lines.map((line, index) => <div className="line-row" key={index}>
      <select className="input" aria-label={`${humanize(spec.destino)} ${index + 1}`} value={line.ref} onChange={(event) => change(index, { ref: event.target.value })}>
        <option value="">Selecciona…</option>
        {options.map((row) => <option key={row.id} value={row.id}>{rowLabel(row)}{spec.precio && row[spec.precio] !== undefined ? ` — ${money(Number(row[spec.precio]))}` : ''}</option>)}
      </select>
      <input className="input" type="number" min="1" step="1" aria-label={`Cantidad ${index + 1}`} value={line.qty} onChange={(event) => change(index, { qty: event.target.value })} />
      <button type="button" className="button secondary" disabled={lines.length === 1} onClick={() => setLines((old) => old.filter((_, position) => position !== index))}>Quitar</button>
    </div>)}
    <button type="button" className="button secondary" onClick={() => setLines((old) => [...old, { ref: '', qty: 1 }])}>Añadir otra línea</button>
    {spec.precio && <p className="lines-total">Total estimado: <strong>{money(total)}</strong></p>}
  </fieldset>;
}

/** Formulario de una operación de crear o actualizar: pide exactamente sus campos de entrada. */
export function ActionForm({ action, fields, id, initial, onDone, title }) {
  const { api } = useSession();
  const names = fields?.length ? fields : action.inputs;
  const [values, setValues] = useState(initial || {});
  const [lines, setLines] = useState([{ ref: '', qty: 1 }]);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const set = (name, value) => setValues((old) => ({ ...old, [name]: value }));
  const submit = async (event) => {
    event.preventDefault();
    const body = Object.fromEntries(names.filter((name) => values[name] !== undefined && values[name] !== '').map((name) => {
      const type = action.fields?.[name]?.type;
      return [name, type === 'integer' || type === 'number' ? Number(values[name]) : values[name]];
    }));
    if (action.lineas) body.lineas = lines.filter((line) => line.ref).map((line) => ({ [action.lineas.referencia]: line.ref, [action.lineas.cantidad]: Number(line.qty) }));
    try {
      await api(pathOf(action, id), { method: action.method, body: JSON.stringify(body) });
      setMessage('Guardado'); setError(''); if (!id) { setValues({}); setLines([{ ref: '', qty: 1 }]); }
      onDone?.();
    } catch (failure) { setError(failure.message); setMessage(''); }
  };
  return <form onSubmit={submit} className="form-grid" aria-label={title || action.name}>
    {names.map((name) => <div className="form-row" key={name}>
      <label htmlFor={`campo-${name}`}>{humanize(name)}</label>
      <FieldInput name={name} meta={action.fields?.[name]} value={values[name]} onChange={set} />
    </div>)}
    {action.lineas && <LinesEditor action={action} lines={lines} setLines={setLines} />}
    <div className="form-row"><button type="submit" className="button">{title || humanize(action.name)}</button></div>
    {message && <p role="status">{message}</p>}
    {error && <p role="alert" className="error">{error}</p>}
  </form>;
}

function RowButtons({ row, buttons, actions, allowed, afterRun }) {
  const { api } = useSession();
  const [editing, setEditing] = useState(null);
  const [error, setError] = useState('');
  const perRow = buttons.map((button) => ({ ...button, def: actions[button.operacion] })).filter((button) => button.def?.byId && allowed(button.def));
  const run = async (button) => {
    if (button.def.type === 'eliminar' && !window.confirm('¿Eliminar este registro?')) return;
    if (button.def.type === 'actualizar') { setEditing(editing === button.operacion ? null : button.operacion); return; }
    try { await api(pathOf(button.def, row.id), { method: button.def.method, body: JSON.stringify({}) }); setError(''); afterRun(); } catch (failure) { setError(failure.message); }
  };
  if (!perRow.length) return null;
  const open = perRow.find((button) => button.operacion === editing);
  return <div className="row-actions">
    {perRow.map((button) => <button key={`${button.etiqueta}-${button.operacion}`} type="button" className="button secondary" data-accion={button.operacion} onClick={() => run(button)}>{button.etiqueta}</button>)}
    {error && <span role="alert" className="error">{error}</span>}
    {open && <ActionForm action={open.def} id={row.id} initial={row} onDone={() => { setEditing(null); afterRun(); }} title={open.etiqueta} />}
  </div>;
}

/** Filtros por parámetro y botones que no dependen de una fila (refrescar, nuevo registro). */
function Toolbar({ action, buttons, actions, allowed, query, setQuery, reload }) {
  const [creating, setCreating] = useState(null);
  const params = queryParams(action);
  const create = buttons.map((button) => ({ ...button, def: actions[button.operacion] })).filter((button) => button.def && !button.def.byId && button.def.type === 'crear' && allowed(button.def));
  const open = create.find((button) => button.operacion === creating);
  return <div className="toolbar">
    {params.length > 0 && <form className="form-grid" onSubmit={(event) => { event.preventDefault(); const data = new FormData(event.currentTarget); setQuery(Object.fromEntries(params.map((name) => [name, data.get(name)]))); }}>
      {params.map((name) => <div className="form-row" key={name}><label htmlFor={`filtro-${name}`}>{humanize(name)}</label><input id={`filtro-${name}`} name={name} className="input" type={/^(desde|hasta|fecha|inicio|fin)/i.test(name) ? 'date' : 'text'} defaultValue={query[name] || ''} /></div>)}
      <div className="form-row"><button type="submit" className="button">Filtrar</button></div>
    </form>}
    <button type="button" className="button secondary" onClick={reload}>Actualizar</button>
    {create.map((button) => <button key={button.operacion} type="button" className="button" onClick={() => setCreating(creating === button.operacion ? null : button.operacion)}>{button.etiqueta}</button>)}
    {open && <ActionForm action={open.def} onDone={() => { setCreating(null); reload(); }} title={open.etiqueta} />}
  </div>;
}

function ActionList({ block, actions, allowed }) {
  const action = actions[block.operacion];
  const [query, setQuery] = useState({});
  const { rows, error, loading, reload } = useRows(action, query);
  const fields = block.campos?.length ? block.campos : action.output;
  const buttons = block.acciones || [];
  const toolbar = <Toolbar action={action} buttons={buttons} actions={actions} allowed={allowed} query={query} setQuery={setQuery} reload={reload} />;
  if (error) return <section>{toolbar}<p role="alert" className="error">{error}</p></section>;
  if (!loading && !rows.length) return <section>{toolbar}<p className="empty" role="status">No hay registros para mostrar.</p></section>;
  if (block.tipo === 'tarjetas') {
    return <section>{toolbar}<div className="cards">{rows.map((row) => <article key={row.id} className="card" data-id={row.id}>
      <dl>{fields.map((name) => <div key={name}><dt>{humanize(name)}</dt><dd>{shown(cell(row, name))}</dd></div>)}</dl>
      <RowButtons row={row} buttons={buttons} actions={actions} allowed={allowed} afterRun={reload} />
    </article>)}</div></section>;
  }
  return <section>{toolbar}<div className="table-wrap"><table className="table">
    <thead><tr>{fields.map((name) => <th key={name}>{humanize(name)}</th>)}<th /></tr></thead>
    <tbody>{rows.map((row) => <tr key={row.id} data-id={row.id}>
      {fields.map((name) => <td key={name}>{shown(cell(row, name))}</td>)}
      <td><RowButtons row={row} buttons={buttons} actions={actions} allowed={allowed} afterRun={reload} /></td>
    </tr>)}</tbody>
  </table></div></section>;
}

function ActionDetail({ block, actions }) {
  const action = actions[block.operacion];
  const { rows, error } = useRows(action, {});
  const fields = block.campos?.length ? block.campos : action.output;
  const row = rows[0];
  if (error) return <p role="alert" className="error">{error}</p>;
  if (!row) return <p className="empty" role="status">No hay datos para mostrar.</p>;
  return <dl className="detail">{fields.map((name) => <div key={name}><dt>{humanize(name)}</dt><dd>{shown(cell(row, name))}</dd></div>)}</dl>;
}

function ActionKpi({ block, actions }) {
  const action = actions[block.operacion];
  const { rows, error } = useRows(action, {});
  return <div className="kpi" role="status">{error ? <span className="error">{error}</span> : <><strong>{rows.length}</strong> <span>{humanize(action.entity || action.name)}</span></>}</div>;
}

/** Un componente de pantalla de la especificación: tabla, tarjetas, formulario, detalle o indicador. */
export function SpecBlock({ block, actions }) {
  const allowed = usePermission();
  const action = actions[block.operacion];
  if (!action) return null;
  if (!allowed(action)) return <p className="empty" role="status">No tienes permiso para ver esta sección.</p>;
  if (block.tipo === 'formulario') return <ActionForm action={action} fields={block.campos} />;
  if (block.tipo === 'detalle') return <ActionDetail block={block} actions={actions} />;
  if (block.tipo === 'kpi') return <ActionKpi block={block} actions={actions} />;
  return <ActionList block={block} actions={actions} allowed={allowed} />;
}
