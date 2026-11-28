// Componentes de pantalla generados desde la especificación aprobada de la aplicación.
// Cada componente llama a una operación de negocio con nombre (/api/actions/...) y muestra datos reales del backend.
import React, { useCallback, useEffect, useState } from 'react';
import { useSession } from './session';
import ReferenceOptions from './ReferenceOptions';
import { label, enumLabel, money, isMoney, display, pathOf, optionsPath, queryParams, isDateParam, buttonVisible, formFields, isOptional, buildBody, submitLabel, successMessage } from './specFormat';

const METHOD_FOR_PERMISSION = { consulta: 'GET', resumen: 'GET', crear: 'POST', actualizar: 'PATCH', transicion: 'PATCH', eliminar: 'DELETE' };
const permissionOf = (action) => action.permiso || action.capability;

function usePermission() {
  const { can } = useSession();
  return (action) => can(permissionOf(action), METHOD_FOR_PERMISSION[action.type]);
}

/** Filas de una consulta; se vuelven a pedir solas cuando el servidor avisa de cambios (platos agotados, pedidos nuevos). */
function useRows(action, query) {
  const { api, subscribeChanges } = useSession();
  const [rows, setRows] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const key = JSON.stringify(query || {});
  const reload = useCallback(async () => {
    try {
      const data = await api(pathOf(action, undefined, JSON.parse(key)));
      setRows(Array.isArray(data) ? data : []);
      setError('');
    } catch (failure) { setError(failure.message); } finally { setLoading(false); }
  }, [api, action, key]);
  useEffect(() => { reload(); }, [reload]);
  const channel = permissionOf(action);
  useEffect(() => (subscribeChanges ? subscribeChanges(channel, reload) : undefined), [subscribeChanges, channel, reload]);
  return { rows, error, loading, reload };
}

/** Registros que la persona puede elegir: los entrega la propia operación, con su permiso. */
function useOptions(action, name, enabled, revision) {
  const { api } = useSession();
  const [options, setOptions] = useState([]);
  useEffect(() => {
    if (!enabled) return undefined;
    let alive = true;
    api(optionsPath(action, name)).then((data) => { if (alive) setOptions(Array.isArray(data) ? data : []); }).catch(() => { if (alive) setOptions([]); });
    return () => { alive = false; };
  }, [api, action, name, enabled, revision]);
  return options;
}

function FieldInput({ action, name, value, onChange, revision }) {
  const meta = action.fields?.[name] || {};
  const choosable = (action.opciones || []).includes(name);
  const options = useOptions(action, name, choosable, revision);
  const required = !isOptional(action, name);
  const common = { name, id: `${action.name}-${name}`, className: 'input', value: value ?? '', required, onChange: (event) => onChange(name, event.target.value) };
  if (choosable) {
    const chosen = options.find((option) => String(option.id) === String(value));
    return <>
      <select {...common}><option value="">{required ? 'Selecciona…' : 'Sin asignar'}</option>{options.map((option) => <option key={option.id} value={option.id}>{option.etiqueta}</option>)}</select>
      {!options.length && <small className="hint">No hay opciones disponibles por ahora.</small>}
      {chosen?.total !== undefined && <small className="amount">Total a cobrar: <strong>{money(chosen.total)}</strong></small>}
    </>;
  }
  if (meta.referencia) return <select {...common}><ReferenceOptions operation={meta.referencia} /></select>;
  if (meta.enum) {
    // Las cuentas guardan el rol en minúsculas.
    const account = action.cuenta?.rol === name;
    return <select {...common}><option value="">Selecciona…</option>{meta.enum.map((item) => <option key={item} value={account ? String(item).toLowerCase() : item}>{enumLabel(item)}</option>)}</select>;
  }
  if (meta.type === 'boolean') return <input type="checkbox" name={name} id={common.id} checked={Boolean(value)} onChange={(event) => onChange(name, event.target.checked)} />;
  if (meta.type === 'integer' || meta.type === 'number') return <input {...common} type="number" min="0" step={meta.type === 'integer' ? '1' : '0.01'} inputMode="decimal" />;
  if (meta.format === 'date-time') return <input {...common} type="datetime-local" />;
  if (meta.format === 'date') return <input {...common} type="date" />;
  if (action.cuenta?.password === name) return <input {...common} type="password" minLength={8} autoComplete="new-password" />;
  if (action.cuenta?.email === name) return <input {...common} type="email" />;
  return <input {...common} type="text" />;
}

