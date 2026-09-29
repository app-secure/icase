import React, { useEffect, useState } from "react";
import mermaid from "mermaid";
import { ZoomIn, ZoomOut, RotateCcw, Maximize2, X, MoveHorizontal } from "lucide-react";
import { getPlantUMLSvgUrl } from "../utils/plantumlEncoder";

export default function StaticDiagram({ code, plantumlCode, caption }) {
  const [svgContent, setSvgContent] = useState("");
  const [imgUrl, setImgUrl] = useState("");
  const [zoomLevel, setZoomLevel] = useState(1);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    let isMounted = true;

    async function loadDiagram() {
      // 1. Priorizar PlantUML / Structurizr C4
      const puml = (plantumlCode && plantumlCode.trim()) || (code && code.includes("@start") ? code.trim() : null);
      if (puml) {
        try {
          const url = getPlantUMLSvgUrl(puml);
          if (!isMounted) return;
          setImgUrl(url);

          const res = await fetch(url);
          if (res.ok) {
            const text = await res.text();
            if (!text.includes("Error line") && isMounted) {
              setSvgContent(text);
              return;
            }
          }
        } catch (e) {
          console.warn("PlantUML static load error:", e);
        }
      }

      // 2. Fallback a Mermaid
      if (code && code.trim() && !code.includes("@start")) {
        const id = "static-mermaid-" + Math.random().toString(36).substring(2, 9);
        try {
          const isValid = await mermaid.parse(code.trim()).catch(() => false);
          if (isValid) {
            const { svg } = await mermaid.render(id, code.trim());
            if (isMounted) setSvgContent(svg);
          }
        } catch (err) {
          document.querySelectorAll('.error-icon, [id^="dmermaid"]').forEach((el) => el.remove());
          console.warn("Error renderizando diagrama estático Mermaid:", err);
        }
      }
    }

    loadDiagram();

    return () => {
      isMounted = false;
    };
  }, [code, plantumlCode]);

  const handleZoomIn = () => setZoomLevel((z) => Math.min(z + 0.2, 2.5));
  const handleZoomOut = () => setZoomLevel((z) => Math.max(z - 0.2, 0.6));
  const handleResetZoom = () => setZoomLevel(1);

  if (!svgContent && !imgUrl) {
    return (
      <div className="py-8 text-center text-xs text-slate-400 italic bg-slate-50 border border-slate-200 rounded-xl my-3">
        Renderizando imagen del diagrama...
      </div>
    );
  }

  return (
    <>
      <figure className="my-5 p-4 bg-white border border-slate-200 rounded-xl flex flex-col shadow-xs overflow-hidden">
        {/* Barra superior del diagrama con controles de zoom y scroll */}
        <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 mb-2 border-b border-slate-100 text-xs text-slate-500">
          <div className="flex items-center gap-1.5 font-medium text-slate-700">
            <MoveHorizontal size={14} className="text-blue-600" />
            <span className="text-[11px] text-slate-600">Desplazamiento horizontal ↔ disponible</span>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={handleZoomOut}
              className="p-1 rounded-md hover:bg-slate-100 text-slate-600 hover:text-slate-900 transition-colors cursor-pointer"
              title="Reducir zoom"
            >
              <ZoomOut size={14} />
            </button>
            <span className="text-[11px] font-mono px-1 text-slate-600 min-w-[38px] text-center">
              {Math.round(zoomLevel * 100)}%
            </span>
            <button
              type="button"
              onClick={handleZoomIn}
              className="p-1 rounded-md hover:bg-slate-100 text-slate-600 hover:text-slate-900 transition-colors cursor-pointer"
              title="Aumentar zoom"
            >
              <ZoomIn size={14} />
            </button>
            <button
              type="button"
              onClick={handleResetZoom}
              className="p-1 rounded-md hover:bg-slate-100 text-slate-600 hover:text-slate-900 transition-colors cursor-pointer"
              title="Restablecer tamaño (100%)"
            >
              <RotateCcw size={13} />
            </button>
            <button
              type="button"
              onClick={() => setIsFullscreen(true)}
              className="p-1 rounded-md hover:bg-slate-100 text-blue-600 hover:text-blue-800 transition-colors cursor-pointer ml-1"
              title="Ver en pantalla completa"
            >
              <Maximize2 size={14} />
            </button>
          </div>
        </div>

        {/* Contenedor scrolleable horizontalmente sin cortes */}
        <div className="w-full overflow-x-auto overflow-y-auto max-h-[650px] p-3 bg-slate-50/70 border border-slate-200/80 rounded-lg custom-scrollbar">
          <div
            style={{
              transform: `scale(${zoomLevel})`,
              transformOrigin: "top left",
              transition: "transform 0.15s ease-out"
            }}
            className="min-w-fit inline-block"
          >
            {svgContent ? (
              <div
                className="[&_svg]:max-w-none [&_svg]:h-auto inline-block align-top"
                dangerouslySetInnerHTML={{ __html: svgContent }}
              />
            ) : (
              <img
                src={imgUrl}
                alt={caption || "Diagrama"}
                className="max-w-none h-auto inline-block align-top"
              />
            )}
          </div>
        </div>

        {caption && (
          <figcaption className="text-[11px] text-slate-500 mt-2 font-medium text-center">
            {caption}
          </figcaption>
        )}
      </figure>

      {/* Modal Pantalla Completa para inspeccionar diagramas muy anchos o complejos */}
      {isFullscreen && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-xs flex flex-col p-4 md:p-6 animate-fade-in">
          <div className="flex items-center justify-between pb-3 text-white border-b border-slate-800">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-sm">{caption || "Visualizador de Diagrama Completo"}</span>
              <span className="text-[11px] text-slate-400">({Math.round(zoomLevel * 100)}%)</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleZoomOut}
                className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
                title="Reducir"
              >
                <ZoomOut size={16} />
              </button>
              <button
                type="button"
                onClick={handleZoomIn}
                className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
                title="Aumentar"
              >
                <ZoomIn size={16} />
              </button>
              <button
                type="button"
                onClick={handleResetZoom}
                className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
                title="Restablecer"
              >
                <RotateCcw size={15} />
              </button>
              <button
                type="button"
                onClick={() => setIsFullscreen(false)}
                className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors ml-2"
                title="Cerrar pantalla completa"
              >
                <X size={18} />
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-auto p-6 flex items-start justify-center">
            <div
              style={{
                transform: `scale(${zoomLevel})`,
                transformOrigin: "top center",
                transition: "transform 0.15s ease-out"
              }}
              className="bg-white p-6 rounded-2xl shadow-2xl inline-block max-w-none"
            >
              {svgContent ? (
                <div
                  className="[&_svg]:max-w-none [&_svg]:h-auto"
                  dangerouslySetInnerHTML={{ __html: svgContent }}
                />
              ) : (
                <img src={imgUrl} alt={caption || "Diagrama"} className="max-w-none h-auto" />
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
