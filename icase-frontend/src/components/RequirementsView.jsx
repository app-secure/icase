import React, { useState } from "react";
import { Check, CheckCircle2, Pencil, Plus, Save, Send, Trash2, X } from "lucide-react";
import BrainGearsIcon from "./BrainGearsIcon";

const emptyRequirement = (type) => type === "rf" ? {
  name: "", description: "", actors: ["Usuario"], priority: "Alta",
  precondition: "", postcondition: "", approved: false
} : {
  category: "", description: "", metric: "", compliance: "Pendiente de validación",
  approved: false
};

const nextId = (items, prefix) => {
  const max = items.reduce((current, item) => {
    const match = String(item.id || "").match(/(\d+)$/);
    return Math.max(current, match ? Number(match[1]) : 0);
  }, 0);
  return `${prefix}-${String(max + 1).padStart(2, "0")}`;
};

export default function RequirementsView({
  requirements, onApprovePhase, isApproved, onApplyAiCorrection, onUpdateRequirements
}) {
  const [prompt, setPrompt] = useState("");
  const [isFixing, setIsFixing] = useState(false);
  const [correctionFeedback, setCorrectionFeedback] = useState(null);
  const [editing, setEditing] = useState(null);
  const [pendingDelete, setPendingDelete] = useState(null);
  const [formError, setFormError] = useState("");

  const functional = requirements?.functional || [];
  const nonFunctional = (requirements?.nonFunctional || []).filter(
    r => !r.category?.includes("Ajuste Validado por Experto") && !r.description?.includes("Requisito incorporado por corrección")
  );

  const startEdit = (type, index, item) => {
    setEditing({ type, index, isNew: false, draft: { ...item, actors: Array.isArray(item.actors) ? item.actors : [item.actors || "Usuario"] } });
    setPendingDelete(null);
    setFormError("");
  };

  const startAdd = (type) => {
    setEditing({ type, index: null, isNew: true, draft: emptyRequirement(type) });
    setPendingDelete(null);
    setFormError("");
  };

  const cancelEdit = () => {
    setEditing(null);
    setFormError("");
  };

  const saveRequirement = () => {
    if (!editing) return;
    const { type, index, isNew, draft } = editing;
    const title = type === "rf" ? draft.name : draft.category;
    if (!String(title || "").trim() || !String(draft.description || "").trim()) {
      setFormError("El nombre y la descripción son obligatorios.");
      return;
    }
    if (type === "rnf" && !String(draft.metric || "").trim()) {
      setFormError("El requisito no funcional necesita una métrica verificable.");
      return;
    }

    const updatedFunctional = [...functional];
    const updatedNonFunctional = [...nonFunctional];
    if (type === "rf") {
      const normalized = {
        ...draft,
        id: draft.id || nextId(updatedFunctional, "RF"),
        name: draft.name.trim(),
        description: draft.description.trim(),
        actors: (Array.isArray(draft.actors) ? draft.actors : String(draft.actors || "").split(","))
          .map(actor => actor.trim()).filter(Boolean),
        priority: draft.priority || "Alta",
        precondition: String(draft.precondition || "").trim(),
        postcondition: String(draft.postcondition || "").trim()
      };
      if (isNew) updatedFunctional.push(normalized); else updatedFunctional[index] = normalized;
    } else {
      const normalized = {
        ...draft,
        id: draft.id || nextId(updatedNonFunctional, "RNF"),
        category: draft.category.trim(),
        description: draft.description.trim(),
        metric: draft.metric.trim(),
        compliance: String(draft.compliance || "Pendiente de validación").trim()
      };
      if (isNew) updatedNonFunctional.push(normalized); else updatedNonFunctional[index] = normalized;
    }

    onUpdateRequirements?.({ functional: updatedFunctional, nonFunctional: updatedNonFunctional });
    setEditing(null);
    setFormError("");
    setCorrectionFeedback({
      type: "success",
      message: `${isNew ? "Requisito añadido" : "Requisito actualizado"}. Debes aprobar nuevamente el análisis antes de continuar.`
    });
  };

  const deleteRequirement = (type, index) => {
    const updatedFunctional = type === "rf" ? functional.filter((_, i) => i !== index) : [...functional];
    const updatedNonFunctional = type === "rnf" ? nonFunctional.filter((_, i) => i !== index) : [...nonFunctional];
    onUpdateRequirements?.({ functional: updatedFunctional, nonFunctional: updatedNonFunctional });
    setPendingDelete(null);
    if (editing?.type === type && editing?.index === index) setEditing(null);
    setCorrectionFeedback({
      type: "success",
      message: "Requisito eliminado. Debes aprobar nuevamente el análisis antes de continuar."
    });
  };

  const updateDraft = (field, value) => setEditing(current => ({
    ...current, draft: { ...current.draft, [field]: value }
  }));

  const handleSendCorrection = async (event) => {
    event?.preventDefault();
    if (!prompt.trim() || isFixing) return;
    const text = prompt;
    setIsFixing(true);
    setCorrectionFeedback(null);
    try {
      const result = await onApplyAiCorrection?.(text);
      if (result?.success === false) {
        setCorrectionFeedback({ type: "error", message: result.error || "No se pudo aplicar el ajuste." });
      } else {
        setCorrectionFeedback({ type: "success", message: `Ajuste aplicado: "${text}"` });
        setPrompt("");
      }
    } catch (error) {
      setCorrectionFeedback({ type: "error", message: error.message || "Error al conectar con la IA." });
    } finally {
      setIsFixing(false);
    }
  };

  return (
    <div className="flex h-full min-h-0 w-full flex-col bg-white">
      <div className="flex min-h-0 w-full flex-1 flex-col overflow-y-auto px-6 pb-4 pt-6 md:px-12">
        <div className="mx-auto flex min-h-0 w-full max-w-5xl flex-1 flex-col">
          <div className="mb-6 flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
            <div>
              <span className="block text-[11px] font-semibold uppercase tracking-wider text-[#7C3AED]">Fase 1: Análisis de Requerimientos</span>
              <h2 className="mt-0.5 text-xl font-normal tracking-tight text-slate-900">Especificación de Requerimientos del Sistema</h2>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {isApproved && <span className="flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700"><CheckCircle2 size={13} />Fase Aprobada</span>}
            </div>
          </div>

          <div className="flex-1 space-y-8 text-[15px] leading-relaxed text-slate-800">
            <RequirementSection
              title="Requerimientos Funcionales del Sistema"
              type="rf"
              items={functional}
              numberOffset={0}
              editing={editing}
              pendingDelete={pendingDelete}
              formError={formError}
              onEdit={startEdit}
              onDeleteRequest={setPendingDelete}
              onDelete={deleteRequirement}
              onCancelDelete={() => setPendingDelete(null)}
              onDraftChange={updateDraft}
              onSave={saveRequirement}
              onCancelEdit={cancelEdit}
              onAdd={() => startAdd("rf")}
            />
            <RequirementSection
              title="Requerimientos No Funcionales (Criterios de Calidad ISO 25010)"
              type="rnf"
              items={nonFunctional}
              numberOffset={functional.length}
              editing={editing}
              pendingDelete={pendingDelete}
              formError={formError}
              onEdit={startEdit}
              onDeleteRequest={setPendingDelete}
              onDelete={deleteRequirement}
              onCancelDelete={() => setPendingDelete(null)}
              onDraftChange={updateDraft}
              onSave={saveRequirement}
              onCancelEdit={cancelEdit}
              onAdd={() => startAdd("rnf")}
            />
            {!functional.length && !nonFunctional.length && !editing && <div className="py-8 text-center text-slate-400">No hay requisitos. Puedes añadirlos manualmente desde cada sección.</div>}
          </div>
        </div>
      </div>

      <div className="z-10 w-full shrink-0 border-t border-slate-200 bg-white px-6 py-3.5 md:px-12">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-2">
          {correctionFeedback && <div className={`flex items-center justify-between gap-2 rounded-lg border px-3 py-1.5 text-xs ${correctionFeedback.type === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-700"}`}><span className="truncate">{correctionFeedback.message}</span><button type="button" onClick={() => setCorrectionFeedback(null)} className="ml-2 font-bold text-slate-400 hover:text-slate-600">×</button></div>}
          <div className="flex items-center gap-3">
            <form onSubmit={handleSendCorrection} className="flex flex-1 items-center rounded-full border border-slate-300 bg-slate-50 px-3 py-1.5 shadow-2xs transition-all hover:bg-slate-100/60 focus-within:border-[#7C3AED] focus-within:bg-white">
              <BrainGearsIcon size={16} className="mr-2 shrink-0 text-[#7C3AED]" />
              <span className="mr-2 shrink-0 rounded-full border border-[#DDD2F5] bg-[#F2EDFF] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[#6D28D9]">Requisitos ISO 29148</span>
              <input type="text" value={prompt} onChange={event => setPrompt(event.target.value)} disabled={isFixing} placeholder="Pide un ajuste a los requerimientos con IA..." className="min-w-0 flex-1 bg-transparent text-xs text-slate-800 outline-none placeholder:text-slate-400" />
              <button type="submit" disabled={!prompt.trim() || isFixing} className="ml-1 shrink-0 p-1 text-[#7C3AED] hover:text-[#6D28D9] disabled:text-slate-300" title="Aplicar ajuste con IA">{isFixing ? <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-violet-200 border-t-[#7C3AED]" /> : <Send size={14} />}</button>
            </form>
            <button type="button" onClick={onApprovePhase} disabled={Boolean(editing)} className="flex shrink-0 items-center gap-1.5 rounded-full bg-[#7C3AED] px-5 py-2.5 text-xs font-semibold text-white shadow-xs transition-all hover:bg-[#6D28D9] disabled:opacity-40"><Check size={14} /><span>{isApproved ? "Reintentar diagramas" : "Aprobar y generar diagramas"}</span></button>
          </div>
        </div>
      </div>
    </div>
  );
}

function RequirementSection({
  title, type, items, numberOffset, editing, pendingDelete, formError,
  onEdit, onDeleteRequest, onDelete, onCancelDelete, onDraftChange, onSave, onCancelEdit, onAdd
}) {
  const newHere = editing?.type === type && editing.isNew;
  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between border-b border-slate-100 pb-2">
        <h3 className="text-base font-semibold tracking-tight text-slate-900">{title}</h3>
        <div className="flex shrink-0 items-center gap-3">
          <span className="text-xs text-slate-400">{items.length} {items.length === 1 ? "requisito" : "requisitos"}</span>
          <button
            type="button"
            onClick={onAdd}
            disabled={Boolean(editing)}
            className="flex items-center gap-1.5 rounded-full border border-[#CFC0F1] bg-[#F2EDFF] px-3 py-1.5 text-xs font-semibold text-[#6D28D9] transition-colors hover:bg-[#E9DDFE] disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Plus size={13} />
            {type === "rf" ? "Añadir RF" : "Añadir RNF"}
          </button>
        </div>
      </div>
      {items.map((item, index) => {
        const key = `${type}-${index}`;
        const editingThis = editing?.type === type && editing?.index === index && !editing.isNew;
        const deletingThis = pendingDelete === key;
        if (editingThis) return <RequirementEditor key={item.id || key} type={type} draft={editing.draft} error={formError} onChange={onDraftChange} onSave={onSave} onCancel={onCancelEdit} />;
        return (
          <article key={item.id || key} className="group flex items-start gap-3 rounded-xl border border-transparent px-2 py-2 transition-colors hover:border-[#E7E3EE] hover:bg-[#FAF9FC]">
            <span className="mt-0.5 min-w-5 text-sm font-semibold text-slate-800">{numberOffset + index + 1}.</span>
            <div className="min-w-0 flex-1 space-y-1">
              {type === "rf" ? <FunctionalDisplay item={item} /> : <NonFunctionalDisplay item={item} />}
            </div>
            <div className="flex shrink-0 items-center gap-1 opacity-100 transition-opacity md:opacity-0 md:group-hover:opacity-100">
              {deletingThis ? <><span className="mr-1 text-[11px] text-red-600">¿Eliminar?</span><button type="button" onClick={() => onDelete(type, index)} className="rounded-lg bg-red-600 px-2 py-1 text-[11px] font-semibold text-white">Sí</button><button type="button" onClick={onCancelDelete} className="rounded-lg border border-slate-200 px-2 py-1 text-[11px] text-slate-600">No</button></> : <><button type="button" disabled={Boolean(editing)} onClick={() => onEdit(type, index, item)} className="rounded-lg p-1.5 text-slate-400 hover:bg-[#F2EDFF] hover:text-[#7C3AED] disabled:opacity-30" title="Editar este requisito"><Pencil size={14} /></button><button type="button" disabled={Boolean(editing)} onClick={() => onDeleteRequest(key)} className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-30" title="Eliminar este requisito"><Trash2 size={14} /></button></>}
            </div>
          </article>
        );
      })}
      {newHere && <RequirementEditor type={type} draft={editing.draft} error={formError} onChange={onDraftChange} onSave={onSave} onCancel={onCancelEdit} isNew />}
      {!items.length && !newHere && <p className="rounded-xl border border-dashed border-slate-200 px-4 py-6 text-center text-xs text-slate-400">No hay requisitos de este tipo.</p>}
    </section>
  );
}

function FunctionalDisplay({ item }) {
  return <><p><strong className="font-semibold text-slate-900">{item.name}</strong>: {item.description}</p><p className="text-xs text-slate-500"><strong className="text-slate-700">Actores:</strong> {Array.isArray(item.actors) ? item.actors.join(", ") : item.actors} <span>•</span> <strong className="text-slate-700">Prioridad:</strong> {item.priority}</p>{item.precondition && <p className="text-xs text-slate-500"><strong className="text-slate-600">Precondición:</strong> {item.precondition}</p>}{item.postcondition && <p className="text-xs text-slate-500"><strong className="text-slate-600">Poscondición:</strong> {item.postcondition}</p>}</>;
}

function NonFunctionalDisplay({ item }) {
  return <><p><strong className="font-semibold text-slate-900">{item.category}</strong>: {item.description}</p><p className="text-xs text-slate-600"><strong className="text-[#6D28D9]">Métrica cuantitativa:</strong> {item.metric}{item.compliance && <> <span>•</span> <span className="text-slate-500">{item.compliance}</span></>}</p></>;
}

function RequirementEditor({ type, draft, error, onChange, onSave, onCancel, isNew = false }) {
  const inputClass = "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-800 outline-none focus:border-[#7C3AED] focus:ring-2 focus:ring-violet-100";
  return (
    <div className="rounded-xl border border-[#CFC0F1] bg-[#FCFBFE] p-4 shadow-sm" onKeyDown={event => { if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") { event.preventDefault(); onSave(); } if (event.key === "Escape") onCancel(); }}>
      <div className="mb-3 flex items-center justify-between"><p className="text-xs font-semibold text-[#6D28D9]">{isNew ? "Nuevo" : "Editar"} {type === "rf" ? "requisito funcional" : "requisito no funcional"}</p><button type="button" onClick={onCancel} className="rounded p-1 text-slate-400 hover:bg-slate-100"><X size={14} /></button></div>
      <div className="grid gap-3 md:grid-cols-2">
        <label className="space-y-1 md:col-span-2"><span className="text-[11px] font-semibold text-slate-600">{type === "rf" ? "Nombre" : "Categoría"} *</span><input autoFocus value={type === "rf" ? draft.name : draft.category} onChange={event => onChange(type === "rf" ? "name" : "category", event.target.value)} className={inputClass} /></label>
        <label className="space-y-1 md:col-span-2"><span className="text-[11px] font-semibold text-slate-600">Descripción normativa *</span><textarea value={draft.description || ""} onChange={event => onChange("description", event.target.value)} rows={3} className={`${inputClass} resize-y`} /></label>
        {type === "rf" ? <>
          <label className="space-y-1"><span className="text-[11px] font-semibold text-slate-600">Actores, separados por coma</span><input value={Array.isArray(draft.actors) ? draft.actors.join(", ") : draft.actors || ""} onChange={event => onChange("actors", event.target.value.split(","))} className={inputClass} /></label>
          <label className="space-y-1"><span className="text-[11px] font-semibold text-slate-600">Prioridad</span><select value={draft.priority || "Alta"} onChange={event => onChange("priority", event.target.value)} className={inputClass}><option>Alta</option><option>Media</option><option>Baja</option></select></label>
          <label className="space-y-1"><span className="text-[11px] font-semibold text-slate-600">Precondición</span><input value={draft.precondition || ""} onChange={event => onChange("precondition", event.target.value)} className={inputClass} /></label>
          <label className="space-y-1"><span className="text-[11px] font-semibold text-slate-600">Poscondición</span><input value={draft.postcondition || ""} onChange={event => onChange("postcondition", event.target.value)} className={inputClass} /></label>
        </> : <>
          <label className="space-y-1 md:col-span-2"><span className="text-[11px] font-semibold text-slate-600">Métrica cuantitativa verificable *</span><input value={draft.metric || ""} onChange={event => onChange("metric", event.target.value)} className={inputClass} placeholder="Ej.: respuesta menor a 1 segundo en el percentil 95" /></label>
          <label className="space-y-1 md:col-span-2"><span className="text-[11px] font-semibold text-slate-600">Criterio de cumplimiento</span><input value={draft.compliance || ""} onChange={event => onChange("compliance", event.target.value)} className={inputClass} /></label>
        </>}
      </div>
      {error && <p className="mt-3 text-xs font-medium text-red-600">{error}</p>}
      <div className="mt-4 flex justify-end gap-2"><button type="button" onClick={onCancel} className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50">Cancelar</button><button type="button" onClick={onSave} className="flex items-center gap-1.5 rounded-lg bg-[#7C3AED] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#6D28D9]"><Save size={13} />Guardar requisito</button></div>
    </div>
  );
}
