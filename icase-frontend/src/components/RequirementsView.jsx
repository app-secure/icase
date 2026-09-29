import React, { useState, useRef } from "react";
import { Check, CheckCircle2, Send, Pencil, X } from "lucide-react";
import BrainGearsIcon from "./BrainGearsIcon";

export default function RequirementsView({
  requirements,
  onApprovePhase,
  isApproved,
  onApplyAiCorrection,
  onUpdateRequirements
}) {
  const [prompt, setPrompt] = useState("");
  const [isFixing, setIsFixing] = useState(false);
  const [correctionFeedback, setCorrectionFeedback] = useState(null);
  const [isEditing, setIsEditing] = useState(false);

  const containerRef = useRef(null);

  const functional = requirements?.functional || [];
  // Filtrar cualquier requerimiento corrupto residual de fallback
  const nonFunctional = (requirements?.nonFunctional || []).filter(
    (r) => !r.category?.includes("Ajuste Validado por Experto") && !r.description?.includes("Requisito incorporado por corrección")
  );

  const handleStartEdit = () => {
    setIsEditing(true);
    setCorrectionFeedback(null);
    setTimeout(() => {
      if (containerRef.current) {
        containerRef.current.focus();
      }
    }, 50);
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    setCorrectionFeedback(null);
  };

  const handleKeyDown = (e) => {
    if (isEditing && (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
      e.preventDefault();
      handleSaveEdit();
    } else if (isEditing && e.key === "Escape") {
      e.preventDefault();
      handleCancelEdit();
    }
  };

  const handleSaveEdit = () => {
    if (!containerRef.current) {
      setIsEditing(false);
      return;
    }

    // Extraer los requerimientos directamente del documento editado (estilo Word)
    const updatedFunctional = functional.map((rf, i) => {
      const itemEl = containerRef.current.querySelector(`[data-rf-item="${i}"]`);
      if (!itemEl) return rf;

      const nameEl = itemEl.querySelector(`[data-rf-name]`);
      const descEl = itemEl.querySelector(`[data-rf-desc]`);
      const actorsEl = itemEl.querySelector(`[data-rf-actors]`);
      const priorityEl = itemEl.querySelector(`[data-rf-priority]`);
      const preEl = itemEl.querySelector(`[data-rf-precondition]`);

      let name = rf.name;
      let description = rf.description;
      let actors = rf.actors;
      let priority = rf.priority;
      let precondition = rf.precondition;

      if (nameEl) {
        name = nameEl.innerText.replace(/:$/, "").trim();
      }
      if (descEl) {
        description = descEl.innerText.trim();
      }

      // Respaldo de parseo en caso de que el usuario haya editado el párrafo completo
      if (!nameEl || !descEl) {
        const mainP = itemEl.querySelector("p");
        if (mainP) {
          const text = mainP.innerText.trim();
          const colonIdx = text.indexOf(":");
          if (colonIdx !== -1) {
            name = text.substring(0, colonIdx).trim();
            description = text.substring(colonIdx + 1).trim();
          } else {
            description = text;
          }
        }
      }

      if (actorsEl) {
        actors = actorsEl.innerText.split(",").map((s) => s.trim()).filter(Boolean);
      }
      if (priorityEl) {
        priority = priorityEl.innerText.trim();
      }
      if (preEl) {
        precondition = preEl.innerText.trim();
      }

      return {
        ...rf,
        name: name || rf.name,
        description: description !== undefined ? description : rf.description,
        actors: actors && actors.length ? actors : rf.actors,
        priority: priority || rf.priority,
        precondition: precondition || rf.precondition
      };
    });

    const updatedNonFunctional = nonFunctional.map((rnf, i) => {
      const itemEl = containerRef.current.querySelector(`[data-rnf-item="${i}"]`);
      if (!itemEl) return rnf;

      const catEl = itemEl.querySelector(`[data-rnf-category]`);
      const descEl = itemEl.querySelector(`[data-rnf-desc]`);
      const metricEl = itemEl.querySelector(`[data-rnf-metric]`);
      const compEl = itemEl.querySelector(`[data-rnf-compliance]`);

      let category = rnf.category;
      let description = rnf.description;
      let metric = rnf.metric;
      let compliance = rnf.compliance;

      if (catEl) {
        category = catEl.innerText.replace(/:$/, "").trim();
      }
      if (descEl) {
        description = descEl.innerText.trim();
      }

      if (!catEl || !descEl) {
        const mainP = itemEl.querySelector("p");
        if (mainP) {
          const text = mainP.innerText.trim();
          const colonIdx = text.indexOf(":");
          if (colonIdx !== -1) {
            category = text.substring(0, colonIdx).trim();
            description = text.substring(colonIdx + 1).trim();
          } else {
            description = text;
          }
        }
      }

      if (metricEl) {
        metric = metricEl.innerText.trim();
      }
      if (compEl) {
        compliance = compEl.innerText.trim();
      }

      return {
        ...rnf,
        category: category || rnf.category,
        description: description !== undefined ? description : rnf.description,
        metric: metric || rnf.metric,
        compliance: compliance || rnf.compliance
      };
    });

    if (onUpdateRequirements) {
      onUpdateRequirements({
        functional: updatedFunctional,
        nonFunctional: updatedNonFunctional
      });
    }

    setIsEditing(false);
    setCorrectionFeedback({
      type: "success",
      message: "Cambios Guardados"
    });
  };

  const handleSendCorrection = async (e) => {
    e?.preventDefault();
    if (!prompt.trim() || isFixing) return;

    const text = prompt;
    setIsFixing(true);
    setCorrectionFeedback(null);

    try {
      if (onApplyAiCorrection) {
        const res = await onApplyAiCorrection(text);
        if (res && res.success === false) {
          setCorrectionFeedback({ type: "error", message: res.error || "No se pudo aplicar el ajuste a los requerimientos." });
        } else {
          setCorrectionFeedback({ type: "success", message: `Ajuste aplicado: "${text}"` });
          setPrompt("");
        }
      }
    } catch (err) {
      setCorrectionFeedback({ type: "error", message: err.message || "Error al conectar con la IA." });
    } finally {
      setIsFixing(false);
    }
  };

  return (
    <div className="w-full h-full flex flex-col min-h-0 bg-white">
      {/* Contenedor scrolleable que abarca todo el ancho hasta el extremo derecho */}
      <div className="w-full flex-1 overflow-y-auto min-h-0 px-6 md:px-12 pt-6 pb-4 flex flex-col">
        <div className="max-w-5xl mx-auto w-full flex-1 flex flex-col min-h-0">
          {/* Upper Phase Indicator con Botón de Edición Manual */}
          <div className="pb-4 mb-6 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3 shrink-0">
            <div>
              <span className="text-[11px] font-semibold text-blue-600 uppercase tracking-wider block">
                Fase 1: Análisis de Requerimientos
              </span>
              <h2 className="text-xl font-normal text-slate-900 tracking-tight mt-0.5">
                Especificación de Requerimientos del Sistema
              </h2>
            </div>

            <div className="flex items-center gap-2">
              {isApproved && !isEditing && (
                <span className="flex items-center gap-1.5 text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-1 rounded-full">
                  <CheckCircle2 size={13} />
                  Fase Aprobada
                </span>
              )}

              {/* Botón de Edición Manual Tipo Word */}
              {!isEditing ? (
                <button
                  type="button"
                  onClick={handleStartEdit}
                  className="px-3.5 py-1.5 rounded-full text-xs font-medium flex items-center gap-1.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 hover:border-slate-400 transition-colors cursor-pointer shadow-2xs"
                  title="Editar directamente en el texto como en Word"
                >
                  <Pencil size={13} className="text-blue-600" />
                  <span>Editar</span>
                </button>
              ) : (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-blue-700 bg-blue-50 border border-blue-200 px-2.5 py-1 rounded-full font-medium flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-blue-600 animate-pulse"></span>
                    Cursor editable activo
                  </span>
                  <button
                    type="button"
                    onClick={handleSaveEdit}
                    className="px-4 py-1.5 bg-[#0b57d0] hover:bg-[#0947a8] text-white text-xs font-semibold rounded-full flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs"
                    title="Guardar cambios directamente en la base de datos (Ctrl+S)"
                  >
                    <Check size={13} />
                    <span>Guardar</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleCancelEdit}
                    className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-medium rounded-full flex items-center gap-1 transition-colors cursor-pointer"
                    title="Cancelar edición (Esc)"
                  >
                    <X size={13} />
                    <span>Cancelar</span>
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Main Content Area: Exacto mismo diseño, editable directamente con cursor de texto (sin cajones ni contenedores) */}
          <div
            ref={containerRef}
            contentEditable={isEditing}
            suppressContentEditableWarning={true}
            spellCheck={true}
            onKeyDown={handleKeyDown}
            tabIndex={isEditing ? 0 : undefined}
            className={`flex-1 space-y-6 text-slate-800 leading-relaxed text-[15px] outline-none ${
              isEditing ? "cursor-text select-text" : ""
            }`}
          >
            {functional.length === 0 && nonFunctional.length === 0 ? (
              <div className="py-16 text-center text-slate-400" contentEditable={false}>
                No hay contenido generado aún. Presiona "Procesar" en el panel izquierdo.
              </div>
            ) : (
              <>
                {/* Functional Requirements Block */}
                <div className="space-y-4">
                  <h3
                    contentEditable={false}
                    className="text-base font-semibold text-slate-900 tracking-tight select-none"
                  >
                    Requerimientos Funcionales del Sistema:
                  </h3>

                  <div className="space-y-4 text-slate-700">
                    {functional.map((rf, index) => (
                      <div
                        key={rf.id || index}
                        data-rf-item={index}
                        className="flex items-start gap-3"
                      >
                        <span
                          contentEditable={false}
                          className="font-semibold text-slate-800 text-sm mt-0.5 select-none"
                        >
                          {index + 1}.
                        </span>
                        <div className="flex-1 space-y-1">
                          <p className="leading-relaxed">
                            <strong data-rf-name className="font-semibold text-slate-900">
                              {rf.name}
                            </strong>
                            <span>: </span>
                            <span data-rf-desc>
                              {rf.description}
                            </span>
                          </p>

                          <p className="text-xs text-slate-500">
                            <strong contentEditable={false} className="text-slate-700 select-none">
                              Actores:
                            </strong>{" "}
                            <span data-rf-actors>
                              {Array.isArray(rf.actors) ? rf.actors.join(", ") : rf.actors}
                            </span>
                            <span contentEditable={false} className="select-none"> • </span>
                            <strong contentEditable={false} className="text-slate-700 select-none">
                              Prioridad:
                            </strong>{" "}
                            <span data-rf-priority>
                              {rf.priority}
                            </span>
                          </p>

                          {rf.precondition && (
                            <p className="text-xs text-slate-500">
                              <strong contentEditable={false} className="text-slate-600 select-none">
                                Precondición:
                              </strong>{" "}
                              <span data-rf-precondition>
                                {rf.precondition}
                              </span>
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Non-Functional Requirements Block */}
                <div className="space-y-4 pt-4 border-t border-slate-100">
                  <h3
                    contentEditable={false}
                    className="text-base font-semibold text-slate-900 tracking-tight select-none"
                  >
                    Requerimientos No Funcionales (Criterios de Calidad ISO 25010):
                  </h3>

                  <div className="space-y-4 text-slate-700">
                    {nonFunctional.map((rnf, index) => (
                      <div
                        key={rnf.id || index}
                        data-rnf-item={index}
                        className="flex items-start gap-3"
                      >
                        <span
                          contentEditable={false}
                          className="font-semibold text-slate-800 text-sm mt-0.5 select-none"
                        >
                          {functional.length + index + 1}.
                        </span>
                        <div className="flex-1 space-y-1">
                          <p className="leading-relaxed">
                            <strong data-rnf-category className="font-semibold text-slate-900">
                              {rnf.category}
                            </strong>
                            <span>: </span>
                            <span data-rnf-desc>
                              {rnf.description}
                            </span>
                          </p>

                          <p className="text-xs text-slate-600">
                            <strong contentEditable={false} className="text-blue-700 select-none">
                              Métrica cuantitativa:
                            </strong>{" "}
                            <span data-rnf-metric>
                              {rnf.metric}
                            </span>
                            <span contentEditable={false} className="select-none"> • </span>
                            <span data-rnf-compliance className="text-slate-500">
                              {rnf.compliance}
                            </span>
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Bottom Action Bar: Estático y fijo al fondo al extremo inferior */}
      <div className="w-full shrink-0 border-t border-slate-200 bg-white z-10 px-6 md:px-12 py-3.5">
        <div className="max-w-5xl mx-auto w-full flex flex-col gap-2">
          {correctionFeedback && (
            <div
              className={`text-xs px-3 py-1.5 rounded-lg flex items-center justify-between gap-2 ${
                correctionFeedback.type === "success"
                  ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                  : correctionFeedback.type === "info"
                  ? "bg-blue-50 text-blue-800 border border-blue-200"
                  : "bg-red-50 text-red-700 border border-red-200"
              }`}
            >
              <span className="truncate">{correctionFeedback.message}</span>
              <button
                type="button"
                onClick={() => setCorrectionFeedback(null)}
                className="text-slate-400 hover:text-slate-600 font-bold ml-2 text-xs cursor-pointer"
              >
                ×
              </button>
            </div>
          )}

          <div className="flex items-center gap-3">
            {/* Input de Ajustes IA redimensionado y elegante al lado del botón de aprobar */}
            <form
              onSubmit={handleSendCorrection}
              className="flex-1 flex items-center bg-slate-50 hover:bg-slate-100/60 focus-within:bg-white border border-slate-300 focus-within:border-blue-500 rounded-full px-3 py-1.5 transition-all shadow-2xs"
            >
              <BrainGearsIcon size={16} className="text-blue-600 mr-2 shrink-0" />

              {/* Guía contextual que indica qué se está ajustando */}
              <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-blue-100/80 text-blue-700 border border-blue-200/80 shrink-0 mr-2">
                Requisitos ISO 29148
              </span>

              <input
                type="text"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                disabled={isFixing}
                placeholder="Pide un ajuste a los requerimientos con IA (ej: 'añade módulo de facturación')..."
                className="flex-1 bg-transparent text-xs text-slate-800 placeholder:text-slate-400 outline-none min-w-0"
              />
              <button
                type="submit"
                disabled={!prompt.trim() || isFixing}
                className="p-1 text-blue-600 hover:text-blue-700 disabled:text-slate-300 transition-colors cursor-pointer shrink-0 ml-1"
                title="Aplicar ajuste a requerimientos"
              >
                {isFixing ? (
                  <div className="w-3.5 h-3.5 border-2 border-blue-600/30 border-t-blue-600 rounded-full animate-spin"></div>
                ) : (
                  <Send size={14} />
                )}
              </button>
            </form>

            {/* Botón Aprobar Fase en azul coherente con Fase 2 */}
            <button
              type="button"
              onClick={onApprovePhase}
              className="px-5 py-2.5 bg-[#0b57d0] hover:bg-[#0947a8] text-white rounded-full text-xs font-semibold flex items-center gap-1.5 transition-all shadow-xs cursor-pointer shrink-0"
            >
              <Check size={14} />
              <span>Aprobar Fase</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
