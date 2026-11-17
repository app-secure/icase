import React, { useCallback, useEffect, useRef, useState } from 'react';
import { BookOpen, ExternalLink, Loader2, Monitor, Play, RotateCcw, Smartphone, Square } from 'lucide-react';
import { controlLocalRunApi, fetchLocalRunApi } from '../services/api';

const STATE = {
  inactivo: { label: 'Sin ejecutar', style: 'border-slate-200 bg-slate-50 text-slate-600' },
  iniciando: { label: 'Iniciando…', style: 'border-blue-200 bg-blue-50 text-blue-700' },
  activo: { label: 'En ejecución', style: 'border-emerald-200 bg-emerald-50 text-emerald-700' },
  detenido: { label: 'Contenedores detenidos o eliminados', style: 'border-amber-200 bg-amber-50 text-amber-700' },
  deteniendo: { label: 'Deteniendo…', style: 'border-blue-200 bg-blue-50 text-blue-700' },
  error: { label: 'Error', style: 'border-red-200 bg-red-50 text-red-700' }
};

function AccessCard({ icon: Icon, title, children }) {
  return <div className="rounded-xl border border-slate-200 bg-white p-4 text-xs">
    <p className="flex items-center gap-2 text-sm font-semibold text-slate-900"><Icon size={15} className="text-violet-500" />{title}</p>
    <div className="mt-2 space-y-1.5 text-slate-600">{children}</div>
  </div>;
}

function OpenLink({ url, enabled }) {
  return enabled
    ? <a href={url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-mono text-violet-700 hover:underline">{url}<ExternalLink size={11} /></a>
    : <span className="font-mono text-slate-400">{url} (no disponible hasta que se ejecute)</span>;
}

/**
 * Resumen final operativo: ejecuta el paquete aprobado desde la herramienta, muestra por separado los accesos a web,
 * móvil y documentación, y permite volver a levantar los contenedores si se detienen o se eliminan.
 */
export default function LocalRunPanel({ projectId, onError }) {
  const [run, setRun] = useState(null);
  const [busy, setBusy] = useState(false);
  const notify = useRef(onError);
  useEffect(() => { notify.current = onError; });

  const load = useCallback(async () => {
    try { setRun(await fetchLocalRunApi(projectId)); } catch (error) { notify.current?.(error.message); }
  }, [projectId]);

  // Consulta frecuente mientras algo está en curso; más espaciada después, para detectar contenedores que se detienen.
  const transitioning = run && ['iniciando', 'deteniendo'].includes(run.estado);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const timer = setInterval(load, transitioning ? 2500 : 10000);
    return () => clearInterval(timer);
  }, [load, transitioning]);

  const control = async (action) => {
    try { setBusy(true); setRun(await controlLocalRunApi(projectId, action)); } catch (error) { notify.current?.(error.message); await load(); } finally { setBusy(false); }
  };

  if (!run) return null;
  const state = STATE[run.estado] || STATE.inactivo;
  const canStart = !transitioning && run.estado !== 'activo';

  return <section aria-label="Ejecución local" className="rounded-xl border border-slate-200 bg-slate-50/50 p-5">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h3 className="font-semibold text-slate-900">Ejecutar el proyecto</h3>
        <p className="mt-1 text-xs text-slate-500">Levanta los contenedores del paquete aprobado en esta máquina con Docker. Los datos se conservan al detener.</p>
        <span className={`mt-2 inline-flex items-center gap-1.5 rounded-full border px-3 py-0.5 text-xs font-semibold ${state.style}`} role="status">
          {transitioning && <Loader2 size={12} className="animate-spin" />}{state.label}{run.version ? ` · paquete v${run.version}` : ''}
        </span>
      </div>
      <div className="flex gap-2">
        {run.estado === 'activo' && <button type="button" disabled={busy || transitioning} onClick={() => control('detener')} className="flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 disabled:opacity-40"><Square size={14} />Detener</button>}
        <button type="button" disabled={busy || !canStart} onClick={() => control('iniciar')} className="flex items-center gap-1.5 rounded-lg bg-violet-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">
          {run.requiere_levantar ? <RotateCcw size={14} /> : <Play size={14} />}{run.requiere_levantar ? 'Volver a levantar contenedores' : 'Ejecutar proyecto'}
        </button>
      </div>
    </div>

    {run.error && <p role="alert" className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">{run.error}</p>}

    <div className="mt-4 grid gap-3 md:grid-cols-3">
      {run.accesos.web && <AccessCard icon={Monitor} title="Aplicación web">
        <OpenLink url={run.accesos.web.url} enabled={run.accesos.web.disponible} />
        {run.credenciales_admin && <p>Administrador: <span className="font-mono">{run.credenciales_admin.email}</span> / <span className="font-mono">{run.credenciales_admin.password}</span></p>}
      </AccessCard>}
      {run.accesos.movil && <AccessCard icon={Smartphone} title="Aplicación móvil">
        <p>{run.accesos.movil.instrucciones}</p>
        <p>API local: <span className="font-mono">{run.accesos.movil.api}</span></p>
      </AccessCard>}
      {run.accesos.documentacion && <AccessCard icon={BookOpen} title="Documentación de la API">
        <OpenLink url={run.accesos.documentacion.url} enabled={run.accesos.documentacion.disponible} />
        <p>Explorador interactivo de todos los endpoints.</p>
      </AccessCard>}
    </div>

    {run.contenedores.length > 0 && <ul className="mt-4 flex flex-wrap gap-2 text-[11px]" aria-label="Contenedores">
      {run.contenedores.map((item) => <li key={item.servicio} className={`rounded-full border px-2.5 py-0.5 ${item.estado === 'running' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-amber-200 bg-amber-50 text-amber-700'}`}>{item.servicio}: {item.estado}</li>)}
    </ul>}

    {run.log.length > 0 && <details className="mt-3 text-xs text-slate-600">
      <summary className="cursor-pointer font-semibold">Salida de Docker</summary>
      <pre className="mt-2 max-h-56 overflow-auto rounded-lg bg-slate-900 p-3 text-[11px] text-slate-100">{run.log.join('\n')}</pre>
    </details>}
  </section>;
}