const LABEL_KEYS = ['nombre', 'name', 'titulo', 'numero', 'codigo', 'descripcion'];
const rowLabel = (row) => { for (const key of LABEL_KEYS) if (row[key] !== undefined && row[key] !== null && String(row[key]).trim()) return String(row[key]); return `#${row.id}`; };

/** Líneas de un alta compuesta (los platos de un pedido): elige el registro y la cantidad; el servidor pone el precio y suma el total. */
function LinesEditor({ action, lines, setLines }) {
  const { api, subscribeChanges } = useSession();
  const [options, setOptions] = useState([]);
  const [error, setError] = useState('');
  const load = useCallback(() => api(action.path).then((data) => { setOptions(Array.isArray(data) ? data : []); setError(''); }).catch((failure) => setError(failure.message)), [api, action.path]);
  useEffect(() => { load(); }, [load]);
  // Un plato que la cocina marca como agotado deja de ofrecerse sin recargar.
  const channel = permissionOf(action);
  useEffect(() => (subscribeChanges ? subscribeChanges(channel, load) : undefined), [subscribeChanges, channel, load]);
  const spec = action.lineas;
  const noun = label(spec.destino);
  const priceOf = (ref) => Number(options.find((row) => String(row.id) === String(ref))?.[spec.precio]);
  const total = lines.reduce((sum, line) => sum + (line.ref ? (Number.isFinite(priceOf(line.ref)) ? priceOf(line.ref) : 0) * (Number(line.qty) || 0) : 0), 0);
  const change = (index, patch) => setLines((old) => old.map((line, position) => (position === index ? { ...line, ...patch } : line)));
  return <fieldset className="lines" aria-label="Líneas">
    <legend>{noun}s del pedido</legend>
    {error && <p role="alert" className="error">{error}</p>}
    {lines.map((line, index) => <div className="line-row" key={index}>
      <select className="input" required aria-label={`${noun} ${index + 1}`} value={line.ref} onChange={(event) => change(index, { ref: event.target.value })}>
        <option value="">Selecciona…</option>
        {options.map((row) => <option key={row.id} value={row.id}>{rowLabel(row)}{spec.precio && row[spec.precio] !== undefined ? ` — ${money(row[spec.precio])}` : ''}</option>)}
      </select>
      <input className="input" required type="number" min="1" step="1" aria-label={`Cantidad ${index + 1}`} value={line.qty} onChange={(event) => change(index, { qty: event.target.value })} />
      <button type="button" className="button secondary" disabled={lines.length === 1} onClick={() => setLines((old) => old.filter((_, position) => position !== index))}>Quitar</button>
    </div>)}
    <button type="button" className="button secondary" onClick={() => setLines((old) => [...old, { ref: '', qty: 1 }])}>Añadir {noun.toLowerCase()}</button>
    {spec.precio && <p className="lines-total">Total estimado: <strong>{money(total)}</strong></p>}
  </fieldset>;
}

