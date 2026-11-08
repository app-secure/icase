import React, { useState } from 'react';

export default function RequirementReviewPanel({ audit, onReview, readOnly, onBusyChange }) {
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState('');
  const act = async (payload) => {
    setBusy(true); onBusyChange?.(true); setFeedback('');
    try { await onReview(payload); setForm(null); setFeedback('Revisión guardada. El control se calculó con los requisitos actuales.'); }
    catch (error) { setFeedback(error.message || 'No se pudo guardar.'); }
    finally { setBusy(false); onBusyChange?.(false); }
  };
  const open = (scope, id, accion, entry) => {
    setFeedback('');
    setForm({ scope, id, accion, justificacion: '', evidencias: entry?.evidencias?.length ? entry.evidencias.map(item => ({ texto: item.texto, fuente: item.fuente || '' })) : [{ texto: entry?.evidencia || '', fuente: '' }],
      cambios: { tipo: entry?.tipo || 'RF', necesidad: entry?.necesidad || '', estado: entry?.estado || 'confirmado', objetivo_id: entry?.objetivo_id || '' } });
  };
  if (!audit || !onReview) return null;
  const button = 'rounded border border-violet-200 bg-white px-3 py-1 text-xs text-violet-800 disabled:opacity-50';
  return <section className="rounded-xl border border-violet-200 bg-violet-50/40 p-4 text-sm">
    <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold">Revisión y decisiones · versión {audit.version_analisis || 1}</h3>
      <button className={button} disabled={busy} onClick={() => act({ accion: 'validar' })}>Comprobar versión guardada</button></div>
    <p className="mt-2 text-xs text-slate-600">Una cita inválida requiere corregir su evidencia, no borrar automáticamente la necesidad. Las observaciones de IA son advertencias; solo un problema crítico confirmado por ti bloquea el pase, además de los errores estructurales.</p>
    {audit.revision_actual && <div className="mt-2 rounded border bg-white p-2">
      <p className="font-medium">Última comprobación: {audit.revision_actual.errores.length} errores críticos · {audit.revision_actual.advertencias.length} advertencias</p>
      {[...audit.revision_actual.errores.map(item => item.mensaje), ...audit.revision_actual.advertencias].map((text, i) => <p key={i} className="mt-1 text-xs">• {text}</p>)}
    </div>}
    {!readOnly && <>
      {(audit.necesidades_pendientes || []).filter(item => item.estado_validacion === 'pendiente').map((item, i) => <div key={`pending-${i}`} className="mt-3 border-t pt-2">
        <p>{item.id}: {item.elemento?.necesidad}</p><p className="text-xs">Impacto: {['RF', 'RNF'].includes(item.elemento?.tipo) ? 'Necesidad funcional o de calidad sin validar: bloquea el pase.' : 'Contexto o decisión por revisar: advertencia.'}</p>
        <div className="mt-1 flex gap-2"><button disabled={busy} className={button} onClick={() => open('necesidad', item.id, 'corregir_evidencia', item.elemento)}>Corregir fragmentos</button><button disabled={busy} className={button} onClick={() => open('necesidad', item.id, 'descartar')}>Descartar con justificación</button></div>
      </div>)}
      <details className="mt-3"><summary className="cursor-pointer font-medium">Editar clasificación, reglas, restricciones y preguntas</summary>
        {(audit.inventario || []).map(item => <div key={item.id} className="mt-2 flex items-start justify-between gap-2 border-t pt-2"><p className="text-xs">{item.id} · {item.tipo} · {item.estado}: {item.necesidad}</p><button disabled={busy} className={button} onClick={() => open('analisis', item.id, 'editar_analisis', item)}>Revisar</button></div>)}
      </details>
      {(audit.revision_semantica?.hallazgos || []).map(item => <div key={item.id} className="mt-3 border-t pt-2">
        <p>{item.id}: {item.descripcion} · {item.estado}</p><p className="text-xs">Propuesta: {item.accion_propuesta}. Afecta: {[...item.requisitos_afectados, ...item.necesidades_afectadas].join(', ') || 'elemento no identificado en el inventario'}.</p>
        <div className="mt-1 flex flex-wrap gap-2">
          {item.estado === 'corregido' && <button disabled={busy} className={button} onClick={() => open('hallazgo', item.id, 'aceptar')}>Aceptar corrección aplicada</button>}
          {['pendiente', 'confirmado'].includes(item.estado) && <>
            <button disabled={busy} className={button} onClick={() => open('hallazgo', item.id, 'confirmar')}>Confirmar incidencia</button>
            <button disabled={busy} className={button} onClick={() => open('hallazgo', item.id, 'resolver')}>Ya lo corregí manualmente</button>
            <button disabled={busy} className={button} onClick={() => open('hallazgo', item.id, 'descartar')}>Descartar observación</button>
          </>}
        </div>
        {!!item.historial?.length && <details className="mt-1 text-xs"><summary>Historial de decisiones</summary>{item.historial.map((entry, i) => <p key={i}>{entry.fecha} · {entry.accion}: {entry.justificacion}</p>)}</details>}
      </div>)}
    </>}
    {form && !readOnly && <form className="mt-4 space-y-2 rounded-lg border bg-white p-3" onSubmit={event => {
      event.preventDefault();
      const { scope, id, ...data } = form;
      if (!data.justificacion.trim()) return setFeedback('Explica la decisión antes de guardarla.');
      act(scope === 'necesidad' ? { scope, id, data } : { ...data, id });
    }}>
      <p className="font-medium">{form.id} · {form.accion}</p>
      {form.accion === 'corregir_evidencia' && <>
        <p className="text-xs">Copia fragmentos continuos. Para una propuesta y su confirmación añade dos fragmentos; fuente vacía permite localizarla en los insumos actuales.</p>
        {form.evidencias.map((evidence, index) => <div key={index} className="space-y-1 rounded border p-2">
          <label className="block text-xs">Fragmento literal<textarea required className="w-full rounded border p-2" value={evidence.texto} onChange={event => setForm({ ...form, evidencias: form.evidencias.map((item, i) => i === index ? { ...item, texto: event.target.value } : item) })} /></label>
          <label className="block text-xs">Archivo de origen<input className="w-full rounded border p-2" value={evidence.fuente} onChange={event => setForm({ ...form, evidencias: form.evidencias.map((item, i) => i === index ? { ...item, fuente: event.target.value } : item) })} /></label>
          {form.evidencias.length > 1 && <button type="button" className={button} onClick={() => setForm({ ...form, evidencias: form.evidencias.filter((_, i) => i !== index) })}>Quitar fragmento</button>}
        </div>)}
        <button type="button" className={button} onClick={() => setForm({ ...form, evidencias: [...form.evidencias, { texto: '', fuente: '' }] })}>Añadir fragmento</button>
      </>}
      {['editar_analisis', 'corregir_evidencia'].includes(form.accion) && <>
        <label className="block text-xs">Clasificación<select className="ml-2 rounded border p-1" value={form.cambios.tipo} onChange={event => setForm({ ...form, cambios: { ...form.cambios, tipo: event.target.value } })}>{['RF', 'RNF', 'regla_negocio', 'restriccion_tecnica', 'contexto', 'pregunta', 'decision'].map(tipo => <option key={tipo}>{tipo}</option>)}</select></label>
        <label className="block text-xs">Contenido<textarea required className="w-full rounded border p-2" value={form.cambios.necesidad} onChange={event => setForm({ ...form, cambios: { ...form.cambios, necesidad: event.target.value } })} /></label>
        <label className="block text-xs">Estado<select className="ml-2 rounded border p-1" value={form.cambios.estado} onChange={event => setForm({ ...form, cambios: { ...form.cambios, estado: event.target.value } })}>{['confirmado', 'pendiente', 'rechazado', 'fuera_de_alcance'].map(state => <option key={state}>{state}</option>)}</select></label>
        <label className="block text-xs">Objetivo (obligatorio para RF/RNF)<input className="ml-2 rounded border p-1" value={form.cambios.objetivo_id} onChange={event => setForm({ ...form, cambios: { ...form.cambios, objetivo_id: event.target.value } })} /></label>
        <p className="text-xs">Cambiar la clasificación no crea requisitos automáticamente. Después ajusta su cobertura y criterios.</p>
      </>}
      {form.accion === 'confirmar' && <label className="block text-xs">Impacto<select className="ml-2 rounded border p-1" value={form.severidad || 'advertencia'} onChange={event => setForm({ ...form, severidad: event.target.value })}><option value="advertencia">Advertencia</option><option value="critico">Crítico: bloquear aprobación hasta resolver</option></select></label>}
      {form.accion === 'resolver' && <p className="text-xs">Confirma que revisaste y corregiste el contenido. Se validará la estructura actual; esto registra tu revisión humana, no una nueva auditoría con IA.</p>}
      <label className="block text-xs">Justificación<textarea required className="w-full rounded border p-2" value={form.justificacion} onChange={event => setForm({ ...form, justificacion: event.target.value })} /></label>
      <button disabled={busy} className={button}>{busy ? 'Guardando…' : 'Guardar decisión'}</button> <button disabled={busy} type="button" className={button} onClick={() => setForm(null)}>Cancelar</button>
    </form>}
    {feedback && <p role="status" className="mt-2 whitespace-pre-wrap text-xs">{feedback}</p>}
  </section>;
}
