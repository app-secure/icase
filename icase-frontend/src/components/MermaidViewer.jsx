import React, { useEffect, useRef, useState } from "react";
import mermaid from "mermaid";
import { ZoomIn, ZoomOut, RotateCcw, Copy, Check, AlertCircle } from "lucide-react";

mermaid.initialize({
  startOnLoad: false,
  suppressErrorRendering: true,
  theme: "default",
  securityLevel: "loose",
  themeVariables: {
    fontFamily: "Roboto, sans-serif",
    fontSize: "13px",
    primaryColor: "#e8f0fe",
    primaryTextColor: "#1f1f1f",
    primaryBorderColor: "#7cacf8",
    lineColor: "#5f6368",
    secondaryColor: "#f1f3f4",
    tertiaryColor: "#ffffff"
  }
});

export default function MermaidViewer({ code, title }) {
  const containerRef = useRef(null);
  const [svgContent, setSvgContent] = useState("");
  const [renderError, setRenderError] = useState(null);
  const [copied, setCopied] = useState(false);
  const [zoom, setZoom] = useState(1);

  useEffect(() => {
    let isMounted = true;

    async function renderDiagram() {
      // Limpiar cualquier bomb icon previo de mermaid en el DOM
      document.querySelectorAll('.error-icon, [id^="dmermaid"]').forEach((el) => el.remove());

      if (!code || !code.trim()) {
        setSvgContent("");
        setRenderError(null);
        return;
      }

      if (code.includes("@startuml") || code.includes("@startwbs")) {
        if (isMounted) {
          setRenderError("Este diagrama usa sintaxis PlantUML. Selecciona 'PlantUML / C4' arriba para visualizarlo.");
          setSvgContent("");
        }
        return;
      }

      const id = "mermaid-svg-" + Math.random().toString(36).substring(2, 9);
      try {
        setRenderError(null);
        const isValid = await mermaid.parse(code.trim()).catch(() => false);
        if (!isValid) {
          throw new Error("Sintaxis no compatible con Mermaid.");
        }
        const { svg } = await mermaid.render(id, code.trim());
        if (isMounted) {
          setSvgContent(svg);
        }
      } catch (err) {
        document.querySelectorAll('.error-icon, [id^="dmermaid"]').forEach((el) => el.remove());
        if (isMounted) {
          setRenderError("Sintaxis Mermaid en ajuste. Puedes revisar el diagrama en PlantUML / C4 o editar el código fuente.");
          setSvgContent("");
        }
      }
    }

    renderDiagram();

    return () => {
      isMounted = false;
    };
  }, [code]);

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleZoomIn = () => setZoom((prev) => Math.min(prev + 0.15, 2.5));
  const handleZoomOut = () => setZoom((prev) => Math.max(prev - 0.15, 0.5));
  const handleResetZoom = () => setZoom(1);

  return (
    <div className="flex flex-col h-full bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-xs">
      {/* Top Toolbar */}
      <div className="flex items-center justify-between px-4 py-2 bg-slate-50 border-b border-slate-200 text-xs text-slate-600">
        <span className="font-medium text-slate-800">{title || "Diagrama Mermaid"}</span>

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
            onClick={handleCopy}
            className="flex items-center gap-1 px-2.5 py-1 bg-white hover:bg-slate-100 text-slate-700 rounded-full border border-slate-200 text-xs transition-colors"
          >
            {copied ? <Check size={12} className="text-emerald-600" /> : <Copy size={12} />}
            <span>{copied ? "Copiado" : "Copiar"}</span>
          </button>
        </div>
      </div>

      {/* Render Area */}
      <div className="relative flex-1 overflow-auto bg-white flex items-center justify-center min-h-[460px]">
        {renderError ? (
          <div className="max-w-md p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-xs flex items-start gap-2 m-6">
            <AlertCircle size={16} className="mt-0.5 shrink-0 text-red-500" />
            <div>
              <p className="font-semibold mb-1">Aviso de sintaxis Mermaid:</p>
              <pre className="text-xs whitespace-pre-wrap">{renderError}</pre>
            </div>
          </div>
        ) : svgContent ? (
          <div
            ref={containerRef}
            style={{ transform: zoom !== 1 ? `scale(${zoom})` : undefined }}
            className="diagram-canvas-container transition-transform duration-150 ease-out origin-center"
            dangerouslySetInnerHTML={{ __html: svgContent }}
          />
        ) : (
          <div className="text-slate-400 text-xs italic py-16">Cargando visualización del diagrama...</div>
        )}
      </div>
    </div>
  );
}
