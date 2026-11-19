import React, { useCallback, useEffect, useState } from 'react';
import { useSession } from './session';

export default function FilesPanel({ operation, record }) {
  const { api, can } = useSession();
  const [files, setFiles] = useState([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const url = '/api/files/' + encodeURIComponent(operation) + '/' + encodeURIComponent(record);
  const load = useCallback(() => api(url).then(setFiles).catch(failure => setError(failure.message)), [api,url]);
  useEffect(() => { load(); }, [load]);
  const upload = async event => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > 512 * 1024) { setError('Máximo 512 KiB'); return; }
    setBusy(true); setError('');
    try {
      await api(url, { method:'POST', headers:{'Content-Type':file.type, 'X-File-Name':encodeURIComponent(file.name)}, body:file });
      await load();
    } catch (failure) { setError(failure.message); }
    finally { setBusy(false); event.target.value = ''; }
  };
  const download = async file => {
    try {
      const blob = await api('/api/download/' + file.id, { responseType:'blob' });
      const href = URL.createObjectURL(blob);
      const link = document.createElement('a'); link.href = href; link.download = file.name; link.click();
      setTimeout(() => URL.revokeObjectURL(href),1000);
    } catch (failure) { setError(failure.message); }
  };
  return <section aria-label="Archivos del registro"><h4>Archivos e imágenes</h4>
    {error && <p role="alert">{error}</p>}
    {can(operation,'PATCH') && <label>Adjuntar PNG, JPEG o PDF (512 KiB)<input type="file" accept="image/png,image/jpeg,application/pdf" disabled={busy} onChange={upload}/></label>}
    <ul>{files.map(file => <li key={file.id}><button onClick={() => download(file)}>{file.name}</button>
      {can(operation,'PATCH') && <button onClick={async () => { try { await api('/api/download/'+file.id,{method:'DELETE'}); await load(); } catch(failure) {setError(failure.message);} }}>Eliminar archivo</button>}
    </li>)}</ul>
  </section>;
}
