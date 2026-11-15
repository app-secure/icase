import React, { useState } from 'react';
import AnalysisModal from './AnalysisModal';
import SourceAutocomplete from './SourceAutocomplete';
import { WandSparkles } from 'lucide-react';
const FormContainer = ({ modalForms, open, title, onClose, busy, children, footer }) => modalForms ? <AnalysisModal open={open} title={title} onClose={onClose} busy={busy} footer={footer}>{children}</AnalysisModal> : <>{children}{footer}</>;

const key = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().replace(/\s+/g, ' ').toLowerCase();
export default function RequirementActorsPanel({ audit, requirements, onReview, readOnly = true, onBusyChange, modalForms = false, onCorrectActor, onReviewActors, sources = [], compact = false }) {
  const [adding, setAdding] = useState(false);
  const [merging, setMerging] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const submit = async (actor, accion) => {
    const missing = {};
    if (accion !== 'fusionar_actor' && !form.nombre?.trim()) missing.nombre = 'Escribe el nombre del actor.';
    if (!form.justificacion?.trim()) missing.justificacion = 'Explica la razón del cambio.';
    if (accion === 'fusionar_actor' && !form.destino_id) missing.destino_id = 'Selecciona el actor destino.';
    if (accion !== 'fusionar_actor' && form.evidencias?.some(entry => !entry.texto?.trim())) missing.evidencias = 'Completa o elimina los fragmentos vacíos.';
    setFieldErrors(missing); setError('');
    if (Object.keys(missing).length) return;
    setBusy(true); onBusyChange?.(true);
    try {
      await onReview({ accion, id: actor.id, cambios: form, destino_id: form.destino_id, justificacion: form.justificacion });
      setEditing(null); setMerging(null);
    } catch (e) { setError(e.message); }
    finally { setBusy(false); onBusyChange?.(false); }
  };
  const rows = [...(requirements?.functional || []), ...(requirements?.nonFunctional || [])];
  const names = [...new Map(rows.flatMap(row => row.actors || row.actores || []).map(name => [key(name), name])).values()];
  const actors = audit?.actores?.length ? audit.actores : names.map((nombre, index) => ({ id: `legacy-${index}`, nombre, estado: 'pendiente', heredado: true, alias: [], evidencias: [] }));
  if (!actors.length && readOnly) return null;
  return <details className={compact ? 'group/section border-b border-slate-200 py-3' : 'my-4 rounded-xl border border-slate-200 bg-white p-4'}>
    <summary className={compact ? 'cursor-pointer text-xs font-semibold text-slate-700' : 'flex cursor-pointer items-center gap-2 font-semibold'}>Actores del sistema <span className={compact ? 'ml-1 font-normal text-slate-400' : 'initial-analysis__count inline-flex items-center rounded-full bg-violet-50 px-2.5 py-0.5 text-xs font-semibold text-violet-700'}>{compact ? `(${actors.length})` : actors.length}</span>{!compact && <span className="ml-auto flex flex-wrap items-center justify-end gap-2">{!readOnly && onReview && <button type="button" disabled={busy} aria-haspopup={modalForms ? 'dialog' : undefined} aria-expanded={modalForms ? undefined : adding} className="inline-flex items-center gap-1.5 rounded-lg border border-violet-200 bg-white px-3 py-2 text-xs font-semibold text-violet-700 transition-colors hover:border-violet-300 hover:bg-violet-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50" onClick={event => { event.preventDefault(); event.stopPropagation(); const panel = event.currentTarget.closest("details"); if (panel) panel.open = true; setAdding(value => !value); }}>Añadir</button>}{!readOnly && onReviewActors && <button type="button" disabled={busy || !actors.length} onClick={event => { event.preventDefault(); event.stopPropagation(); onReviewActors(); }}><WandSparkles size={14} aria-hidden="true" />Revisar apartado con IA</button>}</span>}</summary>
    <p className="mt-2 text-xs text-slate-500">Un actor no implica una clase, pantalla ni permiso. Las asociaciones muestran los requisitos que lo mencionan.</p>
    {error && !editing && !adding && !merging && <p role="alert" className="text-sm text-red-700">{error}</p>}
    {!readOnly && onReview && <div className="mt-3">{(modalForms || adding) && <FormContainer modalForms={modalForms} busy={busy} open={adding} title="Añadir actor del sistema" onClose={() => setAdding(false)}><form className="mt-3 space-y-2 rounded border p-3" onSubmit={async e => {
      e.preventDefault(); const data = new FormData(e.currentTarget); const element = e.currentTarget;
      setBusy(true); onBusyChange?.(true); setError('');
      try { await onReview({ accion: 'agregar_actor', cambios: { nombre: data.get('nombre'), descripcion: data.get('descripcion'), tipo: data.get('tipo') }, justificacion: data.get('justificacion') }); element.reset(); setAdding(false); }
      catch (failure) { setError(failure.message); } finally { setBusy(false); onBusyChange?.(false); }
    }}><fieldset disabled={busy} className="space-y-2"><legend className="font-medium">Añadir actor</legend>
      <label className="block">Nombre del nuevo actor<input required name="nombre" className="block w-full border p-2" /></label>
      <label className="block">Responsabilidad del nuevo actor<textarea name="descripcion" className="block w-full border p-2" /></label>
      <label className="block">Tipo del nuevo actor<select name="tipo"><option value="persona">Persona</option><option value="sistema_externo">Sistema externo</option></select></label>
      <label className="block">Justificación del nuevo actor<textarea required name="justificacion" className="block w-full border p-2" /></label>
      <button type="submit" className="text-violet-700">Añadir actor pendiente</button>
    {error && <p role="alert" className="text-red-700">{error}</p>}</fieldset></form></FormContainer>}</div>}
    {actors.map(actor => {
      const aliases = [actor.nombre, ...(actor.alias || [])].map(key);
      const related = rows.filter(row => (row.actors || row.actores || []).some(name => aliases.includes(key(name))));
      return <article key={actor.id} data-actor-id={actor.id} className={compact ? 'mt-3 rounded-lg border border-slate-200 bg-white p-3 text-xs text-slate-600' : 'mt-3 border-t border-slate-100 pt-3 text-sm'}>
        <h3 className="font-semibold">{actor.nombre} · {actor.estado}</h3>
        <p>{actor.descripcion}</p>
        {(actor.advertencias || []).map((message, index) => <p key={index} className="text-xs text-amber-800">{message}</p>)}
        <p className="text-xs text-slate-500">{actor.heredado ? 'Información heredada; sin evidencia propia.' : `${actor.tipo === 'sistema_externo' ? 'Sistema externo' : 'Persona'} · ${actor.origen}`}</p>
        {!!actor.alias?.length && <p>Alias: {actor.alias.join(', ')}</p>}
        <p>Requisitos: {related.map(row => row.identificador || row.id).join(', ') || 'Sin asociación'}</p>
        {(actor.evidencias || []).map((e, i) => <blockquote key={i} className="mt-1 text-xs text-slate-500">“{e.texto}” · {e.fuente}</blockquote>)}
        {!readOnly && onReview && <button type="button" disabled={busy} className="mt-2 text-violet-700 underline" onClick={() => { setError(''); setFieldErrors({}); setEditing(actor.id); setForm({ origen: actor.origen || 'inferido', estado: actor.estado || 'pendiente', evidencias: structuredClone(actor.evidencias || []), nombre: actor.nombre, descripcion: actor.descripcion || '', tipo: actor.tipo || 'persona', justificacion: '', destino_id: '' }); }}>Revisar actor</button>}
        {!readOnly && onCorrectActor && <button type="button" disabled={busy} className="ml-2" onClick={() => onCorrectActor(actor)}>Corregir con IA</button>}
        {!readOnly && onReview && <button type="button" disabled={busy} className="ml-2" onClick={() => { setError(''); setFieldErrors({}); setMerging(actor.id); setForm({ destino_id: '', justificacion: '' }); }}>Fusionar</button>}
        {!readOnly && editing === actor.id && <FormContainer modalForms={modalForms} busy={busy} open title={`Revisar actor: ${actor.nombre}`} onClose={() => setEditing(null)} footer={<div className="flex flex-wrap justify-end gap-2"><button disabled={busy} onClick={() => setEditing(null)}>Cancelar</button><button className="initial-analysis__primary" disabled={busy} onClick={() => submit(actor, 'editar_actor')}>Guardar cambios</button></div>}>
          <fieldset disabled={busy} className="space-y-4">
            <label className="block">Nombre<input aria-invalid={Boolean(fieldErrors.nombre)} value={form.nombre} onChange={e => setForm({ ...form, nombre: e.target.value })} />{fieldErrors.nombre && <span role="alert" className="block text-xs text-red-700">{fieldErrors.nombre}</span>}</label>
            <label className="block">Responsabilidad<textarea value={form.descripcion} onChange={e => setForm({ ...form, descripcion: e.target.value })} /></label>
            <label className="block">Tipo<select value={form.tipo} onChange={e => setForm({ ...form, tipo: e.target.value })}><option value="persona">Persona</option><option value="sistema_externo">Sistema externo</option></select></label>
            <label className="block">Origen<select value={form.origen} onChange={e => setForm({ ...form, origen: e.target.value })}><option value="explicito">Explícito en las fuentes</option><option value="inferido">Inferido · requiere revisión</option><option value="manual">Añadido manualmente</option></select></label>
            <label className="block">Estado de revisión<select value={form.estado} onChange={e => setForm({ ...form, estado: e.target.value })}><option value="pendiente">Pendiente</option><option value="confirmado">Confirmado</option></select></label>
            <fieldset className="space-y-3"><legend className="mb-2 font-semibold">Evidencias</legend>
              {(form.evidencias || []).map((entry, index) => <div key={index} className="space-y-2 rounded-xl border border-slate-200 p-3">
                <label className="block">Cita literal {index + 1}<textarea value={entry.texto || ''} onChange={e => setForm({ ...form, evidencias: form.evidencias.map((item, n) => n === index ? { texto: e.target.value, fuente: item.fuente } : item) })} /></label>
                <label className="block">Archivo de origen<SourceAutocomplete sources={sources} value={entry.fuente || ''} onChange={fuente => setForm({ ...form, evidencias: form.evidencias.map((item, n) => n === index ? { texto: item.texto, fuente } : item) })} /></label>
                <button onClick={() => setForm({ ...form, evidencias: form.evidencias.filter((_, n) => n !== index) })}>Quitar fragmento</button>
              </div>)}
              <button onClick={() => setForm({ ...form, evidencias: [...(form.evidencias || []), { texto: '', fuente: '' }] })}>Añadir fragmento de evidencia</button>
              {fieldErrors.evidencias && <p role="alert" className="text-xs text-red-700">{fieldErrors.evidencias}</p>}
            </fieldset>
            <label className="block">Justificación de los cambios<textarea value={form.justificacion} onChange={e => setForm({ ...form, justificacion: e.target.value })} />{fieldErrors.justificacion && <span role="alert" className="block text-xs text-red-700">{fieldErrors.justificacion}</span>}</label>
            {error && <p role="alert" className="text-red-700">{error}</p>}
          </fieldset>
        </FormContainer>}
        {!readOnly && merging === actor.id && <FormContainer modalForms={modalForms} busy={busy} open title={`Fusionar actor: ${actor.nombre}`} onClose={() => setMerging(null)} footer={<div className="flex justify-end gap-2"><button disabled={busy} onClick={() => setMerging(null)}>Cancelar</button><button className="initial-analysis__primary" disabled={busy || !form.destino_id} onClick={() => submit(actor, 'fusionar_actor')}>Confirmar fusión</button></div>}>
          <fieldset disabled={busy} className="space-y-4"><p>Selecciona dónde conservar el actor. Se reunirán alias y evidencias y se actualizarán sus asociaciones; no se borrará el historial.</p>
            <div className="space-y-2">{actors.filter(a => a.id !== actor.id).map(a => <label key={a.id} className="flex items-start gap-3 rounded-lg border p-3"><input type="radio" name="actor-destino" checked={form.destino_id === a.id} onChange={() => setForm({ ...form, destino_id: a.id })} /><span><strong>{a.nombre}</strong><span className="block text-xs text-slate-500">{a.descripcion}</span></span></label>)}</div>
            <label className="block">Justificación de la fusión<textarea value={form.justificacion} onChange={e => setForm({ ...form, justificacion: e.target.value })} />{fieldErrors.justificacion && <span role="alert" className="block text-xs text-red-700">{fieldErrors.justificacion}</span>}</label>
            {error && <p role="alert" className="text-red-700">{error}</p>}
          </fieldset>
        </FormContainer>}
      </article>;
    })}
  </details>;
}
