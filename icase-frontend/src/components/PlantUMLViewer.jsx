import React, { useEffect, useRef, useState, useCallback } from "react";
import { ZoomIn, ZoomOut, RotateCcw, AlertCircle, RefreshCw, Maximize2, X, MoveHorizontal, Scan } from "lucide-react";
import { getPlantUMLSvgUrl } from "../utils/plantumlEncoder";

/**
 * Extrae las dimensiones intrínsecas del SVG a partir de viewBox o width/height
 */
function extractSvgDimensions(svgString) {
  if (!svgString || typeof svgString !== "string") return null;

  const viewBoxMatch = svgString.match(/viewBox=["']\s*([\d.-]+)\s+([\d.-]+)\s+([\d.-]+)\s+([\d.-]+)\s*["']/i);
  if (viewBoxMatch) {
    const w = parseFloat(viewBoxMatch[3]);
    const h = parseFloat(viewBoxMatch[4]);
    if (w > 0 && h > 0) return { width: w, height: h };
  }

  const widthMatch = svgString.match(/width=["']([\d.-]+)(?:px)?["']/i);
  const heightMatch = svgString.match(/height=["']([\d.-]+)(?:px)?["']/i);
  if (widthMatch && heightMatch) {
    const w = parseFloat(widthMatch[1]);
    const h = parseFloat(heightMatch[1]);
    if (w > 0 && h > 0) return { width: w, height: h };
  }

  return null;
}

export default function PlantUMLViewer({ code, title }) {
  const [svgUrl, setSvgUrl] = useState("");
  const [svgContent, setSvgContent] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [renderError, setRenderError] = useState(null);
  const [zoom, setZoom] = useState(1);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [diagramSize, setDiagramSize] = useState(null);
  const canvasRef = useRef(null);
  const fullscreenCanvasRef = useRef(null);
  const autoFittedRef = useRef(false);

  // Calcula y aplica el zoom para ajustar el diagrama al ancho disponible del contenedor
  const fitDiagramToContainer = useCallback((customWidth = null, containerRef = canvasRef) => {
    const dWidth = customWidth || diagramSize?.width;
    if (!dWidth || !containerRef.current) return;

    const availableWidth = Math.max(containerRef.current.clientWidth - 48, 300);
    if (dWidth > availableWidth) {
      const fitZoom = Math.max(0.3, Math.min(1, availableWidth / dWidth));
      setZoom(Number(fitZoom.toFixed(2)));
    } else {
      setZoom(1);
    }
  }, [diagramSize]);

  useEffect(() => {
    let isMounted = true;

    async function loadDiagram() {
      if (!code || !code.trim() || code.includes("No hay diagrama disponible")) {
        setSvgUrl("");
        setSvgContent("");
        setRenderError(null);
        setDiagramSize(null);
        return;
      }

      setSvgUrl("");
      setSvgContent("");
      setDiagramSize(null);
      setZoom(1);
      autoFittedRef.current = false;
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
                if (isMounted) {
                  setSvgContent(text);
                  const dims = extractSvgDimensions(text);
                  if (dims) {
                    setDiagramSize(dims);
                    if (!autoFittedRef.current && canvasRef.current && dims.width > 0) {
                      const avail = Math.max(canvasRef.current.clientWidth - 48, 300);
                      if (dims.width > avail) {
                        const fitZ = Math.max(0.3, Math.min(1, avail / dims.width));
                        setZoom(Number(fitZ.toFixed(2)));
                      }
                      autoFittedRef.current = true;
                    }
                  }
                }
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

  const handleZoomIn = () => setZoom((prev) => Math.min(Number((prev + 0.15).toFixed(2)), 3.0));
  const handleZoomOut = () => setZoom((prev) => Math.max(Number((prev - 0.15).toFixed(2)), 0.25));
  const handleResetZoom = () => setZoom(1);
  const handleFitScreen = () => {
    fitDiagramToContainer(null, isFullscreen ? fullscreenCanvasRef : canvasRef);
  };

  const renderDiagram = (fullscreen = false) => {
    if (!svgContent && !svgUrl) return null;

    const scaledWidth = diagramSize ? Math.round(diagramSize.width * zoom) : null;
    const scaledHeight = diagramSize ? Math.round(diagramSize.height * zoom) : null;

    return (
      <div className="w-full flex justify-start items-start">
        <div
          className="relative shrink-0 mx-auto transition-all duration-150"
          style={
            scaledWidth && scaledHeight
              ? { width: `${scaledWidth}px`, height: `${scaledHeight}px` }
              : undefined
          }
        >
          <div
            style={{
              transform: `scale(${zoom})`,
              transformOrigin: "top left",
              transition: "transform 0.15s ease-out",
              position: scaledWidth ? "absolute" : "relative",
              top: 0,
              left: 0
            }}
            className="inline-block"
          >
            {svgContent ? (
              <div
                className={`[&_svg]:max-w-none [&_svg]:h-auto inline-block align-top ${
                  fullscreen ? "bg-white p-4 rounded-xl shadow-xs border border-slate-200" : "drop-shadow-xs"
                }`}
                dangerouslySetInnerHTML={{ __html: svgContent }}
              />
            ) : (
              <img
                src={svgUrl}
                alt={title}
                onLoad={(event) => {
                  const naturalWidth = event.currentTarget.naturalWidth;
                  const naturalHeight = event.currentTarget.naturalHeight;
                  setDiagramSize({ width: naturalWidth, height: naturalHeight });
                  if (!autoFittedRef.current && canvasRef.current && naturalWidth > 0) {
                    const availableWidth = Math.max(canvasRef.current.clientWidth - 48, 300);
                    if (naturalWidth > availableWidth) {
                      const fitZoom = Math.max(0.3, Math.min(1, availableWidth / naturalWidth));
                      setZoom(Number(fitZoom.toFixed(2)));
                    }
                    autoFittedRef.current = true;
                  }
                }}
                className={`max-w-none h-auto inline-block align-top ${
                  fullscreen ? "bg-white p-4 rounded-xl shadow-xs border border-slate-200" : "drop-shadow-xs"
                }`}
              />
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <>
      <div className="flex flex-col h-full bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-xs">
        {/* Top Toolbar con indicador de scroll horizontal, zoom, pantalla completa y acciones */}
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 bg-slate-50 border-b border-slate-200 text-xs text-slate-600">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-slate-800">{title || "Diagrama"}</span>
            <span className="hidden sm:flex items-center gap-1 text-[11px] text-slate-500 font-normal pl-2 border-l border-slate-200">
              <MoveHorizontal size={13} className="text-blue-600" />
              <span>Desplazamiento panorámico disponible</span>
            </span>
          </div>

          <div className="flex items-center gap-1.5 flex-wrap">
            <button
              onClick={handleZoomOut}
              title="Alejar (-15%)"
              className="p-1 hover:bg-slate-200/70 rounded text-slate-600 transition-colors cursor-pointer"
            >
              <ZoomOut size={14} />
            </button>
            <span className="text-[11px] font-mono text-slate-600 min-w-[38px] text-center">
              {Math.round(zoom * 100)}%
            </span>
            <button
              onClick={handleZoomIn}
              title="Acercar (+15%)"
              className="p-1 hover:bg-slate-200/70 rounded text-slate-600 transition-colors cursor-pointer"
            >
              <ZoomIn size={14} />
            </button>
            <button
              onClick={handleFitScreen}
              title="Ajustar diagrama a la ventana"
              className="p-1 hover:bg-slate-200/70 rounded text-slate-600 transition-colors cursor-pointer flex items-center gap-1"
            >
              <Scan size={13} />
            </button>
            <button
              onClick={handleResetZoom}
              title="Restablecer tamaño real (100%)"
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

        {/* Contenedor scrolleable horizontal y verticalmente sin recortes ni overflow negativo */}
        <div
          ref={canvasRef}
          className="relative flex-1 w-full overflow-auto max-h-[680px] min-h-[420px] p-4 bg-slate-50/60 custom-scrollbar flex items-start justify-start"
        >
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
          ) : svgContent || svgUrl ? (
            renderDiagram()
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
                  onClick={() => fitDiagramToContainer(null, fullscreenCanvasRef)}
                  className="p-1.5 rounded-lg hover:bg-slate-200 text-slate-600 transition-colors cursor-pointer"
                  title="Ajustar a ventana"
                >
                  <Scan size={15} />
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

            {/* Canvas de Pantalla Completa con Scroll Libre y sin recortes */}
            <div
              ref={fullscreenCanvasRef}
              className="flex-1 overflow-auto p-6 bg-slate-50 custom-scrollbar flex items-start justify-start"
            >
              {renderDiagram(true)}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
