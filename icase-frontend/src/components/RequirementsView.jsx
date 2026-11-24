import React, { useState } from "react";
import { Check, CheckCircle2, ChevronDown, ClipboardCheck, Pencil, Plus, Save, Send, Trash2 } from "lucide-react";
import BrainGearsIcon from "./BrainGearsIcon";
import RequirementReviewPanel from './RequirementReviewPanel';
import RequirementDiagnostics from './RequirementDiagnostics';
import RequirementActorsPanel from './RequirementActorsPanel';
import ActorAutocomplete from './ActorAutocomplete';
import AnalysisModal from './AnalysisModal';
import './InitialAnalysisView.css';
import { ToastContainer, useToasts } from "./Toast";

const emptyRequirement = (type) => type === "rf" ? {
  name: "", description: "", actors: [], priority: "Alta",
  precondition: "", postcondition: "", origin: "manual", evidence: "",
  requiresConfirmation: false, approved: false
} : {
  category: "", description: "", metric: "", compliance: "Pendiente de validación",
  origin: "manual", evidence: "", requiresConfirmation: false, approved: false
};

const nextId = (items, prefix) => {
  const max = items.reduce((current, item) => {
    const match = String(item.id || "").match(/(\d+)$/);
    return Math.max(current, match ? Number(match[1]) : 0);
  }, 0);
  return `${prefix}-${String(max + 1).padStart(2, "0")}`;
};

