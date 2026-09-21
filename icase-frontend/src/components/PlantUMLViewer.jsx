import React, { useEffect, useState } from "react";
import { ZoomIn, ZoomOut, RotateCcw, Copy, Check, Download, AlertCircle, RefreshCw } from "lucide-react";
import { getPlantUMLSvgUrl } from "../utils/plantumlEncoder";

export default function PlantUMLViewer({ code, title }) {
  const [svgUrl, setSvgUrl] = useState("");
  const [svgContent, setSvgContent] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [renderError, setRenderError] = useState(null);
  const [copied, setCopied] = useState(false);
  const [zoom, setZoom] = useState(1);

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
    <div className="flex flex-col h-full bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-xs">
      {/* Top Toolbar */}
      <div className="flex items-center justify-between px-4 py-2 bg-slate-50 border-b border-slate-200 text-xs text-slate-600">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-slate-800">{title || "Diagrama"}</span>
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={handleZoomOut}
            title="Alejar"
            className="p-1 hover:bg-slate-200/70 rounded text-slate-600 transition-colors"
          >
            <ZoomOut size={14} />
          </button>
          <span className="text-[11px] font-mono text-slate-500 w-10 text-center">
            {Math.round(zoom * 100)}%
          </span>
          <button
            onClick={handleZoomIn}
            title="Acercar"
            className="p-1 hover:bg-slate-200/70 rounded text-slate-600 transition-colors"
          >
            <ZoomIn size={14} />
          </button>
          <button
            onClick={handleResetZoom}
            title="Restablecer"
            className="p-1 hover:bg-slate-200/70 rounded text-slate-600 transition-colors mr-2"
          >
            <RotateCcw size={14} />
          </button>

          <button
            onClick={handleDownload}
            title="Descargar SVG vectorial"
            className="flex items-center gap-1 px-2.5 py-1 bg-white hover:bg-slate-100 text-slate-700 rounded-full border border-slate-200 text-xs transition-colors"
          >
            <Download size={12} />
            <span>SVG</span>
          </button>

          <button
            onClick={handleCopy}
            title="Copiar código PlantUML"
            className="flex items-center gap-1 px-2.5 py-1 bg-white hover:bg-slate-100 text-slate-700 rounded-full border border-slate-200 text-xs transition-colors"
          >
            {copied ? <Check size={12} className="text-emerald-600" /> : <Copy size={12} />}
            <span>{copied ? "Copiado" : "Copiar"}</span>
          </button>
        </div>
      </div>

      {/* Render Area with Auto-Fit Scaling */}
      <div className="relative flex-1 overflow-auto bg-white flex flex-col items-center justify-start min-h-[380px] p-2">
        {isLoading ? (
          <div className="flex flex-col items-center gap-3 text-slate-500 text-xs py-16">
            <RefreshCw size={24} className="animate-spin text-blue-600" />
            <span>Renderizando diagrama en alta definición...</span>
          </div>
        ) : renderError ? (
          <div className="max-w-md p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-xs flex items-start gap-2 m-6">
            <AlertCircle size={16} className="mt-0.5 shrink-0 text-red-500" />
            <div>
              <p className="font-semibold mb-1">Aviso de renderizado:</p>
              <pre className="text-xs whitespace-pre-wrap">{renderError}</pre>
            </div>
          </div>
        ) : svgContent ? (
          <div
            className="diagram-canvas-container transition-transform duration-150 ease-out origin-center"
            style={{ transform: zoom !== 1 ? `scale(${zoom})` : undefined }}
            dangerouslySetInnerHTML={{ __html: svgContent }}
          />
        ) : svgUrl ? (
          <div
            className="diagram-canvas-container transition-transform duration-150 ease-out origin-center"
            style={{ transform: zoom !== 1 ? `scale(${zoom})` : undefined }}
          >
            <img
              src={svgUrl}
              alt={title}
              className="drop-shadow-xs"
            />
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center gap-2 text-slate-400 py-16">
            <span className="text-sm font-medium text-slate-500">No hay diagrama disponible</span>
            <span className="text-xs text-slate-400">Puedes solicitar a la IA su generación o escribir código PlantUML.</span>
          </div>
        )}
      </div>
    </div>
  );
}