/** Formulario de una operación: pide exactamente sus campos de entrada. */
export function ActionForm({ action, fields, id, initial, onDone, title, submit: preferred }) {
  const { api } = useSession();
  const given = initial || {};
  const names = formFields(action, fields, given, action.liquida ? [action.liquida.campo] : []);
  const [values, setValues] = useState(given);
  const [lines, setLines] = useState([{ ref: '', qty: 1 }]);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState(0);
  const set = (name, value) => setValues((old) => ({ ...old, [name]: value }));
  const submit = async (event) => {
    event.preventDefault();
    const sent = [...names, ...(action.liquida && given[action.liquida.campo] !== undefined ? [action.liquida.campo] : [])];
    const body = buildBody(action, sent, values);
    // Con saldo prepagado, el método se envía igual que cualquier otro campo.
    if (action.lineas) body.lineas = lines.filter((line) => line.ref).map((line) => ({ [action.lineas.referencia]: line.ref, [action.lineas.cantidad]: Number(line.qty) }));
    setBusy(true); setError(''); setMessage('');
    try {
      const result = await api(pathOf(action, id), { method: action.method, body: JSON.stringify(body) });
      const done = successMessage(action, result || {});
      setMessage(done);
      if (!id && action.type === 'crear') { setValues(given); setLines([{ ref: '', qty: 1 }]); setRevision((current) => current + 1); }
      onDone?.(done);
    } catch (failure) { setError(failure.message); } finally { setBusy(false); }
  };
  return <form onSubmit={submit} className="spec-form" aria-label={title || label(action.name)}>
    <div className="form-grid">
      {names.map((name) => <div className="form-row" key={name}>
        <label htmlFor={`${action.name}-${name}`}>{label(name)}{isMoney(name, action.fields?.[name]) ? ' (USD)' : ''}{isOptional(action, name) ? '' : ' *'}</label>
        <FieldInput action={action} name={name} value={values[name]} onChange={set} revision={revision} />
      </div>)}
    </div>
    {action.lineas && <LinesEditor action={action} lines={lines} setLines={setLines} />}
    <div className="form-actions"><button type="submit" className="button" disabled={busy}>{busy ? 'Guardando…' : submitLabel(action, preferred)}</button></div>
    {message && <p role="status" className="success">{message}</p>}
    {error && <p role="alert" className="error">{error}</p>}
  </form>;
}

const needsForm = (def) => def.type === 'actualizar' || Boolean(def.liquida) || Boolean(def.alCambiar);

/** Botones de la fila: los que actúan sobre ella y «Cobrar», que registra el cobro de ese documento. */
function RowButtons({ row, buttons, actions, allowed, afterRun, opened, onOpen }) {
  const { api } = useSession();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const perRow = buttons.map((button) => ({ ...button, def: actions[button.operacion] }))
    .filter((button) => button.def && (button.def.byId || button.def.liquida) && allowed(button.def) && buttonVisible(button.def, row));
  const run = async (button) => {
    setError('');
    if (needsForm(button.def)) { onOpen(opened === button.operacion ? null : button.operacion); return; }
    if (button.def.type === 'eliminar' && !window.confirm('¿Eliminar este registro?')) return;
    setBusy(true);
    try {
      await api(pathOf(button.def, row.id), { method: button.def.method, body: JSON.stringify({}) });
      await afterRun(`${button.etiqueta}: hecho.`);
    } catch (failure) { setError(failure.message); } finally { setBusy(false); }
  };
  if (!perRow.length) return null;
  return <div className="row-actions">
    {perRow.map((button) => <button key={`${button.etiqueta}-${button.operacion}`} type="button" className="button secondary" aria-expanded={needsForm(button.def) ? opened === button.operacion : undefined} disabled={busy} data-accion={button.operacion} onClick={() => run(button)}>{button.etiqueta}</button>)}
    {error && <span role="alert" className="error">{error}</span>}
  </div>;
}

/** El formulario que pide un botón de fila (cobrar, activar, editar), a lo ancho bajo su registro. */
function RowForm({ row, operation, buttons, actions, onDone }) {
  const def = actions[operation];
  const button = buttons.find((item) => item.operacion === operation);
  if (!def || !button) return null;
  const initial = def.liquida ? { [def.liquida.campo]: String(row.id) }
    : def.type === 'actualizar' ? Object.fromEntries((def.inputs || []).filter((name) => row[name] !== undefined).map((name) => [name, row[name]])) : {};
  return <div className="row-form"><h2>{button.etiqueta} · registro #{row.id}</h2>
    <ActionForm action={def} id={def.byId ? row.id : undefined} initial={initial} submit={button.etiqueta} onDone={onDone} title={`${button.etiqueta} #${row.id}`} />
  </div>;
}

