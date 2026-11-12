import React from 'react';
export default function RequirementJobStatus({ job, onResume }) {
  if (!job || job.estado === 'completado') return null;
  const progress = job.progreso_requisitos || {};
  const resumable = ['esperando_proveedor', 'interrumpido'].includes(job.estado);
  return <section aria-label="Trabajo de requisitos" role="status" className="m-4 shrink-0 break-words rounded-xl border border-violet-200 bg-violet-50 p-4 text-sm text-slate-800">
    <p className="font-semibold">{job.mensaje || job.estado}</p>
    <p>Etapa: {progress.etapa || 'en cola'} · Puntos de recuperación válidos: {job.total_recuperadas || 0}</p>
    {progress.proveedor && <p>Proveedor: {progress.proveedor} · Modelo: {progress.modelo}</p>}
    {progress.recuperada && <p>Esta etapa se recuperó sin volver a consultar a la IA.</p>}
    {job.borrador_conservado && <p>El borrador se conserva en el trabajo; no sustituye requisitos aprobados.</p>}
    {!!progress.cambios_ruta?.length && <details className="mt-2"><summary>Disponibilidad y cambios de ruta</summary>
      {progress.cambios_ruta.map((event, i) => <p key={i}>{event.provider} / {event.model}: {event.cause} · {event.until ? `Disponible desde ${new Date(event.until).toLocaleString()}` : 'sin fecha de disponibilidad confirmada'}</p>)}
    </details>}
    {resumable && <button type="button" onClick={onResume} className="mt-3 rounded-full bg-violet-700 px-4 py-2 font-semibold text-white">Reanudar pendientes</button>}
    {job.estado === 'fallido' && <p>No se aplicó un resultado obsoleto. Revisa los cambios e inicia una nueva generación.</p>}
  </section>;
}
