import React, { useState } from "react";
import { Bot, Send, X, CheckCircle2, AlertTriangle } from "lucide-react";
import BrainGearsIcon from "./BrainGearsIcon";

export default function FeedbackChat({ phaseName, onApplyCorrection, onClose }) {
  const [prompt, setPrompt] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [lastCorrection, setLastCorrection] = useState(null);
  const [errorMessage, setErrorMessage] = useState(null);

  const sampleSuggestions = [
    "Añade un nuevo RNF con métrica numérica de tiempo de respuesta <= 0.5s",
    "Agrega al diagrama de casos de uso el proceso de Liquidación de Turno",
    "Asegura que el diagrama de arquitectura incluya el nodo réplica con failover",
    "Modifica la prioridad del RF-04 a Alta y añade actor 'Supervisor'"
  ];

  const handleSend = async (textToSend) => {
    const query = textToSend || prompt;
    if (!query.trim() || isProcessing) return;

    setIsProcessing(true);
    setErrorMessage(null);
    setLastCorrection(null);

    try {
      const res = await onApplyCorrection(query);
      if (res && res.success === false) {
        setErrorMessage(res.error || "La IA no pudo procesar esta instrucción. Intente reformular su solicitud.");
      } else {
        setLastCorrection(query);
        setPrompt("");
      }
    } catch (err) {
      setErrorMessage(err.message || "Error al comunicarse con el motor de IA.");
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="mt-4 p-4 bg-slate-900 border border-slate-700/80 rounded-lg shadow-lg">
      <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded bg-indigo-950/80 border border-indigo-700/50 flex items-center justify-center text-indigo-400">
            <Bot size={16} />
          </div>
          <div>
            <h4 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
              Asistente de Corrección I-CASE
              <span className="text-[10px] font-normal uppercase tracking-wider px-2 py-0.5 rounded bg-indigo-950 text-indigo-300 border border-indigo-800/60">
                HITL Activo
              </span>
            </h4>
            <p className="text-xs text-slate-400">
              Indica como experto qué modificaciones debe realizar la IA sobre {phaseName}
            </p>
          </div>
        </div>

        <button
          onClick={onClose}
          className="text-slate-400 hover:text-slate-200 p-1 hover:bg-slate-800 rounded transition-colors"
          title="Cerrar panel de corrección"
        >
          <X size={16} />
        </button>
      </div>

      {lastCorrection && (
        <div className="mb-3 p-2.5 bg-emerald-950/40 border border-emerald-800/50 rounded text-xs text-emerald-300 flex items-center gap-2">
          <CheckCircle2 size={15} className="shrink-0 text-emerald-400" />
          <span>
            <strong>Ajuste aplicado con éxito:</strong> "{lastCorrection}"
          </span>
        </div>
      )}

      {errorMessage && (
        <div className="mb-3 p-2.5 bg-rose-950/50 border border-rose-800/60 rounded text-xs text-rose-300 flex items-center gap-2">
          <AlertTriangle size={15} className="shrink-0 text-rose-400" />
          <span>
            <strong>Error al generar el ajuste:</strong> {errorMessage}
          </span>
        </div>
      )}

      {/* Suggestion tags */}
      <div className="mb-3 flex flex-wrap gap-1.5">
        {sampleSuggestions.map((item, idx) => (
          <button
            key={idx}
            type="button"
            onClick={() => handleSend(item)}
            className="text-[11px] px-2.5 py-1 rounded bg-slate-800/80 hover:bg-slate-700/80 text-slate-300 border border-slate-700/60 transition-colors text-left flex items-center gap-1.5"
          >
            <BrainGearsIcon size={12} className="text-indigo-400 shrink-0" />
            <span>{item}</span>
          </button>
        ))}
      </div>

      {/* Input area */}
      <div className="flex gap-2">
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
          placeholder="Escribe la instrucción de corrección (ej: 'Añade un RNF de disponibilidad 99.9% y conmutación en menos de 2s')..."
          rows={2}
          className="flex-1 bg-slate-950 border border-slate-700 rounded-md px-3 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/50 resize-none font-sans"
        />
        <button
          onClick={() => handleSend()}
          disabled={!prompt.trim() || isProcessing}
          className="px-4 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 disabled:text-slate-500 text-white rounded-md text-xs font-medium flex items-center justify-center gap-1.5 transition-colors self-stretch"
        >
          {isProcessing ? (
            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
          ) : (
            <>
              <Send size={14} />
              <span>Enviar</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
}