/** Filtros por parámetro y botones que no dependen de una fila (actualizar, nuevo registro). */
function Toolbar({ action, buttons, actions, allowed, query, setQuery, reload }) {
  const [creating, setCreating] = useState(null);
  const params = queryParams(action);
  const create = buttons.map((button) => ({ ...button, def: actions[button.operacion] })).filter((button) => button.def && !button.def.byId && button.def.type === 'crear' && !button.def.liquida && allowed(button.def));
  const open = create.find((button) => button.operacion === creating);
  return <div className="toolbar">
    {params.length > 0 && <form className="filters" onSubmit={(event) => { event.preventDefault(); const data = new FormData(event.currentTarget); setQuery(Object.fromEntries(params.map((name) => [name, String(data.get(name) || '').trim()]))); }}>
      {params.map((name) => <div className="form-row" key={name}><label htmlFor={`filtro-${action.name}-${name}`}>{label(name)}</label><input id={`filtro-${action.name}-${name}`} name={name} className="input" required={action.exigeParametro} type={isDateParam(name) ? 'date' : 'text'} defaultValue={query[name] || ''} /></div>)}
      <button type="submit" className="button">{action.exigeParametro ? 'Buscar' : 'Filtrar'}</button>
    </form>}
    <button type="button" className="button secondary" onClick={reload}>Actualizar</button>
    {create.map((button) => <button key={button.operacion} type="button" className="button" onClick={() => setCreating(creating === button.operacion ? null : button.operacion)}>{button.etiqueta}</button>)}
    {open && <ActionForm action={open.def} onDone={() => { setCreating(null); reload(); }} title={open.etiqueta} />}
  </div>;
}

/** Columnas de una consulta: las aprobadas, el número del documento y lo que contiene (los platos). */
function columnsOf(block, action) {
  const fields = [...(block.campos?.length ? block.campos : action.output || [])];
  if (action.detalle && !fields.includes(action.detalle.campo)) fields.push(action.detalle.campo);
  if (action.detalle && !fields.includes('id')) fields.unshift('id');
  return fields.filter((name) => !/password|hash/i.test(name));
}
const heading = (name) => (name === 'id' ? 'N.º' : label(name));
const Cell = ({ row, name, action }) => {
  const text = display(row, name, action.fields?.[name]);
  if (/^(estado|disponibilidad)$/.test(name) && text !== '—') return <span className={`badge badge-${String(row[name]).toLowerCase()}`}>{text}</span>;
  return text;
};

function ActionList({ block, actions, allowed }) {
  const action = actions[block.operacion];
  const [query, setQuery] = useState({});
  const [notice, setNotice] = useState('');
  const [panel, setPanel] = useState(null);
  const { rows, error, loading, reload } = useRows(action, query);
  const fields = columnsOf(block, action);
  const buttons = block.acciones || [];
  const afterRun = async (done) => { setPanel(null); setNotice(done || ''); await reload(); };
  const rowButtons = (row) => <RowButtons row={row} buttons={buttons} actions={actions} allowed={allowed} afterRun={afterRun}
    opened={panel?.id === row.id ? panel.operation : null} onOpen={(operation) => { setNotice(''); setPanel(operation ? { id: row.id, operation } : null); }} />;
  const rowForm = (row) => (panel?.id === row.id ? <RowForm row={row} operation={panel.operation} buttons={buttons} actions={actions} onDone={afterRun} /> : null);
  const toolbar = <Toolbar action={action} buttons={buttons} actions={actions} allowed={allowed} query={query} setQuery={setQuery} reload={reload} />;
  const waiting = action.exigeParametro && !queryParams(action).some((name) => query[name]);
  const status = notice ? <p role="status" className="success">{notice}</p> : null;
  const wrap = (content) => <section>{toolbar}{status}{content}</section>;
  if (error) return wrap(<p role="alert" className="error">{error}</p>);
  if (loading) return wrap(<p className="empty" role="status">Cargando…</p>);
  if (waiting) return wrap(<p className="empty" role="status">Escribe el dato y pulsa «Buscar».</p>);
  if (!rows.length) return wrap(<p className="empty" role="status">{queryParams(action).some((name) => query[name]) ? 'No se encontraron registros.' : 'No hay registros para mostrar.'}</p>);
  if (block.tipo === 'tarjetas') {
    return wrap(<div className="cards">{rows.map((row) => <article key={row.id} className="card" data-id={row.id}>
      <dl>{fields.map((name) => <div key={name}><dt>{heading(name)}</dt><dd><Cell row={row} name={name} action={action} /></dd></div>)}</dl>
      {rowButtons(row)}
      {rowForm(row)}
    </article>)}</div>);
  }
  const hasButtons = buttons.some((button) => actions[button.operacion]);
  return wrap(<div className="table-wrap"><table className="table">
    <thead><tr>{fields.map((name) => <th key={name}>{heading(name)}</th>)}{hasButtons && <th>Acciones</th>}</tr></thead>
    <tbody>{rows.map((row) => <React.Fragment key={row.id}>
      <tr data-id={row.id}>
        {fields.map((name) => <td key={name}><Cell row={row} name={name} action={action} /></td>)}
        {hasButtons && <td>{rowButtons(row)}</td>}
      </tr>
      {panel?.id === row.id && <tr><td colSpan={fields.length + (hasButtons ? 1 : 0)}>{rowForm(row)}</td></tr>}
    </React.Fragment>)}</tbody>
  </table></div>);
}

