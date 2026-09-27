import React, { useState, useCallback, useEffect } from "react";
import {
  LogIn,
  LayoutDashboard,
  List,
  FileText,
  BarChart3,
  Settings,
  Monitor,
  Tablet,
  Smartphone,
  Download,
  Copy,
  RotateCcw,
  Plus,
  Code,
  Layout,
  Check,
  Send,
  Loader2,
  AlertCircle,
  X
} from "lucide-react";
import BrainGearsIcon from "./BrainGearsIcon";
import { generateMockupsApi } from "../services/api";

const ICON_MAP = {
  login: LogIn,
  dashboard: LayoutDashboard,
  list: List,
  form: FileText,
  detail: FileText,
  chart: BarChart3,
  settings: Settings,
  otro: Layout
};

const VIEWPORTS = [
  { key: "desktop", label: "Escritorio (1280px)", width: 1280, icon: Monitor },
  { key: "tablet", label: "Tablet (768px)", width: 768, icon: Tablet },
  { key: "mobile", label: "Móvil (390px)", width: 390, icon: Smartphone }
];

const prepareMockupHtml = (rawHtml) => {
  if (!rawHtml) return '';
  let html = rawHtml;

  // Asegurar Tailwind CDN
  if (!html.includes('cdn.tailwindcss.com')) {
    if (html.includes('<head>')) {
      html = html.replace(/<head>/i, '<head>\n  <script src="https://cdn.tailwindcss.com"></script>');
    } else {
      html = `<script src="https://cdn.tailwindcss.com"></script>\n` + html;
    }
  }

  // Asegurar Google Fonts Inter
  if (!html.includes('fonts.googleapis.com')) {
    const fontsLink = `  <link rel="preconnect" href="https://fonts.googleapis.com">\n  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap" rel="stylesheet">\n`;
    if (html.includes('<head>')) {
      html = html.replace(/<head>/i, `<head>\n${fontsLink}`);
    }
  }

  // Estilos modernos de respaldo y elevación estética
  const modernStyles = `
  <style id="icase-modern-styles">
    *, *::before, *::after { box-sizing: border-box; }
    html, body {
      font-family: 'Inter', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif !important;
      margin: 0;
      padding: 0;
      background-color: #f8fafc;
      color: #0f172a;
      -webkit-font-smoothing: antialiased;
      -moz-osx-font-smoothing: grayscale;
    }
    input, select, textarea, button {
      font-family: inherit;
    }
    .bg-slate-50 { background-color: #f8fafc; }
    .bg-slate-100 { background-color: #f1f5f9; }
    .bg-white { background-color: #ffffff; }
    .text-slate-900 { color: #0f172a; }
    .text-slate-800 { color: #1e293b; }
    .text-slate-700 { color: #334155; }
    .text-slate-600 { color: #475569; }
    .text-slate-500 { color: #64748b; }
    .text-slate-400 { color: #94a3b8; }
    .border-slate-200 { border-color: #e2e8f0; }
    .border-slate-300 { border-color: #cbd5e1; }
    .rounded-2xl { border-radius: 1rem; }
    .rounded-xl { border-radius: 0.75rem; }
    .rounded-lg { border-radius: 0.5rem; }
    .rounded-full { border-radius: 9999px; }
    .shadow-2xl { box-shadow: 0 25px 50px -12px rgba(0,0,0,0.15); }
    .shadow-xl { box-shadow: 0 20px 25px -5px rgba(0,0,0,0.08), 0 8px 10px -6px rgba(0,0,0,0.04); }
    .shadow-lg { box-shadow: 0 10px 15px -3px rgba(0,0,0,0.08), 0 4px 6px -4px rgba(0,0,0,0.04); }
    .shadow-md { box-shadow: 0 4px 6px -1px rgba(0,0,0,0.08), 0 2px 4px -2px rgba(0,0,0,0.04); }
    .shadow-sm { box-shadow: 0 1px 2px 0 rgba(0,0,0,0.05); }
    input[type="text"], input[type="email"], input[type="password"], select, textarea {
      outline: none;
      transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
    }
    input[type="text"]:focus, input[type="email"]:focus, input[type="password"]:focus, select:focus, textarea:focus {
      border-color: #0b57d0 !important;
      box-shadow: 0 0 0 3px rgba(11, 87, 208, 0.15) !important;
    }
    button {
      cursor: pointer;
      transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
    }
    button:hover {
      filter: brightness(1.05);
    }
    button:active {
      transform: scale(0.98);
    }
  </style>
  `;

  if (!html.includes('icase-modern-styles')) {
    if (html.includes('</head>')) {
      html = html.replace(/<\/head>/i, `${modernStyles}\n</head>`);
    } else {
      html = modernStyles + html;
    }
  }

  // Configuración de colores primarios y tipografía en Tailwind
  if (!html.includes('tailwind.config')) {
    const tailwindConfig = `
  <script>
    tailwind.config = {
      theme: {
        extend: {
          fontFamily: {
            sans: ['Inter', 'system-ui', 'sans-serif'],
          },
          colors: {
            primary: {
              50: '#eff6ff',
              100: '#dbeafe',
              500: '#0b57d0',
              600: '#0947a8',
              700: '#073d8c',
            },
            secondary: {
              500: '#64748b',
              600: '#475569',
            }
          }
        }
      }
    }
  </script>
    `;
    if (html.includes('</head>')) {
      html = html.replace(/<\/head>/i, `${tailwindConfig}\n</head>`);
    }
  }

  return html;
};