export default function RequirementsView({
  requirements, onApprovePhase, isApproved, onApplyAiCorrection, onUpdateRequirements,
  readOnly = false, onBackToDesign, onBackToInitial, audit = null, onReview, onRegenerate, regenerating = false
}) {
  const [prompt, setPrompt] = useState("");
  const [isFixing, setIsFixing] = useState(false);
  const [isReviewing, setIsReviewing] = useState(false);
  const { toasts, addToast, removeToast } = useToasts();
  const [editing, setEditing] = useState(null);
  const [pendingDelete, setPendingDelete] = useState(null);
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);

  const functional = requirements?.functional || [];
  const actorCatalog = audit?.actores?.length ? audit.actores : [...new Set(functional.flatMap(r => r.actors || []))].filter(Boolean).map(nombre => ({ nombre, heredado: true }));
  const nonFunctional = (requirements?.nonFunctional || []).filter(
    r => !r.category?.includes("Ajuste Validado por Experto") && !r.description?.includes("Requisito incorporado por corrección")
  );

  const startEdit = (type, index, item) => {
    setEditing({ type, index, isNew: false, draft: { ...item, actors: Array.isArray(item.actors) ? item.actors : [item.actors].filter(Boolean) } });
    setPendingDelete(null);
    setFormError("");
  };

  const openRequirement = (identifier) => {
    const id = String(identifier || "").trim();
    const rfIndex = functional.findIndex(item => (item.identificador || item.id) === id);
    if (rfIndex >= 0) { startEdit("rf", rfIndex, functional[rfIndex]); return; }
    const rnfIndex = nonFunctional.findIndex(item => (item.identificador || item.id) === id);
    if (rnfIndex >= 0) startEdit("rnf", rnfIndex, nonFunctional[rnfIndex]);
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

  const saveRequirement = async () => {
    if (!editing || saving) return;
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
    const prefix = type === "rf" ? "RF" : "RNF";
    let chosenId = String(draft.id || "").trim();
    if (!chosenId) {
      chosenId = nextId(type === "rf" ? updatedFunctional : updatedNonFunctional, prefix);
    }

    // Comprobar colisión de ID en el resto de requisitos
    const otherReqs = [
      ...updatedFunctional.filter((_, i) => !(type === "rf" && !isNew && i === index)),
      ...updatedNonFunctional.filter((_, i) => !(type === "rnf" && !isNew && i === index))
    ];
    if (otherReqs.some(r => (r.id || r.identificador) === chosenId)) {
      setFormError(`El identificador "${chosenId}" ya está en uso por otro requisito. Introduce un código único.`);
      return;
    }

    if (type === "rf") {
      const normalized = {
        ...draft,
        id: chosenId,
        identificador: chosenId,
        name: draft.name.trim(),
        description: draft.description.trim(),
        actors: (Array.isArray(draft.actors) ? draft.actors : String(draft.actors || "").split(","))
          .map(actor => actor.trim()).filter(Boolean),
        priority: draft.priority || "Alta",
        precondition: String(draft.precondition || "").trim(),
        postcondition: String(draft.postcondition || "").trim(),
        origin: "manual",
        evidence: draft.evidence || "",
        requiresConfirmation: false
      };
      if (isNew) updatedFunctional.push(normalized); else updatedFunctional[index] = normalized;
    } else {
      const normalized = {
        ...draft,
        id: chosenId,
        identificador: chosenId,
        category: draft.category.trim(),
        description: draft.description.trim(),
        metric: draft.metric.trim(),
        compliance: String(draft.compliance || "Pendiente de validación").trim(),
        origin: "manual",
        evidence: draft.evidence || "",
        requiresConfirmation: /por confirmar/i.test(draft.metric)
      };
      if (isNew) updatedNonFunctional.push(normalized); else updatedNonFunctional[index] = normalized;
    }

    setSaving(true);
    try {
    await onUpdateRequirements?.({ functional: updatedFunctional, nonFunctional: updatedNonFunctional });
    setEditing(null);
    setFormError("");
    addToast({
      type: "success",
      message: `${isNew ? "Requisito añadido" : "Requisito actualizado"} (${chosenId}). Revisa y aprueba los requisitos antes de continuar.`
    });
    } catch (error) { setFormError(error.message || 'No se pudo guardar el requisito. Tus cambios se conservan en el formulario.'); }
    finally { setSaving(false); }
  };

  const deleteRequirement = (type, index) => {
    const updatedFunctional = type === "rf" ? functional.filter((_, i) => i !== index) : [...functional];
    const updatedNonFunctional = type === "rnf" ? nonFunctional.filter((_, i) => i !== index) : [...nonFunctional];
    onUpdateRequirements?.({ functional: updatedFunctional, nonFunctional: updatedNonFunctional });
    setPendingDelete(null);
    if (editing?.type === type && editing?.index === index) setEditing(null);
    addToast({
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
    const loadingToastId = addToast({
      type: "info",
      title: "Procesando ajuste con IA",
      message: `Aplicando instrucción sobre los requerimientos: "${text}"...`,
      duration: 60000
    });
    try {
      const result = await onApplyAiCorrection?.(text);
      removeToast(loadingToastId);
      if (result?.success === false) {
        addToast({ type: "error", title: "No se pudo aplicar el ajuste", message: result.error || "No se pudo aplicar el ajuste." });
      } else {
        addToast({ type: "success", title: "Requerimientos actualizados", message: `Ajuste puntual aplicado respetando los requisitos válidos: "${text}"` });
        setPrompt("");
      }
    } catch (error) {
      removeToast(loadingToastId);
      addToast({ type: "error", title: "Error de procesamiento", message: error.message || "Error al conectar con la IA." });
    } finally {
      setIsFixing(false);
    }
  };

  const handleResolveProblemsWithAi = async () => {
    if (isFixing || isReviewing || Boolean(editing)) return;
    setIsFixing(true);
    const loadingToastId = addToast({
      type: "info",
      title: "Resolviendo problemas críticos",
      message: "La IA está corrigiendo únicamente los requisitos con observaciones pendientes...",
      duration: 60000
    });
    try {
      const instruction = "Resuelve únicamente los problemas críticos pendientes antes de aprobar, conservando intactos todos los demás requerimientos que ya están correctos.";
      const result = await onApplyAiCorrection?.(instruction);
      removeToast(loadingToastId);
      if (result?.success === false) {
        addToast({ type: "error", title: "No se pudieron resolver los problemas", message: result.error || "No se pudieron resolver los problemas pendientes." });
      } else {
        addToast({ type: "success", title: "Problemas resueltos", message: "Se corrigieron los problemas críticos sin modificar los requisitos que ya estaban listos." });
      }
    } catch (error) {
      removeToast(loadingToastId);
      addToast({ type: "error", title: "Error de procesamiento", message: error.message || "Error al conectar con la IA." });
    } finally {
      setIsFixing(false);
    }
  };

  return (
    <div className="flex h-full min-h-0 w-full flex-col bg-[#f8f9fc]">
      <div className="flex min-h-0 w-full flex-1 flex-col overflow-y-auto p-4 md:p-8">
        <div className="initial-analysis__content flex min-h-0 flex-1 flex-col">
          <header className="initial-analysis__header">
            <div className="initial-analysis__icon"><ClipboardCheck size={24} /></div>
            <div><p className="text-xs font-bold tracking-wide text-violet-700">FASE 3 · REQUISITOS</p>
              <h1 className="font-bold text-slate-900">Especificación de requisitos del sistema</h1>
              <p className="initial-analysis__intro">Revisa los comportamientos y cualidades definidos desde el análisis aprobado antes de continuar al modelado.</p>
            </div>
            <div className="initial-analysis__metadata"><span>{functional.length} RF · {nonFunctional.length} RNF</span><span>{isApproved ? 'Aprobados' : readOnly ? 'Solo lectura' : 'En revisión'}</span>{audit?.referencia_analisis_inicial && <span>Base: análisis v{audit.referencia_analisis_inicial.version}</span>}</div>
          </header>
            <div className="mb-5 flex flex-wrap items-center justify-end gap-2">
              {onReview && !isApproved && !readOnly && <button type="button" title="Vuelve a comprobar los requisitos guardados (criterios, referencias, actores y cobertura) sin llamar a la IA" disabled={regenerating || isFixing || isReviewing || Boolean(editing)}
                onClick={async () => { setIsReviewing(true); try { await onReview({ accion: 'validar' }); addToast({ type: 'success', message: 'Requisitos comprobados de nuevo.' }); } catch (error) { addToast({ type: 'error', message: error.message || 'No se pudo comprobar.' }); } finally { setIsReviewing(false); } }}
                className="rounded-full border border-slate-300 bg-white px-3.5 py-1.5 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-40">{isReviewing ? 'Comprobando…' : 'Comprobar requisitos'}</button>}
              {onRegenerate && !isApproved && !readOnly && <button type="button" onClick={onRegenerate} disabled={regenerating || isFixing || isReviewing || Boolean(editing)} className="rounded-full border border-[#CFC0F1] bg-[#F2EDFF] px-3.5 py-1.5 text-xs font-semibold text-[#6D28D9] transition-colors hover:bg-[#E9DDFE] disabled:opacity-40">{regenerating ? "Regenerando…" : "Regenerar desde el análisis"}</button>}
              {isApproved && <span className="flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700"><CheckCircle2 size={13} />Fase Aprobada</span>}
            </div>
          <div className="flex-1 space-y-6 text-sm leading-relaxed text-slate-800">
            {/* SECCIÓN PRIMERO: Requerimientos Funcionales y No Funcionales (Punto 3) */}
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
              actorCatalog={actorCatalog}
              onAdd={() => startAdd("rf")}
              readOnly={readOnly || isReviewing}
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
              actorCatalog={actorCatalog}
              onAdd={() => startAdd("rnf")}
              readOnly={readOnly || isReviewing}
            />
            {!functional.length && !nonFunctional.length && !editing && <div className="py-8 text-center text-slate-400">No hay requisitos. Puedes añadirlos manualmente desde cada sección.</div>}

            {/* SECCIONES SECUNDARIAS: Paneles de Auditoría, Diagnósticos y Advertencias */}
            {audit?.referencia_analisis_inicial && <p className="text-sm text-slate-500">Base: análisis inicial v{audit.referencia_analisis_inicial.version}. Para modificar actores, necesidades o clasificación, abre «Análisis inicial» y crea un borrador.</p>}
            <RequirementActorsPanel audit={audit} requirements={requirements} onReview={onReview} readOnly={Boolean(audit?.referencia_analisis_inicial) || readOnly || isApproved || Boolean(editing) || isFixing} onBusyChange={setIsReviewing} />
            <RequirementReviewPanel audit={audit} onReview={onReview} readOnly={readOnly || isApproved || Boolean(editing) || isFixing} onBusyChange={setIsReviewing} />
            <RequirementDiagnostics audit={audit} onCorrect={!readOnly && !isApproved ? openRequirement : null} />
            {audit?.control_aprobacion?.bloqueado && (
              <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-semibold">Hay problemas que deben resolverse antes de aprobar</p>
                  {!readOnly && (
                    <button
                      type="button"
                      onClick={handleResolveProblemsWithAi}
                      disabled={isFixing || isReviewing || Boolean(editing)}
                      className="flex items-center gap-1.5 rounded-full bg-red-700 px-3.5 py-1.5 text-xs font-semibold text-white shadow-2xs transition-colors hover:bg-red-800 disabled:opacity-40"
                    >
                      <BrainGearsIcon size={13} className="text-white" />
                      <span>{isFixing ? "Resolviendo problemas..." : "Resolver solo estos problemas con IA"}</span>
                    </button>
                  )}
                </div>
                <ul className="mt-2 list-disc pl-5">{audit.control_aprobacion.errores_criticos.map((error, index) => <li key={index}>{error.mensaje}</li>)}</ul>
                <p className="mt-2 text-xs">Completa o corrige únicamente los requisitos señalados arriba, manualmente o con IA (los requisitos que ya están listos no se tocarán). Al aprobar se volverá a comprobar la versión guardada.</p>
              </div>
            )}
            {audit?.estado === 'revision_requerida' && !audit.revision_actual && !audit?.control_aprobacion?.bloqueado && (
              <div role="alert" className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
                <p className="font-semibold">Borrador generado: cobertura pendiente de revisión</p>
                <p>La revisión detectó incidencias y no puede acreditar la cobertura completa. Esto no significa que todos los requisitos sean incorrectos. Revisa las causas siguientes antes de aprobar.</p>
                {!audit.advertencias?.length && <p className="mt-2">Esta generación no guardó el detalle de la causa. No es posible determinarla desde este resultado; no se considera una comprobación satisfactoria.</p>}
                <ul className="mt-2 list-disc pl-5">{(audit.advertencias || []).map((warning, index) => {
                  const target = String(warning).match(/^(R?NF-\d+|RF-\d+)/)?.[1];
                  const exists = target && [...functional, ...nonFunctional].some(item => (item.identificador || item.id) === target);
                  return <li key={index}>{warning}{exists && !readOnly && !isApproved && <button type="button" onClick={() => openRequirement(target)} className="ml-2 rounded-full bg-amber-800 px-2.5 py-0.5 text-[11px] font-semibold text-white">Corregir {target}</button>}</li>;
                })}</ul>
                {audit.diagnostico_inventario?.errores_pendientes?.length > 0 && <details className="mt-3">
                  <summary className="cursor-pointer font-semibold">Ver evidencias rechazadas y diagnóstico técnico</summary>
                  {audit.diagnostico_inventario.errores_pendientes.map((item, index) => <div key={index} className="mt-2 border-t border-amber-200 pt-2">
                    <p>{item.id || `Posición ${item.indice}`} · {item.errores.join(', ')}</p>
                    <p className="whitespace-pre-wrap break-words">Cita que devolvió la IA: {item.elemento?.evidencia ? `“${item.elemento.evidencia}”` : '(sin cita)'}</p>
                  </div>)}
                  {audit.diagnostico_inventario.reparacion && <div className="mt-3">
                    <p>Reparación: {({ no_necesaria: 'no necesaria', fallo_proveedor: 'falló la solicitud al proveedor', sin_respuesta_utilizable: 'no se recibió una respuesta utilizable; revisa también el presupuesto de ejecución', completada: 'se corrigieron los elementos solicitados', parcial_o_invalida: 'la respuesta no corrigió todos los elementos solicitados' })[audit.diagnostico_inventario.reparacion.estado] || 'estado no disponible'}.</p>
                    {!!audit.diagnostico_inventario.reparacion.omitidos_por_limite?.length && <p>No se intentó reparar por el límite de cinco elementos: {audit.diagnostico_inventario.reparacion.omitidos_por_limite.join(', ')}. Se priorizan RF y RNF para no perder funciones.</p>}
                  </div>}
                </details>}
              </div>
            )}
            {!!audit?.necesidades_pendientes?.length && <section className="rounded-xl border border-amber-200 p-4 text-sm">
              <h3 className="font-semibold">Necesidades conservadas pendientes de validación</h3>
              <p className="mt-1 text-xs text-slate-500">No se han convertido en obligaciones aprobadas ni se han descartado. Una cita incorrecta no demuestra que el contenido sea falso. Las funciones y cualidades pendientes deben resolverse antes de aprobar.</p>
              {audit.necesidades_pendientes.map((entry, index) => <div key={index} className="mt-3 border-t pt-2">
                <p className="font-medium">{entry.id} · {entry.elemento?.tipo}: {entry.elemento?.necesidad}</p>
                <p className="text-xs">Estado: {entry.estado_validacion}. {entry.motivo === 'evidencia_incorrecta' ? 'Incidencia de evidencia' : 'Incidencia de clasificación o estructura'}</p>
                {(entry.elemento?.evidencias || []).map((evidence, i) => <p key={i} className="mt-1 whitespace-pre-wrap break-words text-xs">“{evidence.texto}” · {evidence.fuente || 'fuente no identificada'}</p>)}
              </div>)}
            </section>}
          </div>
        </div>
      </div>

      {readOnly ? (
        <div className="z-10 w-full shrink-0 border-t border-slate-200 bg-white px-6 py-3.5 md:px-12">
          <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-3">
            {onBackToInitial ? <button type="button" onClick={onBackToInitial} className="rounded-full border border-slate-300 bg-white px-5 py-2.5 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50">← Fase anterior: Análisis inicial</button> : <span />}
            <button type="button" onClick={onBackToDesign} className="rounded-full bg-[#7C3AED] px-5 py-2.5 text-xs font-semibold text-white shadow-xs transition-colors hover:bg-[#6D28D9]">
              Fase siguiente: Modelamiento →
            </button>
          </div>
        </div>
      ) : <div className="z-10 w-full shrink-0 border-t border-slate-200 bg-white px-6 py-3.5 md:px-12">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-2">
          <div className="flex min-w-0 flex-col gap-3 md:flex-row md:items-center">
            {onBackToInitial && <button type="button" onClick={onBackToInitial} className="shrink-0 rounded-full border border-slate-300 bg-white px-4 py-2.5 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50">← Fase anterior: Análisis inicial</button>}
            <form onSubmit={handleSendCorrection} className="flex w-full min-w-0 items-center rounded-full border border-slate-300 bg-slate-50 px-3 py-1.5 shadow-2xs transition-all hover:bg-slate-100/60 focus-within:border-[#7C3AED] focus-within:bg-white md:flex-1">
              <BrainGearsIcon size={16} className="mr-2 shrink-0 text-[#7C3AED]" />
              <span className="mr-2 hidden shrink-0 rounded-full border border-[#DDD2F5] bg-[#F2EDFF] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[#6D28D9] sm:inline">Requisitos ISO 29148</span>
              <input type="text" value={prompt} onChange={event => setPrompt(event.target.value)} disabled={isFixing} placeholder="Pide un ajuste a los requerimientos con IA..." className="min-w-0 flex-1 bg-transparent text-xs text-slate-800 outline-none placeholder:text-slate-400" />
              <button type="submit" disabled={!prompt.trim() || isFixing} className="ml-1 shrink-0 p-1 text-[#7C3AED] hover:text-[#6D28D9] disabled:text-slate-300" title="Aplicar ajuste con IA">{isFixing ? <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-violet-200 border-t-[#7C3AED]" /> : <Send size={14} />}</button>
            </form>
            <button type="button" onClick={onApprovePhase} disabled={Boolean(editing) || isReviewing || isFixing} className="flex w-full shrink-0 items-center justify-center gap-1.5 rounded-full bg-[#7C3AED] px-5 py-2.5 text-xs font-semibold text-white shadow-xs transition-all hover:bg-[#6D28D9] disabled:opacity-40 md:w-auto"><Check size={14} /><span>{isApproved ? "Ir a Modelado" : "Aprobar y pasar a Modelado"}</span></button>
          </div>
        </div>
      </div>}
      <AnalysisModal open={Boolean(editing)} title={`${editing?.isNew ? 'Añadir' : 'Editar'} requisito ${editing?.type === 'rf' ? 'funcional' : 'no funcional'}${editing?.draft?.id ? ` · ${editing.draft.id}` : ''}`} onClose={cancelEdit} busy={saving}
        footer={<div className="flex flex-wrap justify-end gap-2"><button type="button" disabled={saving} onClick={cancelEdit}>Cancelar</button><button type="button" disabled={saving} className="initial-analysis__primary" onClick={saveRequirement}><Save size={15} />{saving ? 'Guardando…' : 'Guardar requisito'}</button></div>}>
        {editing && <RequirementEditor type={editing.type} draft={editing.draft} actorCatalog={actorCatalog} error={formError} onChange={updateDraft} onSave={saveRequirement} busy={saving} />}
      </AnalysisModal>
      <ToastContainer toasts={toasts} onDismiss={removeToast} />
    </div>
  );
}

function RequirementSection({
  title, type, items, numberOffset, editing, pendingDelete, formError, actorCatalog = [],
  onEdit, onDeleteRequest, onDelete, onCancelDelete, onDraftChange, onSave, onCancelEdit, onAdd, readOnly = false
}) {
  return (
    <details open className="group/requirements min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:p-6">
      <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-3 [&::-webkit-details-marker]:hidden">
        <span className="flex min-w-0 items-center gap-3"><ChevronDown size={16} className="shrink-0 -rotate-90 text-slate-400 transition-transform group-open/requirements:rotate-0" /><span className="font-semibold text-slate-900">{title}</span><span className="rounded-full bg-violet-50 px-2.5 py-1 text-xs font-semibold text-violet-700">{items.length}</span></span>
        <div className="flex shrink-0 items-center gap-3">
          {!readOnly && <button
            type="button"
            onClick={event => { event.preventDefault(); event.stopPropagation(); onAdd(); }}
            disabled={Boolean(editing)}
            className="flex items-center gap-1.5 rounded-full border border-[#CFC0F1] bg-[#F2EDFF] px-3 py-1.5 text-xs font-semibold text-[#6D28D9] transition-colors hover:bg-[#E9DDFE] disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Plus size={13} />
            {type === "rf" ? "Añadir RF" : "Añadir RNF"}
          </button>}
        </div>
      </summary>
      <div className="mt-5 space-y-3">
      {items.map((item, index) => {
        const key = `${type}-${index}`;
        const deletingThis = pendingDelete === key;
        const anchor = item.identificador || item.id;
        return (
          <article id={anchor ? `requisito-${anchor}` : undefined} key={item.id || key} className="group flex flex-wrap items-start gap-3 rounded-xl border border-slate-100 bg-[#fcfcff] p-4 md:flex-nowrap">
            <span className="mt-0.5 min-w-5 text-sm font-semibold text-slate-800">{numberOffset + index + 1}.</span>
            <div className="min-w-0 flex-1 space-y-1">
              {type === "rf" ? <FunctionalDisplay item={item} /> : <NonFunctionalDisplay item={item} />}
              {item.acceptanceCriteria?.length > 0 && <details className="pt-1 text-xs text-slate-600"><summary className="cursor-pointer font-medium">Criterios de aceptación ({item.acceptanceCriteria.length})</summary><ol className="mt-1 list-decimal space-y-1 pl-5">{item.acceptanceCriteria.map((criterion, criterionIndex) => <li key={criterionIndex}>{criterion.descripcion}</li>)}</ol></details>}
            </div>
            {!readOnly && <div className="flex shrink-0 items-center gap-1">
              {deletingThis ? <><span className="mr-1 text-[11px] text-red-600">¿Eliminar?</span><button type="button" onClick={() => onDelete(type, index)} className="rounded-lg bg-red-600 px-2 py-1 text-[11px] font-semibold text-white">Sí</button><button type="button" onClick={onCancelDelete} className="rounded-lg border border-slate-200 px-2 py-1 text-[11px] text-slate-600">No</button></> : <><button type="button" disabled={Boolean(editing)} onClick={() => onEdit(type, index, item)} className="rounded-lg p-1.5 text-slate-400 hover:bg-[#F2EDFF] hover:text-[#7C3AED] disabled:opacity-30" title="Editar este requisito"><Pencil size={14} /></button><button type="button" disabled={Boolean(editing)} onClick={() => onDeleteRequest(key)} className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-30" title="Eliminar este requisito"><Trash2 size={14} /></button></>}
            </div>}
          </article>
        );
      })}
      {!items.length && <p className="rounded-xl border border-dashed border-slate-200 px-4 py-6 text-center text-xs text-slate-400">No hay requisitos de este tipo.</p>}
      </div>
    </details>
  );
}

function FunctionalDisplay({ item }) {
  const reqId = item.identificador || item.id;
  return <>
    <p>
      {reqId && <span className="inline-block px-1.5 py-0.5 mr-1.5 rounded bg-violet-100 text-[#7C3AED] font-mono text-[11px] font-bold">{reqId}</span>}
      <strong className="font-semibold text-slate-900">{item.name}</strong>: {item.description}
    </p>
    <p className="text-xs text-slate-500"><strong className="text-slate-700">Actores:</strong> {(Array.isArray(item.actors) && item.actors.filter(Boolean).length ? item.actors : ['Sin actor asociado']).join(', ')} <span>•</span> <strong className="text-slate-700">Prioridad:</strong> {item.priority}</p>
    {item.precondition && <p className="text-xs text-slate-500"><strong className="text-slate-600">Precondición:</strong> {item.precondition}</p>}
    {item.postcondition && <p className="text-xs text-slate-500"><strong className="text-slate-600">Poscondición:</strong> {item.postcondition}</p>}
    <RequirementProvenance item={item} />
  </>;
}

function NonFunctionalDisplay({ item }) {
  const reqId = item.identificador || item.id;
  return <>
    <p>
      {reqId && <span className="inline-block px-1.5 py-0.5 mr-1.5 rounded bg-violet-100 text-[#7C3AED] font-mono text-[11px] font-bold">{reqId}</span>}
      <strong className="font-semibold text-slate-900">{item.category}</strong>: {item.description}
    </p>
    <p className="text-xs text-slate-600"><strong className="text-[#6D28D9]">Métrica verificable:</strong> {item.metric}{item.compliance && <> <span>•</span> <span className="text-slate-500">{item.compliance}</span></>}</p>
    {!!item.questionIds?.length && <p className="text-xs text-slate-500">Umbral pendiente en {item.questionIds.join(', ')}.</p>}
    <RequirementProvenance item={item} />
  </>;
}

function RequirementProvenance({ item }) {
  const label = item.origin === "manual" ? "Manual" : item.origin === "explicito" ? "Explícito" : "Inferido";
  const quotes = (item.evidences || []).map(evidence => evidence?.texto).filter(Boolean);
  if (!quotes.length && item.evidence) quotes.push(item.evidence);
  return <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px]">
    <span className={`rounded-full px-2 py-0.5 font-medium ${item.requiresConfirmation ? "bg-amber-100 text-amber-800" : "bg-emerald-50 text-emerald-700"}`}>{label}{item.requiresConfirmation ? " · confirmar" : ""}</span>
    {quotes.map((text, index) => <span key={index} className="max-w-full truncate text-slate-400" title={text}>Evidencia: “{text}”</span>)}
  </div>;
}

function RequirementEditor({ type, draft, error, onChange, onSave, busy, actorCatalog = [] }) {
  const inputClass = "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-800 outline-none focus:border-[#7C3AED] focus:ring-2 focus:ring-violet-100";
  const criteria = draft.acceptanceCriteria || [];
  const splitIds = (text) => [...new Set(text.split(',').map((item) => item.trim()).filter(Boolean))];
  return (
    <fieldset disabled={busy} className="min-w-0 border-0 p-0" onKeyDown={event => { if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") { event.preventDefault(); onSave(); } }}>
      <div className="grid gap-3 md:grid-cols-2">
        <label className="space-y-1 md:col-span-1">
          <span className="text-[11px] font-semibold text-slate-600">Identificador / Código *</span>
          <input
            value={draft.id || draft.identificador || ""}
            onChange={event => onChange("id", event.target.value.toUpperCase().trim())}
            placeholder={type === "rf" ? "Ej. RF-01" : "Ej. RNF-01"}
            className={inputClass}
          />
        </label>
        <label className="space-y-1 md:col-span-1">
          <span className="text-[11px] font-semibold text-slate-600">{type === "rf" ? "Nombre" : "Categoría"} *</span>
          <input autoFocus value={type === "rf" ? draft.name : draft.category} onChange={event => onChange(type === "rf" ? "name" : "category", event.target.value)} className={inputClass} />
        </label>
        <label className="space-y-1 md:col-span-2"><span className="text-[11px] font-semibold text-slate-600">Descripción normativa *</span><textarea value={draft.description || ""} onChange={event => onChange("description", event.target.value)} rows={3} className={`${inputClass} resize-y`} /></label>
        {type === "rf" ? <>
          <ActorAutocomplete value={draft.actors} actors={actorCatalog} onChange={value => onChange('actors', value)} />
          <label className="space-y-1"><span className="text-[11px] font-semibold text-slate-600">Prioridad</span><select value={draft.priority || "Alta"} onChange={event => onChange("priority", event.target.value)} className={inputClass}><option>Alta</option><option>Media</option><option>Baja</option></select></label>
          <label className="space-y-1"><span className="text-[11px] font-semibold text-slate-600">Precondición</span><input value={draft.precondition || ""} onChange={event => onChange("precondition", event.target.value)} className={inputClass} /></label>
          <label className="space-y-1"><span className="text-[11px] font-semibold text-slate-600">Poscondición</span><input value={draft.postcondition || ""} onChange={event => onChange("postcondition", event.target.value)} className={inputClass} /></label>
        </> : <>
          <label className="space-y-1 md:col-span-2"><span className="text-[11px] font-semibold text-slate-600">Métrica o condición verificable *</span><input value={draft.metric || ""} onChange={event => onChange("metric", event.target.value)} className={inputClass} placeholder="Condición cuantitativa o cualitativa acordada" /></label>
          <label className="space-y-1 md:col-span-2"><span className="text-[11px] font-semibold text-slate-600">Criterio de cumplimiento</span><input value={draft.compliance || ""} onChange={event => onChange("compliance", event.target.value)} className={inputClass} /></label>
        </>}
      </div>
      <div className="mt-3 space-y-3">
        <label className="block space-y-1"><span className="text-[11px] font-semibold text-slate-600">Necesidades vinculadas (IDs del análisis, separados por coma)</span><input value={(draft.needIds || []).join(', ')} onChange={(event) => onChange('needIds', splitIds(event.target.value))} className={inputClass} placeholder="N-01, N-02" /></label>
        <p className="text-[11px] text-slate-500">Vincula solo evidencias del mismo objetivo. Los criterios deben cubrir las necesidades vinculadas.</p>
        {criteria.map((criterion, index) => <div key={index} className="space-y-1 rounded-lg border border-slate-200 p-2">
          <label className="block text-[11px] font-semibold text-slate-600">Criterio {index + 1}<textarea value={criterion.descripcion || ''} className={inputClass} onChange={(event) => onChange('acceptanceCriteria', criteria.map((item, position) => position === index ? { ...item, descripcion: event.target.value } : item))} /></label>
          <label className="block text-[11px] text-slate-600">Necesidades que verifica<input value={(criterion.necesidades_origen || []).join(', ')} className={inputClass} onChange={(event) => onChange('acceptanceCriteria', criteria.map((item, position) => position === index ? { ...item, necesidades_origen: splitIds(event.target.value) } : item))} /></label>
          <button type="button" className="text-xs text-red-600" onClick={() => onChange('acceptanceCriteria', criteria.filter((_, position) => position !== index))}>Quitar criterio</button>
        </div>)}
        <button type="button" className="text-xs font-semibold text-violet-700" onClick={() => onChange('acceptanceCriteria', [...criteria, { descripcion: '', necesidades_origen: draft.needIds || [] }])}>Añadir criterio de aceptación</button>
      </div>
      {error && <p role="alert" className="mt-3 text-xs font-medium text-red-600">{error}</p>}
    </fieldset>
  );
}
