import React, { useRef, useState } from 'react';
import { BookOpen, Download, Loader2, Printer } from 'lucide-react';
import { zipSync, strToU8 } from 'fflate';
import { generateProjectDocumentationApi } from '../services/api';
import { createTutorialVideo, embedDocumentationDiagrams } from '../utils/documentationMedia';

function download(blob, name) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = name; anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

export default function ProjectDocumentationPanel({ projectId }) {
  const [bundle, setBundle] = useState(null);
  const [githubActions, setGithubActions] = useState(false);
  const [includeDiagrams, setIncludeDiagrams] = useState(true);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [preview, setPreview] = useState(false);
  const iframe = useRef(null);
  const generate = async () => {
    try {
      setBusy(true); setError(''); setBundle(null); setStatus('Preparando los cinco manuales…');
      let result = await generateProjectDocumentationApi(projectId, { githubActions });
      if (includeDiagrams) { setStatus('Preparando imágenes de los diagramas…'); result = await embedDocumentationDiagrams(result); }
      setBundle(result); setPreview(true); setStatus('Documentación lista para revisar.');
    } catch (failure) { setError(failure.message); setStatus(''); }
    finally { setBusy(false); }
  };
  const exportZip = async (withVideos = false) => {
    try {
      setBusy(true); setError('');
      const entries = Object.fromEntries(bundle.archivos.map(file => [file.ruta, strToU8(file.contenido)]));
      if (withVideos) {
        let markup = '';
        for (const tutorial of bundle.videos) {
          const video = await createTutorialVideo(tutorial, (step, total) => setStatus(`Video ${tutorial.id}: paso ${step} de ${total}. Mantén esta pestaña abierta…`));
          entries[`documentation/docs/assets/videos/${tutorial.id}.webm`] = new Uint8Array(await video.arrayBuffer());
          markup += `<p>Guía animada: ${tutorial.id}</p><video controls preload="metadata" src="assets/videos/${tutorial.id}.webm"></video>`;
        }
        for (const file of bundle.archivos.filter(file => /(?:usuario\.md|manual-completo\.html)$/.test(file.ruta))) entries[file.ruta] = strToU8(file.contenido.replace('<div id="tutorial-videos"></div>', markup));
      }
      // Las imágenes y videos se incorporan en el navegador: registrar la huella final de todo lo exportado.
      const manifestPath = 'documentation/documentation-manifest.json';
      const manifest = JSON.parse(bundle.archivos.find(file => file.ruta === manifestPath).contenido);
      manifest.archivos = await Promise.all(Object.entries(entries).filter(([path]) => path !== manifestPath).map(async ([ruta, bytes]) => ({ ruta, sha256: [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(byte => byte.toString(16).padStart(2, '0')).join('') })));
      manifest.videos_incluidos = withVideos; manifest.advertencias = bundle.advertencias;
      entries[manifestPath] = strToU8(JSON.stringify(manifest, null, 2));
      download(new Blob([zipSync(entries)], { type: 'application/zip' }), 'documentacion-proyecto.zip');
      setStatus(withVideos ? 'ZIP descargado con los tres videos y los manuales.' : 'ZIP de documentación descargado.');
    } catch (failure) { setError(failure.message); setStatus(''); }
    finally { setBusy(false); }
  };
  return <section aria-label="Documentación del proyecto generado" className="my-5 rounded-xl border border-blue-200 bg-blue-50/40 p-5 text-sm">
    <h3 className="flex items-center gap-2 text-lg font-semibold text-slate-900"><BookOpen size={20} />Documentación del proyecto generado</h3>
    <p className="mt-2 text-slate-600">Cinco manuales: usuario, desarrollador, mantenimiento, instalación y referencia técnica. Incluye MkDocs, infografía del flujo, diagramas aprobados y guías animadas.</p>
    <div className="my-3 flex flex-wrap gap-4 text-xs">
      <label className="flex gap-2"><input type="checkbox" checked={githubActions} disabled={busy} onChange={event => { setGithubActions(event.target.checked); setBundle(null); }} />Incluir GitHub Actions (publicación manual y opcional)</label>
      <label className="flex gap-2"><input type="checkbox" checked={includeDiagrams} disabled={busy} onChange={event => { setIncludeDiagrams(event.target.checked); setBundle(null); }} />Incluir imágenes mediante el servidor PlantUML del visor</label>
    </div>
    <div className="flex flex-wrap gap-2">
      <button type="button" disabled={busy || !projectId} onClick={generate} className="rounded-lg bg-blue-700 px-4 py-2 font-semibold text-white disabled:opacity-50">{busy ? <Loader2 className="inline animate-spin" size={16} /> : 'Generar documentación'}</button>
      {bundle && <>
        <button type="button" disabled={busy} onClick={() => setPreview(!preview)} className="rounded-lg border bg-white px-3 py-2">{preview ? 'Ocultar vista previa' : 'Ver manuales'}</button>
        <button type="button" disabled={busy} onClick={() => exportZip()} className="flex items-center gap-2 rounded-lg border bg-white px-3 py-2"><Download size={15} />Descargar MkDocs</button>
        <button type="button" disabled={busy} onClick={() => exportZip(true)} className="rounded-lg border bg-white px-3 py-2">Descargar con 3 videos</button>
        <button type="button" disabled={busy} onClick={() => { setPreview(true); setTimeout(() => { iframe.current?.contentDocument?.querySelectorAll('details').forEach(item => { item.open = true; }); iframe.current?.contentWindow?.focus(); iframe.current?.contentWindow?.print(); }, 300); }} className="flex items-center gap-2 rounded-lg border bg-white px-3 py-2"><Printer size={15} />Imprimir / guardar PDF</button>
        <button type="button" disabled={busy} onClick={() => download(new Blob([bundle.html], { type: 'text/html;charset=utf-8' }), 'manual-completo.html')} className="rounded-lg border bg-white px-3 py-2">Descargar HTML</button>
      </>}
    </div>
    {status && <p role="status" className="mt-3 text-xs text-blue-800">{status}</p>}
    {error && <p role="alert" className="mt-3 text-red-700">{error}</p>}
    {bundle && <><ul className="mt-3 list-disc pl-5 text-xs text-amber-900">{bundle.advertencias.map(message => <li key={message}>{message}</li>)}</ul><p className="mt-2 text-xs text-slate-500">El ZIP incluye el comando para construir HTML y exportar un PDF con Chromium. Los videos son guías animadas sin audio. Generar o descargar no publica en GitHub.</p></>}
    {bundle && preview && <iframe ref={iframe} title="Manuales del proyecto generado" sandbox="allow-same-origin allow-modals" srcDoc={bundle.html} className="mt-4 h-[650px] w-full rounded-lg border bg-white" />}
  </section>;
}
