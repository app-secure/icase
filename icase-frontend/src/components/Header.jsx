import React from "react";
import { ArrowLeft, LogOut } from "lucide-react";
import RbixLogo from "./RbixLogo";

export default function Header({ onGoToProjects, activeView, projectName, isProcessed, user, onLogout }) {
  const userInitials = user?.nombre
    ? `${user.nombre.charAt(0)}${user.apellido ? user.apellido.charAt(0) : ''}`.toUpperCase()
    : 'U';

  const hasProcessedName = activeView === "workspace" && isProcessed && projectName && projectName !== "Proyecto sin nombre";

  const cleanProjectTitle = (name) => {
    if (!name || name === "Proyecto sin nombre") return "";
    const cleaned = name
      .replace(/^(Sistema de|Sistema para|Sistema|Software de|Software para|Aplicación de|Plataforma de)\s+/i, "")
      .trim();
    return cleaned ? (cleaned.charAt(0).toUpperCase() + cleaned.slice(1)) : name;
  };

  return (
    <header className="h-14 bg-[#1F1D30] border-b border-white/10 px-6 flex items-center justify-between shrink-0 z-10 shadow-xs select-none font-inter">
      <div className="flex items-center gap-3">
        {activeView === "workspace" && (
          <button
            onClick={onGoToProjects}
            className="p-1.5 -ml-1.5 rounded-full hover:bg-white/10 text-slate-200 hover:text-white transition-colors cursor-pointer"
            title="Volver a Mis Proyectos"
          >
            <ArrowLeft size={18} />
          </button>
        )}

        <div className="flex items-center gap-3">
          {/* Al hacer clic en el logo ORBIX se navega directamente a proyectos */}
          <div
            className="cursor-pointer flex items-center hover:opacity-90 transition-opacity"
            onClick={onGoToProjects}
            title="Ir a Mis Proyectos"
          >
            <RbixLogo size="sm" isDark={true} />
          </div>

          {/* Nombre del proyecto procesado al lado del logo */}
          {hasProcessedName && (
            <div className="flex items-center gap-2 border-l border-white/20 pl-3 max-w-md lg:max-w-xl">
              <span className="text-xs font-semibold text-white truncate" title={cleanProjectTitle(projectName)}>
                {cleanProjectTitle(projectName)}
              </span>
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center gap-3">
        {/* Datos del usuario autenticado y botón de cerrar sesión */}
        {user && (
          <div className="flex items-center gap-2.5">
            <div
              className="w-8 h-8 rounded-full bg-white/15 border border-white/20 text-white flex items-center justify-center font-bold text-xs shadow-xs shrink-0"
              title={`${user.nombre} ${user.apellido || ""} (${user.correo || ""})`}
            >
              {userInitials}
            </div>
            <div className="hidden sm:flex flex-col text-left leading-tight">
              <span className="text-sm font-semibold text-white">
                {user.nombre} {user.apellido || ""}
              </span>
              {user.correo && (
                <span className="text-xs text-slate-300 font-normal">
                  {user.correo}
                </span>
              )}
            </div>
            <button
              onClick={onLogout}
              className="p-1.5 rounded-md hover:bg-white/10 text-slate-400 hover:text-rose-400 transition-colors cursor-pointer ml-1"
              title="Cerrar sesión"
            >
              <LogOut size={16} />
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
