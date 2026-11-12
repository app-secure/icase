import React, { useState } from "react";
import { Check, CheckCircle2, Pencil, Plus, Save, Send, Trash2, X } from "lucide-react";
import BrainGearsIcon from "./BrainGearsIcon";
import RequirementReviewPanel from './RequirementReviewPanel';
import RequirementDiagnostics from './RequirementDiagnostics';
import RequirementActorsPanel from './RequirementActorsPanel';
import { ToastContainer, useToasts } from "./Toast";

const emptyRequirement = (type) => type === "rf" ? {
  name: "", description: "", actors: ["Usuario"], priority: "Alta",
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
  readOnly = false, onBackToDesign, audit = null, onReview
}) {
  const [prompt, setPrompt] = useState("");
  const [isFixing, setIsFixing] = useState(false);
  const [isReviewing, setIsReviewing] = useState(false);
  const { toasts, addToast, removeToast } = useToasts();
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

    onUpdateRequirements?.({ functional: updatedFunctional, nonFunctional: updatedNonFunctional });
    setEditing(null);
    setFormError("");
    addToast({
      type: "success",
      message: `${isNew ? "Requisito añadido" : "Requisito actualizado"} (${chosenId}). Debes aprobar nuevamente el análisis antes de continuar.`
    });
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
              onAdd={() => startAdd("rnf")}
              readOnly={readOnly || isReviewing}
            />
            {!functional.length && !nonFunctional.length && !editing && <div className="py-8 text-center text-slate-400">No hay requisitos. Puedes añadirlos manualmente desde cada sección.</div>}

            {/* SECCIONES SECUNDARIAS: Paneles de Auditoría, Diagnósticos y Advertencias */}
            {audit?.referencia_analisis_inicial && <p className="text-sm text-slate-500">Base: análisis inicial v{audit.referencia_analisis_inicial.version}. Para modificar actores, necesidades o clasificación, abre «Análisis inicial» y crea un borrador.</p>}
            <RequirementActorsPanel audit={audit} requirements={requirements} onReview={onReview} readOnly={Boolean(audit?.referencia_analisis_inicial) || readOnly || isApproved || Boolean(editing) || isFixing} onBusyChange={setIsReviewing} />
            <RequirementReviewPanel audit={audit} onReview={onReview} readOnly={readOnly || isApproved || Boolean(editing) || isFixing} onBusyChange={setIsReviewing} />
            <RequirementDiagnostics audit={audit} />
            {audit?.metricas_ejecucion && <p className="text-xs text-slate-500">Generación: {(audit.metricas_ejecucion.duracion_ms / 1000).toFixed(1)} s · {audit.metricas_ejecucion.intentos_http} solicitudes al proveedor · {audit.metricas_ejecucion.presupuesto_agotado ? "presupuesto agotado; revisar cobertura" : "dentro del presupuesto"}</p>}
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
            {audit?.version >= 2 && (
              <details className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm">
                <summary className="cursor-pointer font-semibold">Reglas, decisiones técnicas y preguntas del análisis</summary>
                <p className="mt-2 text-xs text-slate-500">Se conservan como contexto del proyecto; no cuentan como funciones adicionales.</p>
                {[["Reglas de negocio", audit.reglas_negocio], ["Restricciones técnicas y plataformas", audit.restricciones_tecnicas], ["Alcance y decisiones", audit.decisiones], ["Preguntas pendientes", audit.preguntas_pendientes], ["Contexto", audit.contexto]].map(([title, entries]) => entries?.length ? (
                  <section key={title} className="mt-3"><h3 className="font-semibold">{title}</h3><ul className="list-disc pl-5">{entries.map((entry, index) => <li key={entry.id || index}>{entry.necesidad} <span className="text-xs text-slate-500">({entry.estado})</span>{entry.evidencia && <p className="text-xs text-slate-500">Evidencia: “{entry.evidencia}”</p>}</li>)}</ul></section>
                ) : null)}
              </details>
            )}
            {audit?.estado === 'revision_requerida' && !audit.revision_actual && (
              <div role="alert" className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
                <p className="font-semibold">Borrador generado: cobertura pendiente de revisión</p>
                <p>La revisión detectó incidencias y no puede acreditar la cobertura completa. Esto no significa que todos los requisitos sean incorrectos. Revisa las causas siguientes antes de aprobar.</p>
                {!audit.advertencias?.length && <p className="mt-2">Esta generación no guardó el detalle de la causa. No es posible determinarla desde este resultado; no se considera una comprobación satisfactoria.</p>}
                <ul className="mt-2 list-disc pl-5">{(audit.advertencias || []).map((warning, index) => <li key={index}>{warning}</li>)}</ul>
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
            {audit?.revision_semantica && <section className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm">
              <h3 className="font-semibold">Revisión semántica del insumo</h3>
              <p className="mt-1">{audit.revision_semantica.estado === 'completada' ? 'Revisión ejecutada' : audit.revision_semantica.estado === 'parcial' ? 'Revisión parcial: faltan contrastes válidos de categorías' : 'No se pudo completar la revisión'} · {audit.revision_semantica.hallazgos.length} hallazgos.</p>
              {audit.revision_semantica.contraste_categorias && <details className="mt-2">
                <summary className="cursor-pointer">Contraste de reglas, restricciones y contexto</summary>
                {audit.revision_semantica.contraste_categorias.revisados.map((entry, i) => <p key={i} className="mt-1">{entry.necesidad_id} · {entry.naturaleza}: {entry.justificacion} Requisitos: {entry.requisitos.join(', ') || 'sin requisito identificado'}.</p>)}
                {!!audit.revision_semantica.contraste_categorias.pendientes.length && <p>Pendientes: {audit.revision_semantica.contraste_categorias.pendientes.join(', ')}.</p>}
                {audit.revision_semantica.contraste_categorias.rechazados.map((entry, i) => <p key={i}>{entry.necesidad_id || 'Entrada'}: {entry.motivo}</p>)}
              </details>}
              <p className="text-xs text-slate-500">Las citas fueron comprobadas; su interpretación sigue siendo una evaluación de IA, no una garantía de exhaustividad.</p>
              {audit.revision_semantica.hallazgos.map(item => <details key={item.id} className="mt-3 border-t pt-2">
                <summary className="cursor-pointer">{item.id} · {item.tipo} · {item.estado}: {item.descripcion}</summary>
                <p>Acción propuesta: {item.accion_propuesta}</p>
                <p>Requisitos: {item.requisitos_afectados.join(', ') || 'ninguno existente'} · Necesidades: {item.necesidades_afectadas.join(', ') || 'no identificada en el inventario'}</p>
                {item.evidencias.map((evidence, index) => <p key={index} className="mt-1 whitespace-pre-wrap break-words text-xs">“{evidence.texto}” · {evidence.fuente}</p>)}
              </details>)}
              <p className="mt-2 text-xs">Corrección de hallazgos semánticos (no incluye errores estructurales): {!audit.revision_semantica.reparacion || audit.revision_semantica.reparacion.estado === 'no_necesaria' ? 'sin corrección solicitada para esta revisión' : audit.revision_semantica.reparacion.estado}. {audit.revision_semantica.reparacion?.motivo || ''}</p>
              {!!audit.revision_semantica.rechazados?.length && <p className="mt-1 text-xs">{audit.revision_semantica.rechazados.length} observaciones descartadas del control automático por evidencia o referencias inválidas.</p>}
            </section>}
          </div>
        </div>
      </div>

      {readOnly ? (
        <div className="z-10 w-full shrink-0 border-t border-slate-200 bg-white px-6 py-3.5 md:px-12">
          <div className="mx-auto flex w-full max-w-5xl justify-end">
            <button type="button" onClick={onBackToDesign} className="rounded-full bg-[#7C3AED] px-5 py-2.5 text-xs font-semibold text-white shadow-xs transition-colors hover:bg-[#6D28D9]">
              Volver a diagramas
            </button>
          </div>
        </div>
      ) : <div className="z-10 w-full shrink-0 border-t border-slate-200 bg-white px-6 py-3.5 md:px-12">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-2">
          <div className="flex min-w-0 flex-col gap-3 md:flex-row md:items-center">
            <form onSubmit={handleSendCorrection} className="flex w-full min-w-0 items-center rounded-full border border-slate-300 bg-slate-50 px-3 py-1.5 shadow-2xs transition-all hover:bg-slate-100/60 focus-within:border-[#7C3AED] focus-within:bg-white md:flex-1">
              <BrainGearsIcon size={16} className="mr-2 shrink-0 text-[#7C3AED]" />
              <span className="mr-2 hidden shrink-0 rounded-full border border-[#DDD2F5] bg-[#F2EDFF] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[#6D28D9] sm:inline">Requisitos ISO 29148</span>
              <input type="text" value={prompt} onChange={event => setPrompt(event.target.value)} disabled={isFixing} placeholder="Pide un ajuste a los requerimientos con IA..." className="min-w-0 flex-1 bg-transparent text-xs text-slate-800 outline-none placeholder:text-slate-400" />
              <button type="submit" disabled={!prompt.trim() || isFixing} className="ml-1 shrink-0 p-1 text-[#7C3AED] hover:text-[#6D28D9] disabled:text-slate-300" title="Aplicar ajuste con IA">{isFixing ? <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-violet-200 border-t-[#7C3AED]" /> : <Send size={14} />}</button>
            </form>
            <button type="button" onClick={onApprovePhase} disabled={Boolean(editing) || isReviewing || isFixing} className="flex w-full shrink-0 items-center justify-center gap-1.5 rounded-full bg-[#7C3AED] px-5 py-2.5 text-xs font-semibold text-white shadow-xs transition-all hover:bg-[#6D28D9] disabled:opacity-40 md:w-auto"><Check size={14} /><span>{isApproved ? "Ir a Fase 2 · Modelado" : "Aprobar y pasar a Modelado"}</span></button>
          </div>
        </div>
      </div>}
      <ToastContainer toasts={toasts} onDismiss={removeToast} />
    </div>
  );
}

function RequirementSection({
  title, type, items, numberOffset, editing, pendingDelete, formError,
  onEdit, onDeleteRequest, onDelete, onCancelDelete, onDraftChange, onSave, onCancelEdit, onAdd, readOnly = false
}) {
  const newHere = editing?.type === type && editing.isNew;
  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between border-b border-slate-100 pb-2">
        <h3 className="text-base font-semibold tracking-tight text-slate-900">{title}</h3>
        <div className="flex shrink-0 items-center gap-3">
          <span className="text-xs text-slate-400">{items.length} {items.length === 1 ? "requisito" : "requisitos"}</span>
          {!readOnly && <button
            type="button"
            onClick={onAdd}
            disabled={Boolean(editing)}
            className="flex items-center gap-1.5 rounded-full border border-[#CFC0F1] bg-[#F2EDFF] px-3 py-1.5 text-xs font-semibold text-[#6D28D9] transition-colors hover:bg-[#E9DDFE] disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Plus size={13} />
            {type === "rf" ? "Añadir RF" : "Añadir RNF"}
          </button>}
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
              {item.acceptanceCriteria?.length > 0 && <details className="pt-1 text-xs text-slate-600"><summary className="cursor-pointer font-medium">Criterios de aceptación ({item.acceptanceCriteria.length})</summary><ol className="mt-1 list-decimal space-y-1 pl-5">{item.acceptanceCriteria.map((criterion, criterionIndex) => <li key={criterionIndex}>{criterion.descripcion}</li>)}</ol></details>}
            </div>
            {!readOnly && <div className="flex shrink-0 items-center gap-1 opacity-100 transition-opacity md:opacity-0 md:group-hover:opacity-100">
              {deletingThis ? <><span className="mr-1 text-[11px] text-red-600">¿Eliminar?</span><button type="button" onClick={() => onDelete(type, index)} className="rounded-lg bg-red-600 px-2 py-1 text-[11px] font-semibold text-white">Sí</button><button type="button" onClick={onCancelDelete} className="rounded-lg border border-slate-200 px-2 py-1 text-[11px] text-slate-600">No</button></> : <><button type="button" disabled={Boolean(editing)} onClick={() => onEdit(type, index, item)} className="rounded-lg p-1.5 text-slate-400 hover:bg-[#F2EDFF] hover:text-[#7C3AED] disabled:opacity-30" title="Editar este requisito"><Pencil size={14} /></button><button type="button" disabled={Boolean(editing)} onClick={() => onDeleteRequest(key)} className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-30" title="Eliminar este requisito"><Trash2 size={14} /></button></>}
            </div>}
          </article>
        );
      })}
      {newHere && <RequirementEditor type={type} draft={editing.draft} error={formError} onChange={onDraftChange} onSave={onSave} onCancel={onCancelEdit} isNew />}
      {!items.length && !newHere && <p className="rounded-xl border border-dashed border-slate-200 px-4 py-6 text-center text-xs text-slate-400">No hay requisitos de este tipo.</p>}
    </section>
  );
}

