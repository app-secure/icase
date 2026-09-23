import React, { useRef, useState } from "react";
import {
  Upload,
  Plus,
  FileText,
  FileAudio,
  FileCode,
  Trash2,
  ArrowRight,
  ArrowLeft,
  Sparkles
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
        fill="#1A73E8"
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
      <rect x="4.5" y="9.5" width="3" height="6" rx="1.5" fill="#1A73E8" />
      <rect x="10.5" y="5" width="3" height="14" rx="1.5" fill="#1A73E8" />
      <rect x="16.5" y="9.5" width="3" height="6" rx="1.5" fill="#1A73E8" />
    </svg>
  );
}

export default function SourcesPanel({
  sources,
  onAddSource,
  onDeleteSource,
  onProcess,
  isProcessing,
  isProcessed,
  projectName,
  onUpdateProjectName,
  onBackToDashboard
}) {
  const [uploadingItem, setUploadingItem] = useState(null);
  const [isEditingName, setIsEditingName] = useState(false);
  const [editedName, setEditedName] = useState("");
  const fileInputRef = useRef(null);

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
    const normalizedName = rawName.normalize("NFC").replace(/[\u0000-\u001F\u007F-\u009F]/g, "").trim();

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
      size: formattedSize,
      date: new Date().toLocaleDateString("es-ES"),
      rawFile: file,
      contentSnippet: textContent
    };

    try {
      // Garantizar que la animación de carga se visualice fluidamente mientras se procesa la fuente
      await Promise.all([
        Promise.resolve(onAddSource(newSource)),
        new Promise((resolve) => setTimeout(resolve, 900))
      ]);
    } catch (err) {
      console.warn("Error cargando fuente:", err);
    } finally {
      setUploadingItem(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  return (
    <aside className="w-80 md:w-88 bg-[#F8FAFD] border-r border-slate-200/90 flex flex-col h-full shrink-0 select-none overflow-hidden font-inter relative shadow-xs">
      {/* Fondo técnico elegante y luminoso con cuadrícula fina y sutil resplandor ambiental */}
      <div
        className="absolute inset-0 pointer-events-none -z-0"
        style={{
          backgroundColor: "#F8FAFD",
          backgroundImage: `
            radial-gradient(circle at 85% 15%, rgba(244, 114, 182, 0.08) 0%, transparent 55%),
            radial-gradient(circle at 15% 85%, rgba(14, 165, 233, 0.06) 0%, transparent 55%),
            linear-gradient(to right, rgba(15, 23, 42, 0.045) 1px, transparent 1px),
            linear-gradient(to bottom, rgba(15, 23, 42, 0.045) 1px, transparent 1px)
          `,
          backgroundSize: "100% 100%, 100% 100%, 28px 28px, 28px 28px"
        }}
      />

      {/* Hidden File Input */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileUpload}
        accept=".txt,.pdf,.mp3,.wav,.m4a,.mp4,.aac,.ogg,.opus,.docx"
        className="hidden"
      />

      {/* 1. PROJECT TITLE HEADER: Título blanco grande con fondo #1F1D30 */}
      <div className="p-4 border-b border-slate-700/60 bg-[#1F1D30] text-white shrink-0 z-10 relative shadow-sm">
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
        </div>
      </div>

      {/* 2. SOURCES HEADER */}
      <div className="p-4 border-b border-slate-200/80 bg-white/40 backdrop-blur-xs z-10 relative">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-bold text-slate-800 font-inter">Fuentes</h3>
          {/* Texto neutral sin pintar como solicitó el usuario */}
          <span className="text-xs font-normal text-slate-500 font-inter">
            {uniqueSources.length + (uploadingItem ? 1 : 0)} cargadas
          </span>
        </div>

        {/* Action Button: Cargar Insumos con altura reducida e icono de adjuntar */}
        <button
          type="button"
          disabled={Boolean(uploadingItem)}
          onClick={() => fileInputRef.current?.click()}
          className="w-full py-2 px-4 bg-white hover:bg-slate-50 border border-slate-300 hover:border-slate-400 rounded-xl text-[15px] font-bold text-slate-800 hover:text-slate-950 flex items-center justify-center gap-2.5 transition-all shadow-2xs hover:shadow-xs cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed font-inter group"
        >
          <Upload size={17} className="text-blue-600 group-hover:-translate-y-0.5 transition-transform duration-200 shrink-0" />
          <span className="text-[15px] font-bold tracking-tight">Subir Insumos</span>
        </button>
      </div>

      {/* 3. UPLOADED DOCUMENTS LIST: Diseño limpio y sin bordes estilo NotebookLM */}
      <div className="flex-1 overflow-y-auto p-3 space-y-1 z-10 relative">
        {/* Efecto de Carga del Archivo en Proceso idéntico a NotebookLM */}
        {uploadingItem && (
          <div className="px-3 py-2.5 rounded-xl bg-[#E8F0FE]/90 border border-blue-100/60 flex items-center justify-between gap-3 font-inter transition-all">
            <div className="flex items-center gap-3 min-w-0 flex-1">
              {getFileIcon(uploadingItem.type)}
              <span className="text-[13.5px] font-medium text-slate-700 truncate font-inter tracking-tight">
                {uploadingItem.name}
              </span>
            </div>
            {/* Spinner circular azul estilo Google idéntico a la imagen adjunta */}
            <svg
              className="w-[22px] h-[22px] animate-spin text-[#1A73E8] shrink-0"
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

        {uniqueSources.length === 0 && !uploadingItem ? (
          <div className="py-12 px-4 text-center">
            <p className="text-xs font-bold text-slate-700 font-inter">Sin fuentes todavía</p>
            <p className="text-xs font-normal text-slate-500 mt-1 max-w-[200px] mx-auto font-inter">
              Sube audios, actas o especificaciones para comenzar el análisis.
            </p>
          </div>
        ) : (
          <div className="space-y-1">
            {uniqueSources.map((src) => (
              <div
                key={src.id}
                className="px-3 py-2.5 rounded-xl hover:bg-slate-200/50 transition-colors flex items-center justify-between gap-3 group cursor-pointer"
                title={`${src.name} (${src.size})`}
              >
                {/* Icono fiel al tipo y nombre con tipografía nítida y sombreado suave de NotebookLM */}
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  {getFileIcon(src.type)}
                  <span
                    className="text-[13.5px] font-medium text-[#202124] truncate font-inter tracking-tight"
                    style={{ textShadow: "0 0.5px 1px rgba(0, 0, 0, 0.12)" }}
                  >
                    {src.name}
                  </span>
                </div>

                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteSource(src.id);
                  }}
                  className="opacity-0 group-hover:opacity-100 p-1 text-slate-400 hover:text-red-600 rounded-md hover:bg-slate-200/80 transition-all cursor-pointer shrink-0"
                  title="Quitar fuente"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 4. ACTION BAR: Botón de Procesar / Reprocesar más grande y estilo píldora */}
      <div className="p-2.5 border-t border-slate-200/80 bg-white/80 backdrop-blur-xs mt-auto shrink-0 z-10 relative">
        <button
          type="button"
          onClick={onProcess}
          disabled={sources.length === 0 || isProcessing}
          className="w-full py-3 px-6 bg-[#0b57d0] hover:bg-[#0947a8] disabled:bg-slate-200 disabled:text-slate-400 text-white rounded-full text-sm font-bold flex items-center justify-center gap-2.5 transition-all shadow-md hover:shadow-lg cursor-pointer disabled:cursor-not-allowed font-inter hover:scale-[1.01] active:scale-[0.99]"
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
        className="py-2 px-4 bg-[#181724] border-t border-slate-700/80 flex items-center justify-center cursor-pointer hover:bg-[#201E30] transition-colors shrink-0 z-10 relative shadow-inner"
        onClick={onBackToDashboard}
        title="RBIX - Volver a Proyectos"
      >
        <RbixLogo size="sm" isDark={true} />
      </div>
    </aside>
  );
}
