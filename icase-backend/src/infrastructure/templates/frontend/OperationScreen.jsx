import React, { useCallback, useEffect, useState } from 'react';
import { useSession } from './session';

export default function OperationScreen({ title, capabilities, referenceText }) {
  const { api, can } = useSession();
  const readable = capabilities.filter((key) => can(key, 'GET'));
  const [capability, setCapability] = useState(readable[0] || '');
  const [records, setRecords] = useState([]);
  const [payload, setPayload] = useState('{\n  "valor": ""\n}');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const key = readable.join('|');

  useEffect(() => { if (!readable.includes(capability)) setCapability(readable[0] || ''); }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  const path = (id) => `/api/operations/${encodeURIComponent(capability)}${id === undefined ? '' : `/${encodeURIComponent(id)}`}`;

  const refresh = useCallback(async () => {
    if (!capability) { setRecords([]); return; }
    try { setRecords(await api(`/api/operations/${encodeURIComponent(capability)}`)); setError(''); } catch (failure) { setError(failure.message); }
  }, [api, capability]);

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

  const denied = capabilities.length > 0 && readable.length === 0;
  return <main className="screen" data-screen={capability || 'sin-operacion'}>
    <h1>{title}</h1>
    {referenceText && <p>{referenceText}</p>}
    {readable.length > 1 && <div className="tabs">{readable.map((value) => <button className="button" key={value} onClick={() => setCapability(value)}>{value}</button>)}</div>}
    {!capabilities.length && <p className="error">Esta pantalla no tiene RF asociado; corrige la trazabilidad antes de aprobarla.</p>}
    {denied && <p role="alert" className="error">Tu rol no tiene permiso para ver esta pantalla.</p>}
    {error && <p role="alert" className="error">{error}</p>}
    {message && <p role="status" className="success">{message}</p>}
    {capability && <section className="card">
      {can(capability, 'POST') && <label>Datos de la operación<textarea aria-label="Datos JSON" className="field" value={payload} onChange={(event) => setPayload(event.target.value)} /></label>}
      {can(capability, 'POST') && <button className="button" onClick={create}>Crear</button>}
      <button className="button" onClick={refresh}>Actualizar lista</button>
    </section>}
    <section className="card">
      <h2>Registros</h2>
      {records.map((record) => <article key={record.id || record._id} className="record">{JSON.stringify(record, null, 2)}
        <div>
          {can(capability, 'PATCH') && <button className="button" onClick={() => update(record.id || record._id)}>Modificar</button>}
          {can(capability, 'DELETE') && <button className="button danger" onClick={() => remove(record.id || record._id)}>Eliminar</button>}
        </div>
      </article>)}
    </section>
  </main>;
}