/** Un reporte sin agrupar es un par de cifras grandes; agrupado, una tabla. */
function ActionSummary({ block, actions, allowed }) {
  const action = actions[block.operacion];
  if (action.agrupado) return <ActionList block={block} actions={actions} allowed={allowed} />;
  return <ActionFigures action={action} fields={block.campos?.length ? block.campos : action.output} />;
}

function ActionFigures({ action, fields }) {
  const [query, setQuery] = useState({});
  const { rows, error, reload } = useRows(action, query);
  const row = rows[0] || {};
  return <section>
    <Toolbar action={action} buttons={[]} actions={{}} allowed={() => false} query={query} setQuery={setQuery} reload={reload} />
    {error ? <p role="alert" className="error">{error}</p> : <div className="figures">{(fields || []).map((name) => <div className="figure" key={name}><span>{label(name)}</span><strong>{display(row, name, action.fields?.[name] || { type: 'number' })}</strong></div>)}</div>}
  </section>;
}

function ActionDetail({ block, actions }) {
  const action = actions[block.operacion];
  const { rows, error, loading } = useRows(action, {});
  const fields = columnsOf(block, action).filter((name) => name !== 'id');
  if (error) return <section><p role="alert" className="error">{error}</p></section>;
  if (loading) return <section><p className="empty" role="status">Cargando…</p></section>;
  if (!rows.length) return <section><p className="empty" role="status">No hay datos para mostrar.</p></section>;
  return <section>{rows.map((row) => <dl className="detail" key={row.id}>{fields.map((name) => <div key={name}><dt>{label(name)}</dt><dd><Cell row={row} name={name} action={action} /></dd></div>)}</dl>)}</section>;
}

/** Un indicador muestra el dato de la persona (sus puntos); si son varios registros, cuántos hay. */
function ActionKpi({ block, actions }) {
  const action = actions[block.operacion];
  const { rows, error } = useRows(action, {});
  const fields = (block.campos?.length ? block.campos : action.output || []).filter((name) => name !== 'id' && !name.endsWith('_id'));
  if (error) return <section><p role="alert" className="error">{error}</p></section>;
  const row = rows.length <= 1 ? rows[0] || {} : null;
  return <section><div className="figures">{row && fields.length
    ? fields.map((name) => <div className="figure" key={name}><span>{label(name)}</span><strong>{row[name] ?? 0}</strong></div>)
    : <div className="figure"><span>Registros</span><strong>{rows.length}</strong></div>}</div></section>;
}

/** Un componente de pantalla de la especificación: tabla, tarjetas, formulario, detalle, indicador o reporte. */
export function SpecBlock({ block, actions }) {
  const allowed = usePermission();
  const action = actions[block.operacion];
  if (!action) return null;
  if (!allowed(action)) return <p className="empty" role="status">No tienes permiso para ver esta sección.</p>;
  if (block.tipo === 'formulario') return <section><ActionForm action={action} fields={block.campos} submit={block.acciones?.find((item) => item.operacion === block.operacion)?.etiqueta} /></section>;
  if (action.type === 'resumen') return <ActionSummary block={block} actions={actions} allowed={allowed} />;
  if (block.tipo === 'detalle') return <ActionDetail block={block} actions={actions} />;
  if (block.tipo === 'kpi') return <ActionKpi block={block} actions={actions} />;
  return <ActionList block={block} actions={actions} allowed={allowed} />;
}