export default function MockupsView({
  mockups = [],
  onUpdateMockup,
  onApprovePhase,
  onBackToDiagrams,
  projectId
}) {
  const [selectedScreen, setSelectedScreen] = useState(0);
  const [viewMode, setViewMode] = useState("visual");
  const [viewport, setViewport] = useState("desktop");
  const [prompt, setPrompt] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [correctionFeedback, setCorrectionFeedback] = useState(null);
  const [generatePrompt, setGeneratePrompt] = useState("");
  const [isGeneratingAll, setIsGeneratingAll] = useState(false);

  const currentMockup = mockups[selectedScreen];
  const currentViewport = VIEWPORTS.find(v => v.key === viewport) || VIEWPORTS[0];

  const handleSendCorrection = async (e) => {
    e?.preventDefault();
    if (!prompt.trim() || !projectId) return;

    const text = prompt;
    setCorrectionFeedback(null);
    setIsRegenerating(true);

    try {
      const pantallasToUpdate = currentMockup ? [currentMockup.nombre_pantalla] : [];
      const result = await generateMockupsApi(projectId, pantallasToUpdate, text);
      if (result && result.mockups && result.mockups.length > 0) {
        setCorrectionFeedback({ type: "success", message: `Ajuste aplicado correctamente con IA` });
        setPrompt("");
        if (onUpdateMockup) {
          onUpdateMockup(result.mockups);
        }
      } else {
        setCorrectionFeedback({ type: "error", message: "La IA no devolvió mockups para este ajuste." });
      }
    } catch (err) {
      setCorrectionFeedback({ type: "error", message: err.message || "Error al aplicar ajuste con IA." });
    } finally {
      setIsRegenerating(false);
    }
  };

  const handleGenerateAll = async () => {
    if (isGeneratingAll || !projectId) return;
    setIsGeneratingAll(true);
    setCorrectionFeedback(null);

    try {
      const result = await generateMockupsApi(projectId, [], '');
      if (result && result.mockups && result.mockups.length > 0) {
        setCorrectionFeedback({ type: "success", message: `Generados ${result.mockups.length} mockups exitosamente` });
        if (onUpdateMockup) {
          onUpdateMockup(result.mockups);
        }
      } else {
        const errorMsg = result?.advertencias?.length
          ? result.advertencias.join(', ')
          : "No se generaron mockups. Verifica que el proyecto tenga requerimientos.";
        setCorrectionFeedback({ type: "error", message: errorMsg });
      }
    } catch (err) {
      setCorrectionFeedback({ type: "error", message: err.message || "Error generando mockups" });
    } finally {
      setIsGeneratingAll(false);
    }
  };

  const handleRegenerateScreen = async () => {
    if (!currentMockup || isRegenerating || !projectId) return;
    setIsRegenerating(true);
    setCorrectionFeedback(null);

    try {
      const result = await generateMockupsApi(projectId, [currentMockup.nombre_pantalla], '');
      if (result && result.mockups && result.mockups.length > 0) {
        setCorrectionFeedback({ type: "success", message: `Mockup ${currentMockup.nombre_pantalla} regenerado exitosamente` });
        if (onUpdateMockup) {
          onUpdateMockup(result.mockups);
        }
      } else {
        setCorrectionFeedback({ type: "error", message: "No se pudo regenerar el mockup." });
      }
    } catch (err) {
      setCorrectionFeedback({ type: "error", message: err.message || "Error al regenerar mockup." });
    } finally {
      setIsRegenerating(false);
    }
  };

  const handleDownloadHtml = () => {
    if (!currentMockup) return;
    const blob = new Blob([currentMockup.preview_code], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${currentMockup.nombre_pantalla}.html`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleCopyHtml = () => {
    if (!currentMockup) return;
    navigator.clipboard.writeText(currentMockup.preview_code);
    setCorrectionFeedback({ type: "success", message: "HTML copiado al portapapeles" });
  };

  const handleIframeLoad = () => {
    // Iframe loaded successfully
  };

  const handleIframeError = () => {
    setCorrectionFeedback({ type: "error", message: "Error cargando el mockup en el iframe" });
  };

  return (
    <div className="w-full h-full flex flex-col min-h-0 bg-white">
      <div className="w-full flex-1 overflow-y-auto min-h-0 px-6 md:px-12 pt-6 pb-4 flex flex-col">
        <div className="max-w-6xl mx-auto w-full flex-1 flex flex-col min-h-0">
          {/* Upper Phase Indicator */}
          <div className="pb-3 mb-3 border-b border-slate-100 flex items-center justify-between shrink-0">
            <div>
              <span className="text-[11px] font-semibold text-blue-600 uppercase tracking-wider block">
                Fase 2: Modelado del Software
              </span>
              <h2 className="text-xl font-normal text-slate-900 tracking-tight mt-0.5">
                Wireframes y Mockups de Interfaz
              </h2>
            </div>

            <button
              onClick={onBackToDiagrams}
              className="text-xs text-slate-500 hover:text-slate-800 transition-colors cursor-pointer"
            >
              ← Volver a Diagramas
            </button>
          </div>

          {/* Screen Pills + Viewport Selector */}
          <div className="flex flex-wrap items-center justify-between gap-3 mb-3 shrink-0">
            <div className="flex flex-wrap items-center gap-2 min-w-0 flex-1">
              {mockups.map((m, idx) => {
                const Icon = ICON_MAP[m.tipo] || Layout;
                const isSelected = selectedScreen === idx;
                return (
                  <button
                    key={m.nombre_pantalla}
                    onClick={() => setSelectedScreen(idx)}
                    className={`px-3.5 py-1.5 rounded-full text-xs font-medium flex items-center gap-1.5 transition-all cursor-pointer shrink-0 ${
                      isSelected
                        ? "bg-slate-900 text-white shadow-xs"
                        : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                    }`}
                    title={`${m.tipo} • ${m.estado} v${m.version}`}
                  >
                    <Icon size={14} />
                    <span className="truncate max-w-[120px]">{m.nombre_pantalla}</span>
                    {m.estado === 'editado' && (
                      <span className="text-[10px] bg-amber-100 text-amber-700 px-1.5 rounded">EDIT</span>
                    )}
                  </button>
                );
              })}
              {mockups.length < 6 && (
                <button
                  onClick={handleGenerateAll}
                  disabled={isGeneratingAll}
                  className="px-3.5 py-1.5 rounded-full text-xs font-medium flex items-center gap-1.5 transition-all cursor-pointer bg-blue-50 text-blue-600 hover:bg-blue-100 border border-blue-200"
                >
                  <Plus size={14} />
                  <span>Generar mockups</span>
                  {isGeneratingAll && <Loader2 size={12} className="animate-spin" />}
                </button>
              )}
            </div>

            {/* Viewport Selector + View Mode */}
            <div className="flex items-center gap-2 shrink-0">
              <select
                value={viewport}
                onChange={(e) => setViewport(e.target.value)}
                className="px-3 py-1.5 text-xs font-medium bg-slate-100 border border-slate-200 rounded-full cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {VIEWPORTS.map(v => (
                  <option key={v.key} value={v.key}>{v.label}</option>
                ))}
              </select>

              <div className="flex items-center bg-slate-100 p-0.5 rounded-full">
                <button
                  type="button"
                  onClick={() => setViewMode("visual")}
                  className={`px-3 py-1 rounded-full text-xs font-medium transition-all cursor-pointer ${
                    viewMode === "visual"
                      ? "bg-white text-slate-900 shadow-2xs"
                      : "text-slate-500 hover:text-slate-800"
                  }`}
                >
                  Diseño
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
            </div>
          </div>

          {/* Mockup Description */}
          {currentMockup && (
            <div className="pb-3 text-xs text-slate-600 border-b border-slate-100 mb-3 shrink-0">
              <p className="leading-relaxed whitespace-normal break-words">
                <strong className="text-slate-800 font-semibold">{currentMockup.nombre_pantalla}:</strong>{" "}
                {currentMockup.descripcion}
              </p>
              {currentMockup.descripcion_jerarquica && currentMockup.descripcion_jerarquica.length > 0 && (
                <ul className="list-disc pl-5 mt-1.5 space-y-1 text-[11px] text-slate-500">
                  {currentMockup.descripcion_jerarquica.map((item, i) => (
                    <li key={i}>{item}</li>
                  ))}
                </ul>
              )}
              <div className="flex flex-wrap gap-2 mt-2 text-[10px]">
                {currentMockup.rf_trazabilidad && currentMockup.rf_trazabilidad.length > 0 && (
                  <span className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded border border-blue-200">
                    RF: {currentMockup.rf_trazabilidad.join(", ")}
                  </span>
                )}
                <span className="px-2 py-0.5 bg-slate-100 text-slate-600 rounded border border-slate-200">
                  Estado: {currentMockup.estado} v{currentMockup.version}
                </span>
                <span className="px-2 py-0.5 bg-slate-100 text-slate-600 rounded border border-slate-200">
                  Tipo: {currentMockup.tipo}
                </span>
              </div>
            </div>
          )}

          {/* Main Canvas Area */}
          <div className="flex-1 flex flex-col min-h-[460px] relative mb-2">
            {currentMockup ? (
              viewMode === "visual" ? (
                <div className="flex-1 border border-slate-200 rounded-2xl bg-slate-100/60 p-2 md:p-4 flex flex-col relative overflow-hidden min-h-[580px]">
                  <div
                    style={{
                      width: `${currentViewport.width}px`,
                      maxWidth: "100%",
                      margin: "0 auto",
                      height: "100%"
                    }}
                    className="flex-1 flex flex-col min-h-[560px] w-full"
                  >
                    <iframe
                      srcDoc={prepareMockupHtml(currentMockup.preview_code)}
                      sandbox="allow-scripts allow-same-origin"
                      className="w-full flex-1 min-h-[560px] border border-slate-200/80 rounded-2xl bg-white shadow-md transition-all"
                      title={`Mockup: ${currentMockup.nombre_pantalla}`}
                      onLoad={handleIframeLoad}
                      onError={handleIframeError}
                    />
                  </div>
                </div>
              ) : (
                <div className="flex-1 flex flex-col min-h-[460px] bg-slate-50 border border-slate-200 rounded-2xl p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[11px] font-mono text-slate-500">HTML Source</span>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={handleDownloadHtml}
                        className="px-2 py-1 text-[10px] text-slate-500 hover:text-slate-700 hover:bg-slate-200 rounded transition-colors flex items-center gap-1"
                        title="Descargar HTML"
                      >
                        <Download size={12} />
                        <span>Descargar</span>
                      </button>
                      <button
                        onClick={handleCopyHtml}
                        className="px-2 py-1 text-[10px] text-slate-500 hover:text-slate-700 hover:bg-slate-200 rounded transition-colors flex items-center gap-1"
                        title="Copiar HTML"
                      >
                        <Copy size={12} />
                        <span>Copiar</span>
                      </button>
                    </div>
                  </div>
                  <textarea
                    value={currentMockup.preview_code}
                    onChange={(e) => {
                      const newCode = e.target.value;
                      const debouncedUpdate = setTimeout(() => {
                        if (onUpdateMockup && currentMockup) {
                          onUpdateMockup(currentMockup.nombre_pantalla, newCode);
                        }
                      }, 800);
                      return () => clearTimeout(debouncedUpdate);
                    }}
                    rows={16}
                    className="flex-1 w-full bg-white border border-slate-200 rounded-xl p-3 text-xs font-mono text-slate-800 focus:outline-none focus:border-blue-600 resize-none leading-relaxed"
                    spellCheck="false"
                  />
                </div>
              )
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-center p-8 bg-slate-50 border border-slate-200 rounded-2xl">
                <Layout className="w-16 h-16 text-slate-300 mb-4" />
                <h3 className="text-lg font-medium text-slate-700 mb-2">No hay mockups generados</h3>
                <p className="text-sm text-slate-500 mb-6 max-w-md">
                  Genera los wireframes y mockups de interfaz para visualizar las pantallas clave del sistema.
                </p>
                <button
                  onClick={handleGenerateAll}
                  disabled={isGeneratingAll}
                  className="px-5 py-2.5 bg-[#0b57d0] hover:bg-[#0947a8] text-white rounded-full text-xs font-semibold flex items-center gap-1.5 transition-all shadow-xs cursor-pointer"
                >
                  <Plus size={14} />
                  <span>Generar mockups</span>
                </button>
              </div>
            )}
          </div>

          {/* Screen Actions */}
          {currentMockup && (
            <div className="flex items-center gap-3 mb-4 shrink-0">
              <button
                onClick={handleRegenerateScreen}
                disabled={isRegenerating}
                className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-full text-xs font-medium flex items-center gap-1.5 transition-all cursor-pointer border border-slate-200"
              >
                <RotateCcw size={14} />
                <span>Regenerar esta pantalla</span>
                {isRegenerating && <Loader2 size={12} className="animate-spin" />}
              </button>
              <button
                onClick={handleDownloadHtml}
                className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-full text-xs font-medium flex items-center gap-1.5 transition-all cursor-pointer border border-slate-200"
              >
                <Download size={14} />
                <span>Descargar HTML</span>
              </button>
              <button
                onClick={handleCopyHtml}
                className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-full text-xs font-medium flex items-center gap-1.5 transition-all cursor-pointer border border-slate-200"
              >
                <Copy size={14} />
                <span>Copiar</span>
              </button>
            </div>
          )}

        </div>
      </div>

      {/* Bottom Approval Bar */}
      <div className="w-full shrink-0 border-t border-slate-200 bg-white z-10 px-6 md:px-12 py-3.5">
        <div className="max-w-6xl mx-auto w-full flex flex-col gap-2">
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
            <form
              onSubmit={handleSendCorrection}
              className="flex-1 flex items-center bg-slate-50 hover:bg-slate-100/60 focus-within:bg-white border border-slate-300 focus-within:border-blue-500 rounded-full px-4 py-1.5 transition-all shadow-2xs"
            >
              <BrainGearsIcon size={16} className="text-blue-600 mr-2 shrink-0" />
              <input
                type="text"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Pide un ajuste a este mockup con IA (ej: 'agrega modo oscuro', 'cambia color primario')..."
                className="flex-1 bg-transparent text-xs text-slate-800 placeholder:text-slate-400 outline-none min-w-0"
              />
              <button
                type="submit"
                disabled={!prompt.trim()}
                className="p-1 text-blue-600 hover:text-blue-700 disabled:text-slate-300 transition-colors cursor-pointer shrink-0 ml-1"
                title="Aplicar ajuste al mockup"
              >
                <Send size={14} />
              </button>
            </form>

            <button
              type="button"
              onClick={onApprovePhase}
              className="px-5 py-2.5 bg-[#0b57d0] hover:bg-[#0947a8] text-white rounded-full text-xs font-semibold flex items-center gap-1.5 transition-all shadow-xs cursor-pointer shrink-0"
            >
              <Check size={14} />
              <span>Aprobar Mockups</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}