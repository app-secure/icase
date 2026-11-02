import React, { useEffect, useRef, useState } from 'react';
import { useSession } from './session';

const recordLabel = (record) => {
  const fields = record.data || record;
  const text = fields.nombre || fields.name || fields.titulo || fields.title || fields.descripcion;
  return `${text || 'Registro'} (#${record.id})`;
};

function RecordPicker({ label, operation, value, onChange, disabled }) {
  const { api } = useSession();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [result, setResult] = useState({ data: [], pagination: {} });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    setLoading(true); setError('');
    const params = new URLSearchParams({ page: String(page), limit: '20', search });
    api(`/api/operations/${encodeURIComponent(operation)}?${params}`).then((data) => {
      if (active) setResult(Array.isArray(data) ? { data, pagination: {} } : data);
    }).catch((failure) => { if (active) { setResult({ data: [], pagination: {} }); setError(failure.message); } })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [api, operation, page, search]);
  const records = result.data || [];
  return <fieldset disabled={disabled} className="card">
    <legend>{label}</legend>
    <label>Buscar {label}<input aria-label={`Buscar ${label}`} value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} /></label>
    {error && <p role="alert" className="error">{error}</p>}
    {loading && <p role="status">Cargando registros…</p>}
    <label>Seleccionar {label}<select aria-label={`Seleccionar ${label}`} value={value} disabled={loading || Boolean(error)} onChange={(e) => onChange(e.target.value)}>
      <option value="">Selecciona un registro</option>
      {value && !records.some((record) => String(record.id) === value) && <option value={value}>Seleccionado (#{value})</option>}
      {records.map((record) => <option key={record.id} value={String(record.id)}>{recordLabel(record)}</option>)}
    </select></label>
    <button type="button" disabled={loading || page <= 1} onClick={() => setPage((p) => p - 1)}>Anterior</button>
    <span>Página {page}</span>
    <button type="button" disabled={loading || page >= (result.pagination?.total_pages || 1)} onClick={() => setPage((p) => p + 1)}>Siguiente</button>
  </fieldset>;
}

function RelationEditor({ relation, readable, writable }) {
  const { api } = useSession();
  const [source, setSource] = useState('');
  const [target, setTarget] = useState('');
  const [links, setLinks] = useState([]);
  const [more, setMore] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const generation = useRef(0);
  const selection = useRef(0);
  const path = `/api/associations/${encodeURIComponent(relation.table)}`;
  useEffect(()=>{selection.current++;setLinks([]);setMore(false);setError('');setMessage('');return()=>{selection.current++;};},[path,source]);
  useEffect(() => {
    const run = ++generation.current;
    if (!source) return;
    api(`${path}?${new URLSearchParams({ source_id: source, limit: '50' })}`).then((data) => {
      if (run === generation.current) { setLinks(data.data || []); setMore(data.has_more === true); }
    }).catch((failure) => { if (run === generation.current) setError(failure.message); })
      ;
    return () => { generation.current++; };
  }, [api, path, source]);
  const run = async (action, targetId = target) => {
    if (!source || busy) return;
    const selected = selection.current;
    setBusy(true); setError(''); setMessage('');
    try {
      const mutating = action === 'link' || action === 'unlink';
      if (mutating) await api(path, { method: action === 'link' ? 'POST' : 'DELETE', body: JSON.stringify({ source_id: source, target_id: targetId }) });
      if(selected!==selection.current)return;
      if (mutating) setMessage(action === 'link' ? 'Vínculo guardado.' : 'Vínculo eliminado. Los registros se conservaron.');
      const revision=++generation.current;
      const query = new URLSearchParams({ source_id: source, limit: '50' });
      if (action === 'more' && links.length) query.set('after_target_id', links[links.length - 1].target_id);
      const data = await api(`${path}?${query}`);
      if (revision !== generation.current || selected!==selection.current) return;
      setLinks((previous) => action === 'more' ? [...previous, ...(data.data || [])] : data.data || []);
      setMore(data.has_more === true);
    } catch (failure) { if (selected === selection.current) setError(failure.message); }
    finally { if (selected === selection.current) setBusy(false); }
  };
  return <section className="card" aria-label={`Vínculos ${relation.entities.join(' / ')}`}>
    <h3>{relation.label || relation.entities.join(' / ')}</h3>
    {relation.requires_replica_set && <p>MongoDB requiere un replica set transaccional. El Compose generado prepara un nodo local; no proporciona alta disponibilidad.</p>}
    <RecordPicker label={`Origen: ${relation.entities[0]}`} operation={readable[0]} value={source} onChange={setSource} disabled={busy} />
    {writable && <RecordPicker label={`Destino: ${relation.entities[1]}`} operation={readable[1]} value={target} onChange={setTarget} disabled={busy} />}
    {writable && <button type="button" className="button" disabled={busy || !source || !target} onClick={() => run('link')}>Asociar</button>}
    <button type="button" className="button" disabled={busy || !source} onClick={() => run('refresh')}>Actualizar vínculos</button>
    {error && <p role="alert" className="error">{error}</p>}
    {message && <p role="status" className="success">{message}</p>}
    {busy && <p role="status">Actualizando vínculos…</p>}
    {source && !busy && !links.length && !error && <p>No hay vínculos.</p>}
    <ul>{links.map((link) => <li key={link.target_id}>{relation.entities[1]} #{link.target_id}
      {writable && <button type="button" className="button danger" disabled={busy} onClick={() => run('unlink', link.target_id)}>Desasociar #{link.target_id}</button>}
    </li>)}</ul>
    {more && <button type="button" className="button" disabled={busy} onClick={() => run('more')}>Cargar más vínculos</button>}
  </section>;
}

export default function AssociationsPanel({ capability }) {
  const { api, can, user } = useSession();
  const [contract, setContract] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    api('/api/contract').then((data) => { if (active) { setContract(data); setError(''); } })
      .catch((failure) => { if (active) setError(failure.message); });
    return () => { active = false; };
  }, [api]);
  if (!capability) return null;
  if (error) return <p role="alert" className="error">No se pudo consultar el contrato de vínculos: {error}</p>;
  const relations = (contract?.associations || []).filter((item) => item.operations?.some((keys) => keys.includes(capability)));
  if (!relations.length) return null;
  return <section aria-label="Relaciones muchos a muchos"><h2>Relaciones muchos a muchos</h2>{relations.map((relation) => {
    const readable = relation.operations.map((keys) => keys.find((key) => can(key, 'GET')));
    if (!readable.every(Boolean)) return <p key={relation.table}>Sin permiso de consulta o sin operación asignada en alguno de los extremos de {relation.label || relation.entities.join(' / ')}.</p>;
    if (!relation.endpoints_generated) return <p key={relation.table} role="status">{relation.label || relation.entities.join(' / ')}: la API de vínculos aún no está disponible para este stack.</p>;
    const writable = user?.administrador === true || relation.operations.every((keys) => keys.some((key) => can(key, 'GET') && can(key, 'PATCH')));
    return <RelationEditor key={`${capability}:${relation.table}`} relation={relation} readable={readable} writable={writable} />;
  })}</section>;
}
