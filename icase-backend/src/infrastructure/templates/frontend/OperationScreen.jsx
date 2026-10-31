import React, { useCallback, useEffect, useState } from 'react';
import { useSession } from './session';

/** Editor de registros como JSON: sirve para cualquier esquema, incluso sin campos declarados. */
export function JsonRecords({ capability }) {
  const { api, can } = useSession();
  const [records, setRecords] = useState([]);
  const [payload, setPayload] = useState('{\n  "valor": ""\n}');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ page: 1, limit: 10, total: 0, total_pages: 1 });

  const path = (id) => `/api/operations/${encodeURIComponent(capability)}${id === undefined ? '' : `/${encodeURIComponent(id)}`}`;

  const refresh = useCallback(async () => {
    if (!capability) { setRecords([]); return; }
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

  const parse = () => {
    const value = JSON.parse(payload);
    if (!value || Array.isArray(value) || typeof value !== 'object') throw new Error('Los datos deben ser un objeto JSON');
    return value;
  };
  const run = async (action, success) => {
    try { await action(); setMessage(success); setError(''); await refresh(); } catch (failure) { setError(failure.message); }
  };
  const create = () => run(() => api(path(), { method: 'POST', body: JSON.stringify(parse()) }), 'Registro creado');
  const update = (id) => run(() => api(path(id), { method: 'PATCH', body: JSON.stringify(parse()) }), 'Registro actualizado');
  const remove = (id) => run(() => api(path(id), { method: 'DELETE' }), 'Registro eliminado');

  return <>
    {error && <p role="alert" className="error">{error}</p>}
    {message && <p role="status" className="success">{message}</p>}
    {capability && <section className="card">
      {can(capability, 'POST') && <label>Datos de la operación<textarea aria-label="Datos JSON" className="field" value={payload} onChange={(event) => setPayload(event.target.value)} /></label>}
      {can(capability, 'POST') && <button className="button" onClick={create}>Crear</button>}
      <button className="button" onClick={refresh}>Actualizar lista</button>
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
      {records.length === 0 ? <p>No hay registros.</p> : records.map((record) => <article key={record.id || record._id} className="record">{JSON.stringify(record, null, 2)}
        <div>
          {can(capability, 'PATCH') && <button className="button" onClick={() => update(record.id || record._id)}>Modificar</button>}
          {can(capability, 'DELETE') && <button className="button danger" onClick={() => remove(record.id || record._id)}>Eliminar</button>}
        </div>
      </article>)}
      {pagination && pagination.total_pages > 1 && (
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginTop: '1rem' }}>
          <button className="button" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>Anterior</button>
          <span>Página {page} de {pagination.total_pages} (Total: {pagination.total})</span>
          <button className="button" disabled={page >= pagination.total_pages} onClick={() => setPage((p) => p + 1)}>Siguiente</button>
        </div>
      )}
    </section>
  </>;
}

export default function OperationScreen({ title, capabilities, referenceText }) {
  const { can } = useSession();
  const readable = capabilities.filter((key) => can(key, 'GET'));
  const [capability, setCapability] = useState(readable[0] || '');
  const key = readable.join('|');

  useEffect(() => { if (!readable.includes(capability)) setCapability(readable[0] || ''); }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  const denied = capabilities.length > 0 && readable.length === 0;
  return <main className="screen" data-screen={capability || 'sin-operacion'}>
    <h1>{title}</h1>
    {referenceText && <p>{referenceText}</p>}
    {readable.length > 1 && <div className="tabs">{readable.map((value) => <button className="button" key={value} onClick={() => setCapability(value)}>{value}</button>)}</div>}
    {!capabilities.length && <p className="error">Esta pantalla no tiene RF asociado; corrige la trazabilidad antes de aprobarla.</p>}
    {denied && <p role="alert" className="error">Tu rol no tiene permiso para ver esta pantalla.</p>}
    <JsonRecords key={capability} capability={capability} />
  </main>;
}
