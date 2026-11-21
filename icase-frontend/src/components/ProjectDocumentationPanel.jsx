import React, { useEffect, useRef, useState } from 'react';
import { BookOpen, Download, Loader2, Printer, Settings2, Film, Play, Check, FileText, ChevronDown, RefreshCw, Users, Info } from 'lucide-react';
import { zipSync, strToU8 } from 'fflate';
import { generateProjectDocumentationApi } from '../services/api';
import { createTutorialVideo, drawTutorialFrame, getTutorialDuration, embedDocumentationDiagrams } from '../utils/documentationMedia';
import './ProjectDocumentationPanel.css';

const MANUALS = { usuario: ['Usuario', 'Funciones y recorridos por rol'], desarrollador: ['Desarrollador', 'Código y documentos del repositorio'], mantenimiento: ['Mantenimiento', 'Operación, recuperación y cambios'], instalacion: ['Instalación', 'Entorno y despliegue'], tecnica: ['Referencia técnica', 'Contratos, requisitos y diagramas'] };
const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
function download(blob, name) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = name; anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
function TutorialPoster({ tutorial }) {
  const canvas = useRef(null);
  useEffect(() => { if (canvas.current) drawTutorialFrame(canvas.current.getContext('2d'), tutorial, 0, 0.4); }, [tutorial]);
  return <canvas ref={canvas} width={1280} height={720} role="img" aria-label={`Vista previa de ${tutorial.title}`} />;
}

