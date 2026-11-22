import React, { useEffect, useState } from 'react';
import { X, Download, Loader2 } from 'lucide-react';
import { documentationRequest } from '../services/api';
import { saveDocumentationBlob } from './ProjectDocumentationPanel';

/** El informe se captura e imprime en Chromium del servidor, sin jsPDF ni capturas de la pestaña. */
export default function PdfPreviewModal({ project, onClose }) {
  const [job, setJob] = useState(null), [blob, setBlob] = useState(null), [url, setUrl] = useState(''), [error, setError] = useState('');
  const id = project.id || project._id;
  useEffect(() => {
    let alive = true, timer, objectUrl;
    const poll = async version => {
      const state = await documentationRequest(id, `/${version}`);
      if (!alive) return;
      setJob(state);
      if (state.estado === 'lista') {
        const file = await documentationRequest(id, `/${version}/archivo?ruta=informe-final.pdf`, { binary: true });
        if (!alive) return;
        objectUrl = URL.createObjectURL(file); setBlob(file); setUrl(objectUrl);
      } else if (['fallida', 'interrumpida'].includes(state.estado)) setError(state.error || 'No se pudo generar el informe.');
      else timer = setTimeout(() => poll(version).catch(failure => setError(failure.message)), 2000);
    };
    (async () => {
      // Cada apertura usa los datos aprobados actuales, conserva una versión y no reutiliza informes obsoletos.
      const versions = await documentationRequest(id);
      const running = versions.find(item => ['pendiente', 'procesando'].includes(item.estado));
      const state = running || await documentationRequest(id, '', { method: 'POST', body: JSON.stringify({}) });
      if (alive) await poll(state.id);
    })().catch(failure => { if (alive) setError(failure.message); });
    return () => { alive = false; clearTimeout(timer); if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [id]);
  return <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"><section className="bg-white rounded-2xl shadow-xl w-full max-w-6xl h-[90vh] flex flex-col" aria-label="Informe final en PDF"><header className="flex items-center gap-3 p-4 border-b"><h2 className="font-bold flex-1">Informe final · {project.name || project.nombre}</h2><button disabled={!blob} onClick={() => saveDocumentationBlob(blob, 'informe-final.pdf')} className="flex items-center gap-2"><Download size={18} />Descargar PDF</button><button aria-label="Cerrar vista previa" onClick={onClose}><X /></button></header>{error ? <p role="alert" className="p-6 text-red-700">{error}</p> : url ? <iframe className="w-full flex-1" title="Vista previa del informe final" src={url} /> : <div role="status" className="flex-1 flex items-center justify-center gap-3"><Loader2 className="animate-spin" />{job?.etapa || 'Preparando informe en el servidor…'}</div>}</section></div>;
}
