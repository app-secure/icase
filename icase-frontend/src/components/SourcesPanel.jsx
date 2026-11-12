import React, { useRef, useState } from "react";
import {
  ChevronDown,
  Pencil,
  Sparkles,
  WandSparkles,
  X,
  Save,
  CheckCircle2,
  ArrowLeft
} from "lucide-react";

function CloudUploadFileIllustration() {
  return (
    <svg width="68" height="76" viewBox="0 0 68 76" fill="none" xmlns="http://www.w3.org/2000/svg" className="shrink-0">
      {/* Document Base */}
      <path
        d="M10 12C10 7.58172 13.5817 4 18 4H43.3726C45.4943 4 47.5291 4.84285 49.0294 6.34315L55.6569 12.9706C57.1571 14.4709 58 16.5057 58 18.6274V64C58 68.4183 54.4183 72 50 72H18C13.5817 72 10 68.4183 10 64V12Z"
        fill="#DCE4FF"
      />
      {/* Folded Corner */}
      <path
        d="M44 4.5V14C44 17.3137 46.6863 20 50 20H57.5L44 4.5Z"
        fill="#BCCBFF"
      />
      {/* Cloud inside Document */}
      <path
        d="M25.5 49H43C46.5899 49 49.5 46.0899 49.5 42.5C49.5 39.2111 47.0548 36.4926 43.8819 36.0604C42.9056 31.4648 38.8247 28 33.95 28C28.3443 28 23.8 32.5443 23.8 38.15C23.8 38.4981 23.8175 38.8422 23.8517 39.1812C21.3774 39.8825 19.5 42.1552 19.5 44.85C19.5 47.142 21.358 49 23.65 49H25.5Z"
        fill="#7B96FF"
      />
      {/* Upward Arrow inside Cloud */}
      <path
        d="M34 45V36M34 36L30.5 39.5M34 36L37.5 39.5"
        stroke="white"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function FileTypeBadge({ type }) {
  if (type === "audio") {
    return (
      <div className="w-10 h-10 rounded-xl bg-[#5850EC] flex items-center justify-center shrink-0 shadow-2xs">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
          <rect x="4" y="10" width="2.2" height="4" rx="1.1" fill="white" />
          <rect x="7.5" y="7" width="2.2" height="10" rx="1.1" fill="white" />
          <rect x="11" y="4" width="2.2" height="16" rx="1.1" fill="white" />
          <rect x="14.5" y="8" width="2.2" height="8" rx="1.1" fill="white" />
          <rect x="18" y="10" width="2.2" height="4" rx="1.1" fill="white" />
        </svg>
      </div>
    );
  }
  if (type === "pdf") {
    return (
      <div className="w-10 h-10 rounded-xl bg-[#E05246] flex items-center justify-center shrink-0 shadow-2xs">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
          <path
            d="M12 4.5C10.5 4.5 9.8 7.5 11.2 11.5C9.5 13.8 6.5 16.2 5.5 17.5C4.8 18.4 5.6 19.5 6.8 19C8.2 18.4 10.5 15.8 12.2 13.8C14.8 13.2 17.8 13.4 18.8 14.2C19.6 14.8 19.8 13.5 18.8 12.6C17.6 11.6 14.8 11.5 13 11.8C12.2 8.8 13.2 4.5 12 4.5Z"
            stroke="white"
            strokeWidth="1.9"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
    );
  }
  return (
    <div className="w-10 h-10 rounded-xl bg-[#3B82F6] flex items-center justify-center shrink-0 shadow-2xs">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
        <path
          d="M7 4.5H14L18 8.5V19.5H7V4.5Z"
          stroke="white"
          strokeWidth="1.8"
          strokeLinejoin="round"
        />
        <path d="M9.5 11.5H15.5M9.5 14.5H15.5M9.5 17.2H13" stroke="white" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    </div>
  );
}

function AiBrainModelIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="text-slate-500 shrink-0">
      <path
        d="M9.5 4C7.567 4 6 5.567 6 7.5C6 7.89 6.064 8.265 6.182 8.615C4.896 9.188 4 10.488 4 12C4 13.765 5.236 15.242 6.889 15.612C7.283 17.545 8.994 19 11.045 19H11.5V4H9.5Z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M14.5 4C16.433 4 18 5.567 18 7.5C18 7.89 17.936 8.265 17.818 8.615C19.104 9.188 20 10.488 20 12C20 13.765 18.764 15.242 17.111 15.612C16.717 17.545 15.006 19 12.955 19H12.5V4H14.5Z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function SourcesPanel({
  sources = [],
  onAddSource,
  onUpdateSource,
  onSuggestSourceMetadata,
  onDeleteSource,
  onProcess,
  isProcessing = false,
  isProcessed = false,
  selectedProvider,
  onSelectProvider,
  availableProviders = [],
  onContinueToProject = null
}) {
  const [uploadingItems, setUploadingItems] = useState([]);
  const [uploadError, setUploadError] = useState("");
  const [localProvider, setLocalProvider] = useState("auto");
  const [activeSourceId, setActiveSourceId] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef(null);

  const currentProvider = selectedProvider !== undefined ? selectedProvider : localProvider;

  const handleProviderChange = (val) => {
    setLocalProvider(val);
    if (onSelectProvider) {
      onSelectProvider(val);
    }
  };

  const uniqueSources = React.useMemo(() => {
    const seen = new Set();
    return (sources || []).filter((src) => {
      const key = src.name || src.id;
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [sources]);

  const pendingUploading = React.useMemo(() => {
    const existingNames = new Set(uniqueSources.map((s) => s.name));
    return uploadingItems.filter((item) => !existingNames.has(item.name));
  }, [uniqueSources, uploadingItems]);

  const allDisplayedFiles = React.useMemo(() => {
    return [...uniqueSources, ...pendingUploading];
  }, [uniqueSources, pendingUploading]);

  const isAnySourceLoading = pendingUploading.length > 0 || uniqueSources.some((s) => s.isUploading);
  const activeSource = uniqueSources.find((source) => source.id === activeSourceId) || null;

  const formatFileSize = (bytes) => {
    if (!bytes && bytes !== 0) return "";
    if (bytes >= 1024 * 1024) {
      return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    }
    return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  };

  const processFiles = async (fileList) => {
    const files = Array.from(fileList || []);
    if (!files.length) return;
    setUploadError("");

    for (const file of files) {
      const rawName = file.name || "archivo";
      const normalizedName = Array.from(rawName.normalize("NFC"))
        .filter((character) => {
          const code = character.charCodeAt(0);
          return code > 31 && !(code >= 127 && code <= 159);
        })
        .join("")
        .trim();

      const ext = normalizedName.split(".").pop().toLowerCase();
      const mime = (file.type || "").toLowerCase();
      const audioExts = ["mp3", "wav", "m4a", "mp4", "aac", "ogg", "opus", "webm", "flac", "wma"];
      const isAudio = mime.startsWith("audio/") || mime === "video/mp4" || audioExts.includes(ext);
      const isPdf = mime.includes("pdf") || ext === "pdf";

      let type = "txt";
      if (isAudio) {
        type = "audio";
      } else if (isPdf) {
        type = "pdf";
      }
      const category = isAudio
        ? ["mp4", "webm"].includes(ext) || mime.startsWith("video/")
          ? "videos"
          : "audios"
        : isPdf
          ? "documentos"
          : "textos";

      const formattedSize = formatFileSize(file.size);
      const tempId = "src-" + Date.now() + "-" + Math.random().toString(36).slice(2, 6);

      setUploadingItems((prev) => [
        ...prev,
        {
          id: tempId,
          name: normalizedName,
          type,
          size: formattedSize,
          isUploading: true
        }
      ]);

      let textContent = "";
      if (type === "txt") {
        try {
          textContent = await file.text();
        } catch (err) {
          console.warn("Error leyendo texto del archivo:", err);
        }
      }

      const newSource = {
        id: tempId,
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
        documentDateSource: "",
        tags: [],
        transcriptionVerified: false,
        isUploading: true
      };

      try {
        await onAddSource(newSource);
      } catch (err) {
        console.warn("Error cargando fuente:", err);
        setUploadError(err.message || "No se pudo cargar la fuente. Vuelve a intentarlo.");
      } finally {
        setUploadingItems((prev) => prev.filter((item) => item.id !== tempId));
      }
    }

    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleFileUpload = async (e) => {
    await processFiles(e.target.files);
  };

  const handleDrop = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (isAnySourceLoading || isProcessing) return;
    if (e.dataTransfer?.files?.length) {
      await processFiles(e.dataTransfer.files);
    }
  };

  return (
    <div className="flex-1 w-full h-full overflow-y-auto bg-[#F8F9FB] px-4 py-8 md:py-12 flex flex-col items-center">
      <input
        type="file"
        multiple
        ref={fileInputRef}
        onChange={handleFileUpload}
        accept=".txt,.pdf,.mp3,.wav,.m4a,.mp4,.aac,.ogg,.opus,.docx"
        className="hidden"
      />

      <div className="w-full max-w-2xl my-auto">
        {/* Cabecera de sección "Cargar Insumos" */}
        <div className="mb-5 flex items-center justify-between gap-3">
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
            Cargar Insumos
          </h1>
          {isProcessed && onContinueToProject && (
            <button
              type="button"
              onClick={onContinueToProject}
              className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3.5 py-1.5 text-xs font-medium text-slate-700 shadow-2xs hover:bg-slate-50 transition-colors cursor-pointer"
            >
              <ArrowLeft size={13} />
              <span>Volver al análisis</span>
            </button>
          )}
        </div>

        {/* Contenedor principal de carga estilo tarjeta limpia */}
        <div className="rounded-2xl border border-slate-200/90 bg-white shadow-[0_4px_24px_rgba(15,23,42,0.04)] overflow-hidden">
          <div className="p-6">
            {/* Zona Drag & Drop */}
            <div
              role="button"
              tabIndex={0}
              onClick={() => !isAnySourceLoading && !isProcessing && fileInputRef.current?.click()}
              onKeyDown={(e) => {
                if ((e.key === "Enter" || e.key === " ") && !isAnySourceLoading && !isProcessing) {
                  e.preventDefault();
                  fileInputRef.current?.click();
                }
              }}
              onDragOver={(e) => {
                e.preventDefault();
                e.stopPropagation();
                if (!isDragging) setIsDragging(true);
              }}
              onDragLeave={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setIsDragging(false);
              }}
              onDrop={handleDrop}
              className={`rounded-2xl border-2 border-dashed px-6 py-10 flex flex-col items-center justify-center text-center transition-all cursor-pointer select-none ${
                isDragging
                  ? "border-[#4349C6] bg-[#EEF2FF]"
                  : "border-[#C7D2FE] bg-[#F5F7FF]/80 hover:bg-[#EEF2FF]/75 hover:border-[#818CF8]"
              } ${isAnySourceLoading || isProcessing ? "opacity-60 cursor-not-allowed" : ""}`}
            >
              <CloudUploadFileIllustration />
              <p className="mt-4 text-[16px] font-medium text-slate-800 tracking-tight">
                Arrastra o selecciona tus archivos
              </p>
              <p className="mt-1 text-xs text-slate-400">
                .mp3, .wav, .txt, .pdf
              </p>
            </div>

            {uploadError && (
              <p role="alert" className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs text-red-700">
                {uploadError}
              </p>
            )}

            {/* Lista de Archivos */}
            <div className="mt-6">
              <h2 className="text-sm font-medium text-slate-700 mb-2">
                Archivos
              </h2>

              {allDisplayedFiles.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-200/80 py-7 px-4 text-center">
                  <p className="text-xs text-slate-400">
                    Aún no has seleccionado ningún archivo. Sube entrevistas, actas o documentos para iniciar.
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {allDisplayedFiles.map((src) => (
                    <div
                      key={src.id || src.name}
                      onClick={() => !src.isUploading && setActiveSourceId(src.id)}
                      className="group flex items-center justify-between gap-3 py-3 px-1 transition-colors hover:bg-slate-50/70 rounded-xl cursor-pointer"
                      title={src.isUploading ? "Subiendo archivo..." : "Clic para revisar transcripción o contexto del archivo"}
                    >
                      <div className="flex items-center gap-3.5 min-w-0 flex-1">
                        <FileTypeBadge type={src.type} />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-slate-800 truncate">
                            {src.name}
                          </p>
                          <div className="mt-0.5 flex items-center gap-1.5">
                            {src.isUploading ? (
                              <>
                                <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-indigo-200 border-t-[#4349C6]" />
                                <span className="text-[11px] text-slate-400">Subiendo...</span>
                              </>
                            ) : src.uploadError ? (
                              <span className="text-[11px] text-red-600">Error al subir</span>
                            ) : (
                              <>
                                <CheckCircle2 size={14} className="text-emerald-500 shrink-0" />
                                {src.contentType && (
                                  <span className="text-[11px] text-slate-400 truncate">
                                    {src.contentType}
                                  </span>
                                )}
                              </>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2.5 shrink-0">
                        {src.size && (
                          <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-medium text-slate-500">
                            {src.size}
                          </span>
                        )}
                        {!src.isUploading && (
                          <>
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                setActiveSourceId(src.id);
                              }}
                              className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-600 hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 transition-colors cursor-pointer"
                              title="Editar contexto o transcripción"
                            >
                              <Pencil size={14} />
                              <span>Editar</span>
                            </button>
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                onDeleteSource(src.id);
                              }}
                              className="p-1 text-slate-400 hover:text-slate-700 rounded-md hover:bg-slate-100 transition-colors cursor-pointer"
                              title="Quitar archivo"
                            >
                              <X size={15} />
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Barra inferior: Botón Procesar (izquierda) + Selector Elegir modelo (derecha) */}
          <div className="border-t border-slate-100 bg-[#FAFAFC] px-6 py-4 flex flex-col sm:flex-row items-stretch sm:items-center gap-3.5">
            <button
              type="button"
              onClick={() => onProcess(currentProvider)}
              disabled={uniqueSources.length === 0 || isProcessing || isAnySourceLoading}
              className="flex-1 h-11 px-6 rounded-xl bg-[#4349C6] hover:bg-[#373CB3] disabled:bg-slate-200 disabled:text-slate-400 text-white text-sm font-semibold flex items-center justify-center gap-2 shadow-xs transition-all cursor-pointer disabled:cursor-not-allowed"
            >
              {isProcessing ? (
                <>
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                  <span>Procesando...</span>
                </>
              ) : (
                <>
                  <WandSparkles size={16} className="shrink-0" />
                  <span>{isProcessed ? "Reprocesar" : "Procesar"}</span>
                </>
              )}
            </button>

            <div className="relative sm:w-64 shrink-0">
              <span className="absolute -top-2 left-3 bg-white px-1 text-[10px] font-medium text-slate-400 z-10 leading-none">
                Elegir modelo
              </span>
              <div className="relative flex items-center h-11 rounded-xl border border-slate-200 bg-white px-3 shadow-2xs hover:border-slate-300 focus-within:border-[#4349C6]">
                <AiBrainModelIcon />
                <select
                  value={currentProvider}
                  onChange={(e) => handleProviderChange(e.target.value)}
                  aria-label="Elegir modelo"
                  className="w-full h-full pl-2 pr-6 text-xs font-medium text-slate-700 bg-transparent outline-none appearance-none cursor-pointer truncate"
                >
                  {Array.isArray(availableProviders) && availableProviders.length > 0 ? (
                    availableProviders.map((p) => {
                      const cleanName = (p.nombre || "").replace(/\s*\([^)]*\)/g, "").trim();
                      const label = p.id === "auto"
                        ? "Modelo: Whisper + Auto IA"
                        : `Modelo: ${cleanName || p.nombre}`;
                      return (
                        <option key={p.id} value={p.id} disabled={p.disponible === false}>
                          {label}{!p.disponible ? " — Sin API Key" : ""}
                        </option>
                      );
                    })
                  ) : (
                    <>
                      <option value="auto">Modelo: Whisper + Auto IA</option>
                      <option value="gemini">Modelo: Whisper + Gemini</option>
                      <option value="groq">Modelo: Whisper + Groq</option>
                      <option value="openai">Modelo: Whisper + GPT-4</option>
                      <option value="deepseek">Modelo: Whisper + DeepSeek</option>
                      <option value="openrouter">Modelo: Whisper + OpenRouter</option>
                    </>
                  )}
                </select>
                <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400" />
              </div>
            </div>
          </div>
        </div>
      </div>

      {activeSource && (
        <SourceDetailsModal
          source={activeSource}
          onClose={() => setActiveSourceId(null)}
          onSave={onUpdateSource}
          onSuggest={onSuggestSourceMetadata}
        />
      )}
    </div>
  );
}

function SourceDetailsModal({ source, onClose, onSave, onSuggest }) {
  const toDraft = React.useCallback((item) => ({
    category: item.category || (item.type === "audio" ? "audios" : item.type === "pdf" ? "documentos" : "textos"),
    contentType: item.contentType || "",
    description: item.description || "",
    authorOrigin: item.authorOrigin || "",
    documentDate: item.documentDate || "",
    documentDateSource: item.documentDateSource || "",
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

  const update = (field, value) => setDraft((current) => ({
    ...current,
    [field]: value,
    ...(field === "documentDate" ? { documentDateSource: value ? "usuario" : "" } : {})
  }));

  const handleSuggest = async () => {
    setIsSuggesting(true);
    setFeedback(null);
    try {
      const suggestion = await onSuggest(source.id);
      setDraft((current) => ({
        ...current,
        ...suggestion,
        documentDate: current.documentDate,
        documentDateSource: current.documentDateSource,
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

  const inputClass = "w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-[#4349C6] focus:ring-2 focus:ring-indigo-100";
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-[#171425]/45 p-4 backdrop-blur-[2px]" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <form onSubmit={handleSave} className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-[#E7E3EE] bg-white shadow-2xl">
        <header className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-[#4349C6]">Contexto de la fuente</p>
            <h3 className="truncate text-lg font-semibold text-slate-900">{source.name}</h3>
            <p className="mt-0.5 text-xs text-slate-500">Estos datos acompañarán el contenido cuando la IA analice el proyecto.</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"><X size={18} /></button>
        </header>

        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
          <div className="flex justify-end">
            <button type="button" onClick={handleSuggest} disabled={isSuggesting || isSaving} className="flex items-center gap-2 rounded-full border border-indigo-200 bg-indigo-50 px-3.5 py-2 text-xs font-semibold text-[#4349C6] hover:bg-indigo-100 disabled:opacity-50">
              {isSuggesting ? <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-indigo-200 border-t-[#4349C6]" /> : <Sparkles size={14} />}
              {isSuggesting ? "Analizando fuente..." : "Rellenar campos con IA"}
            </button>
          </div>

          {feedback && <div className={`rounded-xl border px-3 py-2 text-xs ${feedback.type === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-700"}`}>{feedback.message}</div>}

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="space-y-1.5"><span className="text-xs font-semibold text-slate-700">Categoría</span><select value={draft.category} onChange={(event) => update("category", event.target.value)} className={inputClass}><option value="textos">Textos</option><option value="documentos">Documentos</option><option value="audios">Audios</option><option value="videos">Videos</option><option value="otros">Otros</option></select></label>
            <label className="space-y-1.5"><span className="text-xs font-semibold text-slate-700">Tipo de contenido</span><input value={draft.contentType} onChange={(event) => update("contentType", event.target.value)} placeholder="Ej. Entrevista, acta, especificación" maxLength={100} className={inputClass} /></label>
            <label className="space-y-1.5"><span className="text-xs font-semibold text-slate-700">Autor u origen</span><input value={draft.authorOrigin} onChange={(event) => update("authorOrigin", event.target.value)} placeholder="Persona, equipo o institución" maxLength={160} className={inputClass} /></label>
            <label className="space-y-1.5"><span className="text-xs font-semibold text-slate-700">Fecha del contenido</span><input value={draft.documentDate} onChange={(event) => update("documentDate", event.target.value)} placeholder="Ej. 05/10/2026 o Sprint 3" maxLength={40} className={inputClass} />{draft.documentDateSource === "metadatos_pdf" ? <span className="block text-[10px] text-amber-700">Sugerida por los metadatos internos del PDF. Verifica que corresponda al contenido.</span> : draft.documentDateSource === "usuario" ? <span className="block text-[10px] text-slate-500">Fecha registrada o confirmada manualmente.</span> : <span className="block text-[10px] text-slate-500">Sin fecha confiable detectada; puedes completarla manualmente.</span>}</label>
            <label className="space-y-1.5 sm:col-span-2"><span className="text-xs font-semibold text-slate-700">Descripción para la IA</span><textarea value={draft.description} onChange={(event) => update("description", event.target.value)} placeholder="Explica qué contiene, quién lo produjo y por qué es relevante para el sistema." rows={3} maxLength={1200} className={`${inputClass} resize-y`} /><span className="block text-right text-[10px] text-slate-400">{draft.description.length}/1200</span></label>
            <label className="space-y-1.5 sm:col-span-2"><span className="text-xs font-semibold text-slate-700">Etiquetas</span><input value={draft.tagsText} onChange={(event) => update("tagsText", event.target.value)} placeholder="reservas, clientes, pagos, reglas de negocio" className={inputClass} /><span className="text-[10px] text-slate-400">Sepáralas con comas.</span></label>
          </div>

          {hasTranscription && (
            <section className="rounded-2xl border border-indigo-100 bg-[#FCFBFE] p-4">
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
          <button type="submit" disabled={isSaving || isSuggesting} className="flex items-center gap-2 rounded-full bg-[#4349C6] px-5 py-2 text-xs font-semibold text-white hover:bg-[#373CB3] disabled:opacity-50">{isSaving ? <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/40 border-t-white" /> : <Save size={14} />}Guardar contexto</button>
        </footer>
      </form>
    </div>
  );
}
