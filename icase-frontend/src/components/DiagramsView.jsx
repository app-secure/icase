import React, { useState } from "react";
import {
  GitBranch,
  Network,
  Box,
  Compass,
  Check,
  Send,
  Layout
} from "lucide-react";
import BrainGearsIcon from "./BrainGearsIcon";
import PlantUMLViewer from "./PlantUMLViewer";
import MockupsView from "./MockupsView";
import { generateMockupsApi } from "../services/api";

export default function DiagramsView({
  diagrams,
  mockups = [],
  onUpdateMockups,
  onUpdateDiagramCode,
  onApprovePhase,
  onBackToAnalysis,
  onApplyAiCorrection,
  projectId,
  requirements = null
}) {
  const [selectedKey, setSelectedKey] = useState("useCase");
  const [viewMode, setViewMode] = useState("visual"); // "visual" | "code"
  const [selectedScreen, setSelectedScreen] = useState(0);
  const [prompt, setPrompt] = useState("");
  const [isFixing, setIsFixing] = useState(false);
  const [correctionFeedback, setCorrectionFeedback] = useState(null);

  const options = [
    { key: "useCase", label: "Casos de Uso", icon: GitBranch },
    { key: "architecture", label: "Arquitectura", icon: Network },
    { key: "classDiagram", label: "Clases de Dominio", icon: Box },
    { key: "navigationTree", label: "Árbol de Navegación", icon: Compass },
    { key: "mockups", label: "Mockups", icon: Layout }
  ];

  const currentDiagram = diagrams?.[selectedKey] || {
    title: "Diagrama pendiente",
    code: "@startuml\nactor Usuario\nrectangle Sistema {\n  usecase Generar\n}\nUsuario --> Generar\n@enduml",
    plantumlCode: "@startuml\nactor Usuario\nrectangle Sistema {\n  usecase Generar\n}\nUsuario --> Generar\n@enduml",
    description: "Pendiente de procesamiento."
  };

  const activeMockup = mockups[selectedScreen] || mockups[0] || null;

  // Determinar la etiqueta y placeholder contextual del chat inteligente
  const getContextInfo = () => {
    switch (selectedKey) {
      case "useCase":
        return {
          badge: "Casos de Uso",
          placeholder: "Pide un ajuste a Casos de Uso con IA (ej: 'añade actor Cocinero y proceso KDS')..."
        };
      case "architecture":
        return {
          badge: "Arquitectura C4",
          placeholder: "Pide un ajuste a la Arquitectura con IA (ej: 'agrega Redis para caché y gateway Nginx')..."
        };
      case "classDiagram":
        return {
          badge: "Clases de Dominio",
          placeholder: "Pide un ajuste a Clases con IA (ej: 'añade entidad Factura con atributos monto y fecha')..."
        };
      case "navigationTree":
        return {
          badge: "Árbol de Navegación",
          placeholder: "Pide un ajuste al Árbol de Navegación con IA (ej: 'incluye la pantalla de reportes de cierre')..."
        };
      case "mockups":
        return {
          badge: activeMockup ? `Mockup: ${activeMockup.nombre_pantalla}` : "Mockups UI",
          placeholder: activeMockup
            ? `Pide un ajuste a "${activeMockup.nombre_pantalla}" con IA (ej: 'añade modal de pago y filtros')...`
            : "Pide un ajuste a los mockups con IA (ej: 'añade pantalla de comandas')..."
        };
      default:
        return {
          badge: "Modelado",
          placeholder: "Pide un ajuste al modelo con IA..."
        };
    }
  };

  const contextInfo = getContextInfo();

  // Envío inteligente: enruta la corrección según el artefacto activo
  const handleSendCorrection = async (e) => {
    e?.preventDefault();
    if (!prompt.trim() || isFixing) return;

    const text = prompt;
    setIsFixing(true);
    setCorrectionFeedback(null);

    try {
      if (selectedKey === "mockups") {
        // Enrutamiento inteligente a Mockup AI Service
        if (!projectId) {
          throw new Error("No se encontró el ID del proyecto para procesar mockups.");
        }
        const pantallasTarget = activeMockup ? [activeMockup.nombre_pantalla] : [];
        const result = await generateMockupsApi(projectId, pantallasTarget, text);
        if (result && result.mockups && result.mockups.length > 0) {
          setCorrectionFeedback({
            type: "success",
            message: `Ajuste aplicado exitosamente al mockup con IA: "${text}"`
          });
          if (onUpdateMockups) {
            onUpdateMockups(result.mockups);
          }
          setPrompt("");
        } else {
          setCorrectionFeedback({
            type: "error",
            message: "La IA no devolvió mockups para este ajuste. Intenta reformular."
          });
        }
      } else {
        // Enrutamiento inteligente a Diagramas PlantUML
        if (onApplyAiCorrection) {
          const res = await onApplyAiCorrection(text, selectedKey);
          if (res && res.success === false) {
            setCorrectionFeedback({
              type: "error",
              message: res.error || "No se pudo aplicar el ajuste al diagrama."
            });
          } else {
            setCorrectionFeedback({
              type: "success",
              message: `Ajuste aplicado al diagrama [${contextInfo.badge}]: "${text}"`
            });
            setPrompt("");
          }
        }
      }
    } catch (err) {
      setCorrectionFeedback({
        type: "error",
        message: err.message || "Error al conectar con la IA."
      });
    } finally {
      setIsFixing(false);
    }
  };

  return (
    <div className="w-full h-full flex flex-col min-h-0 bg-white">
      {/* Contenedor scrolleable que abarca todo el ancho hasta el extremo derecho */}
      <div className="w-full flex-1 overflow-y-auto min-h-0 px-6 md:px-12 pt-6 pb-4 flex flex-col">
        <div className="max-w-6xl mx-auto w-full flex-1 flex flex-col min-h-0">
          {/* Cabecera superior unificada de Fase 2 */}
          <div className="pb-3 mb-3 border-b border-slate-100 flex items-center justify-between shrink-0">
            <div>
              <span className="text-[11px] font-semibold text-blue-600 uppercase tracking-wider block">
                Fase 2: Modelado del Software & Wireframes
              </span>
              <h2 className="text-xl font-normal text-slate-900 tracking-tight mt-0.5">
                {selectedKey === "mockups"
                  ? "Wireframes y Mockups de Interfaz del Sistema"
                  : "Diagramas UML & Arquitectura en Código Puro"}
              </h2>
            </div>

            <button
              onClick={onBackToAnalysis}
              className="text-xs text-slate-500 hover:text-slate-800 transition-colors cursor-pointer"
            >
              ← Volver a Requerimientos
            </button>
          </div>

          {/* Fila Superior: Tabs de navegación (Casos de Uso, Arquitectura, Clases, Árbol de Navegación, Mockups) */}
          <div className="flex flex-wrap items-center justify-between gap-3 mb-3 shrink-0">
            <div className="flex flex-wrap items-center gap-2">
              {options.map((opt) => {
                const Icon = opt.icon;
                const isSelected = selectedKey === opt.key;
                return (
                  <button
                    key={opt.key}
                    onClick={() => {
                      setSelectedKey(opt.key);
                      setCorrectionFeedback(null);
                    }}
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

            {/* Selector Vista Gráfica / Código (solo para diagramas PlantUML; Mockups maneja su propio toggle) */}
            {selectedKey !== "mockups" && (
              <div className="flex items-center bg-slate-100 p-0.5 rounded-full shrink-0">
                <button
                  type="button"
                  onClick={() => setViewMode("visual")}
                  className={`px-3 py-1 rounded-full text-xs font-medium transition-all cursor-pointer ${
                    viewMode === "visual"
                      ? "bg-white text-slate-900 shadow-2xs"
                      : "text-slate-500 hover:text-slate-800"
                  }`}
                >
                  Gráfico
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode("code")}
                  className={`px-3 py-1 rounded-full text-xs font-medium transition-all cursor-pointer ${
                    viewMode === "code"
                      ? "bg-white text-slate-900 shadow-2xs"
                      : "text-slate-500 hover:text-slate-800"
                  }`}
                >
                  Código
                </button>
              </div>
            )}
          </div>

          {/* Descripción del Diagrama (para diagramas PlantUML) */}
          {selectedKey !== "mockups" && (
            <div className="pb-3 text-xs text-slate-600 border-b border-slate-100 mb-3 shrink-0">
              <p className="leading-relaxed whitespace-normal break-words">
                <strong className="text-slate-800 font-semibold">{currentDiagram.title}:</strong>{" "}
                {currentDiagram.description}
              </p>
            </div>
          )}

          {/* Main Canvas Area */}
          <div className="flex-1 flex flex-col min-h-[460px] relative mb-2">
            {selectedKey === "mockups" ? (
              <MockupsView
                mockups={mockups}
                onUpdateMockup={onUpdateMockups}
                projectId={projectId}
                selectedScreen={selectedScreen}
                onSelectScreen={setSelectedScreen}
                requirements={requirements}
              />
            ) : viewMode === "visual" ? (
              <div className="flex-1 flex flex-col relative min-h-0">
                <PlantUMLViewer
                  key={selectedKey + (currentDiagram.plantumlCode || currentDiagram.code)}
                  code={currentDiagram.plantumlCode || currentDiagram.code}
                  title={currentDiagram.title}
                  diagramType={selectedKey}
                  hierarchicalDescription={currentDiagram.descripcion_jerarquica}
                />
              </div>
            ) : (
              <div className="flex-1 flex flex-col min-h-[460px] bg-slate-50 border border-slate-200 rounded-2xl p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] font-mono text-slate-500">PlantUML Source</span>
                  <span className="text-[11px] text-slate-400">Edición en tiempo real</span>
                </div>
                <textarea
                  value={currentDiagram.plantumlCode || currentDiagram.code || ""}
                  onChange={(e) => onUpdateDiagramCode(selectedKey, e.target.value)}
                  rows={16}
                  className="flex-1 w-full bg-white border border-slate-200 rounded-xl p-3 text-xs font-mono text-slate-800 focus:outline-none focus:border-blue-600 resize-none leading-relaxed"
                  spellCheck="false"
                />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* CHAT INTELIGENTE UNIFICADO: Detecta automáticamente el diagrama o mockup activo */}
      <div className="w-full shrink-0 border-t border-slate-200 bg-white z-10 px-6 md:px-12 py-3.5">
        <div className="max-w-6xl mx-auto w-full flex flex-col gap-2">
          {correctionFeedback && (
            <div
              className={`text-xs px-3 py-1.5 rounded-lg flex items-center justify-between gap-2 ${
                correctionFeedback.type === "success"
                  ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
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
            {/* Input de Ajustes IA Inteligente y Contextual */}
            <form
              onSubmit={handleSendCorrection}
              className="flex-1 flex items-center bg-slate-50 hover:bg-slate-100/60 focus-within:bg-white border border-slate-300 focus-within:border-blue-500 rounded-full px-3 py-1.5 transition-all shadow-2xs"
            >
              <BrainGearsIcon size={16} className="text-blue-600 mr-2 shrink-0" />

              {/* Badge Contextual que indica el artefacto exacto que se está refinando */}
              <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-blue-100/80 text-blue-700 border border-blue-200/80 shrink-0 mr-2 max-w-[160px] truncate">
                {contextInfo.badge}
              </span>

              <input
                type="text"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                disabled={isFixing}
                placeholder={contextInfo.placeholder}
                className="flex-1 bg-transparent text-xs text-slate-800 placeholder:text-slate-400 outline-none min-w-0"
              />

              <button
                type="submit"
                disabled={!prompt.trim() || isFixing}
                className="p-1 text-blue-600 hover:text-blue-700 disabled:text-slate-300 transition-colors cursor-pointer shrink-0 ml-1"
                title={`Aplicar ajuste con IA a ${contextInfo.badge}`}
              >
                {isFixing ? (
                  <div className="w-3.5 h-3.5 border-2 border-blue-600/30 border-t-blue-600 rounded-full animate-spin"></div>
                ) : (
                  <Send size={14} />
                )}
              </button>
            </form>

            {/* Botón de Aprobación Escalonada: Modelado -> Mockups -> Documento */}
            <button
              type="button"
              onClick={selectedKey !== "mockups" ? () => setSelectedKey("mockups") : onApprovePhase}
              className="px-5 py-2.5 bg-[#0b57d0] hover:bg-[#0947a8] text-white rounded-full text-xs font-semibold flex items-center gap-1.5 transition-all shadow-xs cursor-pointer shrink-0"
            >
              <Check size={14} />
              <span>{selectedKey !== "mockups" ? "Aprobar Modelado y Pasar a Mockups" : "Aprobar y Pasar a Documento"}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
