import React, { useState } from 'react';
import AnalysisModal from './AnalysisModal';
import { Plus } from 'lucide-react';
const FormContainer = ({ modalForms, open, title, onClose, busy, children }) => modalForms ? <AnalysisModal open={open} title={title} onClose={onClose} busy={busy}>{children}</AnalysisModal> : children;

const key = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().replace(/\s+/g, ' ').toLowerCase();
export default function RequirementActorsPanel({ audit, requirements, onReview, readOnly = true, onBusyChange, modalForms = false }) {
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const submit = async (actor, accion) => {
    setBusy(true); onBusyChange?.(true); setError('');
    try {
      await onReview({ accion, id: actor.id, cambios: form, destino_id: form.destino_id, justificacion: form.justificacion });
      setEditing(null);
    } catch (e) { setError(e.message); }
    finally { setBusy(false); onBusyChange?.(false); }
  };
  const rows = [...(requirements?.functional || []), ...(requirements?.nonFunctional || [])];
  const names = [...new Map(rows.flatMap(row => row.actors || row.actores || []).map(name => [key(name), name])).values()];
  const actors = audit?.actores?.length ? audit.actores : names.map((nombre, index) => ({ id: `legacy-${index}`, nombre, estado: 'pendiente', heredado: true, alias: [], evidencias: [] }));
  if (!actors.length && readOnly) return null;
  return <details className="my-4 rounded-xl border border-slate-200 bg-white p-4">
    <summary className="flex cursor-pointer items-center gap-2 font-semibold">Actores del sistema <span className="initial-analysis__count inline-flex items-center rounded-full bg-violet-50 px-2.5 py-0.5 text-xs font-semibold text-violet-700">{actors.length}</span></summary>
    <p className="mt-2 text-xs text-slate-500">Un actor no implica una clase, pantalla ni permiso. Las asociaciones muestran los requisitos que lo mencionan.</p>
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    {!readOnly && onReview && <div className="mt-3"><button type="button" disabled={busy} aria-haspopup={modalForms ? 'dialog' : undefined} aria-expanded={modalForms ? undefined : adding} className="inline-flex items-center gap-1.5 rounded-lg border border-violet-200 bg-white px-3 py-2 text-xs font-semibold text-violet-700 transition-colors hover:border-violet-300 hover:bg-violet-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50" onClick={() => setAdding(value => !value)}><Plus size={16} aria-hidden="true" />Añadir actor</button>{(modalForms || adding) && <FormContainer modalForms={modalForms} busy={busy} open={adding} title="Añadir actor del sistema" onClose={() => setAdding(false)}><form className="mt-3 space-y-2 rounded border p-3" onSubmit={async e => {
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
      return <article key={actor.id} data-actor-id={actor.id} className="mt-3 border-t border-slate-100 pt-3 text-sm">
        <h3 className="font-semibold">{actor.nombre} · {actor.estado}</h3>
        <p>{actor.descripcion}</p>
        {(actor.advertencias || []).map((message, index) => <p key={index} className="text-xs text-amber-800">{message}</p>)}
        <p className="text-xs text-slate-500">{actor.heredado ? 'Información heredada; sin evidencia propia.' : `${actor.tipo === 'sistema_externo' ? 'Sistema externo' : 'Persona'} · ${actor.origen}`}</p>
        {!!actor.alias?.length && <p>Alias: {actor.alias.join(', ')}</p>}
        <p>Requisitos: {related.map(row => row.identificador || row.id).join(', ') || 'Sin asociación'}</p>
        {(actor.evidencias || []).map((e, i) => <blockquote key={i} className="mt-1 text-xs text-slate-500">“{e.texto}” · {e.fuente}</blockquote>)}
        {!readOnly && onReview && <button type="button" disabled={busy} className="mt-2 text-violet-700 underline" onClick={() => { setEditing(actor.id); setForm({ nombre: actor.nombre, descripcion: actor.descripcion || '', tipo: actor.tipo || 'persona', justificacion: '', destino_id: '' }); }}>Revisar actor</button>}
        {!readOnly && editing === actor.id && <FormContainer modalForms={modalForms} busy={busy} open title={`Revisar actor: ${actor.nombre}`} onClose={() => setEditing(null)}><fieldset disabled={busy} className="mt-3 space-y-2 rounded border p-3">
          {error && <p role="alert" className="text-red-700">{error}</p>}
          <label className="block">Nombre<input className="block w-full border p-2" value={form.nombre} onChange={e => setForm({ ...form, nombre: e.target.value })} /></label>
          <label className="block">Responsabilidad<textarea className="block w-full border p-2" value={form.descripcion} onChange={e => setForm({ ...form, descripcion: e.target.value })} /></label>
          <label className="block">Tipo<select value={form.tipo} onChange={e => setForm({ ...form, tipo: e.target.value })}><option value="persona">Persona</option><option value="sistema_externo">Sistema externo</option></select></label>
          <label className="block">Justificación de la decisión<textarea className="block w-full border p-2" value={form.justificacion} onChange={e => setForm({ ...form, justificacion: e.target.value })} /></label>
          <button type="button" className="mr-3 text-violet-700" onClick={() => submit(actor, 'editar_actor')}>Guardar cambios</button>
          <button type="button" className="mr-3 text-violet-700" onClick={() => submit(actor, 'confirmar_actor')}>Confirmar actor actual</button>
          <label className="block">Fusionar este actor en<select className="block w-full border p-2" value={form.destino_id} onChange={e => setForm({ ...form, destino_id: e.target.value })}><option value="">Selecciona destino</option>{actors.filter(a => a.id !== actor.id).map(a => <option key={a.id} value={a.id}>{a.nombre}</option>)}</select></label>
          <p className="text-xs text-slate-500">La fusión conserva alias y evidencias y actualiza los requisitos asociados.</p>
          <button type="button" disabled={!form.destino_id} className="mr-3 text-violet-700 disabled:opacity-50" onClick={() => { if (window.confirm('¿Fusionar estos actores y actualizar sus asociaciones?')) submit(actor, 'fusionar_actor'); }}>Fusionar</button>
          <button type="button" onClick={() => setEditing(null)}>Cancelar</button>
        </fieldset></FormContainer>}
      </article>;
    })}
  </details>;
}
