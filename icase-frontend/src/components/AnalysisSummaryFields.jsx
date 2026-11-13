import React, { useEffect, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { objectiveGroups } from './analysisSummary';

const fields = [
  ['contexto', 'Contexto'],
  ['problema', 'Problema'],
  ['alcance', 'Alcance']
];

function fieldText(value) {
  if (Array.isArray(value)) return value.filter(Boolean).join('\n');
  return value == null ? '' : String(value);
}

function withoutObjective(inventory, objectiveId) {
  return inventory.map(item => {
    const next = { ...item };
    if (next.objetivo_id === objectiveId) delete next.objetivo_id;
    if (Array.isArray(next.objetivos_relacionados)) {
      next.objetivos_relacionados = next.objetivos_relacionados.filter(id => id !== objectiveId);
      if (!next.objetivos_relacionados.length) delete next.objetivos_relacionados;
    }
    return next;
  });
}

export default function AnalysisSummaryFields({ sintesis = {}, inventory = [], editing, busy, onCommit, onDirty, onClose }) {
  const [texts, setTexts] = useState(() => Object.fromEntries(fields.map(([field]) => [field, fieldText(sintesis[field])])));
  const [objectives, setObjectives] = useState(() => objectiveGroups(inventory).map(group => ({ ...group })));
  useEffect(() => { onDirty?.(editing); return () => onDirty?.(false); }, [editing, onDirty]);
  const save = async () => {
    let nextInventory = inventory;
    for (const group of objectives) {
      if (group.removed) nextInventory = withoutObjective(nextInventory, group.id);
      else {
        const original = objectiveGroups(inventory).find(item => item.id === group.id);
        if (original && group.text.trim() && group.text.trim() !== original.text) {
          nextInventory = nextInventory.map(item => item.id === group.needIds[0] ? { ...item, necesidad: group.text.trim() } : item);
        }
      }
    }
    await onCommit({
      sintesis: { ...sintesis, contexto: texts.contexto.trim(), problema: texts.problema.trim(), alcance: texts.alcance.trim() },
      inventario: nextInventory,
      justificacion: 'Edición del contexto, el problema, el alcance y los objetivos.'
    });
    onClose();
  };
  return <div className="my-3 space-y-3">
    {fields.map(([field, label]) => <div key={field}>
      <strong>{label}</strong>
      {editing ? <textarea aria-label={label} className="mt-1 block w-full border p-2" value={texts[field] || ''} onChange={e => setTexts({ ...texts, [field]: e.target.value })} /> : <p className="whitespace-pre-wrap">{fieldText(sintesis[field]).trim() || 'Sin información registrada'}</p>}
    </div>)}
    <div>
      <strong>Objetivos</strong>
      {(editing ? objectives.filter(group => !group.removed) : objectiveGroups(inventory)).length ? <ul className="mt-1 space-y-2">{(editing ? objectives.filter(group => !group.removed) : objectiveGroups(inventory)).map(group => <li key={group.id} className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-xs text-slate-500">{group.id} · {group.needIds.join(', ')}</p>
          {editing ? <textarea aria-label={`Objetivo ${group.id}`} className="mt-1 block w-full border p-2" value={group.text} onChange={e => setObjectives(objectives.map(item => item.id === group.id ? { ...item, text: e.target.value } : item))} /> : <p>{group.text}</p>}
        </div>
        {editing && <button type="button" title={`Quitar ${group.id}`} aria-label={`Quitar ${group.id}`} className="mt-5 rounded p-0.5 text-slate-300 hover:text-red-500" onClick={() => setObjectives(objectives.map(item => item.id === group.id ? { ...item, removed: true } : item))}><Trash2 size={12} /></button>}
      </li>)}</ul> : <p>{editing ? 'Sin objetivos en esta edición.' : 'Sin información registrada'}</p>}
    </div>
    {editing && <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-3">
      <button type="button" className="initial-analysis__primary" disabled={busy} onClick={() => save().catch(() => {})}>Guardar cambios</button>
      <button type="button" disabled={busy} onClick={onClose}>Cancelar</button>
    </div>}
  </div>;
}
