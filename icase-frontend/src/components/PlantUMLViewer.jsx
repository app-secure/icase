import React, { useEffect, useState } from "react";
import { ZoomIn, ZoomOut, RotateCcw, Copy, Check, Download, AlertCircle, RefreshCw, Maximize2, X, MoveHorizontal } from "lucide-react";
import { getPlantUMLSvgUrl } from "../utils/plantumlEncoder";

export default function PlantUMLViewer({ code, title }) {
  const [svgUrl, setSvgUrl] = useState("");
  const [svgContent, setSvgContent] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [renderError, setRenderError] = useState(null);
  const [copied, setCopied] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    let isMounted = true;

    async function loadDiagram() {
      if (!code || !code.trim() || code.includes("No hay diagrama disponible")) {
        setSvgUrl("");
        setSvgContent("");
        setRenderError(null);
        return;
      }

      setSvgUrl("");
      setSvgContent("");
      setIsLoading(true);
      setRenderError(null);

      try {
        const url = getPlantUMLSvgUrl(code);
        if (!isMounted) return;
        setSvgUrl(url);

        try {
          const res = await fetch(url);
          if (res.ok) {
            const text = await res.text();
            if (text.includes("<svg") && !text.includes("bad URL") && !text.includes("HUFFMAN")) {
              if (text.includes("Syntax Error?") || text.includes("[From string (line") || text.includes("cannot use expression")) {
                if (isMounted) {
                  setRenderError("Error de sintaxis en el código PlantUML. Puedes editarlo en la pestaña 'Código' o solicitar una corrección a la IA.");
                  setSvgContent("");
                }
              } else {
                if (isMounted) setSvgContent(text);
              }
            }
          }
        } catch (fetchErr) {
          console.warn("[PlantUML] Fetch inline omitido, usando tag img fallback:", fetchErr);
        }

        if (isMounted) {
          setIsLoading(false);
        }
      } catch (err) {
        console.warn("PlantUML error:", err);
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    loadDiagram();

    return () => {
      isMounted = false;
    };
  }, [code]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "Escape" && isFullscreen) {
        setIsFullscreen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isFullscreen]);

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    if (!svgUrl) return;
    const link = document.createElement("a");
    link.href = svgUrl;
    link.download = `${title?.toLowerCase().replace(/\s+/g, "_") || "diagrama"}.svg`;
    link.target = "_blank";
    link.click();
  };

  const handleZoomIn = () => setZoom((prev) => Math.min(prev + 0.15, 2.5));
  const handleZoomOut = () => setZoom((prev) => Math.max(prev - 0.15, 0.5));
  const handleResetZoom = () => setZoom(1);

  return (
    <>
      <div className="flex flex-col h-full bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-xs">
        {/* Top Toolbar con indicador de scroll horizontal, zoom, pantalla completa y acciones */}
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 bg-slate-50 border-b border-slate-200 text-xs text-slate-600">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-slate-800">{title || "Diagrama"}</span>
            <span className="hidden sm:flex items-center gap-1 text-[11px] text-slate-500 font-normal pl-2 border-l border-slate-200">
              <MoveHorizontal size={13} className="text-blue-600" />
              <span>Desplazamiento horizontal ↔ disponible</span>
            </span>
          </div>

          <div className="flex items-center gap-1.5 flex-wrap">
            <button
              onClick={handleZoomOut}
              title="Alejar"
              className="p-1 hover:bg-slate-200/70 rounded text-slate-600 transition-colors cursor-pointer"
            >
              <ZoomOut size={14} />
            </button>
            <span className="text-[11px] font-mono text-slate-600 min-w-[38px] text-center">
              {Math.round(zoom * 100)}%
            </span>
            <button
              onClick={handleZoomIn}
              title="Acercar"
              className="p-1 hover:bg-slate-200/70 rounded text-slate-600 transition-colors cursor-pointer"
            >
              <ZoomIn size={14} />
            </button>
            <button
              onClick={handleResetZoom}
              title="Restablecer tamaño (100%)"
              className="p-1 hover:bg-slate-200/70 rounded text-slate-600 transition-colors cursor-pointer"
            >
              <RotateCcw size={13} />
            </button>

            <button
              onClick={() => setIsFullscreen(true)}
              title="Ver en pantalla completa"
              className="p-1 hover:bg-slate-200/70 rounded text-blue-600 hover:text-blue-800 transition-colors cursor-pointer"
            >
              <Maximize2 size={14} />
            </button>
          </div>
        </div>

        {/* Contenedor scrolleable horizontalmente y verticalmente sin cortes ni restricciones */}
        <div className="relative flex-1 w-full overflow-x-auto overflow-y-auto max-h-[680px] p-4 bg-slate-50/60 custom-scrollbar flex items-start justify-center">
          {isLoading ? (
            <div className="flex flex-col items-center gap-3 text-slate-500 text-xs py-20 m-auto">
              <RefreshCw size={24} className="animate-spin text-blue-600" />
              <span>Renderizando diagrama en alta definición...</span>
            </div>
          ) : renderError ? (
            <div className="max-w-md p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-xs flex items-start gap-2 m-auto">
              <AlertCircle size={16} className="mt-0.5 shrink-0 text-red-500" />
              <div>
                <p className="font-semibold mb-1">Aviso de renderizado:</p>
                <pre className="text-xs whitespace-pre-wrap">{renderError}</pre>
              </div>
            </div>
          ) : svgContent ? (
            <div
              style={{
                transform: `scale(${zoom})`,
                transformOrigin: "top left",
                transition: "transform 0.15s ease-out"
              }}
              className="min-w-fit inline-block m-auto"
            >
              <div
                className="[&_svg]:max-w-none [&_svg]:h-auto inline-block align-top drop-shadow-xs"
                dangerouslySetInnerHTML={{ __html: svgContent }}
              />
            </div>
          ) : svgUrl ? (
            <div
              style={{
                transform: `scale(${zoom})`,
                transformOrigin: "top left",
                transition: "transform 0.15s ease-out"
              }}
              className="min-w-fit inline-block m-auto"
            >
              <img
                src={svgUrl}
                alt={title}
                className="max-w-none h-auto inline-block align-top drop-shadow-xs"
              />
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center gap-2 text-slate-400 py-20 m-auto">
              <span className="text-sm font-medium text-slate-500">No hay diagrama disponible</span>
              <span className="text-xs text-slate-400">Puedes solicitar a la IA su generación o escribir código PlantUML.</span>
            </div>
          )}
        </div>
      </div>

      {/* Modal de Pantalla Completa */}
      {isFullscreen && (
        <div className="fixed inset-0 z-50 bg-slate-900/80 backdrop-blur-xs flex flex-col p-4 md:p-6 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl flex-1 flex flex-col shadow-2xl overflow-hidden">
            {/* Header del Modal */}
            <div className="flex items-center justify-between px-5 py-3 border-b border-slate-200 bg-slate-50/80">
              <div className="flex items-center gap-2.5">
                <span className="font-semibold text-slate-800 text-sm">{title || "Diagrama"}</span>
                <span className="text-xs text-slate-500 font-normal hidden sm:inline">• Pantalla Completa</span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleZoomOut}
                  className="p-1.5 rounded-lg hover:bg-slate-200 text-slate-600 transition-colors cursor-pointer"
                  title="Reducir"
                >
                  <ZoomOut size={16} />
                </button>
                <span className="text-xs font-mono px-1.5 text-slate-700 min-w-[42px] text-center">
                  {Math.round(zoom * 100)}%
                </span>
                <button
                  type="button"
                  onClick={handleZoomIn}
                  className="p-1.5 rounded-lg hover:bg-slate-200 text-slate-600 transition-colors cursor-pointer"
                  title="Aumentar"
                >
                  <ZoomIn size={16} />
                </button>
                <button
                  type="button"
                  onClick={handleResetZoom}
                  className="p-1.5 rounded-lg hover:bg-slate-200 text-slate-600 transition-colors cursor-pointer"
                  title="Restablecer (100%)"
                >
                  <RotateCcw size={15} />
                </button>

                <div className="w-px h-5 bg-slate-300 mx-1" />

                <button
                  type="button"
                  onClick={() => setIsFullscreen(false)}
                  className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors cursor-pointer"
                  title="Cerrar (Esc)"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            {/* Canvas de Pantalla Completa con Scroll Libre */}
            <div className="flex-1 overflow-auto p-6 bg-slate-50 flex items-start justify-center custom-scrollbar">
              <div
                style={{
                  transform: `scale(${zoom})`,
                  transformOrigin: "top left",
                  transition: "transform 0.15s ease-out"
                }}
                className="min-w-fit inline-block m-auto"
              >
                {svgContent ? (
                  <div
                    className="[&_svg]:max-w-none [&_svg]:h-auto inline-block align-top bg-white p-4 rounded-xl shadow-xs border border-slate-200"
                    dangerouslySetInnerHTML={{ __html: svgContent }}
                  />
                ) : svgUrl ? (
                  <img
                    src={svgUrl}
                    alt={title}
                    className="max-w-none h-auto inline-block align-top bg-white p-4 rounded-xl shadow-xs border border-slate-200"
                  />
                ) : null}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
