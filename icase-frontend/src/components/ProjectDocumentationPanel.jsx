import React, { useEffect, useRef, useState } from 'react';
import { BookOpen, Download, Loader2, Settings2, Film, FileText, RefreshCw, Users, Info } from 'lucide-react';
import { documentationRequest } from '../services/api';
import './ProjectDocumentationPanel.css';

export function saveDocumentationBlob(blob, name) {
  const url = URL.createObjectURL(blob), anchor = document.createElement('a');
  anchor.href = url; anchor.download = name; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 30000);
}

export default function ProjectDocumentationPanel({ projectId }) {
  const [versions, setVersions] = useState([]), [job, setJob] = useState(null);
  const [error, setError] = useState(''), [busy, setBusy] = useState(false), [manual, setManual] = useState('usuario');
  const [preview, setPreview] = useState(''), [mode, setMode] = useState('manuales'), [videoUrls, setVideoUrls] = useState({});
  const [options, setOptions] = useState({ githubActions: true, licencia: '', titular: '', ia: false, videos: false, videoReal: false });
  const objectUrls = useRef([]), loadSequence = useRef(0);
  const running = job && ['pendiente', 'procesando'].includes(job.estado);
  const ready = job?.estado === 'lista';
  const clearUrls = () => { objectUrls.current.forEach(URL.revokeObjectURL); objectUrls.current = []; };
  useEffect(() => {
    let alive = true;
    setJob(null); setPreview(''); setError('');
    documentationRequest(projectId).then(items => { if (alive) { setVersions(items); setJob(items[0] || null); } }).catch(failure => { if (alive) setError(failure.message); });
    return () => { alive = false; clearUrls(); loadSequence.current++; };
  }, [projectId]);
  useEffect(() => {
    if (!running) return undefined;
    let alive = true;
    const timer = setInterval(async () => {
      try { const result = await documentationRequest(projectId, `/${job.id}`); if (alive) { setJob(result); if (!['pendiente', 'procesando'].includes(result.estado)) setVersions(await documentationRequest(projectId)); } }
      catch (failure) { if (alive) setError(failure.message); }
    }, 2000);
    return () => { alive = false; clearInterval(timer); };
  }, [projectId, job?.id, running]);
  const asset = async ruta => documentationRequest(projectId, `/${job.id}/archivo?ruta=${encodeURIComponent(ruta)}`, { binary: true });
  const makeUrl = blob => { const url = URL.createObjectURL(blob); objectUrls.current.push(url); return url; };
  useEffect(() => {
    const sequence = ++loadSequence.current;
    setPreview(''); setVideoUrls({}); clearUrls();
    if (!ready) return;
    (async () => {
      const prefix = 'documentation/site/';
      const blob = await asset(`${prefix}${manual}.html`);
      const document = new DOMParser().parseFromString(await blob.text(), 'text/html');
      // El sitio descargado conserva búsqueda, tema y navegación. En el visor se usa HTML sin scripts.
      document.querySelectorAll('script,base,iframe,object,embed').forEach(node => node.remove());
      for (const node of document.querySelectorAll('img[src],link[rel=stylesheet][href]')) {
        const attr = node.tagName === 'IMG' ? 'src' : 'href', value = node.getAttribute(attr);
        if (!value || /^(?:https?:|data:|\/\/)/i.test(value)) continue;
        const route = new URL(value, `https://documentation.local/${manual}.html`).pathname.slice(1);
        const file = await asset(prefix + route);
        if (node.tagName === 'LINK') { const style = document.createElement('style'); style.textContent = await file.text(); node.replaceWith(style); }
        else { node.setAttribute(attr, makeUrl(file)); node.removeAttribute('loading'); }
      }
      document.querySelectorAll('a').forEach(node => { if (!node.getAttribute('href')?.startsWith('#')) node.removeAttribute('href'); });
      const style = document.createElement('style'); style.textContent = '.md-header,.md-sidebar,.md-tabs,.md-footer{display:none!important}.md-main__inner{margin:0}.md-content{margin:0;width:100%}.md-grid{max-width:100%}'; document.head.append(style);
      if (sequence === loadSequence.current) setPreview('<!doctype html>' + document.documentElement.outerHTML);
      const clips = {};
      for (const video of job.videos || []) clips[video.id] = makeUrl(await asset(video.ruta));
      if (sequence === loadSequence.current) setVideoUrls(clips);
    })().catch(failure => { if (sequence === loadSequence.current) setError(failure.message); });
  }, [job?.id, ready, manual, projectId]);
  const generate = async () => {
    try {
      setBusy(true); setError('');
      if (!options.licencia) throw new Error('Elige una licencia o indica que decidirás después.');
      if (['MIT', 'Apache-2.0', 'propietaria'].includes(options.licencia) && !options.titular.trim()) throw new Error('Escribe el nombre del titular de los derechos.');
      const result = await documentationRequest(projectId, '', { method: 'POST', body: JSON.stringify(options) });
      setJob(result); setVersions(await documentationRequest(projectId));
    } catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  };
  const download = async (ruta, name) => { try { setBusy(true); setError(''); saveDocumentationBlob(await asset(ruta), name); } catch (failure) { setError(failure.message); } finally { setBusy(false); } };
  const update = (name, value) => setOptions(previous => ({ ...previous, [name]: value }));
  return <section className="docs-panel" aria-label="Documentación del proyecto generado">
    <header className="docs-panel-header"><span className="docs-panel-symbol"><BookOpen size={24} /></span><div className="docs-panel-heading"><span className="docs-eyebrow">ENTREGA DEL PROYECTO</span><h3>Documentación del proyecto generado</h3><p>Cinco manuales, recorridos por rol y archivos de entrega. Cada generación conserva su versión.</p></div><span className="docs-state">{running ? <Loader2 className="animate-spin" size={15} /> : <FileText size={15} />}{job ? `Versión ${job.version} · ${job.estado}` : 'Por generar'}</span></header>
    <div className="docs-toolbar"><button type="button" className="docs-button docs-button-primary" disabled={busy || running} onClick={generate}>{running ? <Loader2 className="animate-spin" size={16} /> : <RefreshCw size={16} />}Generar documentación</button>
      {ready && <div className="docs-exports"><button className="docs-button" disabled={busy} onClick={() => download('documentacion.zip', `documentacion-v${job.version}.zip`)}><Download size={15} />Descargar MkDocs y medios</button><button className="docs-button" disabled={busy} onClick={() => download('documentation/site/documentacion.pdf', `manuales-v${job.version}.pdf`)}><Download size={15} />Descargar PDF</button><button className="docs-button" disabled={busy} onClick={() => download('informe-final.pdf', `informe-final-v${job.version}.pdf`)}><FileText size={15} />Informe final PDF</button></div>}
    </div>
    <div className="docs-generation-options"><label>Licencia de la entrega<select aria-label="Licencia de la entrega" value={options.licencia} disabled={running} onChange={event => update('licencia', event.target.value)}><option value="">Selecciona una opción</option><option value="MIT">MIT</option><option value="Apache-2.0">Apache 2.0</option><option value="propietaria">Propietaria</option><option value="conservar">Conservar licencia existente</option><option value="pendiente">Decidir después</option></select></label><label>Titular de los derechos<input aria-label="Titular de los derechos" value={options.titular} disabled={running} onChange={event => update('titular', event.target.value)} placeholder="Nombre de la persona u organización" /></label>
      <details className="docs-options"><summary><Settings2 size={15} />Opciones de generación</summary><div>{[['githubActions', 'Incluir GitHub Actions', 'Construcción automática y manual; publicación opcional.'], ['videos', 'Generar videos por rol', 'Grabación en el servidor; puede tardar varios minutos.'], ['videoReal', 'Recorrer la aplicación en Docker', 'Requiere una entrega aprobada. Si no hay acceso, se etiquetará el recorrido de mockups.'], ['ia', 'Mejorar redacción con IA', 'Dos pasos de redacción y revisión; usa la conexión Bedrock y tiene costo de inferencia.']].map(([name, title, description]) => <label key={name}><input type="checkbox" checked={options[name]} disabled={running || (name === 'videoReal' && !options.videos)} onChange={event => update(name, event.target.checked)} /><span>{title}<small>{description}</small></span></label>)}</div></details>
    </div>
    {versions.length > 0 && <label className="docs-version-select">Versión para revisar<select aria-label="Versión de documentación" value={job?.id || ''} disabled={running} onChange={event => setJob(versions.find(item => item.id === event.target.value))}>{versions.map(item => <option key={item.id} value={item.id}>v{item.version} · {new Date(item.createdAt).toLocaleString('es-EC')} · {item.estado}</option>)}</select></label>}
    {running && <div className="docs-job-progress" role="status"><p><Loader2 size={15} className="animate-spin" />{job.etapa}</p><progress max="100" value={job.progreso} /><small>El trabajo continúa en el servidor aunque cierres esta página.</small></div>}
    {(error || job?.error) && <p className="docs-error" role="alert">{error || job.error}</p>}
    {!job && <div className="docs-empty"><BookOpen size={30} /><p>Elige la licencia y genera los manuales desde los requisitos, diseños y código aprobados.</p></div>}
    {ready && <><div className="docs-content-nav"><div className="docs-view-switch"><button aria-pressed={mode === 'manuales'} onClick={() => setMode('manuales')}><BookOpen size={16} />Manuales<span>5</span></button><button aria-pressed={mode === 'videos'} onClick={() => setMode('videos')}><Film size={16} />Videos<span>{job.videos.length}</span></button></div><span className="docs-role-count"><Users size={14} />{job.flujos.filter(flow => !flow.pending).length} roles documentados</span></div>
      {mode === 'manuales' ? <><nav className="docs-manual-tabs">{job.categorias.map(category => <button key={category.id} aria-pressed={manual === category.id} onClick={() => setManual(category.id)}><strong>{category.title}</strong></button>)}</nav>{preview ? <iframe title="Manuales del proyecto generado" sandbox="allow-same-origin" srcDoc={preview} className="docs-preview" /> : <p role="status" className="docs-status">Cargando manual…</p>}</> : <div className="docs-tutorials"><h4>Recorridos por rol</h4><p>Cada ficha identifica si se grabó la aplicación en ejecución o los mockups aprobados.</p>{!job.videos.length && <p>No se generaron videos en esta versión. Activa la opción y genera una nueva versión.</p>}<div className="docs-video-grid">{job.videos.map(video => <article className="docs-video-card" key={video.id}><div className="docs-video-preview"><video controls preload="metadata" src={videoUrls[video.id]} aria-label={video.titulo} /></div><div className="docs-video-info"><span className="docs-role-badge">{video.rol}</span><h5>{video.titulo}</h5><p>{video.origen === 'aplicacion-docker' ? 'Aplicación en Docker' : 'Mockups aprobados'}</p><button className="docs-button" disabled={busy} onClick={() => download(video.ruta, `${video.id}.webm`)}><Download size={14} />Descargar video</button></div></article>)}</div></div>}
    </>}
    <footer className="docs-panel-footer"><p><Info size={13} />Generar y descargar no publica en GitHub.</p>{job?.advertencias?.length > 0 && <details><summary>Avisos ({job.advertencias.length})</summary><ul>{job.advertencias.map((warning, i) => <li key={i}>{warning}</li>)}</ul></details>}</footer>
  </section>;
}
