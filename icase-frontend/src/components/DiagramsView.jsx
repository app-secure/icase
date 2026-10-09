import React, { useState } from "react";
import {
  GitBranch,
  Network,
  Box,
  Compass,
  Check,
  Send,
  Layout,
  Server,
  Workflow,
  LockKeyhole,
  RefreshCw,
  AlertTriangle,
  History,
  Save
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
  onLoadDiagramVersions,
  onRestoreDiagramVersion,
  onGenerateDiagram,
  onApproveDiagram,
  onRejectDiagram,
  onApproveMockups,
  isDiagramsApproved = false,
  onBackToAnalysis,
  onApplyAiCorrection,
  projectId,
  requirements = null,
  diagramFlow = null,
  isGeneratingDiagram = false
}) {
  const [selectedKey, setSelectedKey] = useState(isDiagramsApproved ? "mockups" : "useCase");
  const [viewMode, setViewMode] = useState("visual"); // "visual" | "code"
  const [selectedScreen, setSelectedScreen] = useState(0);
  const [prompt, setPrompt] = useState("");
  const [isFixing, setIsFixing] = useState(false);
  const [correctionFeedback, setCorrectionFeedback] = useState(null);
  const [showReviewPanel, setShowReviewPanel] = useState(false);
  const [reviewComment, setReviewComment] = useState("");
  const [isReviewing, setIsReviewing] = useState(false);
  const [codeDrafts, setCodeDrafts] = useState({});
  const [isSavingCode, setIsSavingCode] = useState(false);
  const [versionHistory, setVersionHistory] = useState(null);
  const [showVersionHistory, setShowVersionHistory] = useState(false);
  const [restoringVersion, setRestoringVersion] = useState(null);

  const options = [
    { key: "useCase", type: "casos_de_uso", label: "Casos de Uso", icon: GitBranch },
    { key: "classDiagram", type: "clases_dominio", label: "Clases de Dominio", icon: Box },
    { key: "architecture", type: "arquitectura_software", label: "Arquitectura de Software", icon: Network },
    { key: "systemArchitecture", type: "arquitectura_sistema", label: "Arquitectura del Sistema", icon: Server },
    { key: "designClassDiagram", type: "clases_diseno", label: "Clases de Diseño", icon: Workflow },
    { key: "navigationTree", type: "arbol_navegacion", label: "Árbol de Navegación", icon: Compass },
    { key: "mockups", label: "Mockups", icon: Layout }
  ];

  const currentOption = options.find((option) => option.key === selectedKey);
  const currentDiagram = diagrams?.[selectedKey] || null;
  const currentFlowItem = currentOption?.type
    ? diagramFlow?.items?.find((item) => item.tipo === currentOption.type)
    : null;
  const currentState = selectedKey === "mockups"
    ? (isDiagramsApproved ? "disponible" : "bloqueado")
    : currentFlowItem?.estado || currentDiagram?.status || (currentDiagram ? "pendiente_revision" : "bloqueado");
  const originVersions = currentFlowItem?.diagrama?.versiones_origen || currentDiagram?.originVersions || {};
  const staleReasons = currentFlowItem?.motivos_desactualizacion?.length
    ? currentFlowItem.motivos_desactualizacion
    : currentDiagram?.staleReasons || [];
  const qualityStatus = currentFlowItem?.diagrama?.estado_calidad || currentDiagram?.qualityStatus;
  const validationWarnings = currentFlowItem?.diagrama?.advertencias_validacion || currentDiagram?.validationWarnings || [];
  const validationErrors = currentFlowItem?.diagrama?.errores_validacion || currentDiagram?.validationErrors || [];
  const qualityInvalid = qualityStatus === "invalido" || validationErrors.length > 0;
  const reviewHistory = currentFlowItem?.diagrama?.revisiones || currentDiagram?.reviewHistory || [];
  const latestRejectedReview = [...reviewHistory].reverse().find((review) => review.decision === "rechazado");
  const persistedCode = currentDiagram?.plantumlCode || currentDiagram?.code || "";
  const codeDraft = Object.prototype.hasOwnProperty.call(codeDrafts, selectedKey)
    ? codeDrafts[selectedKey]
    : persistedCode;
  const hasUnsavedCode = codeDraft !== persistedCode;

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
      case "systemArchitecture":
        return {
          badge: "Arquitectura del Sistema",
          placeholder: "Pide un ajuste de infraestructura, despliegue o disponibilidad..."
        };
      case "classDiagram":
        return {
          badge: "Clases de Dominio",
          placeholder: "Pide un ajuste a Clases con IA (ej: 'añade entidad Factura con atributos monto y fecha')..."
        };
      case "designClassDiagram":
        return {
          badge: "Clases de Diseño",
          placeholder: "Pide un ajuste a controladores, servicios, repositorios o DTO..."
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

  const handleApproveCurrentStage = async () => {
    setCorrectionFeedback(null);
    let result;
    if (selectedKey === "mockups") {
      result = await onApproveMockups?.();
    } else if (!currentDiagram || ["disponible", "desactualizado", "rechazado"].includes(currentState) || qualityInvalid) {
      result = await onGenerateDiagram?.(currentOption?.type);
    } else {
      result = await onApproveDiagram?.(currentOption?.type);
    }

    if (result?.success === false) {
      setCorrectionFeedback({ type: "error", message: result.error });
      return;
    }
    if (selectedKey !== "mockups") {
      const nextType = result?.flow?.siguiente;
      const nextOption = options.find((option) => option.type === nextType);
      if (nextOption) {
        setSelectedKey(nextOption.key);
        setShowVersionHistory(false);
      } else if (result?.flow?.todos_aprobados) {
        setSelectedKey("mockups");
        setShowVersionHistory(false);
      }
      setCorrectionFeedback({
        type: "success",
        message: result?.flow?.todos_aprobados
          ? "Todos los diagramas fueron aprobados. Ya puedes generar los mockups."
          : currentDiagram && currentState !== "desactualizado"
            ? "Diagrama aprobado. Se habilitó el siguiente artefacto."
            : "Diagrama generado. Revísalo antes de aprobarlo."
      });
    }
  };

  const handleRejectCurrentDiagram = async () => {
    if (reviewComment.trim().length < 5 || isReviewing) return;
    setIsReviewing(true);
    setCorrectionFeedback(null);
    try {
      const result = await onRejectDiagram?.(currentOption?.type, reviewComment.trim());
      if (result?.success === false) {
        setCorrectionFeedback({ type: "error", message: result.error });
        return;
      }
      setShowReviewPanel(false);
      setReviewComment("");
      setCorrectionFeedback({
        type: "success",
        message: "Se solicitaron cambios. La próxima regeneración incluirá estas observaciones."
      });
    } finally {
      setIsReviewing(false);
    }
  };

  const handleSaveCode = async () => {
    if (!hasUnsavedCode || isSavingCode) return;
    setIsSavingCode(true);
    const result = await onUpdateDiagramCode?.(selectedKey, codeDraft);
    setIsSavingCode(false);
    if (result?.success !== false) {
      setCodeDrafts((drafts) => {
        const next = { ...drafts };
        delete next[selectedKey];
        return next;
      });
    }
    setCorrectionFeedback(result?.success === false
      ? { type: "error", message: result.error || "No se pudo guardar el código." }
      : { type: "success", message: "Nueva versión guardada. La aprobación anterior fue retirada." });
  };

  const handleToggleVersionHistory = async () => {
    const nextVisible = !showVersionHistory;
    setShowVersionHistory(nextVisible);
    if (nextVisible && versionHistory?.diagramId !== currentDiagram?.id) {
      try {
        const versions = await onLoadDiagramVersions?.(selectedKey);
        setVersionHistory({ ...versions, diagramId: currentDiagram?.id });
      } catch (error) {
        setCorrectionFeedback({ type: "error", message: error.message });
        setShowVersionHistory(false);
      }
    }
  };

  const handleRestoreVersion = async (version) => {
    setRestoringVersion(version);
    const result = await onRestoreDiagramVersion?.(selectedKey, version);
    setRestoringVersion(null);
    if (result?.success === false) {
      setCorrectionFeedback({ type: "error", message: result.error });
      return;
    }
    setShowVersionHistory(false);
    setVersionHistory(null);
    setCorrectionFeedback({
      type: "success",
      message: `Se restauró la versión ${version} como una nueva versión pendiente de aprobación.`
    });
  };

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
      <div className={`w-full flex-1 overflow-y-auto min-h-0 pt-6 pb-4 flex flex-col ${selectedKey === "mockups" ? "px-4" : "px-6 md:px-12"}`}>
        <div className={`${selectedKey === "mockups" ? "max-w-none" : "max-w-6xl"} mx-auto w-full flex-1 flex flex-col min-h-0`}>
          {/* Cabecera superior unificada de Fase 2 */}
          <div className="pb-3 mb-3 border-b border-slate-100 flex items-center justify-between shrink-0">
            <div>
              <span className="text-[11px] font-semibold text-[#7C3AED] uppercase tracking-wider block">
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
                const flowItem = opt.type ? diagramFlow?.items?.find((item) => item.tipo === opt.type) : null;
                const optionState = opt.key === "mockups"
                  ? (isDiagramsApproved ? "disponible" : "bloqueado")
                  : flowItem?.estado || diagrams?.[opt.key]?.status || (diagrams?.[opt.key] ? "pendiente_revision" : "bloqueado");
                const isBlocked = optionState === "bloqueado" || (opt.key === "mockups" && !isDiagramsApproved);
                return (
                  <button
                    key={opt.key}
                    disabled={isBlocked}
                    title={isBlocked ? `Bloqueado hasta aprobar: ${flowItem?.unmet_dependencies?.join(", ") || "los diagramas anteriores"}` : undefined}
                    onClick={() => {
                      if (isBlocked) return;
                      setSelectedKey(opt.key);
                      setShowVersionHistory(false);
                      setCorrectionFeedback(null);
                    }}
                    className={`px-3.5 py-1.5 rounded-full text-xs font-medium flex items-center gap-1.5 transition-all cursor-pointer ${
                      isSelected
                        ? "bg-slate-900 text-white shadow-xs"
                        : isBlocked
                          ? "bg-slate-50 text-slate-300 cursor-not-allowed"
                          : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                    }`}
                  >
                    {isBlocked ? <LockKeyhole size={13} /> : <Icon size={14} />}
                    <span>{opt.label}</span>
                    {optionState === "aprobado" && <Check size={12} className="text-emerald-500" />}
                    {optionState === "desactualizado" && <RefreshCw size={12} className="text-amber-500" />}
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
                <strong className="text-slate-800 font-semibold">{currentDiagram?.title || currentOption?.label}:</strong>{" "}
                {currentDiagram?.description || (currentState === "disponible"
                  ? "Este diagrama ya puede generarse porque sus dependencias fueron aprobadas."
                  : "Aprueba los artefactos anteriores para habilitar su generación.")}
              </p>
              {currentDiagram && (
                <div className="mt-2 flex flex-wrap items-center gap-2 text-[10px] text-slate-500">
                  <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 font-medium text-slate-700">
                    Versión {currentDiagram.version || currentFlowItem?.diagrama?.version || 1}
                  </span>
                  {(currentFlowItem?.diagrama?.restaurada_desde_version || currentDiagram.restoredFromVersion) && (
                    <span className="rounded-full bg-sky-50 px-2 py-0.5 text-sky-700">
                      Restaurada desde v{currentFlowItem?.diagrama?.restaurada_desde_version || currentDiagram.restoredFromVersion}
                    </span>
                  )}
                  {Object.entries(originVersions).map(([type, version]) => (
                    <span key={type} className="rounded-full bg-violet-50 px-2 py-0.5 text-violet-700">
                      {type.replaceAll("_", " ")} · v{version}
                    </span>
                  ))}
                  {currentState === "aprobado" && (currentFlowItem?.diagrama?.aprobado_en || currentDiagram.approvedAt) && (
                    <span className="text-emerald-700">
                      Aprobado {new Date(currentFlowItem?.diagrama?.aprobado_en || currentDiagram.approvedAt).toLocaleString("es-ES")}
                    </span>
                  )}
                </div>
              )}
              {currentState === "desactualizado" && staleReasons.length > 0 && (
                <div className="mt-2 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-800">
                  <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                  <div>
                    <p className="font-semibold">Debe regenerarse antes de aprobarse</p>
                    {staleReasons.map((reason) => <p key={reason}>• {reason}</p>)}
                  </div>
                </div>
              )}
              {currentDiagram && qualityStatus && (
                <div className={`mt-2 rounded-lg border px-3 py-2 text-[11px] ${
                  qualityInvalid
                    ? "border-red-200 bg-red-50 text-red-700"
                    : qualityStatus === "advertencia"
                      ? "border-amber-200 bg-amber-50 text-amber-800"
                      : "border-emerald-200 bg-emerald-50 text-emerald-700"
                }`}>
                  <p className="font-semibold">Control de calidad: {qualityStatus}</p>
                  {validationErrors.map((message) => <p key={message}>• {message}</p>)}
                  {validationWarnings.map((message) => <p key={message}>• {message}</p>)}
                </div>
              )}
              {currentState === "rechazado" && latestRejectedReview?.observaciones && (
                <div className="mt-2 rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-[11px] text-violet-800">
                  <p className="font-semibold">Cambios solicitados para la versión {latestRejectedReview.version}</p>
                  <p>{latestRejectedReview.observaciones}</p>
                </div>
              )}
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
            ) : !currentDiagram ? (
              <div className="flex-1 min-h-[460px] border border-dashed border-slate-300 rounded-2xl bg-slate-50 flex flex-col items-center justify-center text-center p-8">
                {currentState === "disponible" ? (
                  <>
                    <Workflow size={32} className="text-violet-500 mb-3" />
                    <p className="text-sm font-semibold text-slate-800">{currentOption?.label} está disponible</p>
                    <p className="text-xs text-slate-500 mt-1 max-w-md">Se generará usando exclusivamente los requisitos y diagramas anteriores que ya aprobaste.</p>
                  </>
                ) : (
                  <>
                    <LockKeyhole size={30} className="text-slate-300 mb-3" />
                    <p className="text-sm font-semibold text-slate-600">Diagrama bloqueado</p>
                    <p className="text-xs text-slate-400 mt-1">Primero aprueba: {currentFlowItem?.unmet_dependencies?.join(", ") || "los artefactos anteriores"}.</p>
                  </>
                )}
              </div>
            ) : viewMode === "visual" ? (
              <div className="flex-1 flex flex-col relative min-h-0">
                <PlantUMLViewer
                  key={selectedKey + (currentDiagram?.plantumlCode || currentDiagram?.code)}
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
                  <div className="flex items-center gap-2">
                    <button type="button" onClick={handleToggleVersionHistory} className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] text-slate-600 hover:border-violet-300">
                      <History size={12} /> Historial
                    </button>
                    <button type="button" onClick={handleSaveCode} disabled={!hasUnsavedCode || isSavingCode} className="flex items-center gap-1 rounded-lg bg-violet-700 px-2 py-1 text-[11px] font-semibold text-white disabled:bg-slate-300">
                      <Save size={12} /> {isSavingCode ? "Guardando..." : "Guardar versión"}
                    </button>
                  </div>
                </div>
                {showVersionHistory && (
                  <div className="mb-3 max-h-40 overflow-y-auto rounded-xl border border-slate-200 bg-white p-2">
                    <p className="mb-1 text-[11px] font-semibold text-slate-700">Versión actual: {versionHistory?.actual?.version || currentDiagram?.version || 1}</p>
                    {versionHistory?.historial?.length ? versionHistory.historial.map((entry) => (
                      <div key={`${entry.version}-${entry.guardado_en}`} className="flex items-center justify-between border-t border-slate-100 py-1.5 text-[11px]">
                        <span className="text-slate-600">Versión {entry.version} · {entry.guardado_en ? new Date(entry.guardado_en).toLocaleString("es-ES") : "sin fecha"}</span>
                        <button type="button" disabled={restoringVersion !== null} onClick={() => handleRestoreVersion(entry.version)} className="font-semibold text-violet-700 disabled:text-slate-300">
                          {restoringVersion === entry.version ? "Restaurando..." : "Restaurar"}
                        </button>
                      </div>
                    )) : <p className="py-2 text-[11px] text-slate-400">Todavía no hay versiones anteriores.</p>}
                  </div>
                )}
                <textarea
                  value={codeDraft}
                  onChange={(e) => setCodeDrafts((drafts) => ({ ...drafts, [selectedKey]: e.target.value }))}
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
      <div className={`w-full shrink-0 border-t border-slate-200 bg-white z-10 py-3.5 ${selectedKey === "mockups" ? "px-4" : "px-6 md:px-12"}`}>
        <div className={`${selectedKey === "mockups" ? "max-w-none" : "max-w-6xl"} mx-auto w-full flex flex-col gap-2`}>
          {showReviewPanel && selectedKey !== "mockups" && (
            <div className="rounded-xl border border-violet-200 bg-violet-50 p-3">
              <label className="mb-1 block text-xs font-semibold text-violet-900">Observaciones para la siguiente versión</label>
              <textarea
                value={reviewComment}
                onChange={(event) => setReviewComment(event.target.value)}
                placeholder="Explica concretamente qué debe corregirse antes de aprobar..."
                rows={2}
                className="w-full resize-none rounded-lg border border-violet-200 bg-white px-3 py-2 text-xs text-slate-800 outline-none focus:border-violet-500"
              />
              <div className="mt-2 flex justify-end gap-2">
                <button type="button" onClick={() => setShowReviewPanel(false)} className="rounded-full px-3 py-1.5 text-xs text-slate-600 hover:bg-white">Cancelar</button>
                <button
                  type="button"
                  onClick={handleRejectCurrentDiagram}
                  disabled={reviewComment.trim().length < 5 || isReviewing}
                  className="rounded-full bg-violet-700 px-3 py-1.5 text-xs font-semibold text-white disabled:bg-slate-300"
                >
                  {isReviewing ? "Guardando..." : "Solicitar cambios"}
                </button>
              </div>
            </div>
          )}
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
                disabled={isFixing || (selectedKey !== "mockups" && !currentDiagram)}
                placeholder={contextInfo.placeholder}
                className="flex-1 bg-transparent text-xs text-slate-800 placeholder:text-slate-400 outline-none min-w-0"
              />

              <button
                type="submit"
                disabled={!prompt.trim() || isFixing || (selectedKey !== "mockups" && !currentDiagram)}
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

            {selectedKey !== "mockups" && currentDiagram && !["aprobado", "desactualizado", "rechazado"].includes(currentState) && (
              <button
                type="button"
                onClick={() => setShowReviewPanel((visible) => !visible)}
                className="rounded-full border border-violet-200 px-4 py-2.5 text-xs font-semibold text-violet-700 hover:bg-violet-50"
              >
                Solicitar cambios
              </button>
            )}

            {/* Botón de Aprobación Escalonada: Modelado -> Mockups -> Documento */}
            <button
              type="button"
              onClick={handleApproveCurrentStage}
              disabled={isGeneratingDiagram || currentState === "bloqueado" || (selectedKey !== "mockups" && currentState === "aprobado")}
              className="px-5 py-2.5 bg-[#7C3AED] hover:bg-[#6D28D9] disabled:bg-slate-200 disabled:text-slate-400 text-white rounded-full text-xs font-semibold flex items-center gap-1.5 transition-all shadow-xs cursor-pointer disabled:cursor-not-allowed shrink-0"
            >
              {isGeneratingDiagram ? <RefreshCw size={14} className="animate-spin" /> : <Check size={14} />}
              <span>{selectedKey === "mockups"
                ? "Aprobar Mockups y Pasar a Documento"
                : currentState === "aprobado"
                  ? "Diagrama aprobado"
                  : currentDiagram && !["desactualizado", "rechazado"].includes(currentState) && !qualityInvalid
                    ? `Aprobar ${currentOption?.label}`
                    : isGeneratingDiagram
                      ? "Generando diagrama..."
                      : `${qualityInvalid || currentState === "rechazado" ? "Regenerar" : "Generar"} ${currentOption?.label}`}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