function FunctionalDisplay({ item }) {
  const reqId = item.identificador || item.id;
  return <>
    <p>
      {reqId && <span className="inline-block px-1.5 py-0.5 mr-1.5 rounded bg-violet-100 text-[#7C3AED] font-mono text-[11px] font-bold">{reqId}</span>}
      <strong className="font-semibold text-slate-900">{item.name}</strong>: {item.description}
    </p>
    <p className="text-xs text-slate-500"><strong className="text-slate-700">Actores:</strong> {Array.isArray(item.actors) ? item.actors.join(", ") : item.actors} <span>•</span> <strong className="text-slate-700">Prioridad:</strong> {item.priority}</p>
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
    <RequirementProvenance item={item} />
  </>;
}

function RequirementProvenance({ item }) {
  const label = item.origin === "manual" ? "Manual" : item.origin === "explicito" ? "Explícito" : "Inferido";
  if (item.evidences?.length) return <div className="mt-1 text-[11px]">
    <span>{label}{item.requiresConfirmation ? ' · confirmar' : ''}</span>
    <details className="mt-1"><summary className="cursor-pointer">Evidencias ({item.evidences.length})</summary>
      {item.evidences.map((evidence, index) => <p key={index} className="mt-1 whitespace-pre-wrap break-words text-slate-500">“{evidence.texto}” · {evidence.fuente} · caracteres {evidence.inicio}–{evidence.fin} del insumo procesado</p>)}
    </details>
  </div>;
  return <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px]"><span className={`rounded-full px-2 py-0.5 font-medium ${item.requiresConfirmation ? "bg-amber-100 text-amber-800" : "bg-emerald-50 text-emerald-700"}`}>{label}{item.requiresConfirmation ? " · confirmar" : ""}</span>{item.evidence && <span className="max-w-full truncate text-slate-400" title={item.evidence}>Evidencia: “{item.evidence}”</span>}</div>;
}

