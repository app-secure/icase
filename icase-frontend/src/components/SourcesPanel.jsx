import React, { useRef, useState } from "react";
import {
  Upload,
  Plus,
  FileText,
  FileAudio,
  FileCode,
  Trash2,
  CheckCircle2,
  Sparkles,
  ArrowRight
} from "lucide-react";

export default function SourcesPanel({
  sources,
  onAddSource,
  onDeleteSource,
  onProcess,
  isProcessing,
  isProcessed,
  projectName,
  onUpdateProjectName
}) {
  const [uploadingItem, setUploadingItem] = useState(null);
  const fileInputRef = useRef(null);

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
        return <FileAudio size={16} className="text-amber-600" />;
      case "pdf":
        return <FileText size={16} className="text-red-500" />;
      case "txt":
      default:
        return <FileCode size={16} className="text-blue-500" />;
    }
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const ext = file.name.split('.').pop().toLowerCase();
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

    // Mostrar efecto de carga en el panel de fuentes
    setUploadingItem({
      name: file.name,
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

    // Efecto de transición para que el usuario visualice la carga del archivo
    await new Promise((resolve) => setTimeout(resolve, 500));

    const newSource = {
      id: "src-" + Date.now(),
      name: file.name,
      type,
      size: formattedSize,
      date: new Date().toLocaleDateString("es-ES"),
      rawFile: file,
      contentSnippet: textContent
    };

    onAddSource(newSource);
    setUploadingItem(null);

    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  return (
    <aside className="w-80 md:w-88 bg-[#f0f4f9] border-r border-slate-200 flex flex-col h-full shrink-0">
      {/* Sources Header */}
      <div className="p-4 border-b border-slate-200/80">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-slate-800">Fuentes</h3>
          <span className="text-xs text-slate-500">
            {uniqueSources.length + (uploadingItem ? 1 : 0)} cargadas
          </span>
        </div>

        {/* Hidden File Input */}
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileUpload}
          accept=".txt,.pdf,.mp3,.wav,.m4a,.mp4,.aac,.ogg,.opus,.docx"
          className="hidden"
        />

        {/* Action Button: Cargar Insumos */}
        <button
          type="button"
          disabled={Boolean(uploadingItem)}
          onClick={() => fileInputRef.current?.click()}
          className="w-full py-2.5 px-4 bg-white hover:bg-slate-50 border border-slate-300 hover:border-slate-400 rounded-full text-xs font-medium text-slate-700 flex items-center justify-center gap-2 transition-all shadow-xs cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {uploadingItem ? (
            <>
              <div className="w-3.5 h-3.5 border-2 border-blue-600/30 border-t-blue-600 rounded-full animate-spin"></div>
              <span>Subiendo archivo...</span>
            </>
          ) : (
            <>
              <Plus size={15} className="text-blue-600" />
              <span>Cargar Insumos (PDF, TXT, Audio)</span>
            </>
          )}
        </button>
      </div>

      {/* Uploaded Documents List */}
      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {/* Efecto de Carga del Archivo en Proceso */}
        {uploadingItem && (
          <div className="p-3 bg-blue-50/70 border border-blue-200 rounded-xl flex flex-col gap-2 shadow-xs animate-pulse">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="p-1.5 rounded-lg bg-blue-100/80 border border-blue-200">
                  {getFileIcon(uploadingItem.type)}
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-medium text-blue-900 truncate">{uploadingItem.name}</p>
                  <p className="text-[10px] text-blue-600 font-semibold tracking-wide flex items-center gap-1.5">
                    <span className="inline-block w-1.5 h-1.5 rounded-full bg-blue-600 animate-ping"></span>
                    Cargando archivo • {uploadingItem.size}
                  </p>
                </div>
              </div>
              <div className="w-4 h-4 border-2 border-blue-400 border-t-blue-700 rounded-full animate-spin shrink-0"></div>
            </div>
            {/* Barra de progreso fluida multicolor */}
            <div className="w-full h-1 bg-blue-200/80 rounded-full overflow-hidden">
              <div className="h-full gemini-wave-bar rounded-full"></div>
            </div>
          </div>
        )}

        {uniqueSources.length === 0 && !uploadingItem ? (
          <div className="py-12 px-4 text-center">
            <div className="w-10 h-10 mx-auto mb-2 rounded-full bg-slate-200 flex items-center justify-center text-slate-500">
              <Upload size={18} />
            </div>
            <p className="text-xs font-medium text-slate-700">Sin fuentes todavía</p>
            <p className="text-[11px] text-slate-500 mt-1 max-w-[200px] mx-auto">
              Sube audios (.mp3), actas (.txt) o especificaciones (.pdf) para comenzar el análisis.
            </p>
          </div>
        ) : (
          uniqueSources.map((src) => (
            <div
              key={src.id}
              className="p-2.5 bg-white border border-slate-200 rounded-xl hover:border-slate-300 transition-all flex items-center justify-between gap-2 shadow-xs group"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="p-1.5 rounded-lg bg-slate-50 border border-slate-100">
                  {getFileIcon(src.type)}
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-medium text-slate-800 truncate">{src.name}</p>
                  <p className="text-[11px] text-slate-400">
                    {src.type.toUpperCase()} • {src.size}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => onDeleteSource(src.id)}
                className="opacity-0 group-hover:opacity-100 p-1 text-slate-400 hover:text-red-500 transition-opacity"
                title="Quitar fuente"
              >
                <Trash2 size={13} />
              </button>
            </div>
          ))
        )}
      </div>

      {/* Bottom Process Button (NotebookLM style) */}
      <div className="p-4 border-t border-slate-200 bg-white">
        <button
          type="button"
          onClick={onProcess}
          disabled={sources.length === 0 || isProcessing}
          className="w-full py-2.5 px-4 bg-[#0b57d0] hover:bg-blue-700 disabled:bg-slate-200 disabled:text-slate-400 text-white rounded-full text-xs font-medium flex items-center justify-center gap-2 transition-all shadow-sm cursor-pointer disabled:cursor-not-allowed"
        >
          {isProcessing ? (
            <>
              <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
              <span>Analizando con IA...</span>
            </>
          ) : isProcessed ? (
            <>
              <Sparkles size={14} />
              <span>Reprocesar</span>
            </>
          ) : (
            <>
              <span>Procesar</span>
              <ArrowRight size={14} />
            </>
          )}
        </button>
      </div>

    </aside>
  );
}
