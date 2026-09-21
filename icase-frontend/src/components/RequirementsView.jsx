import React, { useState } from "react";
import { Check, Edit3, Send, Sparkles, CheckCircle2, AlertTriangle } from "lucide-react";

export default function RequirementsView({
  requirements,
  onApprovePhase,
  onApplyAiCorrection,
  isApproved
}) {
  const [showChat, setShowChat] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [isFixing, setIsFixing] = useState(false);
  const [lastCorrection, setLastCorrection] = useState(null);
  const [errorMessage, setErrorMessage] = useState(null);

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
    setErrorMessage(null);
    setLastCorrection(null);

    try {
      const res = await onApplyAiCorrection(text);
      if (res && res.success === false) {
        setErrorMessage(res.error || "La IA no pudo generar los requerimientos solicitados. Intente nuevamente.");
      } else {
        setLastCorrection(text);
        setPrompt("");
      }
    } catch (err) {
      console.error("Error al aplicar corrección agéntica:", err);
      setErrorMessage(err.message || "Error al conectar con el motor de IA.");
    } finally {
      setIsFixing(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-white max-w-4xl mx-auto w-full">
      {/* Upper Phase Indicator */}
      <div className="pb-4 mb-6 border-b border-slate-100 flex items-center justify-between">
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

      {/* Main Content Area with Scroll (Editorial Text Style like Gemini / NotebookLM) */}
      <div className="flex-1 overflow-y-auto pr-3 space-y-6 text-slate-800 leading-relaxed text-[15px]">
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
                      <div className="text-xs text-slate-500 flex flex-wrap gap-x-4 gap-y-0.5">
                        <span><strong>Actores:</strong> {rf.actors?.join(", ")}</span>
                        <span><strong>Prioridad:</strong> {rf.priority}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Non-Functional Requirements Block */}
            <div className="space-y-4 pt-4 border-t border-slate-100">
              <h3 className="text-base font-semibold text-slate-900 tracking-tight">
                Requerimientos No Funcionales Cuantificables (Métricas):
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

        {/* Correction Feedback Notification */}
        {lastCorrection && (
          <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 flex items-center gap-2">
            <CheckCircle2 size={15} className="text-emerald-600 shrink-0" />
            <span>
              <strong>Ajuste incorporado por la IA:</strong> "{lastCorrection}"
            </span>
          </div>
        )}

        {/* Error Notification when AI fails to generate */}
        {errorMessage && (
          <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 flex items-center gap-2">
            <AlertTriangle size={15} className="text-rose-600 shrink-0" />
            <span>
              <strong>No se pudo generar el ajuste:</strong> {errorMessage}
            </span>
          </div>
        )}

        {/* Inline Prompt / Chat Box when "Corregir" is clicked */}
        {showChat && (
          <div className="pt-3 border-t border-slate-200">
            <form onSubmit={handleSendCorrection} className="flex gap-2">
              <input
                type="text"
                autoFocus
                placeholder="Indícale a la IA cómo modificar, ampliar o hacer más entendibles los requerimientos (ej: 'debes aumentar más requerimientos', 'hazlo más entendible')..."
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                className="flex-1 bg-slate-50 border border-slate-300 rounded-full px-4 py-2 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-blue-600"
              />
              <button
                type="submit"
                disabled={!prompt.trim() || isFixing}
                className="px-4 py-2 bg-[#0b57d0] hover:bg-blue-700 disabled:bg-slate-200 disabled:text-slate-400 text-white rounded-full text-xs font-medium flex items-center gap-1.5 transition-all shadow-xs cursor-pointer"
              >
                {isFixing ? (
                  <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                ) : (
                  <>
                    <Send size={13} />
                    <span>Enviar</span>
                  </>
                )}
              </button>
            </form>
          </div>
        )}
      </div>

      {/* Bottom Approval & Correction Bar */}
      <div className="pt-4 mt-4 border-t border-slate-200 flex items-center justify-between">
        <span className="text-xs text-slate-500">
          Revisión del experto requerida para avanzar a la fase de diseño
        </span>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowChat((prev) => !prev)}
            className="px-4 py-2 border border-slate-300 hover:bg-slate-50 text-slate-700 rounded-full text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <Edit3 size={13} />
            <span>{showChat ? "Ocultar chat" : "Corregir"}</span>
          </button>

          <button
            type="button"
            onClick={onApprovePhase}
            className="px-5 py-2 bg-[#0b57d0] hover:bg-blue-700 text-white rounded-full text-xs font-medium flex items-center gap-1.5 transition-all shadow-xs cursor-pointer"
          >
            <Check size={14} />
            <span>Aprobar Fase</span>
          </button>
        </div>
      </div>
    </div>
  );
}
