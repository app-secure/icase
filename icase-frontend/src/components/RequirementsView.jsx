import React, { useState } from "react";
import { Check, CheckCircle2, Send } from "lucide-react";
import BrainGearsIcon from "./BrainGearsIcon";

export default function RequirementsView({
  requirements,
  onApprovePhase,
  isApproved,
  onApplyAiCorrection
}) {
  const [prompt, setPrompt] = useState("");
  const [isFixing, setIsFixing] = useState(false);
  const [correctionFeedback, setCorrectionFeedback] = useState(null);

  const functional = requirements?.functional || [];
  // Filtrar cualquier requerimiento corrupto residual de fallback
  const nonFunctional = (requirements?.nonFunctional || []).filter(
    (r) => !r.category?.includes("Ajuste Validado por Experto") && !r.description?.includes("Requisito incorporado por corrección")
  );

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
          {/* Upper Phase Indicator */}
          <div className="pb-4 mb-6 border-b border-slate-100 flex items-center justify-between shrink-0">
            <div>
              <span className="text-[11px] font-semibold text-blue-600 uppercase tracking-wider block">
                Fase 1: Análisis de Requerimientos
              </span>
              <h2 className="text-xl font-normal text-slate-900 tracking-tight mt-0.5">
                Especificación de Requerimientos del Sistema
              </h2>
            </div>

            {isApproved && (
              <span className="flex items-center gap-1.5 text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-1 rounded-full">
                <CheckCircle2 size={13} />
                Fase Aprobada
              </span>
            )}
          </div>

          {/* Main Content Area */}
          <div className="flex-1 space-y-6 text-slate-800 leading-relaxed text-[15px]">
            {functional.length === 0 && nonFunctional.length === 0 ? (
              <div className="py-16 text-center text-slate-400">
                No hay contenido generado aún. Presiona "Procesar" en el panel izquierdo.
              </div>
            ) : (
              <>
                {/* Functional Requirements Block */}
                <div className="space-y-4">
                  <h3 className="text-base font-semibold text-slate-900 tracking-tight">
                    Requerimientos Funcionales del Sistema:
                  </h3>

                  <div className="space-y-4 text-slate-700">
                    {functional.map((rf, index) => (
                      <div key={rf.id} className="flex items-start gap-3">
                        <span className="font-semibold text-slate-800 text-sm mt-0.5">
                          {index + 1}.
                        </span>
                        <div className="flex-1 space-y-1">
                          <p>
                            <strong className="text-slate-900 font-semibold">{rf.name}:</strong>{" "}
                            {rf.description}
                          </p>
                          <p className="text-xs text-slate-500">
                            <strong className="text-slate-700">Actores:</strong> {Array.isArray(rf.actors) ? rf.actors.join(", ") : rf.actors} • <strong className="text-slate-700">Prioridad:</strong> {rf.priority}
                          </p>
                          {rf.precondition && (
                            <p className="text-xs text-slate-500">
                              <strong className="text-slate-600">Precondición:</strong> {rf.precondition}
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Non-Functional Requirements Block */}
                <div className="space-y-4 pt-4 border-t border-slate-100">
                  <h3 className="text-base font-semibold text-slate-900 tracking-tight">
                    Requerimientos No Funcionales (Criterios de Calidad ISO 25010):
                  </h3>

                  <div className="space-y-4 text-slate-700">
                    {nonFunctional.map((rnf, index) => (
                      <div key={rnf.id} className="flex items-start gap-3">
                        <span className="font-semibold text-slate-800 text-sm mt-0.5">
                          {functional.length + index + 1}.
                        </span>
                        <div className="flex-1 space-y-1">
                          <p>
                            <strong className="text-slate-900 font-semibold">{rnf.category}:</strong>{" "}
                            {rnf.description}
                          </p>
                          <p className="text-xs text-slate-600">
                            <strong className="text-blue-700">Métrica cuantitativa:</strong> {rnf.metric} • <span className="text-slate-500">{rnf.compliance}</span>
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
            <div className={`text-xs px-3 py-1.5 rounded-lg flex items-center justify-between gap-2 ${
              correctionFeedback.type === "success" ? "bg-emerald-50 text-emerald-800 border border-emerald-200" : "bg-red-50 text-red-700 border border-red-200"
            }`}>
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
              className="flex-1 flex items-center bg-slate-50 hover:bg-slate-100/60 focus-within:bg-white border border-slate-300 focus-within:border-blue-500 rounded-full px-4 py-1.5 transition-all shadow-2xs"
            >
              <BrainGearsIcon size={16} className="text-blue-600 mr-2 shrink-0" />
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

            {/* Botón Aprobar Fase */}
            <button
              type="button"
              onClick={onApprovePhase}
              className="px-5 py-2.5 bg-[#6D8196] hover:bg-[#5a6c7f] text-white rounded-full text-xs font-semibold flex items-center gap-1.5 transition-all shadow-xs cursor-pointer shrink-0"
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