export default function ProjectDocumentationPanel({ projectId }) {
  const [bundle, setBundle] = useState(null);
  const [githubActions, setGithubActions] = useState(false);
  const [includeDiagrams, setIncludeDiagrams] = useState(true);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [mode, setMode] = useState('manuales');
  const [manual, setManual] = useState('usuario');
  const [videoRole, setVideoRole] = useState('todos');
  const [clips, setClips] = useState({});
  const [activeVideo, setActiveVideo] = useState('');
  const [printReady, setPrintReady] = useState(false);
  const printFrame = useRef(null);
  const cache = useRef(new Map());
  const players = useRef({});
  useEffect(() => () => { for (const clip of cache.current.values()) URL.revokeObjectURL(clip.url); }, []);
  useEffect(() => { for (const [id, player] of Object.entries(players.current)) { if (!player) continue; if (id === activeVideo) player.play().catch(() => {}); else player.pause(); } }, [activeVideo, clips]);
  const clearClips = () => { for (const clip of cache.current.values()) URL.revokeObjectURL(clip.url); cache.current.clear(); setClips({}); setActiveVideo(''); };
  const resetOptions = change => { change(); setBundle(null); setPrintReady(false); clearClips(); setStatus('Genera la documentación para aplicar las opciones.'); };
  const generate = async () => {
    try {
      setBusy(true); setError(''); setBundle(null); clearClips(); setPrintReady(false); setStatus('Preparando manuales y recorridos por rol…');
      let result = await generateProjectDocumentationApi(projectId, { githubActions });
      if (includeDiagrams) { setStatus('Preparando los diagramas aprobados…'); result = await embedDocumentationDiagrams(result); }
      setBundle(result); setManual('usuario'); setMode('manuales'); setVideoRole(result.videos[0]?.roleId || 'todos'); setStatus('Documentación lista para revisar.');
    } catch (failure) { setError(failure.message); setStatus(''); }
    finally { setBusy(false); }
  };
  const ensureClip = async tutorial => {
    if (cache.current.has(tutorial.id)) return cache.current.get(tutorial.id);
    const blob = await createTutorialVideo(tutorial, (step, total) => setStatus(`${tutorial.role || tutorial.title}: paso ${step} de ${total}. Mantén la pestaña visible…`));
    const clip = { blob, url: URL.createObjectURL(blob) };
    cache.current.set(tutorial.id, clip); setClips(previous => ({ ...previous, [tutorial.id]: clip }));
    return clip;
  };
  const previewVideo = async tutorial => {
    try { setBusy(true); setError(''); await ensureClip(tutorial); setActiveVideo(tutorial.id); setStatus('Guía lista: ya puedes reproducirla o descargarla.'); }
    catch (failure) { setError(failure.message); setStatus(''); }
    finally { setBusy(false); }
  };
  const videos = (bundle?.videos || []).filter(video => videoRole === 'todos' || video.roleId === videoRole);
  const videoRoles = [...new Map((bundle?.videos || []).map(video => [video.roleId || 'todos', video.role || 'Guía general'])).entries()];
  const exportZip = async withVideos => {
    try {
      setBusy(true); setError('');
      const entries = Object.fromEntries(bundle.archivos.map(file => [file.ruta, strToU8(file.contenido)]));
      if (withVideos) {
        let markup = '';
        for (const tutorial of videos) {
          const clip = await ensureClip(tutorial);
          entries[`documentation/docs/assets/videos/${tutorial.id}.webm`] = new Uint8Array(await clip.blob.arrayBuffer());
          markup += `<article class="video-guide"><p><strong>${escape(tutorial.title)}</strong> · ${escape(tutorial.role)}</p><video controls preload="metadata" src="assets/videos/${escape(tutorial.id)}.webm"></video></article>`;
        }
        for (const file of bundle.archivos.filter(file => /(?:usuario\.md|manual-completo\.html)$/.test(file.ruta))) entries[file.ruta] = strToU8(file.contenido.replace('<div id="tutorial-videos"></div>', markup));
      }
      const manifestPath = 'documentation/documentation-manifest.json';
      const manifest = JSON.parse(bundle.archivos.find(file => file.ruta === manifestPath).contenido);
      manifest.archivos = await Promise.all(Object.entries(entries).filter(([path]) => path !== manifestPath).map(async ([ruta, bytes]) => ({ ruta, sha256: [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(byte => byte.toString(16).padStart(2, '0')).join('') })));
      manifest.videos_incluidos = Boolean(withVideos); manifest.videos_exportados = withVideos ? videos.map(video => video.id) : []; manifest.advertencias = bundle.advertencias;
      entries[manifestPath] = strToU8(JSON.stringify(manifest, null, 2));
      download(new Blob([zipSync(entries)], { type: 'application/zip' }), 'documentacion-proyecto.zip');
      setStatus(withVideos ? `ZIP descargado con ${videos.length} guías y los cinco manuales.` : 'ZIP MkDocs descargado con los cinco manuales.');
    } catch (failure) { setError(failure.message); setStatus(''); }
    finally { setBusy(false); }
  };
  const print = () => {
    const frame = printFrame.current;
    if (!frame?.contentDocument || !printReady) return;
    frame.contentDocument.querySelectorAll('details:not(.source-details)').forEach(item => { item.open = true; });
    frame.contentWindow.focus(); frame.contentWindow.print();
  };
  const selectedPage = bundle?.paginas?.find(page => page.id === manual);
  const rolesCount = (bundle?.flujos || []).filter(flow => !flow.pending).length;
  return <section aria-label="Documentación del proyecto generado" className="docs-panel">
    <header className="docs-panel-header">
      <span className="docs-panel-symbol"><BookOpen size={24} /></span>
      <div className="docs-panel-heading"><span className="docs-eyebrow">ENTREGA DEL PROYECTO</span><h3>Documentación del proyecto generado</h3><p>Manuales claros, recorridos por rol y guías para acompañar la entrega.</p></div>
      <span className={`docs-state ${bundle ? 'is-ready' : ''}`}>{busy ? <Loader2 size={13} className="animate-spin" /> : bundle ? <Check size={13} /> : <span className="docs-state-dot" />}{busy ? 'Preparando' : bundle ? 'Lista para revisar' : 'Por generar'}</span>
    </header>
    <div className="docs-toolbar">
      <button type="button" disabled={busy || !projectId} onClick={generate} className="docs-button docs-button-primary">{busy ? <Loader2 size={16} className="animate-spin" /> : bundle ? <RefreshCw size={16} /> : <BookOpen size={16} />}{bundle ? 'Actualizar documentación' : 'Generar documentación'}</button>
      {bundle && <div className="docs-exports" aria-label="Exportar documentación">
        <button type="button" disabled={busy} onClick={() => exportZip(false)} className="docs-button"><Download size={15} />Descargar MkDocs</button>
        <button type="button" disabled={busy} onClick={() => download(new Blob([bundle.html], { type: 'text/html;charset=utf-8' }), 'manual-completo.html')} className="docs-button"><FileText size={15} />HTML completo</button>
        <button type="button" disabled={busy || !printReady} onClick={print} className="docs-button"><Printer size={15} />PDF completo</button>
      </div>}
      <details className="docs-options"><summary><Settings2 size={15} />Opciones<ChevronDown size={13} /></summary><div>
        <label><input type="checkbox" checked={githubActions} disabled={busy} onChange={event => resetOptions(() => setGithubActions(event.target.checked))} /><span>GitHub Actions<small>Incluye un workflow de publicación manual.</small></span></label>
        <label><input type="checkbox" checked={includeDiagrams} disabled={busy} onChange={event => resetOptions(() => setIncludeDiagrams(event.target.checked))} /><span>Imágenes de diagramas<small>Usa el servidor PlantUML configurado en el visor.</small></span></label>
      </div></details>
    </div>
    {!bundle && !busy && <div className="docs-empty"><span><FileText size={27} /></span><div><h4>Todo lo necesario para entender el proyecto</h4><p>Genera los manuales de usuario, desarrollador, mantenimiento, instalación y referencia técnica a partir de los insumos aprobados.</p></div></div>}
    {status && <p role="status" className="docs-status"><Info size={14} />{status}</p>}
    {error && <p role="alert" className="docs-error">{error}</p>}
    {bundle && <>
      <div className="docs-content-nav"><div className="docs-view-switch" aria-label="Vista de documentación">
        <button type="button" aria-pressed={mode === 'manuales'} onClick={() => setMode('manuales')}><BookOpen size={16} />Manuales<span>5</span></button>
        <button type="button" aria-pressed={mode === 'guias'} onClick={() => setMode('guias')}><Film size={16} />Guías animadas<span>{bundle.videos.length}</span></button>
      </div><span className="docs-role-count"><Users size={14} />{rolesCount} {rolesCount === 1 ? 'rol documentado' : 'roles documentados'}</span></div>
      {mode === 'manuales' ? <>
        <nav className="docs-manual-tabs" aria-label="Seleccionar manual">{bundle.categorias.map(category => <button type="button" key={category.id} aria-pressed={manual === category.id} onClick={() => setManual(category.id)}><strong>{MANUALS[category.id]?.[0] || category.title}</strong><small>{MANUALS[category.id]?.[1]}</small></button>)}</nav>
        <iframe title="Manuales del proyecto generado" sandbox="allow-same-origin allow-modals" srcDoc={selectedPage?.html || bundle.html} className="docs-preview" />
      </> : <div className="docs-tutorials">
        <div className="docs-tutorial-heading"><div><h4>Un recorrido para cada rol</h4><p>Preparar, ejecutar y comprobar. Guías animadas sin audio, basadas en los requisitos; no son capturas de la aplicación.</p></div><label>Ver guías de<select value={videoRole} disabled={busy} onChange={event => setVideoRole(event.target.value)}><option value="todos">Todos los roles</option>{videoRoles.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label></div>
        <div className="docs-video-grid">{videos.map(tutorial => <article className="docs-video-card" key={tutorial.id}>
          <div className="docs-video-preview">{clips[tutorial.id] ? <video ref={player => { players.current[tutorial.id] = player; }} controls muted playsInline preload="metadata" src={clips[tutorial.id].url} onPlay={() => setActiveVideo(tutorial.id)} aria-label={tutorial.title} /> : <TutorialPoster tutorial={tutorial} />}</div>
          <div className="docs-video-info"><span className="docs-role-badge">{tutorial.role}</span><h5>{tutorial.title}</h5><p>{tutorial.steps.length} {tutorial.steps.length === 1 ? 'paso' : 'pasos'} · {Math.ceil(getTutorialDuration(tutorial) / 1000)} segundos</p>
            <button type="button" className="docs-button" disabled={busy} onClick={() => clips[tutorial.id] ? download(clips[tutorial.id].blob, `${tutorial.id}.webm`) : previewVideo(tutorial)}>{clips[tutorial.id] ? <Download size={14} /> : <Play size={14} />}{clips[tutorial.id] ? 'Descargar WebM' : 'Crear y reproducir guía'}</button>
          </div>
        </article>)}</div>
        <div className="docs-video-export"><div><strong>Manuales y guías en un solo paquete</strong><p>Incluye las {videos.length} guías de la selección actual, listas para reproducir desde el sitio.</p></div><button type="button" className="docs-button docs-button-primary" disabled={busy || !videos.length} onClick={() => exportZip(true)}><Download size={16} />ZIP con guías ({videos.length})</button></div>
      </div>}
      <footer className="docs-panel-footer"><p><Check size={13} />Generar y descargar no publica en GitHub.</p>{bundle.advertencias.length > 0 && <details><summary>Avisos de documentación ({bundle.advertencias.length})</summary><ul>{bundle.advertencias.map(message => <li key={message}>{message}</li>)}</ul></details>}</footer>
      <iframe ref={printFrame} title="Documento completo para imprimir" aria-hidden="true" tabIndex={-1} sandbox="allow-same-origin allow-modals" srcDoc={bundle.html} onLoad={() => setPrintReady(true)} className="docs-print-frame" />
    </>}
  </section>;
}
