import React from "react";
import { ArrowLeft, BookOpen, Layers } from "lucide-react";

export default function Header({ onGoToProjects, activeView, projectName }) {
  return (
    <header className="h-14 bg-white border-b border-slate-200 px-6 flex items-center justify-between shrink-0 z-10">
      <div className="flex items-center gap-3">
        {activeView === "workspace" && (
          <button
            onClick={onGoToProjects}
            className="p-1.5 -ml-1.5 rounded-full hover:bg-slate-100 text-slate-600 transition-colors"
            title="Volver al catálogo de proyectos"
          >
            <ArrowLeft size={18} />
          </button>
        )}

        <div className="flex items-center gap-2.5 cursor-pointer" onClick={onGoToProjects}>
          <div className="w-8 h-8 rounded-lg bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-600 font-bold text-sm">
            I
          </div>
          <div>
            <span className="text-base font-medium text-slate-800 tracking-tight">
              I-CASE
            </span>
            <span className="text-xs text-slate-400 ml-2 hidden sm:inline">
              Ingeniería de Software
            </span>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3">
        {activeView === "workspace" && projectName && projectName !== "Proyecto sin nombre" && (
          <span className="text-xs font-medium text-slate-600 bg-slate-100 px-3 py-1 rounded-full">
            {projectName}
          </span>
        )}

        <button
          onClick={onGoToProjects}
          className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
            activeView === "dashboard"
              ? "bg-slate-100 text-slate-900"
              : "text-slate-600 hover:text-slate-900 hover:bg-slate-50"
          }`}
        >
          Proyectos
        </button>
      </div>
    </header>
  );
}
