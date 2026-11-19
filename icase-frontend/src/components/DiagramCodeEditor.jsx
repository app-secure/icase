import React, { useMemo, useRef, useState, useLayoutEffect } from "react";
import { Search, ChevronUp, ChevronDown, X } from "lucide-react";

export default function DiagramCodeEditor({ value, onChange }) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const editor = useRef(null);
  const matches = useMemo(() => {
    if (!query) return [];
    const text = value.toLowerCase();
    const needle = query.toLowerCase();
    const positions = [];
    let position = text.indexOf(needle);
    while (position !== -1) {
      positions.push(position);
      position = text.indexOf(needle, position + needle.length);
    }
    return positions;
  }, [value, query]);
  const index = matches.length ? active % matches.length : 0;
  useLayoutEffect(() => {
    const element = editor.current;
    if (!element || !matches.length) return;
    const position = matches[index];
    element.setSelectionRange(position, position + query.length);
    const style = window.getComputedStyle(element);
    const lineHeight = parseFloat(style.lineHeight) || 20;
    const line = value.slice(0, position).split("\n").length - 1;
    element.scrollTop = Math.max(0, line * lineHeight - element.clientHeight / 2);
  }, [matches, index, query, value]);
  function navigate(direction) {
    if (!matches.length) return;
    setActive((index + direction + matches.length) % matches.length);
    editor.current?.focus({ preventScroll: true });
  }
  return <>
    <div role="search" aria-label="Buscar en código PlantUML" className="mb-3 flex flex-wrap items-center gap-2 text-xs">
      <label className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 focus-within:border-violet-500">
        <Search size={14} className="shrink-0 text-violet-600" />
        <input aria-label="Buscar en el código" value={query} placeholder="Buscar en el código…" className="w-full min-w-0 bg-transparent text-slate-800 outline-none" onChange={event => { setQuery(event.target.value); setActive(0); }} onKeyDown={event => {
          if (event.key === "Enter") { event.preventDefault(); navigate(event.shiftKey ? -1 : 1); }
          if (event.key === "Escape") { setQuery(""); setActive(0); }
        }} />
      </label>
      <span role="status" className="min-w-16 text-center text-slate-500">{query ? (matches.length ? `${index + 1}/${matches.length}` : "Sin resultados") : ""}</span>
      <button type="button" aria-label="Coincidencia anterior" title="Anterior (Mayús + Enter)" disabled={!matches.length} onClick={() => navigate(-1)} className="cursor-pointer rounded-lg p-2 text-violet-700 disabled:cursor-default disabled:text-slate-300"><ChevronUp size={16} /></button>
      <button type="button" aria-label="Coincidencia siguiente" title="Siguiente (Enter)" disabled={!matches.length} onClick={() => navigate(1)} className="cursor-pointer rounded-lg p-2 text-violet-700 disabled:cursor-default disabled:text-slate-300"><ChevronDown size={16} /></button>
      {query && <button type="button" aria-label="Limpiar búsqueda" onClick={() => { setQuery(""); setActive(0); }} className="cursor-pointer rounded-lg p-2 text-slate-500"><X size={14} /></button>}
    </div>
    <textarea ref={editor} aria-label="Código PlantUML" value={value} onChange={onChange} rows={16} wrap="off" className="flex-1 w-full bg-white border border-slate-200 rounded-xl p-3 text-xs font-mono text-slate-800 focus:outline-none focus:border-violet-600 resize-none leading-relaxed" spellCheck="false" />
  </>;
}
