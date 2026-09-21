import React, { useEffect, useState } from "react";
import mermaid from "mermaid";
import { getPlantUMLSvgUrl } from "../utils/plantumlEncoder";

export default function StaticDiagram({ code, plantumlCode, caption }) {
  const [svgContent, setSvgContent] = useState("");
  const [imgUrl, setImgUrl] = useState("");

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

  if (!svgContent && !imgUrl) {
    return (
      <div className="py-8 text-center text-xs text-slate-400 italic bg-slate-50 border border-slate-200 rounded-xl my-3">
        Renderizando imagen del diagrama...
      </div>
    );
  }

  return (
    <figure className="my-5 p-4 bg-white border border-slate-200 rounded-xl flex flex-col items-center justify-center shadow-xs">
      <div className="w-full flex justify-center overflow-x-auto py-2">
        {svgContent ? (
          <div dangerouslySetInnerHTML={{ __html: svgContent }} />
        ) : (
          <img src={imgUrl} alt={caption || "Diagrama"} className="max-w-full h-auto" />
        )}
      </div>
      {caption && (
        <figcaption className="text-[11px] text-slate-500 mt-2 font-medium text-center">
          {caption}
        </figcaption>
      )}
    </figure>
  );
}