function RequirementEditor({ type, draft, error, onChange, onSave, onCancel, isNew = false }) {
  const inputClass = "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-800 outline-none focus:border-[#7C3AED] focus:ring-2 focus:ring-violet-100";
  const criteria = draft.acceptanceCriteria || [];
  const splitIds = (text) => [...new Set(text.split(',').map((item) => item.trim()).filter(Boolean))];
  return (
    <div className="rounded-xl border border-[#CFC0F1] bg-[#FCFBFE] p-4 shadow-sm" onKeyDown={event => { if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") { event.preventDefault(); onSave(); } if (event.key === "Escape") onCancel(); }}>
      <div className="mb-3 flex items-center justify-between"><p className="text-xs font-semibold text-[#6D28D9]">{isNew ? "Nuevo" : "Editar"} {type === "rf" ? "requisito funcional" : "requisito no funcional"}</p><button type="button" onClick={onCancel} className="rounded p-1 text-slate-400 hover:bg-slate-100"><X size={14} /></button></div>
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
          <label className="space-y-1"><span className="text-[11px] font-semibold text-slate-600">Actores, separados por coma</span><input value={Array.isArray(draft.actors) ? draft.actors.join(", ") : draft.actors || ""} onChange={event => onChange("actors", event.target.value.split(","))} className={inputClass} /></label>
          <label className="space-y-1"><span className="text-[11px] font-semibold text-slate-600">Prioridad</span><select value={draft.priority || "Alta"} onChange={event => onChange("priority", event.target.value)} className={inputClass}><option>Alta</option><option>Media</option><option>Baja</option></select></label>
          <label className="space-y-1"><span className="text-[11px] font-semibold text-slate-600">Precondición</span><input value={draft.precondition || ""} onChange={event => onChange("precondition", event.target.value)} className={inputClass} /></label>
          <label className="space-y-1"><span className="text-[11px] font-semibold text-slate-600">Poscondición</span><input value={draft.postcondition || ""} onChange={event => onChange("postcondition", event.target.value)} className={inputClass} /></label>
        </> : <>
          <label className="space-y-1 md:col-span-2"><span className="text-[11px] font-semibold text-slate-600">Métrica cuantitativa verificable *</span><input value={draft.metric || ""} onChange={event => onChange("metric", event.target.value)} className={inputClass} placeholder="Ej.: respuesta menor a 1 segundo en el percentil 95" /></label>
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
      {error && <p className="mt-3 text-xs font-medium text-red-600">{error}</p>}
      <div className="mt-4 flex justify-end gap-2"><button type="button" onClick={onCancel} className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50">Cancelar</button><button type="button" onClick={onSave} className="flex items-center gap-1.5 rounded-lg bg-[#7C3AED] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#6D28D9]"><Save size={13} />Guardar requisito</button></div>
    </div>
  );
}
