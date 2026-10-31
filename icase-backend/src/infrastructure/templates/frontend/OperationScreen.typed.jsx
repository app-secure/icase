import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useSession } from './session';
import { JsonRecords } from './JsonOperationScreen';

// Formulario y tabla por campo, derivados del esquema de la entidad y de sus reglas (GET /api/contract).

const humanize = (name) => {
  const text = String(name).replace(/_/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').trim();
  return text.charAt(0).toUpperCase() + text.slice(1);
};
// Cada registro llega como { id, data: { …campos }, created_at, updated_at }.
const dataOf = (record) => (record && typeof record.data === 'object' && record.data ? record.data : record) || {};
const pad = (value) => String(value).padStart(2, '0');
const toLocalInput = (iso) => {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '' : `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
};

function kindOf(property, rules, name) {
  if (property['x-references']) return 'reference';
  if (property.enum) return 'select';
  if (property.type === 'boolean') return 'checkbox';
  if (property.type === 'integer' || property.type === 'number') return 'number';
  if (property.type === 'array') return 'list';
  if (property.format === 'date') return 'date';
  if (property.format === 'date-time') return 'datetime';
  if (property.format === 'time') return 'time';
  const format = rules.find((rule) => rule.tipo === 'formato' && rule.campo === name);
  if (format && format.formato === 'email') return 'email';
  if (format && format.formato === 'url') return 'url';
  return 'text';
}

const INPUT_TYPE = { number: 'number', date: 'date', datetime: 'datetime-local', time: 'time', email: 'email', url: 'url', text: 'text', list: 'text' };

function TypedRecords({ capability, contract }) {
  const { api, can } = useSession();
  const operation = contract.operations.find((item) => item.key === capability);
  const rules = operation.rules || [];
  const fields = useMemo(() => Object.entries(operation.schema.properties || {})
    .filter(([name, property]) => name !== 'id' && !property.readOnly)
    .map(([name, property]) => ({ name, property, kind: kindOf(property, rules, name), required: rules.some((rule) => rule.tipo === 'requerido' && rule.campo === name) })), [operation]); // eslint-disable-line react-hooks/exhaustive-deps
  // Valor inicial de cada control: el estado inicial de una máquina de estados y, en casillas, el valor por defecto de la regla.
  const initial = useCallback(() => Object.fromEntries(fields.map(({ name, kind }) => {
    if (kind === 'checkbox') return [name, rules.find((rule) => rule.tipo === 'valor_por_defecto' && rule.campo === name)?.valor === true];
    return [name, rules.find((rule) => rule.tipo === 'maquina_estados' && rule.campo === name)?.inicial ?? ''];
  })), [fields]); // eslint-disable-line react-hooks/exhaustive-deps

  const [records, setRecords] = useState([]);
  const [lookups, setLookups] = useState({});
  const [values, setValues] = useState(initial);
  const [editing, setEditing] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ page: 1, limit: 10, total: 0, total_pages: 1 });

  const path = (id) => `/api/operations/${encodeURIComponent(capability)}${id === undefined ? '' : `/${encodeURIComponent(id)}`}`;
  const targetOf = (entity) => contract.operations.find((item) => item.schema && item.schema.title === entity);

  const refresh = useCallback(async () => {
    try {
      const q = new URLSearchParams({ page: String(page), limit: '10' });
      if (search.trim()) q.set('search', search.trim());
      const res = await api(`/api/operations/${encodeURIComponent(capability)}?${q.toString()}`);
      const items = Array.isArray(res) ? res : (res.data || []);
      setRecords(items);
      if (res && res.pagination) setPagination(res.pagination);
      else setPagination({ page: 1, limit: items.length, total: items.length, total_pages: 1 });
      setError('');
    } catch (failure) { setError(failure.message); }
  }, [api, capability, page, search]);
  useEffect(() => { refresh(); }, [refresh]);

  // Los registros de las entidades referenciadas alimentan las listas desplegables y los nombres de la tabla.
  useEffect(() => {
    let active = true;
    const targets = [...new Set(fields.filter((field) => field.kind === 'reference').map((field) => field.property['x-references']))]
      .map(targetOf).filter((target) => target && can(target.key, 'GET'));
    Promise.all(targets.map(async (target) => [
      target.schema.title,
      await api(`/api/operations/${encodeURIComponent(target.key)}`).then((res) => Array.isArray(res) ? res : (res.data || [])).catch(() => [])
    ])).then((pairs) => { if (active) setLookups(Object.fromEntries(pairs)); });
    return () => { active = false; };
  }, [api, fields]); // eslint-disable-line react-hooks/exhaustive-deps

  const labelOf = (entity, record) => {
    const target = targetOf(entity);
    const textual = Object.entries((target && target.schema.properties) || {}).find(([name, property]) => name !== 'id' && property.type === 'string' && !property.format && !property['x-references']);
    const text = textual && dataOf(record)[textual[0]];
    return text ? `${text}` : `${record.id || record._id}`;
  };
  const show = ({ name, property, kind }, record) => {
    const value = dataOf(record)[name];
    if (value === undefined || value === null || value === '') return '—';
    if (kind === 'checkbox') return value ? 'Sí' : 'No';
    if (kind === 'list') return Array.isArray(value) ? value.join(', ') : String(value);
    if (kind === 'reference') {
      const found = (lookups[property['x-references']] || []).find((item) => (item.id || item._id) === value);
      return found ? labelOf(property['x-references'], found) : String(value);
    }
    return typeof value === 'object' ? JSON.stringify(value) : String(value);
  };

  const set = (name, value) => { setValues((current) => ({ ...current, [name]: value })); setFieldErrors((current) => ({ ...current, [name]: undefined })); };
  const reset = () => { setValues(initial()); setEditing(null); setFieldErrors({}); };

  const body = () => {
    const result = {};
    for (const { name, property, kind } of fields) {
      const raw = values[name];
      if (kind === 'checkbox') { result[name] = Boolean(raw); continue; }
      if (raw === undefined || raw === '') continue;
      if (kind === 'number') result[name] = Number.isNaN(Number(raw)) ? raw : Number(raw);
      else if (kind === 'datetime') result[name] = Number.isNaN(new Date(raw).getTime()) ? raw : new Date(raw).toISOString();
      else if (kind === 'list') result[name] = String(raw).split(',').map((item) => item.trim()).filter(Boolean).map((item) => (property.items && ['integer', 'number'].includes(property.items.type) && !Number.isNaN(Number(item)) ? Number(item) : item));
      else result[name] = raw;
    }
    return result;
  };

  // Atribuye cada fallo al campo que lo causó: las reglas (422) traen su id y el 400 nombra el campo entre comillas.
  const explain = (failure) => {
    const found = {};
    for (const detail of failure.details || []) {
      const rule = rules.find((item) => item.id === detail.regla);
      const field = rule && (rule.campo || (rule.campos || [])[0]);
      if (field && fields.some((item) => item.name === field)) found[field] = detail.mensaje;
    }
    const quoted = /"([^"]+)"/.exec(failure.message || '');
    if (!Object.keys(found).length && quoted && fields.some((item) => item.name === quoted[1])) found[quoted[1]] = failure.message;
    setFieldErrors(found);
    setError(Object.keys(found).length ? 'Revisa los campos marcados.' : failure.message);
  };

  const submit = async (event) => {
    event.preventDefault();
    try {
      await api(editing ? path(editing) : path(), { method: editing ? 'PATCH' : 'POST', body: JSON.stringify(body()) });
      setMessage(editing ? 'Registro actualizado' : 'Registro creado');
      setError('');
      reset();
      await refresh();
    } catch (failure) { setMessage(''); explain(failure); }
  };
  const remove = async (id) => {
    try { await api(path(id), { method: 'DELETE' }); setMessage('Registro eliminado'); setError(''); if (editing === id) reset(); await refresh(); }
    catch (failure) { setMessage(''); setError(failure.message); }
  };
  const edit = (record) => {
    setEditing(record.id || record._id);
    setFieldErrors({});
    setValues(Object.fromEntries(fields.map(({ name, kind }) => {
      const value = dataOf(record)[name];
      if (kind === 'checkbox') return [name, Boolean(value)];
      if (value === undefined || value === null) return [name, ''];
      if (kind === 'datetime') return [name, toLocalInput(value)];
      if (kind === 'list') return [name, Array.isArray(value) ? value.join(', ') : String(value)];
      return [name, String(value)];
    })));
  };

  const control = ({ name, property, kind, required }) => {
    const id = `campo-${capability}-${name}`;
    const common = { id, name, 'aria-required': required || undefined, 'aria-invalid': fieldErrors[name] ? true : undefined, 'aria-describedby': fieldErrors[name] ? `${id}-error` : undefined };
    if (kind === 'checkbox') return <input {...common} type="checkbox" checked={Boolean(values[name])} onChange={(event) => set(name, event.target.checked)} />;
    if (kind === 'select') return <select {...common} className="input" value={values[name]} onChange={(event) => set(name, event.target.value)}><option value="">—</option>{property.enum.map((option) => <option key={option} value={option}>{option}</option>)}</select>;
    if (kind === 'reference') {
      const entity = property['x-references'];
      const options = lookups[entity];
      if (!options) return <input {...common} className="input" type="text" value={values[name]} onChange={(event) => set(name, event.target.value)} placeholder="Identificador" />;
      return <select {...common} className="input" value={values[name]} onChange={(event) => set(name, event.target.value)}><option value="">—</option>{options.map((option) => <option key={option.id || option._id} value={option.id || option._id}>{labelOf(entity, option)}</option>)}</select>;
    }
    return <input {...common} className="input" type={INPUT_TYPE[kind]} step={kind === 'number' ? (property.type === 'integer' ? 1 : 'any') : kind === 'time' || kind === 'datetime' ? 1 : undefined} value={values[name]} onChange={(event) => set(name, event.target.value)} placeholder={kind === 'list' ? 'Valores separados por comas' : undefined} />;
  };

  const canWrite = editing ? can(capability, 'PATCH') : can(capability, 'POST');
  return <>
    {error && <p role="alert" className="error">{error}</p>}
    {message && <p role="status" className="success">{message}</p>}
    {canWrite && <section className="card">
      <h2>{editing ? 'Modificar registro' : 'Nuevo registro'}</h2>
      <form aria-label="Formulario de registro" onSubmit={submit} noValidate>
        <div className="form-grid">
          {fields.map((field) => <div key={field.name} className="form-row">
            <label htmlFor={`campo-${capability}-${field.name}`}>{humanize(field.name)}{field.required ? ' *' : ''}</label>
            {control(field)}
            {fieldErrors[field.name] && <span id={`campo-${capability}-${field.name}-error`} className="field-error">{fieldErrors[field.name]}</span>}
          </div>)}
        </div>
        <button type="submit" className="button">{editing ? 'Guardar cambios' : 'Crear'}</button>
        {editing && <button type="button" className="button secondary" onClick={reset}>Cancelar edición</button>}
      </form>
    </section>}
    <section className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
        <h2>Registros</h2>
        <input
          aria-label="Buscar en registros"
          placeholder="Buscar..."
          className="field"
          style={{ maxWidth: '250px' }}
          value={search}
          onChange={(event) => { setSearch(event.target.value); setPage(1); }}
        />
      </div>
      <button type="button" className="button" onClick={refresh}>Actualizar lista</button>
      {records.length === 0 ? <p>No hay registros todavía.</p> : <div className="table-wrap"><table className="records">
        <caption className="sr-only">Registros de {humanize(capability)}</caption>
        <thead><tr>{fields.map((field) => <th scope="col" key={field.name}>{humanize(field.name)}</th>)}<th scope="col">Acciones</th></tr></thead>
        <tbody>{records.map((record) => <tr key={record.id || record._id}>
          {fields.map((field) => <td key={field.name}>{show(field, record)}</td>)}
          <td>
            {can(capability, 'PATCH') && <button type="button" className="button" onClick={() => edit(record)}>Editar</button>}
            {can(capability, 'DELETE') && <button type="button" className="button danger" onClick={() => remove(record.id || record._id)}>Eliminar</button>}
          </td>
        </tr>)}</tbody>
      </table></div>}
      {pagination && pagination.total_pages > 1 && (
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginTop: '1rem' }}>
          <button type="button" className="button" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>Anterior</button>
          <span>Página {page} de {pagination.total_pages} (Total: {pagination.total})</span>
          <button type="button" className="button" disabled={page >= pagination.total_pages} onClick={() => setPage((p) => p + 1)}>Siguiente</button>
        </div>
      )}
    </section>
  </>;
}

export default function OperationScreen({ title, capabilities, referenceText }) {
  const { api, can } = useSession();
  const readable = capabilities.filter((key) => can(key, 'GET'));
  const [capability, setCapability] = useState(readable[0] || '');
  const [contract, setContract] = useState(null);
  const key = readable.join('|');

  useEffect(() => { if (!readable.includes(capability)) setCapability(readable[0] || ''); }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    let active = true;
    api('/api/contract').then((value) => { if (active) setContract(value); }).catch(() => { if (active) setContract({ operations: [] }); });
    return () => { active = false; };
  }, [api]);

  const operation = contract && contract.operations.find((item) => item.key === capability);
  const typed = operation && operation.schema && Object.keys(operation.schema.properties || {}).some((name) => name !== 'id');
  const denied = capabilities.length > 0 && readable.length === 0;
  return <main className="screen" data-screen={capability || 'sin-operacion'}>
    <h1>{title}</h1>
    {referenceText && <p>{referenceText}</p>}
    {readable.length > 1 && <div className="tabs">{readable.map((value) => <button className="button" key={value} onClick={() => setCapability(value)}>{value}</button>)}</div>}
    {!capabilities.length && <p className="error">Esta pantalla no tiene RF asociado; corrige la trazabilidad antes de aprobarla.</p>}
    {denied && <p role="alert" className="error">Tu rol no tiene permiso para ver esta pantalla.</p>}
    {capability && !contract && <p aria-busy="true">Cargando formulario…</p>}
    {capability && contract && (typed
      ? <TypedRecords key={capability} capability={capability} contract={contract} />
      : <>
        <p>Esta operación no tiene campos declarados en el modelo de dominio: se editan como JSON.</p>
        <JsonRecords key={capability} capability={capability} />
      </>)}
  </main>;
}
