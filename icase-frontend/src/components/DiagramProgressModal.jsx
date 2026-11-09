import React from "react";

export default function DiagramProgressModal({
  isOpen,
  title = null,
  isCorrection = false,
  diagramLabel = "Diagrama",
  progress = 0,
  statusMessage = "",
  correctionPrompt = null,
  error = null,
  onClose
}) {
  if (!isOpen) return null;

  const displayProgress = Math.min(100, Math.max(0, Number(progress) || 0));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs animate-in fade-in duration-150">
      <div
        role="dialog"
        aria-modal="true"
        className="relative w-full max-w-md rounded-xl bg-white shadow-xl border border-slate-200 p-6 text-left"
      >
        {/* Título arriba de la barra */}
        <div className="mb-4">
          <h3 className="text-base font-semibold text-slate-900 tracking-tight">
            {error
              ? (title ? `Error: ${title}` : "Error al procesar")
              : title
              ? title
              : isCorrection
              ? "Regenerando diagrama"
              : `Generando diagrama ${diagramLabel}`}
          </h3>
          {statusMessage && !isCorrection && !error && (
            <p className="text-xs text-slate-500 mt-1">
              {statusMessage}
            </p>
          )}
        </div>

        {/* Barra de progreso cargando con su porcentaje */}
        {!error && (
          <div className="space-y-2 my-3">
            <div className="flex items-center justify-between text-xs font-semibold">
              <span className="text-slate-600">Progreso</span>
              <span className="text-sm font-bold text-violet-700 bg-violet-50 px-2 py-0.5 rounded border border-violet-200">
                {displayProgress}%
              </span>
            </div>

            <div className="h-2.5 w-full bg-slate-100 rounded-full overflow-hidden border border-slate-200 p-0.5">
              <div
                className="h-full bg-violet-600 rounded-full transition-all duration-300 ease-out"
                style={{ width: `${Math.max(displayProgress, 4)}%` }}
              />
            </div>
          </div>
        )}

        {/* Detalle si ocurrió un error */}
        {error && (
          <div className="my-3 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">
            <p className="font-semibold mb-1">Error:</p>
            <p className="whitespace-pre-wrap break-words">{error}</p>
          </div>
        )}

        {/* Debajo del progreso en corrección: "Chat": [texto que puso el usuario] */}
        {isCorrection && correctionPrompt && (
          <div className="mt-4 pt-3 border-t border-slate-100 text-xs">
            <p className="text-slate-700 leading-relaxed">
              <strong className="text-slate-900 font-semibold">"Chat":</strong> {correctionPrompt}
            </p>
          </div>
        )}

        {/* Botón de cerrar solo si hay error */}
        {error && onClose && (
          <div className="mt-4 flex justify-end">
            <button
              onClick={onClose}
              className="px-4 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded-md transition-colors cursor-pointer"
            >
              Cerrar
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
