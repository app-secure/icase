import React, { useState } from "react";
import {
  Download,
  Copy,
  RotateCcw,
  Plus,
  Layout,
  Loader2,
  AlertCircle,
  Check
} from "lucide-react";
import { generateMockupsApi } from "../services/api";

const prepareMockupHtml = (rawHtml) => {
  if (!rawHtml) return "";
  let html = rawHtml;

  // Asegurar Tailwind CDN
  if (!html.includes("cdn.tailwindcss.com")) {
    if (html.includes("<head>")) {
      html = html.replace(/<head>/i, '<head>\n  <script src="https://cdn.tailwindcss.com"></script>');
    } else {
      html = `<script src="https://cdn.tailwindcss.com"></script>\n` + html;
    }
  }

  // Asegurar Google Fonts Inter
  if (!html.includes("fonts.googleapis.com")) {
    const fontsLink = `  <link rel="preconnect" href="https://fonts.googleapis.com">\n  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap" rel="stylesheet">\n`;
    if (html.includes("<head>")) {
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
      filter: brightness(1.03);
    }
    button:active {
      transform: scale(0.99);
    }
  </style>
  `;

  if (!html.includes("icase-modern-styles")) {
    if (html.includes("</head>")) {
      html = html.replace(/<\/head>/i, `${modernStyles}\n</head>`);
    } else {
      html = modernStyles + html;
    }
  }

  // Configuración de colores primarios y tipografía en Tailwind
  if (!html.includes("tailwind.config")) {
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
    if (html.includes("</head>")) {
      html = html.replace(/<\/head>/i, `${tailwindConfig}\n</head>`);
    }
  }

  return html;
};

// Formatear y capitalizar nombres de pantalla (ej: reserva-mesas-sillas -> Reserva-Mesas-Sillas)
const formatScreenName = (str) => {
  if (!str) return "";
  return str
    .replace(/[-_]+/g, " ")
    .trim()
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
};

const capitalizeFirst = (text) => {
  if (!text) return "";
  return text.charAt(0).toUpperCase() + text.slice(1);
};

export default function MockupsView({
  mockups = [],
  onUpdateMockup,
  projectId,
  selectedScreen = 0,
  onSelectScreen,
  requirements = null
}) {
  const [viewMode, setViewMode] = useState("visual"); // "visual" | "code"
  const [isGeneratingAll, setIsGeneratingAll] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [feedback, setFeedback] = useState(null);

  const currentMockup = mockups[selectedScreen] || mockups[0] || null;

  const handleGenerateAll = async () => {
    if (isGeneratingAll) return;
    if (!projectId) {
      setFeedback({
        type: "error",
        message: "No se encontró el ID del proyecto. Por favor procesa tus fuentes primero en la Fase 1."
      });
      return;
    }
    setIsGeneratingAll(true);
    setFeedback(null);

    try {
      const result = await generateMockupsApi(projectId, [], "", requirements);
      if (result && result.mockups && result.mockups.length > 0) {
        setFeedback({ type: "success", message: `Generados ${result.mockups.length} mockups exitosamente con IA.` });
        if (onUpdateMockup) {
          onUpdateMockup(result.mockups);
        }
        if (onSelectScreen) {
          onSelectScreen(0);
        }
      } else {
        const errorMsg = result?.advertencias?.length
          ? result.advertencias.join(", ")
          : (result?.error || "No se generaron mockups. Intenta de nuevo.");
        setFeedback({ type: "error", message: errorMsg });
      }
    } catch (err) {
      setFeedback({ type: "error", message: err.message || "Error al generar mockups con IA." });
    } finally {
      setIsGeneratingAll(false);
    }
  };

  const handleRegenerateScreen = async () => {
    if (!currentMockup || isRegenerating) return;
    if (!projectId) {
      setFeedback({
        type: "error",
        message: "No se encontró el ID del proyecto en el servidor."
      });
      return;
    }
    setIsRegenerating(true);
    setFeedback(null);

    try {
      const result = await generateMockupsApi(projectId, [currentMockup.nombre_pantalla], "", requirements);
      if (result && result.mockups && result.mockups.length > 0) {
        setFeedback({ type: "success", message: `Mockup "${currentMockup.nombre_pantalla}" regenerado con éxito.` });
        if (onUpdateMockup) {
          onUpdateMockup(result.mockups);
        }
      } else {
        setFeedback({ type: "error", message: result?.error || "No se pudo regenerar esta pantalla." });
      }
    } catch (err) {
      setFeedback({ type: "error", message: err.message || "Error al regenerar pantalla." });
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
    setFeedback({ type: "success", message: "Código HTML copiado al portapapeles." });
  };

  return (
    <div className="w-full flex-1 flex flex-col min-h-0">
      {/* Feedback contextual temporal */}
      {feedback && (
        <div
          className={`mb-3 text-xs px-3 py-1.5 rounded-lg flex items-center justify-between gap-2 shrink-0 ${
            feedback.type === "success"
              ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
              : "bg-red-50 text-red-700 border border-red-200"
          }`}
        >
          <span>{feedback.message}</span>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="text-slate-400 hover:text-slate-600 font-bold ml-2 text-xs cursor-pointer"
          >
            ×
          </button>
        </div>
      )}

      {/* Barra de Controles: Selector elegante en <select> + Acciones */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3 shrink-0">
        <div className="flex items-center gap-2.5 flex-wrap flex-1 min-w-0">
          <div className="flex items-center gap-1.5 shrink-0">
            <Layout size={14} className="text-blue-600" />
            <label className="text-xs font-semibold text-slate-700">Pantalla:</label>
          </div>

          {mockups.length > 0 ? (
            <select
              value={selectedScreen}
              onChange={(e) => {
                const idx = Number(e.target.value);
                if (onSelectScreen) onSelectScreen(idx);
              }}
              className="bg-white border border-slate-300 hover:border-slate-400 text-slate-800 text-xs rounded-xl px-3 py-1.5 font-medium shadow-2xs focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer max-w-xs md:max-w-md truncate"
            >
              {mockups.map((m, idx) => (
                <option key={m.nombre_pantalla || idx} value={idx}>
                  {idx + 1}. {formatScreenName(m.nombre_pantalla)} ({capitalizeFirst(m.tipo || "interfaz")})
                </option>
              ))}
            </select>
          ) : (
            <span className="text-xs text-slate-400 italic">Sin mockups generados aún</span>
          )}

          <button
            type="button"
            onClick={handleGenerateAll}
            disabled={isGeneratingAll}
            className="px-3.5 py-1.5 rounded-xl text-xs font-medium flex items-center gap-1.5 bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 cursor-pointer transition-colors shrink-0"
          >
            <Plus size={13} />
            <span>{mockups.length > 0 ? "Regenerar todos" : "Generar mockups"}</span>
            {isGeneratingAll && <Loader2 size={12} className="animate-spin" />}
          </button>

          {currentMockup && (
            <button
              type="button"
              onClick={handleRegenerateScreen}
              disabled={isRegenerating}
              className="px-3 py-1.5 rounded-xl text-xs font-medium flex items-center gap-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 cursor-pointer transition-colors shrink-0"
              title="Regenerar con IA solo esta pantalla"
            >
              <RotateCcw size={13} />
              <span>Regenerar actual</span>
              {isRegenerating && <Loader2 size={12} className="animate-spin" />}
            </button>
          )}
        </div>

        {/* Controles de vista: Gráfico / Código y acciones */}
        {currentMockup && (
          <div className="flex items-center gap-2 shrink-0">
            <div className="flex items-center bg-slate-100 p-0.5 rounded-xl border border-slate-200">
              <button
                type="button"
                onClick={() => setViewMode("visual")}
                className={`px-3 py-1 rounded-lg text-xs font-medium transition-all cursor-pointer ${
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
                className={`px-3 py-1 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                  viewMode === "code"
                    ? "bg-white text-slate-900 shadow-2xs"
                    : "text-slate-500 hover:text-slate-800"
                }`}
              >
                Código
              </button>
            </div>

            <button
              type="button"
              onClick={handleDownloadHtml}
              className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
              title="Descargar archivo HTML del mockup"
            >
              <Download size={14} />
            </button>
            <button
              type="button"
              onClick={handleCopyHtml}
              className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
              title="Copiar código HTML"
            >
              <Copy size={14} />
            </button>
          </div>
        )}
      </div>

      {/* Área del Mockup: 100% ajustada al ancho de la sección derecha sin contenedor limitante */}
      <div className="w-full flex-1 flex flex-col min-h-[580px] relative mb-3">
        {currentMockup ? (
          viewMode === "visual" ? (
            <div className="w-full flex-1 flex flex-col min-h-[580px] bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-xs">
              <iframe
                srcDoc={prepareMockupHtml(currentMockup.preview_code)}
                sandbox="allow-scripts allow-same-origin"
                className="w-full flex-1 min-h-[580px] border-0"
                title={`Mockup: ${currentMockup.nombre_pantalla}`}
              />
            </div>
          ) : (
            <div className="w-full flex-1 flex flex-col min-h-[580px] bg-slate-50 border border-slate-200 rounded-2xl p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-mono text-slate-500">HTML & Tailwind Source</span>
                <span className="text-[11px] text-slate-400">Edición directa</span>
              </div>
              <textarea
                value={currentMockup.preview_code}
                onChange={(e) => {
                  const newCode = e.target.value;
                  if (onUpdateMockup) {
                    onUpdateMockup(currentMockup.nombre_pantalla, newCode);
                  }
                }}
                rows={20}
                className="flex-1 w-full bg-white border border-slate-200 rounded-xl p-3 text-xs font-mono text-slate-800 focus:outline-none focus:border-blue-600 resize-none leading-relaxed"
                spellCheck="false"
              />
            </div>
          )
        ) : (
          <div className="w-full flex-1 flex flex-col items-center justify-center text-center p-12 bg-slate-50 border border-slate-200 rounded-2xl min-h-[480px]">
            <div className="w-14 h-14 rounded-2xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600 mb-4 shadow-xs">
              <Layout size={28} />
            </div>
            <h3 className="text-base font-semibold text-slate-800 mb-1">
              Wireframes y Mockups de Interfaz
            </h3>
            <p className="text-xs text-slate-500 max-w-md leading-relaxed">
              Genera pantallas hiper-específicas alineadas a los Requerimientos ISO/IEC/IEEE 29148:2018 y a las Clases de Dominio del sistema usando el botón de la barra superior.
            </p>
          </div>
        )}
      </div>

      {/* DESCRIPCIÓN DEL MOCKUP: Con el mismo estilo limpio, numerado y tipográfico de los requerimientos */}
      {currentMockup && (
        <div className="pt-4 mt-2 border-t border-slate-200/80 space-y-2 text-slate-700 text-sm shrink-0">
          <div className="flex items-start gap-3">
            <span className="font-semibold text-slate-800 text-sm mt-0.5">
              {(selectedScreen + 1)}.
            </span>
            <div className="flex-1 space-y-1.5">
              <p className="leading-relaxed">
                <strong className="text-slate-900 font-semibold">{formatScreenName(currentMockup.nombre_pantalla)}:</strong>{" "}
                {capitalizeFirst(currentMockup.descripcion)}
              </p>

              <p className="text-xs text-slate-500">
                <strong className="text-slate-700">Tipo:</strong> {capitalizeFirst(currentMockup.tipo || "interfaz")} •{" "}
                <strong className="text-slate-700">RF Cubiertos:</strong> {currentMockup.rf_trazabilidad?.join(", ") || "N/A"} •{" "}
                <strong className="text-slate-700">Estado:</strong> {capitalizeFirst(currentMockup.estado || "generado")} (v{currentMockup.version || 1})
              </p>

              {currentMockup.descripcion_jerarquica && currentMockup.descripcion_jerarquica.length > 0 && (
                <div className="pt-1 space-y-1 text-xs text-slate-600">
                  <p className="font-semibold text-slate-700">Estructura y Trazabilidad Operativa:</p>
                  <ul className="list-disc pl-5 space-y-0.5">
                    {currentMockup.descripcion_jerarquica.map((item, i) => {
                      const cleanItem = String(item).replace(/^[•\-\*]\s*/, "");
                      return <li key={i}>{cleanItem}</li>;
                    })}
                  </ul>
                </div>
              )}

              {currentMockup.acciones_principales && currentMockup.acciones_principales.length > 0 && (
                <p className="text-xs text-slate-500 pt-0.5">
                  <strong className="text-slate-700">Acciones del usuario:</strong>{" "}
                  {currentMockup.acciones_principales.join(", ")}
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}