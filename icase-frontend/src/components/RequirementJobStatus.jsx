import React, { useState } from 'react';
import { Loader2, Info, X } from 'lucide-react';
export default function RequirementJobStatus({ job, onResume, onCancel, showProgress = false, showRecovery = true, onDismiss, children }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  if (!job || job.estado === 'completado') return null;
  const progress = job.progreso_requisitos || {};
  const resumable = ['esperando_proveedor', 'interrumpido'].includes(job.estado);
  const running = ['encolado', 'procesando'].includes(job.estado);
  return <aside className="fixed bottom-5 right-5 z-50 max-w-[calc(100vw-2.5rem)] text-sm">
    {open && <div className="mb-3 w-96 max-w-full max-h-[65dvh] overflow-y-auto overscroll-contain rounded-2xl border border-violet-200 bg-white p-4 shadow-xl">
    <div className="flex items-center justify-between"><strong>Procesamiento con IA</strong><button type="button" aria-label="Cerrar detalles" onClick={() => setOpen(false)} className="rounded p-2"><X size={16} /></button></div>
    <section aria-label={job.tipo === 'diagrama' ? 'Trabajo de diagrama' : 'Trabajo de requisitos'} role="status" className="mt-3 break-words text-sm text-slate-800">
    <p className="font-semibold">{job.mensaje || job.estado}</p>
    <p>Etapa: {progress.etapa || 'en cola'}{showRecovery && <> · Puntos de recuperación válidos: {job.total_recuperadas || 0}</>}</p>
    {showProgress && running && <div className="my-3"><div className="mb-1 flex justify-between text-xs"><span>Progreso informado</span><strong>{Math.min(100, Math.max(0, Number(job.progreso) || 0))}%</strong></div><div role="progressbar" aria-label="Progreso de generación" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.min(100, Math.max(0, Number(job.progreso) || 0))} className="h-2 overflow-hidden rounded-full bg-violet-100"><div className="h-full rounded-full bg-violet-600 transition-all" style={{ width: `${Math.min(100, Math.max(0, Number(job.progreso) || 0))}%` }} /></div></div>}
    {progress.proveedor && <p>Proveedor: {progress.proveedor} · Modelo: {progress.modelo}</p>}
    {progress.recuperada && <p>Esta etapa se recuperó sin volver a consultar a la IA.</p>}
    {job.borrador_conservado && <p>El borrador se conserva en el trabajo; no sustituye requisitos aprobados.</p>}
    {!!progress.cambios_ruta?.length && <details className="mt-2"><summary>Disponibilidad y cambios de ruta</summary>
      {progress.cambios_ruta.map((event, i) => <p key={i}>{event.provider} / {event.model}: {event.cause} · {event.until ? `Disponible desde ${new Date(event.until).toLocaleString()}` : 'sin fecha de disponibilidad confirmada'}</p>)}
    </details>}
    {resumable && <button type="button" onClick={onResume} className="mt-3 rounded-full bg-violet-700 px-4 py-2 font-semibold text-white">Reanudar pendientes</button>}
    {job.estado === 'fallido' && <p>{job.tipo === 'diagrama' ? job.error || 'No se pudo completar la generación. Revisa el error antes de reintentar.' : 'No se aplicó un resultado obsoleto. Revisa los cambios e inicia una nueva generación.'}</p>}
    {children}
    {onDismiss && !running && <button type="button" onClick={onDismiss} className="mt-3 rounded-lg border border-slate-200 px-3 py-2">Descartar aviso</button>}
    {error && <p role="alert" className="mt-3 text-red-700">{error}</p>}
    {(running || resumable) && onCancel && <button type="button" disabled={busy} className="mt-3 rounded-xl border border-red-200 px-3 py-2 text-red-700 disabled:opacity-50" onClick={async () => {
      if (!window.confirm('¿Cancelar procesamiento? Se conservan las etapas guardadas. Una solicitud ya enviada puede terminar y consumir tokens, pero su respuesta no se aplicará.')) return;
      setBusy(true); setError(''); try { await onCancel(); } catch (failure) { setError(failure.message); } finally { setBusy(false); }
    }}>{busy ? 'Cancelando…' : 'Cancelar procesamiento'}</button>}
    {job.estado === 'cancelado' && <p className="mt-3">Se conservan las etapas guardadas. Las respuestas pendientes no se aplicarán.</p>}
  </section></div>}
  <div className="flex justify-end"><button type="button" aria-expanded={open} aria-label="Ver detalles del procesamiento con IA" onClick={() => setOpen(value => !value)} className="inline-flex items-center gap-3 rounded-full border border-violet-200 bg-white py-2 pl-2 pr-4 shadow-lg hover:bg-violet-50"><span className="flex h-10 w-10 items-center justify-center rounded-full bg-violet-600 text-white">{running ? <Loader2 size={22} className="animate-spin motion-reduce:animate-none" /> : <Info size={22} />}</span><span className="max-w-48 truncate text-left text-xs"><strong className="block text-violet-800" role="status">{running ? 'IA procesando' : job.estado}</strong>{String(progress.etapa || 'En cola').replace(/_/g, ' ')}</span></button></div>
  </aside>;
}
