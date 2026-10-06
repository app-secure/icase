import React, { useRef, useState } from "react";
import {
  Upload,
  Trash2,
  ArrowLeft,
  Cpu,
  ChevronDown,
  Files,
  PanelLeftOpen,
  PanelLeftClose,
  Pencil,
  Sparkles,
  X,
  Save,
  CheckCircle2
} from "lucide-react";
import RbixLogo from "./RbixLogo";
import BrainGearsIcon from "./BrainGearsIcon";

// Icono estilo NotebookLM: PDF rojo con texto PDF
function NotebookPdfIcon({ size = 22, className = "" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={`shrink-0 ${className}`}>
      <rect x="3.5" y="3.5" width="17" height="17" rx="3.5" stroke="#E53935" strokeWidth="2" fill="white" />
      <text x="12" y="14.8" textAnchor="middle" fontSize="6.8" fontWeight="bold" fill="#E53935" fontFamily="Inter, Arial, sans-serif" letterSpacing="0.2px">
        PDF
      </text>
    </svg>
  );
}

// Icono estilo NotebookLM: Documento de texto azul de Google Docs con líneas
function NotebookDocIcon({ size = 22, className = "" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={`shrink-0 ${className}`}>
      <path
        d="M6 3.5C4.9 3.5 4 4.4 4 5.5v13c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V9.5L14 3.5H6z"
        fill="#7C3AED"
      />
      <path d="M14 3.5V9h5.5L14 3.5z" fill="#90CAF9" />
      <path d="M8 12.5h8M8 15.5h5" stroke="white" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

// Icono estilo NotebookLM: Onda de audio con 3 barras redondeadas
function NotebookAudioIcon({ size = 22, className = "" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={`shrink-0 ${className}`}>
      <rect x="4.5" y="9.5" width="3" height="6" rx="1.5" fill="#7C3AED" />
      <rect x="10.5" y="5" width="3" height="14" rx="1.5" fill="#7C3AED" />
      <rect x="16.5" y="9.5" width="3" height="6" rx="1.5" fill="#7C3AED" />
    </svg>
  );
}

export default function SourcesPanel({
  sources,
  onAddSource,
  onUpdateSource,
  onSuggestSourceMetadata,
  onDeleteSource,
  onProcess,
  isProcessing,
  isProcessed,
  projectName,
  onUpdateProjectName,
  onBackToDashboard,
  selectedProvider,
  onSelectProvider,
  availableProviders = [],
  collapsed = false,
  onToggleCollapsed
}) {
  const [uploadingItem, setUploadingItem] = useState(null);
  const [isEditingName, setIsEditingName] = useState(false);
  const [editedName, setEditedName] = useState("");
  const [localProvider, setLocalProvider] = useState("auto");
  const [activeSourceId, setActiveSourceId] = useState(null);
  const fileInputRef = useRef(null);

  const currentProvider = selectedProvider !== undefined ? selectedProvider : localProvider;

  const handleProviderChange = (val) => {
    setLocalProvider(val);
    if (onSelectProvider) {
      onSelectProvider(val);
    }
  };

  const cleanProjectTitle = (name) => {
    if (!name || name === "Proyecto sin nombre") return "Nuevo Proyecto";
    const cleaned = name
      .replace(/^(Sistema de|Sistema para|Sistema|Software de|Software para|Aplicación de|Plataforma de)\s+/i, "")
      .trim();
    return cleaned ? (cleaned.charAt(0).toUpperCase() + cleaned.slice(1)) : name;
  };

  const handleStartEdit = () => {
    setEditedName(cleanProjectTitle(projectName));
    setIsEditingName(true);
  };

  const handleSaveEdit = () => {
    const trimmed = editedName.trim();
    if (trimmed && onUpdateProjectName && trimmed !== projectName) {
      onUpdateProjectName(trimmed);
    }
    setIsEditingName(false);
  };

  // Garantizar que no existan fuentes duplicadas en el panel visual
  const uniqueSources = React.useMemo(() => {
    const seen = new Set();
    return (sources || []).filter((src) => {
      const key = src.name || src.id;
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [sources]);

  // Si uploadingItem está activo, no duplicarlo en la lista si ya fue agregado al estado del proyecto
  const displayedSources = React.useMemo(() => {
    if (!uploadingItem) return uniqueSources;
    return uniqueSources.filter((s) => s.name !== uploadingItem.name);
  }, [uniqueSources, uploadingItem]);

  const totalSourcesCount = uniqueSources.length + (uploadingItem && !uniqueSources.some((s) => s.name === uploadingItem.name) ? 1 : 0);
  const isAnySourceLoading = Boolean(uploadingItem) || uniqueSources.some((s) => s.isUploading);
  const activeSource = uniqueSources.find((source) => source.id === activeSourceId) || null;

  const sourceGroups = React.useMemo(() => {
    const labels = {
      textos: "Textos",
      documentos: "Documentos",
      audios: "Audios",
      videos: "Videos",
      otros: "Otros"
    };
    const groups = {};
    for (const source of displayedSources) {
      const category = source.category || (source.type === "audio" ? "audios" : source.type === "pdf" ? "documentos" : "textos");
      if (!groups[category]) groups[category] = { label: labels[category] || labels.otros, items: [] };
      groups[category].items.push(source);
    }
    return Object.entries(groups);
  }, [displayedSources]);

  const getFileIcon = (type) => {
    switch (type) {
      case "audio":
        return <NotebookAudioIcon size={22} />;
      case "pdf":
        return <NotebookPdfIcon size={22} />;
      case "txt":
      default:
        return <NotebookDocIcon size={22} />;
    }
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Normalizar caracteres especiales UTF-8 del nombre del archivo (tildes, ñ, etc.)
    const rawName = file.name || "archivo";
    const normalizedName = Array.from(rawName.normalize("NFC"))
      .filter((character) => {
        const code = character.charCodeAt(0);
        return code > 31 && !(code >= 127 && code <= 159);
      })
      .join("")
      .trim();

    const ext = normalizedName.split('.').pop().toLowerCase();
    const mime = (file.type || '').toLowerCase();
    const audioExts = ['mp3', 'wav', 'm4a', 'mp4', 'aac', 'ogg', 'opus', 'webm', 'flac', 'wma'];
    const isAudio = mime.startsWith('audio/') || mime === 'video/mp4' || audioExts.includes(ext);
    const isPdf = mime.includes('pdf') || ext === 'pdf';

    let type = "txt";
    if (isAudio) {
      type = "audio";
    } else if (isPdf) {
      type = "pdf";
    }
    const category = isAudio ? (['mp4', 'webm'].includes(ext) || mime.startsWith('video/') ? "videos" : "audios") : isPdf ? "documentos" : "textos";

    const formattedSize = (file.size / 1024).toFixed(1) + " KB";

    setUploadingItem({
      name: normalizedName,
      type,
      size: formattedSize
    });

    let textContent = "";
    if (type === "txt") {
      try {
        textContent = await file.text();
      } catch (err) {
        console.warn("Error leyendo texto del archivo:", err);
      }
    }

    const newSource = {
      id: "src-" + Date.now(),
      name: normalizedName,
      type,
      category,
      size: formattedSize,
      date: new Date().toLocaleDateString("es-ES"),
      rawFile: file,
      contentSnippet: textContent,
      contentType: "",
      description: "",
      authorOrigin: "",
      documentDate: "",
      tags: [],
      transcriptionVerified: false,
      isUploading: true
    };

    try {
      const savedSource = await onAddSource(newSource);
      if (savedSource?.id && !savedSource.isUploading) setActiveSourceId(savedSource.id);
    } catch (err) {
      console.warn("Error cargando fuente:", err);
    } finally {
      setUploadingItem(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  if (collapsed) {
    return (
      <aside className="w-14 bg-[#171425] border-r border-[#29243B] flex h-full shrink-0 flex-col items-center py-3 text-white shadow-sm">
        <input type="file" ref={fileInputRef} onChange={handleFileUpload} accept=".txt,.pdf,.mp3,.wav,.m4a,.mp4,.aac,.ogg,.opus,.docx" className="hidden" />
        <button type="button" onClick={onBackToDashboard} className="mb-3 rounded-lg p-2 text-slate-300 hover:bg-white/10 hover:text-white" title="Volver a proyectos"><ArrowLeft size={17} /></button>
        <button type="button" onClick={onToggleCollapsed} className="rounded-lg bg-white/10 p-2 text-white hover:bg-white/20" title="Mostrar fuentes"><PanelLeftOpen size={18} /></button>
        <div className="my-3 h-px w-7 bg-white/15" />
        <button type="button" disabled={isAnySourceLoading} onClick={() => fileInputRef.current?.click()} className="relative rounded-lg p-2 text-slate-200 hover:bg-white/10 disabled:opacity-40" title={`Fuentes (${totalSourcesCount})`}><Files size={18} />{totalSourcesCount > 0 && <span className="absolute -right-1 -top-1 min-w-4 rounded-full bg-[#A3FF12] px-1 text-[9px] font-bold leading-4 text-[#171425]">{totalSourcesCount}</span>}</button>
        <div className="mt-auto flex w-full items-center justify-center">
          <RbixLogo size="sm" showText={false} isDark={true} />
        </div>
      </aside>
    );
  }

  return (
    <aside className="w-64 md:w-72 bg-white border-r border-[#E7E3EE] flex flex-col h-full shrink-0 select-none overflow-hidden font-inter relative shadow-xs">

      {/* Hidden File Input */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileUpload}
        accept=".txt,.pdf,.mp3,.wav,.m4a,.mp4,.aac,.ogg,.opus,.docx"
        className="hidden"
      />

      {/* 1. PROJECT TITLE HEADER: Título blanco grande con fondo #1F1D30 */}
      <div className="p-4 border-b border-[#29243B] bg-[#171425] text-white shrink-0 z-10 relative shadow-sm">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onBackToDashboard}
            className="p-1.5 -ml-1 text-slate-300 hover:text-white rounded-lg hover:bg-white/10 transition-colors cursor-pointer shrink-0"
            title="Volver a lista de proyectos"
          >
            <ArrowLeft size={16} />
          </button>

          <div className="flex items-center border-l border-white/20 pl-2.5 ml-0.5 min-w-0 flex-1">
            {isEditingName ? (
              <input
                type="text"
                autoFocus
                value={editedName}
                onChange={(e) => setEditedName(e.target.value)}
                onBlur={handleSaveEdit}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSaveEdit();
                  if (e.key === "Escape") setIsEditingName(false);
                }}
                className="w-full text-sm font-bold text-white bg-white/15 border border-white/30 rounded px-2 py-0.5 outline-hidden ring-1 ring-white/50 font-inter"
              />
            ) : (
              <span
                onClick={handleStartEdit}
                className="text-sm font-bold text-white truncate block cursor-pointer hover:text-slate-200 transition-colors font-inter tracking-tight"
                title={`${cleanProjectTitle(projectName)} (Clic para editar nombre)`}
              >
                {cleanProjectTitle(projectName)}
              </span>
            )}
          </div>
          <button type="button" onClick={onToggleCollapsed} className="rounded-lg p-1.5 text-slate-300 hover:bg-white/10 hover:text-white" title="Ocultar fuentes"><PanelLeftClose size={17} /></button>
        </div>
      </div>

      {/* 2. SOURCES HEADER */}
      <div className="p-4 border-b border-[#E7E3EE] bg-white z-10 relative">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-bold text-slate-800 font-inter">Fuentes</h3>
          {/* Texto neutral sin pintar como solicitó el usuario */}
          <span className="text-xs font-normal text-slate-500 font-inter">
            {totalSourcesCount} {totalSourcesCount === 1 ? "cargada" : "cargadas"}
          </span>
        </div>

        {/* Action Button: Cargar Insumos con altura reducida e icono de adjuntar */}
        <button
          type="button"
          disabled={isAnySourceLoading}
          onClick={() => fileInputRef.current?.click()}
          className="w-full py-2 px-4 bg-white hover:bg-[#FAF9FC] border border-[#D8D1E3] hover:border-[#7C3AED] rounded-xl text-[15px] font-bold text-slate-800 hover:text-[#5B21B6] flex items-center justify-center gap-2.5 transition-all shadow-2xs hover:shadow-xs cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed font-inter group"
        >
          <Upload size={17} className="text-[#7C3AED] group-hover:-translate-y-0.5 transition-transform duration-200 shrink-0" />
          <span className="text-[15px] font-bold tracking-tight">Subir Insumos</span>
        </button>
      </div>

      {/* 3. UPLOADED DOCUMENTS LIST: Diseño limpio y sin bordes estilo NotebookLM */}
      <div className="flex-1 overflow-y-auto p-3 space-y-1 z-10 relative bg-white">
        {/* Efecto de Carga del Archivo en Proceso idéntico a NotebookLM */}
        {uploadingItem && (
          <div className="px-3 py-2.5 rounded-xl bg-[#F2EDFF] border border-[#DDD2F5] flex items-center justify-between gap-3 font-inter transition-all">
            <div className="flex items-center gap-3 min-w-0 flex-1">
              {getFileIcon(uploadingItem.type)}
              <span className="text-[13.5px] font-medium text-slate-700 truncate font-inter tracking-tight">
                {uploadingItem.name}
              </span>
            </div>
            {/* Spinner circular azul estilo Google idéntico a la imagen adjunta */}
            <svg
              className="w-[22px] h-[22px] animate-spin text-[#7C3AED] shrink-0"
              viewBox="0 0 24 24"
              fill="none"
            >
              <circle
                cx="12"
                cy="12"
                r="9.5"
                stroke="currentColor"
                strokeWidth="2.4"
                strokeLinecap="round"
                strokeDasharray="44 20"
              />
            </svg>
          </div>
        )}

        {displayedSources.length === 0 && !uploadingItem ? (
          <div className="py-12 px-4 text-center">
            <p className="text-xs font-bold text-slate-700 font-inter">Sin fuentes todavía</p>
            <p className="text-xs font-normal text-slate-500 mt-1 max-w-[200px] mx-auto font-inter">
              Sube audios, actas o especificaciones para comenzar el análisis.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {sourceGroups.map(([category, group]) => (
              <section key={category}>
                <div className="mb-1.5 flex items-center justify-between px-2">
                  <h4 className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">{group.label}</h4>
                  <span className="text-[10px] text-slate-400">{group.items.length}</span>
                </div>
                <div className="space-y-1">
                  {group.items.map((src) => (
                    <div
                      key={src.id}
                      onClick={() => !src.isUploading && setActiveSourceId(src.id)}
                      className="group cursor-pointer rounded-xl border border-transparent px-2.5 py-2.5 transition-colors hover:border-[#E7E3EE] hover:bg-[#FAF9FC]"
                      title={`${src.name} (${src.size})`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex min-w-0 flex-1 items-center gap-2.5">
                          {getFileIcon(src.type)}
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-[13px] font-medium tracking-tight text-[#202124]">{src.name}</p>
                            <p className="truncate text-[10px] text-slate-500">{src.contentType || "Añadir contexto"}</p>
                          </div>
                        </div>
                        {src.isUploading ? (
                          <svg className="h-5 w-5 shrink-0 animate-spin text-[#7C3AED]" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9.5" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeDasharray="44 20" /></svg>
                        ) : (
                          <div className="flex shrink-0 items-center opacity-0 transition-opacity group-hover:opacity-100">
                            <button type="button" onClick={(event) => { event.stopPropagation(); setActiveSourceId(src.id); }} className="rounded-md p-1 text-slate-400 hover:bg-[#F2EDFF] hover:text-[#7C3AED]" title="Editar detalles"><Pencil size={13} /></button>
                            <button type="button" onClick={(event) => { event.stopPropagation(); onDeleteSource(src.id); }} className="rounded-md p-1 text-slate-400 hover:bg-red-50 hover:text-red-600" title="Quitar fuente"><Trash2 size={13} /></button>
                          </div>
                        )}
                      </div>
                      {src.transcriptionVerified && (src.type === "audio" || src.category === "videos") && <div className="mt-1.5 flex items-center gap-1 pl-8 text-[10px] font-medium text-emerald-700"><CheckCircle2 size={11} />Transcripción revisada</div>}
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>

      {/* 4. ACTION BAR: Selector de IA / Modelo + Botón de Procesar / Reprocesar */}
      <div className="p-3 border-t border-slate-200/80 bg-white/90 backdrop-blur-xs mt-auto shrink-0 z-10 relative space-y-2.5">
        {/* Selector de IA / Modelo */}
        <div>
          <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1 font-inter flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              <Cpu size={13} className="text-[#7C3AED]" />
              Proveedor
            </span>
            {currentProvider !== 'auto' && (
              <span className="text-[10px] text-[#5B21B6] font-semibold bg-[#F2EDFF] px-1.5 py-0.2 rounded border border-[#DDD2F5]">
                Seleccionado
              </span>
            )}
          </label>
          <div className="relative">
            <select
              value={currentProvider}
              onChange={(e) => handleProviderChange(e.target.value)}
              className="w-full text-xs font-semibold text-slate-800 bg-white border border-slate-300 hover:border-[#7C3AED] rounded-xl px-3 py-2 pr-8 outline-hidden focus:ring-2 focus:ring-[#7C3AED]/15 focus:border-[#7C3AED] transition-all cursor-pointer shadow-2xs font-inter appearance-none"
            >
              {Array.isArray(availableProviders) && availableProviders.length > 0 ? (
                availableProviders.map((p) => {
                  const cleanName = (p.nombre || '').replace(/\s*\([^)]*\)/g, '').trim();
                  return (
                    <option key={p.id} value={p.id} disabled={p.disponible === false}>
                      {cleanName || p.nombre}{!p.disponible ? ' — Sin API Key' : ''}
                    </option>
                  );
                })
              ) : (
                <>
                  <option value="auto">Automático</option>
                  <option value="groq">Groq Cloud</option>
                  <option value="gemini">Google Gemini</option>
                  <option value="deepseek">DeepSeek API</option>
                  <option value="openrouter">OpenRouter Fast</option>
                </>
              )}
            </select>
            <div className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
              <ChevronDown size={14} />
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={() => onProcess(currentProvider)}
          disabled={sources.length === 0 || isProcessing || isAnySourceLoading}
          className="w-full py-3 px-6 bg-[#7C3AED] hover:bg-[#6D28D9] disabled:bg-slate-200 disabled:text-slate-400 text-white rounded-full text-sm font-bold flex items-center justify-center gap-2.5 transition-all shadow-md shadow-violet-900/10 hover:shadow-lg cursor-pointer disabled:cursor-not-allowed font-inter hover:scale-[1.01] active:scale-[0.99]"
        >
          {isProcessing ? (
            <>
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
              <span>Analizando con IA...</span>
            </>
          ) : isProcessed ? (
            <>
              <BrainGearsIcon size={20} className="shrink-0" />
              <span>Reprocesar</span>
            </>
          ) : (
            <>
              <BrainGearsIcon size={20} className="shrink-0" />
              <span>Procesar</span>
            </>
          )}
        </button>
      </div>

      {/* 5. BRAND FOOTER DOCK: Solo en la parte inferior donde está el logo */}
      <div
        className="py-2 px-4 bg-[#171425] border-t border-[#29243B] flex items-center justify-center cursor-pointer hover:bg-[#211C34] transition-colors shrink-0 z-10 relative shadow-inner"
        onClick={onBackToDashboard}
        title="RBIX - Volver a Proyectos"
      >
        <RbixLogo size="sm" isDark={true} />
      </div>
      {activeSource && (
        <SourceDetailsModal
          source={activeSource}
          onClose={() => setActiveSourceId(null)}
          onSave={onUpdateSource}
          onSuggest={onSuggestSourceMetadata}
        />
      )}
    </aside>
  );
}

function SourceDetailsModal({ source, onClose, onSave, onSuggest }) {
  const toDraft = React.useCallback((item) => ({
    category: item.category || (item.type === "audio" ? "audios" : item.type === "pdf" ? "documentos" : "textos"),
    contentType: item.contentType || "",
    description: item.description || "",
    authorOrigin: item.authorOrigin || "",
    documentDate: item.documentDate || "",
    tagsText: Array.isArray(item.tags) ? item.tags.join(", ") : "",
    contentSnippet: item.contentSnippet || "",
    transcriptionVerified: Boolean(item.transcriptionVerified),
    aiMetadata: Boolean(item.aiMetadata)
  }), []);
  const [draft, setDraft] = useState(() => toDraft(source));
  const [isSaving, setIsSaving] = useState(false);
  const [isSuggesting, setIsSuggesting] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const hasTranscription = source.type === "audio" || draft.category === "audios" || draft.category === "videos";

  React.useEffect(() => {
    const handleKey = (event) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  const update = (field, value) => setDraft((current) => ({ ...current, [field]: value }));

  const handleSuggest = async () => {
    setIsSuggesting(true);
    setFeedback(null);
    try {
      const suggestion = await onSuggest(source.id);
      setDraft((current) => ({
        ...current,
        ...suggestion,
        tagsText: (suggestion.tags || []).join(", "),
        aiMetadata: true
      }));
      setFeedback({ type: "success", message: "Sugerencias aplicadas al formulario. Revísalas antes de guardar." });
    } catch (error) {
      setFeedback({ type: "error", message: error.message || "No fue posible generar sugerencias." });
    } finally {
      setIsSuggesting(false);
    }
  };

  const handleSave = async (event) => {
    event.preventDefault();
    setIsSaving(true);
    setFeedback(null);
    try {
      await onSave(source.id, {
        ...draft,
        tags: draft.tagsText.split(",").map((tag) => tag.trim()).filter(Boolean)
      });
      onClose();
    } catch (error) {
      setFeedback({ type: "error", message: error.message || "No fue posible guardar los detalles." });
    } finally {
      setIsSaving(false);
    }
  };

  const inputClass = "w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-[#7C3AED] focus:ring-2 focus:ring-violet-100";
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-[#171425]/45 p-4 backdrop-blur-[2px]" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <form onSubmit={handleSave} className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-[#E7E3EE] bg-white shadow-2xl">
        <header className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-[#7C3AED]">Contexto de la fuente</p>
            <h3 className="truncate text-lg font-semibold text-slate-900">{source.name}</h3>
            <p className="mt-0.5 text-xs text-slate-500">Estos datos acompañarán el contenido cuando la IA analice el proyecto.</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"><X size={18} /></button>
        </header>

        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
          <div className="flex justify-end">
            <button type="button" onClick={handleSuggest} disabled={isSuggesting || isSaving} className="flex items-center gap-2 rounded-full border border-[#CFC0F1] bg-[#F2EDFF] px-3.5 py-2 text-xs font-semibold text-[#6D28D9] hover:bg-[#E9DDFE] disabled:opacity-50">
              {isSuggesting ? <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-violet-200 border-t-[#7C3AED]" /> : <Sparkles size={14} />}
              {isSuggesting ? "Analizando fuente..." : "Rellenar campos con IA"}
            </button>
          </div>

          {feedback && <div className={`rounded-xl border px-3 py-2 text-xs ${feedback.type === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-700"}`}>{feedback.message}</div>}

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="space-y-1.5"><span className="text-xs font-semibold text-slate-700">Categoría</span><select value={draft.category} onChange={(event) => update("category", event.target.value)} className={inputClass}><option value="textos">Textos</option><option value="documentos">Documentos</option><option value="audios">Audios</option><option value="videos">Videos</option><option value="otros">Otros</option></select></label>
            <label className="space-y-1.5"><span className="text-xs font-semibold text-slate-700">Tipo de contenido</span><input value={draft.contentType} onChange={(event) => update("contentType", event.target.value)} placeholder="Ej. Entrevista, acta, especificación" maxLength={100} className={inputClass} /></label>
            <label className="space-y-1.5"><span className="text-xs font-semibold text-slate-700">Autor u origen</span><input value={draft.authorOrigin} onChange={(event) => update("authorOrigin", event.target.value)} placeholder="Persona, equipo o institución" maxLength={160} className={inputClass} /></label>
            <label className="space-y-1.5"><span className="text-xs font-semibold text-slate-700">Fecha del contenido</span><input value={draft.documentDate} onChange={(event) => update("documentDate", event.target.value)} placeholder="Ej. 05/10/2026 o Sprint 3" maxLength={40} className={inputClass} /></label>
            <label className="space-y-1.5 sm:col-span-2"><span className="text-xs font-semibold text-slate-700">Descripción para la IA</span><textarea value={draft.description} onChange={(event) => update("description", event.target.value)} placeholder="Explica qué contiene, quién lo produjo y por qué es relevante para el sistema." rows={3} maxLength={1200} className={`${inputClass} resize-y`} /><span className="block text-right text-[10px] text-slate-400">{draft.description.length}/1200</span></label>
            <label className="space-y-1.5 sm:col-span-2"><span className="text-xs font-semibold text-slate-700">Etiquetas</span><input value={draft.tagsText} onChange={(event) => update("tagsText", event.target.value)} placeholder="reservas, clientes, pagos, reglas de negocio" className={inputClass} /><span className="text-[10px] text-slate-400">Sepáralas con comas.</span></label>
          </div>

          {hasTranscription && (
            <section className="rounded-2xl border border-[#DDD2F5] bg-[#FCFBFE] p-4">
              <div className="mb-3">
                <h4 className="text-sm font-semibold text-slate-900">Revisión de transcripción</h4>
                <p className="text-xs text-slate-500">Corrige nombres, cifras o reglas mal interpretadas antes de procesar el proyecto.</p>
              </div>
              <textarea value={draft.contentSnippet} onChange={(event) => { update("contentSnippet", event.target.value); update("transcriptionVerified", false); }} rows={10} className={`${inputClass} resize-y font-mono text-xs leading-relaxed`} />
              <label className="mt-3 flex cursor-pointer items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5">
                <input type="checkbox" checked={draft.transcriptionVerified} onChange={(event) => update("transcriptionVerified", event.target.checked)} className="mt-0.5 accent-emerald-600" />
                <span><strong className="block text-xs text-emerald-800">He revisado esta transcripción</strong><span className="text-[11px] text-emerald-700">La IA utilizará este texto como versión validada por el usuario.</span></span>
              </label>
            </section>
          )}
        </div>

        <footer className="flex items-center justify-end gap-2 border-t border-slate-200 bg-slate-50 px-5 py-3">
          <button type="button" onClick={onClose} disabled={isSaving} className="rounded-full px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-200">Cancelar</button>
          <button type="submit" disabled={isSaving || isSuggesting} className="flex items-center gap-2 rounded-full bg-[#7C3AED] px-5 py-2 text-xs font-semibold text-white hover:bg-[#6D28D9] disabled:opacity-50">{isSaving ? <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/40 border-t-white" /> : <Save size={14} />}Guardar contexto</button>
        </footer>
      </form>
    </div>
  );
}
