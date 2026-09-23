import React, { useState, useRef, useEffect } from "react";
import {
  Plus,
  FileText,
  FileAudio,
  FileCode,
  CheckCircle2,
  Trash2,
  Clock,
  FolderOpen,
  Search,
  ChevronDown,
  LayoutGrid,
  Menu,
  Check,
  MoreVertical,
  BookOpen
} from "lucide-react";

export default function ProjectDashboard({
  projects,
  onSelectProject,
  onCreateProject,
  onDeleteProject
}) {
  const [projectToDelete, setProjectToDelete] = useState(null);
  const [activeMenuProjectId, setActiveMenuProjectId] = useState(null);
  const [viewMode, setViewMode] = useState(() => {
    return localStorage.getItem("icase_dashboard_view_mode") || "grid";
  });
  const [sortBy, setSortBy] = useState("recent"); // "recent" | "title"
  const [isSortOpen, setIsSortOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearchOpen, setIsSearchOpen] = useState(false);

  const sortRef = useRef(null);
  const menuRef = useRef(null);
  const searchInputRef = useRef(null);

  // Cerrar menú de ordenamiento y menú de acciones al hacer clic fuera
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (sortRef.current && !sortRef.current.contains(e.target)) {
        setIsSortOpen(false);
      }
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setActiveMenuProjectId(null);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Foco automático cuando se expande el buscador
  useEffect(() => {
    if (isSearchOpen && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [isSearchOpen]);

  const handleSetViewMode = (mode) => {
    setViewMode(mode);
    localStorage.setItem("icase_dashboard_view_mode", mode);
  };

  const handleQuickCreate = () => {
    const newProject = {
      id: "draft-" + Date.now(),
      name: "Proyecto sin nombre",
      description: "",
      updatedAt: new Date().toLocaleDateString("es-ES", {
        day: "numeric",
        month: "short",
        year: "numeric"
      }),
      currentPhase: 0,
      isProcessed: false,
      isAnalysisApproved: false,
      isDiagramsApproved: false,
      sources: [],
      requirements: {
        functional: [],
        nonFunctional: []
      },
      diagrams: {}
    };

    onCreateProject(newProject);
  };

  const parseProjectDate = (dateStr) => {
    if (!dateStr) return null;
    const d = new Date(dateStr);
    if (!isNaN(d.getTime())) return d;
    const months = {
      ene: 0, feb: 1, mar: 2, abr: 3, may: 4, jun: 5,
      jul: 6, ago: 7, sep: 8, sept: 8, oct: 9, nov: 10, dic: 11
    };
    const parts = String(dateStr).toLowerCase().split(/[\s./-]+/);
    if (parts.length >= 3) {
      const day = parseInt(parts[0], 10);
      const monthStr = parts[1].slice(0, 3);
      const month = months[monthStr] !== undefined ? months[monthStr] : parseInt(parts[1], 10) - 1;
      const year = parseInt(parts[2], 10);
      if (!isNaN(day) && !isNaN(month) && !isNaN(year)) {
        return new Date(year, month, day);
      }
    }
    return null;
  };

  const formatProjectDisplayDate = (dateVal) => {
    if (!dateVal) return "Reciente";
    const parsed = parseProjectDate(dateVal);
    if (parsed && !isNaN(parsed.getTime())) {
      const day = parsed.getDate();
      const monthNames = [
        "ene", "feb", "mar", "abr", "may", "jun",
        "jul", "ago", "sept", "oct", "nov", "dic"
      ];
      const month = monthNames[parsed.getMonth()];
      const year = parsed.getFullYear();
      return `${day} ${month} ${year}`;
    }
    return String(dateVal);
  };

  const filteredProjects = React.useMemo(() => {
    let result = [...projects];

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter(
        (p) =>
          (p.name && p.name.toLowerCase().includes(q)) ||
          (p.description && p.description.toLowerCase().includes(q)) ||
          (p.sources && p.sources.some((s) => s.name?.toLowerCase().includes(q)))
      );
    }

    result.sort((a, b) => {
      if (sortBy === "title") {
        return (a.name || "").localeCompare(b.name || "");
      }
      const dA = parseProjectDate(a.updatedAt)?.getTime() || 0;
      const dB = parseProjectDate(b.updatedAt)?.getTime() || 0;
      return dB - dA;
    });

    return result;
  }, [projects, searchQuery, sortBy]);

  const getSourceIcon = (type) => {
    switch (type) {
      case "audio":
        return <FileAudio size={13} className="text-amber-600 shrink-0" />;
      case "pdf":
        return <FileText size={13} className="text-red-500 shrink-0" />;
      case "txt":
      default:
        return <FileCode size={13} className="text-[#6D8196] shrink-0" />;
    }
  };

  return (
    <div className="flex-1 overflow-y-auto bg-gradient-to-br from-white via-[#FCF7FA] to-[#FDF2F8] p-6 md:p-10 select-text font-inter relative min-h-screen">
      {/* Atmósfera elegante con tonos rosa y violeta del logo Orbix */}
      <div className="absolute top-0 right-0 w-[550px] h-[450px] bg-gradient-to-b from-pink-200/25 via-purple-100/20 to-transparent rounded-full blur-3xl pointer-events-none -z-0" />
      <div className="absolute top-48 left-0 w-[450px] h-[350px] bg-gradient-to-tr from-rose-100/30 via-violet-100/20 to-transparent rounded-full blur-3xl pointer-events-none -z-0" />
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#f43f5e06_1px,transparent_1px),linear-gradient(to_bottom,#7c3aed06_1px,transparent_1px)] bg-[size:32px_32px] pointer-events-none -z-0" />

      <div className="max-w-6xl mx-auto relative z-10">
        {/* Encabezado del Tablero con Filtros NotebookLM estilo Google */}
        <div className="mb-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-pink-100/80">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-slate-900 tracking-tight font-inter">
              Mis Proyectos
            </h1>
          </div>

          {/* Barra de Filtros estilo NotebookLM (Buscador circular, Toggle Cuadrícula/Tabla y Dropdown Ordenar) */}
          <div className="flex items-center gap-2.5 self-start sm:self-auto">
            {/* Buscador expandible circular */}
            <div className="relative flex items-center">
              {isSearchOpen || searchQuery ? (
                <div className="flex items-center bg-white/90 border border-slate-300 rounded-full pl-3 pr-2 py-1 shadow-2xs animate-in fade-in zoom-in-95 duration-150 backdrop-blur-xs">
                  <Search size={15} className="text-slate-500 shrink-0 mr-1.5" />
                  <input
                    ref={searchInputRef}
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Buscar proyectos..."
                    className="text-xs md:text-sm font-normal bg-transparent outline-hidden w-36 sm:w-52 text-slate-800 placeholder-slate-400 font-inter"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setSearchQuery("");
                      setIsSearchOpen(false);
                    }}
                    className="p-1 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100 cursor-pointer text-xs"
                    title="Cerrar búsqueda"
                  >
                    ✕
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setIsSearchOpen(true)}
                  className="w-9 h-9 rounded-full border border-slate-300 bg-white/90 hover:bg-white text-slate-700 flex items-center justify-center shadow-2xs transition-all cursor-pointer backdrop-blur-xs"
                  title="Buscar proyecto"
                >
                  <Search size={16} />
                </button>
              )}
            </div>

            {/* Selector Segmentado Cuadrícula / Tabla */}
            <div className="inline-flex items-center bg-white/90 border border-slate-300 rounded-full p-0.5 shadow-2xs backdrop-blur-xs">
              {/* Botón Cuadrícula */}
              <button
                type="button"
                onClick={() => handleSetViewMode("grid")}
                className={`px-3 py-1.5 rounded-l-full text-xs flex items-center gap-1.5 transition-all cursor-pointer font-inter ${
                  viewMode === "grid"
                    ? "bg-[#e8f0fe] text-[#0b57d0] font-bold shadow-2xs"
                    : "text-slate-600 hover:text-slate-900 hover:bg-slate-50 font-normal"
                }`}
                title="Vista de cuadrícula"
              >
                {viewMode === "grid" && <Check size={14} className="stroke-[2.5]" />}
                <LayoutGrid size={15} />
              </button>

              <div className="w-[1px] h-4 bg-slate-200" />

              {/* Botón Tabla */}
              <button
                type="button"
                onClick={() => handleSetViewMode("table")}
                className={`px-3 py-1.5 rounded-r-full text-xs flex items-center gap-1.5 transition-all cursor-pointer font-inter ${
                  viewMode === "table"
                    ? "bg-[#e8f0fe] text-[#0b57d0] font-bold shadow-2xs"
                    : "text-slate-600 hover:text-slate-900 hover:bg-slate-50 font-normal"
                }`}
                title="Vista de lista / tabla"
              >
                {viewMode === "table" && <Check size={14} className="stroke-[2.5]" />}
                <Menu size={16} />
              </button>
            </div>

            {/* Dropdown Ordenar: Más recientes / Título */}
            <div className="relative" ref={sortRef}>
              <button
                type="button"
                onClick={() => setIsSortOpen(!isSortOpen)}
                className="px-3.5 py-1.5 bg-white/90 border border-slate-300 hover:border-slate-400 rounded-full text-xs md:text-sm font-normal text-slate-800 hover:bg-white flex items-center gap-1.5 shadow-2xs transition-all cursor-pointer font-inter backdrop-blur-xs"
              >
                <span className="font-normal">{sortBy === "recent" ? "Más recientes" : "Título"}</span>
                <ChevronDown size={14} className={`text-slate-500 transition-transform ${isSortOpen ? "rotate-180" : ""}`} />
              </button>

              {isSortOpen && (
                <div className="absolute right-0 top-full mt-1.5 w-44 bg-white rounded-xl shadow-lg border border-slate-200 py-1.5 z-30 animate-in fade-in zoom-in-95 duration-100 font-inter">
                  <button
                    type="button"
                    onClick={() => {
                      setSortBy("recent");
                      setIsSortOpen(false);
                    }}
                    className={`w-full text-left px-3.5 py-2 text-xs md:text-sm transition-colors cursor-pointer flex items-center justify-between font-inter ${
                      sortBy === "recent"
                        ? "text-slate-900 font-bold border-2 border-[#1a73e8] rounded-lg mx-1 w-[calc(100%-8px)] bg-blue-50/30"
                        : "text-slate-700 hover:bg-slate-50 font-normal"
                    }`}
                  >
                    <span>Más recientes</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setSortBy("title");
                      setIsSortOpen(false);
                    }}
                    className={`w-full text-left px-3.5 py-2 text-xs md:text-sm transition-colors cursor-pointer flex items-center justify-between mt-1 font-inter ${
                      sortBy === "title"
                        ? "text-slate-900 font-bold border-2 border-[#1a73e8] rounded-lg mx-1 w-[calc(100%-8px)] bg-blue-50/30"
                        : "text-slate-700 hover:bg-slate-50 font-normal"
                    }`}
                  >
                    <span>Título</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Botón Crear Proyecto: Solo se muestra cuando se cambia a la vista Tabla */}
        {viewMode === "table" && (
          <div className="flex justify-end mb-4 animate-in fade-in duration-150">
            <button
              type="button"
              onClick={handleQuickCreate}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#7C3AED] hover:bg-[#6D28D9] text-white shadow-xs hover:shadow-md transition-all cursor-pointer font-bold text-xs md:text-sm font-inter group"
              title="Crear Proyecto"
            >
              <Plus size={16} className="stroke-[2.5] group-hover:rotate-90 transition-transform duration-200" />
              <span>Crear Proyecto</span>
            </button>
          </div>
        )}

        {/* --- CONTENIDO PRINCIPAL: VISTA CUADRÍCULA O VISTA TABLA --- */}
        {viewMode === "grid" ? (
          /* 1. VISTA CUADRÍCULA (Cards con Inter y jerarquía visual Bold / Regular) */
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {/* Card: + Crear Proyecto */}
            <button
              type="button"
              onClick={handleQuickCreate}
              className="h-60 rounded-2xl border-2 border-dashed border-pink-200 hover:border-[#7C3AED] bg-white/80 hover:bg-white p-5 flex flex-col items-center justify-center text-center transition-all cursor-pointer group shadow-2xs hover:shadow-md font-inter backdrop-blur-xs"
            >
              <div className="w-12 h-12 rounded-full bg-pink-50 group-hover:bg-[#7C3AED]/10 flex items-center justify-center text-[#7C3AED] transition-colors mb-3">
                <Plus size={24} />
              </div>
              <span className="text-base font-bold text-slate-900 group-hover:text-[#7C3AED] transition-colors font-inter">
                Crear Proyecto
              </span>
              <span className="text-sm font-normal text-slate-500 mt-1 font-inter">
                Nuevo cuaderno de especificación
              </span>
            </button>

            {/* Proyectos reales desde MongoDB filtrados */}
            {filteredProjects.map((proj) => {
              const sourceCount = proj.sources?.length || 0;
              const sourceText = sourceCount === 0 ? "Sin fuentes" : `${sourceCount} fuente${sourceCount === 1 ? "" : "s"}`;

              return (
              <div
                key={proj.id}
                onClick={() => onSelectProject(proj.id)}
                className="h-60 bg-white/90 border border-pink-100 hover:border-[#7C3AED]/50 rounded-2xl p-5 flex flex-col justify-between transition-all cursor-pointer shadow-2xs hover:shadow-md group relative font-inter backdrop-blur-xs"
              >
                <div className="flex-1 flex items-center">
                  {/* Badge Aprobado en esquina superior izquierda */}
                  {proj.isAnalysisApproved && (
                    <span className="absolute top-3.5 left-4 flex items-center gap-1 text-xs text-emerald-600 font-bold font-inter z-10">
                      <CheckCircle2 size={13} /> Aprobado
                    </span>
                  )}

                  {/* Botón de eliminar en esquina superior derecha */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setProjectToDelete(proj);
                    }}
                    className="absolute top-3.5 right-3.5 opacity-0 group-hover:opacity-100 p-1.5 text-slate-400 hover:text-red-500 rounded-lg hover:bg-red-50/70 transition-all cursor-pointer z-10"
                    title="Eliminar proyecto permanentemente"
                  >
                    <Trash2 size={13} />
                  </button>

                  {/* Título del proyecto – centrado verticalmente */}
                  <div className="pr-7 text-left w-full">
                    <h2 className="text-lg font-bold text-slate-900 group-hover:text-[#7C3AED] transition-colors line-clamp-4 text-left w-full leading-snug tracking-tight font-inter">
                      {proj.name}
                    </h2>
                  </div>
                </div>

                {/* Pie de tarjeta: fecha · fuentes */}
                <div className="pt-2.5 border-t border-slate-100 flex items-center gap-1.5 text-sm text-slate-700 font-inter font-normal">
                  <span>{formatProjectDisplayDate(proj.updatedAt)}</span>
                  <span className="text-slate-400">·</span>
                  <span>{sourceText}</span>
                </div>
              </div>
              );
            })}
          </div>
        ) : (
          /* 2. VISTA TABLA (NotebookLM Table Style) */
          <div className="bg-white/95 backdrop-blur-xs rounded-2xl border border-pink-100/90 shadow-2xs font-inter relative min-h-[140px]">
            {/* Cabecera de la tabla */}
            <div className="grid grid-cols-12 px-6 py-3.5 border-b border-slate-200/80 text-xs md:text-sm font-bold text-slate-700 bg-pink-50/40 rounded-t-2xl font-inter">
              <div className="col-span-6 md:col-span-5 font-bold">Título</div>
              <div className="col-span-3 md:col-span-2 text-left font-bold">Fuentes</div>
              <div className="col-span-3 md:col-span-3 text-left font-bold">Creado</div>
              <div className="hidden md:block md:col-span-1 text-left font-bold">Rol</div>
              <div className="hidden md:block md:col-span-1 text-right"></div>
            </div>

            {/* Filas de proyectos estilo NotebookLM */}
            {filteredProjects.map((proj, idx) => {
              const fuenteCount = proj.sources?.length || 0;
              const fuenteText = fuenteCount === 0 ? "Sin fuentes" : `${fuenteCount} fuente${fuenteCount === 1 ? "" : "s"}`;
              const isLast = idx === filteredProjects.length - 1;

              return (
                <div
                  key={proj.id}
                  onClick={() => onSelectProject(proj.id)}
                  className={`grid grid-cols-12 px-6 py-4 border-b border-slate-100/90 last:border-b-0 hover:bg-pink-50/20 transition-colors cursor-pointer items-center text-xs md:text-sm text-slate-700 group relative font-inter ${
                    isLast ? "rounded-b-2xl" : ""
                  }`}
                >
                  {/* Título del proyecto (sin ícono al lado) */}
                  <div className="col-span-6 md:col-span-5 flex items-center pr-2">
                    <span className="font-bold text-slate-900 group-hover:text-[#7C3AED] transition-colors truncate text-xs md:text-sm font-inter">
                      {proj.name}
                    </span>
                  </div>

                  {/* Fuentes */}
                  <div className="col-span-3 md:col-span-2 font-normal text-slate-600 truncate text-xs md:text-sm font-inter">
                    {fuenteText}
                  </div>

                  {/* Creado / Fecha */}
                  <div className="col-span-3 md:col-span-3 font-normal text-slate-500 truncate text-xs md:text-sm font-inter">
                    {formatProjectDisplayDate(proj.updatedAt)}
                  </div>

                  {/* Rol */}
                  <div className="hidden md:block md:col-span-1 font-normal text-slate-600 text-xs md:text-sm font-inter">
                    Propietario
                  </div>

                  {/* Menú de acciones ⋮ */}
                  <div
                    className="hidden md:flex md:col-span-1 items-center justify-end relative z-30"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setActiveMenuProjectId(activeMenuProjectId === proj.id ? null : proj.id);
                      }}
                      className="p-1.5 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-colors cursor-pointer"
                      title="Opciones"
                    >
                      <MoreVertical size={16} />
                    </button>

                    {activeMenuProjectId === proj.id && (
                      <div
                        ref={menuRef}
                        className="absolute right-0 top-full mt-1.5 w-36 bg-white rounded-xl shadow-xl border border-slate-200 py-1.5 z-50 animate-in fade-in zoom-in-95 duration-100 font-inter"
                      >
                        <button
                          type="button"
                          onClick={() => {
                            setActiveMenuProjectId(null);
                            onSelectProject(proj.id);
                          }}
                          className="w-full text-left px-4 py-2 text-xs md:text-sm font-normal text-slate-700 hover:bg-pink-50/50 hover:text-[#7C3AED] cursor-pointer transition-colors"
                        >
                          Abrir
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setActiveMenuProjectId(null);
                            setProjectToDelete(proj);
                          }}
                          className="w-full text-left px-4 py-2 text-xs md:text-sm font-normal text-red-600 hover:bg-red-50 cursor-pointer transition-colors"
                        >
                          Eliminar
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Mensaje de búsqueda vacía */}
        {filteredProjects.length === 0 && (
          <div className="py-16 text-center text-slate-400 font-inter">
            <FolderOpen size={36} className="mx-auto text-slate-300 mb-2" />
            <p className="text-sm font-bold text-slate-600">No se encontraron proyectos con ese criterio de búsqueda.</p>
            <p className="text-xs font-normal text-slate-400 mt-1">Prueba con otro término de búsqueda.</p>
          </div>
        )}
      </div>

      {/* Modal de confirmación con diseño inspirado en Google Gemini */}
      {projectToDelete && (
        <div
          className="fixed inset-0 z-50 bg-black/40 backdrop-blur-2xs flex items-center justify-center p-4 animate-in fade-in duration-150 font-inter"
          onClick={() => setProjectToDelete(null)}
        >
          <div
            className="bg-white rounded-[28px] p-6 max-w-[440px] w-full shadow-2xl space-y-4 relative border border-slate-100 font-inter"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-xl font-bold text-slate-900 tracking-tight font-inter">
              ¿Eliminar proyecto?
            </h3>

            <p className="text-sm font-normal text-slate-600 leading-relaxed font-inter">
              Se eliminarán las especificaciones, los requerimientos, los diagramas y los archivos asociados a <strong className="font-bold text-slate-800">"{projectToDelete.name}"</strong> de forma permanente.
            </p>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setProjectToDelete(null)}
                className="px-5 py-2 rounded-full text-sm font-normal bg-[#f1f3f4] hover:bg-slate-200 text-slate-700 transition-colors cursor-pointer font-inter"
              >
                Cancelar
              </button>

              <button
                type="button"
                onClick={() => {
                  onDeleteProject(projectToDelete.id);
                  setProjectToDelete(null);
                }}
                className="px-5 py-2 rounded-full text-sm font-bold bg-red-600 hover:bg-red-700 text-white transition-colors cursor-pointer font-inter shadow-xs"
              >
                Eliminar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
