import React, { useState } from "react";
import {
  GitBranch,
  Network,
  Box,
  Compass,
  Check,
  Edit3,
  Send,
  CheckCircle2,
  AlertTriangle
} from "lucide-react";
import PlantUMLViewer from "./PlantUMLViewer";

export default function DiagramsView({
  diagrams,
  onUpdateDiagramCode,
  onApprovePhase,
  onApplyAiCorrection,
  onBackToAnalysis
}) {
  const [selectedKey, setSelectedKey] = useState("useCase");
  const [viewMode, setViewMode] = useState("visual"); // "visual" | "code"
  const [showChat, setShowChat] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [isFixing, setIsFixing] = useState(false);
  const [lastCorrection, setLastCorrection] = useState(null);
  const [errorMessage, setErrorMessage] = useState(null);

  const options = [
    { key: "useCase", label: "Casos de Uso", icon: GitBranch },
    { key: "architecture", label: "Arquitectura", icon: Network },
    { key: "classDiagram", label: "Clases de Dominio", icon: Box },
    { key: "navigationTree", label: "Árbol de Navegación", icon: Compass }
  ];

  const currentDiagram = diagrams?.[selectedKey] || {
    title: "Diagrama pendiente",
    code: "@startuml\nactor Usuario\nrectangle Sistema {\n  usecase Generar\n}\nUsuario --> Generar\n@enduml",
    plantumlCode: "@startuml\nactor Usuario\nrectangle Sistema {\n  usecase Generar\n}\nUsuario --> Generar\n@enduml",
    description: "Pendiente de procesamiento."
  };

  const handleSendCorrection = async (e) => {
    e?.preventDefault();
    if (!prompt.trim() || isFixing) return;

    const text = prompt;
    setIsFixing(true);
    setErrorMessage(null);
    setLastCorrection(null);

    try {
      const res = await onApplyAiCorrection(text, selectedKey);
      if (res && res.success === false) {
        setErrorMessage(res.error || "La IA no pudo procesar la corrección para este diagrama.");
      } else {
        setLastCorrection(text);
        setPrompt("");
      }
    } catch (err) {
      console.error("Error al aplicar corrección agéntica en diagramas:", err);
      setErrorMessage(err.message || "Error al conectar con la IA.");
    } finally {
      setIsFixing(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-white max-w-5xl mx-auto w-full">
      {/* Upper Phase Indicator */}
      <div className="pb-4 mb-4 border-b border-slate-100 flex items-center justify-between">
        <div>
          <span className="text-[11px] font-semibold text-blue-600 uppercase tracking-wider block">
            Fase 2: Modelado del Software
          </span>
          <h2 className="text-xl font-normal text-slate-900 tracking-tight mt-0.5">
            Diagramas UML & Arquitectura en Código Puro
          </h2>
        </div>

        <button
          onClick={onBackToAnalysis}
          className="text-xs text-slate-500 hover:text-slate-800 transition-colors"
        >
          ← Volver a Requerimientos
        </button>
      </div>

      {/* Options Pills (Options to pick diagram as requested by user) */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        {options.map((opt) => {
          const Icon = opt.icon;
          const isSelected = selectedKey === opt.key;
          return (
            <button
              key={opt.key}
              onClick={() => setSelectedKey(opt.key)}
              className={`px-3.5 py-1.5 rounded-full text-xs font-medium flex items-center gap-1.5 transition-all cursor-pointer ${
                isSelected
                  ? "bg-slate-900 text-white shadow-xs"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              <Icon size={14} />
              <span>{opt.label}</span>
            </button>
          );
        })}
      </div>

      {/* Rationale & Engine / View Switcher */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 text-xs text-slate-600 border-b border-slate-100 mb-3">
        <p className="line-clamp-1 pr-4">
          <strong className="text-slate-800">{currentDiagram.title}:</strong> {currentDiagram.description}
        </p>

        <div className="flex items-center gap-2">
          {/* Selector Vista Gráfica / Código Fuente */}
          <div className="flex items-center bg-slate-100 p-0.5 rounded-full shrink-0">
            <button
              onClick={() => setViewMode("visual")}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-all cursor-pointer ${
                viewMode === "visual"
                  ? "bg-white text-slate-900 shadow-xs"
                  : "text-slate-500 hover:text-slate-800"
              }`}
            >
              Visual
            </button>
            <button
              onClick={() => setViewMode("code")}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-all cursor-pointer ${
                viewMode === "code"
                  ? "bg-white text-slate-900 shadow-xs"
                  : "text-slate-500 hover:text-slate-800"
              }`}
            >
              Código
            </button>
          </div>
        </div>
      </div>

      {/* Main Display Container with Scroll */}
      <div className="flex-1 min-h-[480px] overflow-hidden flex flex-col">
        {viewMode === "visual" ? (
          <div className="flex-1 h-full min-h-[480px]">
            <PlantUMLViewer
              key={selectedKey}
              code={currentDiagram.plantumlCode || currentDiagram.code}
              title={currentDiagram.title}
            />
          </div>
        ) : (
          <div className="flex-1 flex flex-col bg-slate-50 border border-slate-200 rounded-2xl overflow-hidden p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-mono text-slate-600">
                Código fuente PlantUML / Structurizr C4 editable:
              </span>
              <span className="text-[10px] text-blue-700 bg-blue-50 border border-blue-200 px-2.5 py-0.5 rounded-full font-medium">
                PlantUML Estándar
              </span>
            </div>
            <textarea
              value={currentDiagram.plantumlCode || currentDiagram.code || ""}
              onChange={(e) => onUpdateDiagramCode(selectedKey, e.target.value)}
              rows={14}
              className="flex-1 w-full bg-white border border-slate-200 rounded-xl p-3 text-xs font-mono text-slate-800 focus:outline-none focus:border-blue-600 resize-none leading-relaxed"
              spellCheck="false"
            />
          </div>
        )}

        {/* Correction Feedback Notification */}
        {lastCorrection && (
          <div className="mt-3 p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 flex items-center gap-2">
            <CheckCircle2 size={15} className="text-emerald-600 shrink-0" />
            <span>
              <strong>Ajuste incorporado en el diagrama:</strong> "{lastCorrection}"
            </span>
          </div>
        )}

        {/* Error Notification when AI fails to generate */}
        {errorMessage && (
          <div className="mt-3 p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 flex items-center gap-2">
            <AlertTriangle size={15} className="text-rose-600 shrink-0" />
            <span>
              <strong>No se pudo actualizar el diagrama:</strong> {errorMessage}
            </span>
          </div>
        )}

        {/* Inline Prompt / Chat Box when "Corregir" is clicked */}
        {showChat && (
          <div className="pt-3 mt-3 border-t border-slate-200">
            <form onSubmit={handleSendCorrection} className="flex gap-2">
              <input
                type="text"
                autoFocus
                placeholder={
                  selectedKey === "useCase"
                    ? "Pídele a la IA: ej. Agrega el actor Farmacéutico y el caso Dispensar Receta..."
                    : selectedKey === "classDiagram"
                    ? "Pídele a la IA: ej. Agrega la clase Medicamento y Lote con métodos y relaciones..."
                    : selectedKey === "architecture"
                    ? "Pídele a la IA: ej. Agrega la Terminal Nocturna 24h y servidor réplica failover..."
                    : "Pídele a la IA: ej. Agrega el módulo de Control de Lotes al árbol..."
                }
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
          Revisión del experto requerida para generar la documentación final
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
            <span>Aprobar Diagramas</span>
          </button>
        </div>
      </div>
    </div>
  );
}
