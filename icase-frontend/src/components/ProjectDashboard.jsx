import React from "react";
import { Plus, FileText, FileAudio, FileCode, CheckCircle2, Trash2, Clock } from "lucide-react";

export default function ProjectDashboard({
  projects,
  onSelectProject,
  onCreateProject,
  onDeleteProject
}) {
  const handleQuickCreate = () => {
    // Al presionar nuevo proyecto, simplemente se crea sin modal como "Proyecto sin nombre"
    // y se abre directamente la pantalla 2
    const newProject = {
      id: "proj-" + Date.now(),
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

  const getSourceIcon = (type) => {
    switch (type) {
      case "audio":
        return <FileAudio size={13} className="text-amber-600" />;
      case "pdf":
        return <FileText size={13} className="text-red-500" />;
      case "txt":
      default:
        return <FileCode size={13} className="text-blue-500" />;
    }
  };

  return (
    <div className="flex-1 overflow-y-auto bg-slate-50 p-6 md:p-10">
      <div className="max-w-6xl mx-auto">
        {/* NotebookLM Shelf Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-normal text-slate-800 tracking-tight">
            Mis Proyectos
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Selecciona un proyecto para revisar su análisis o crea uno nuevo para procesar fuentes.
          </p>
        </div>

        {/* Project Cards Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {/* Card: + Crear Proyecto (Minimalist NotebookLM style) */}
          <button
            type="button"
            onClick={handleQuickCreate}
            className="h-56 rounded-2xl border border-dashed border-slate-300 hover:border-slate-400 bg-white hover:bg-slate-50/80 p-5 flex flex-col items-center justify-center text-center transition-all cursor-pointer group shadow-sm hover:shadow"
          >
            <div className="w-12 h-12 rounded-full bg-slate-100 group-hover:bg-blue-50 flex items-center justify-center text-slate-500 group-hover:text-blue-600 transition-colors mb-3">
              <Plus size={24} />
            </div>
            <span className="text-sm font-medium text-slate-800">
              Crear Proyecto
            </span>
            <span className="text-xs text-slate-400 mt-1">
              Nuevo cuaderno de requisitos
            </span>
          </button>

          {/* Existing Projects Cards */}
          {projects.map((proj) => (
            <div
              key={proj.id}
              onClick={() => onSelectProject(proj.id)}
              className="h-56 bg-white border border-slate-200 hover:border-slate-300 rounded-2xl p-5 flex flex-col justify-between transition-all cursor-pointer shadow-sm hover:shadow group relative"
            >
              <div>
                {/* Project Title */}
                <div className="flex items-start justify-between gap-2 mb-2">
                  <h2 className="text-sm font-medium text-slate-900 group-hover:text-blue-600 transition-colors line-clamp-2">
                    {proj.name}
                  </h2>

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteProject(proj.id);
                    }}
                    className="opacity-0 group-hover:opacity-100 p-1 text-slate-400 hover:text-red-500 rounded transition-opacity"
                    title="Eliminar proyecto"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>

                {/* Sources list (No button to upload more for existing projects) */}
                <div className="mt-3">
                  <span className="text-[11px] font-medium text-slate-400 block mb-1.5">
                    Fuentes analizadas ({proj.sources?.length || 0}):
                  </span>

                  {proj.sources && proj.sources.length > 0 ? (
                    <div className="space-y-1.5 max-h-24 overflow-hidden">
                      {proj.sources.slice(0, 3).map((s) => (
                        <div
                          key={s.id}
                          className="flex items-center gap-1.5 text-xs text-slate-600 bg-slate-50 px-2 py-1 rounded border border-slate-100 truncate"
                        >
                          {getSourceIcon(s.type)}
                          <span className="truncate">{s.name}</span>
                        </div>
                      ))}
                      {proj.sources.length > 3 && (
                        <span className="text-[11px] text-slate-400 pl-1 block">
                          +{proj.sources.length - 3} fuentes más
                        </span>
                      )}
                    </div>
                  ) : (
                    <span className="text-xs text-slate-400 italic">
                      Sin fuentes cargadas
                    </span>
                  )}
                </div>
              </div>

              {/* Card Footer */}
              <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-400">
                <span className="flex items-center gap-1">
                  <Clock size={11} /> {proj.updatedAt}
                </span>

                {proj.isAnalysisApproved && (
                  <span className="flex items-center gap-1 text-emerald-600 font-medium">
                    <CheckCircle2 size={12} /> Aprobado
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
