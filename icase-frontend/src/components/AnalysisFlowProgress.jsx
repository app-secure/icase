import React from 'react';
import { ArrowLeft, Check, ChevronDown, ChevronUp, ChevronRight, Files, ScanText, ListChecks } from 'lucide-react';

const steps = [
  { key: 'sources', title: 'Fuentes', description: 'Información del proyecto', icon: Files },
  { key: 'analysis', title: 'Análisis inicial', description: 'Comprender y aprobar', icon: ScanText },
  { key: 'requirements', title: 'Requisitos', description: 'Definir y validar RF / RNF', icon: ListChecks }
];

export default function AnalysisFlowProgress({ current, completed, requirementsAvailable, laterPhase, onNavigate, collapsed = false, onReveal, onCollapse, onBack }) {
  const active = steps.findIndex(step => step.key === current);
  return (
    <div className="shrink-0">
    {collapsed && <div className="border-b border-white/10 bg-[#171425] px-4 py-3 md:px-8"><div className="mx-auto flex max-w-[1200px] flex-wrap items-center justify-between gap-2 pl-10 md:pl-8 xl:pl-0"><div className="flex items-center gap-2">{onBack && <button type="button" onClick={onBack} aria-label="Volver a Mis Proyectos" title="Volver a Mis Proyectos" className="inline-flex shrink-0 items-center justify-center rounded-lg p-2 text-slate-300 hover:bg-white/10 hover:text-white focus-visible:outline-violet-500"><ArrowLeft size={17} /></button>}<span className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-300">{`Fase ${active + 1} · ${steps[active]?.title || "Análisis del proyecto"}`}</span></div><div className="ml-auto flex flex-wrap items-center justify-end gap-4"><span className="text-xs font-medium text-violet-300">{laterPhase ? `Consultando análisis · ${laterPhase}` : `Paso ${active + 1} de 3 · ${steps[active]?.title}`}</span><button type="button" onClick={onReveal} aria-expanded="false" aria-label="Mostrar pasos" title="Mostrar pasos" className="inline-flex shrink-0 cursor-pointer items-center justify-center p-1.5 text-violet-200 focus-visible:outline-violet-500"><ChevronDown size={16} aria-hidden="true" /></button></div></div></div>}
    <div className={`grid transition-[grid-template-rows,opacity] duration-200 motion-reduce:transition-none ${collapsed ? 'grid-rows-[0fr] opacity-0' : 'grid-rows-[1fr] opacity-100'}`} inert={collapsed} aria-hidden={collapsed ? true : undefined}>
    <div className="min-h-0 overflow-hidden"><nav aria-label="Subfases del análisis" className="border-b border-white/10 bg-[#171425] px-4 py-3 md:px-8">
      <div className="mx-auto max-w-[1200px]">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 pl-10 md:pl-8 xl:pl-0">
          <div className="flex items-center gap-2">{onBack && <button type="button" onClick={onBack} aria-label="Volver a Mis Proyectos" title="Volver a Mis Proyectos" className="inline-flex shrink-0 items-center justify-center rounded-lg p-2 text-slate-300 hover:bg-white/10 hover:text-white focus-visible:outline-violet-500"><ArrowLeft size={17} /></button>}<span className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-300">{`Fase ${active + 1} · ${steps[active]?.title || "Análisis del proyecto"}`}</span></div>
          <div className="ml-auto flex flex-wrap items-center justify-end gap-4"><span className="text-xs font-medium text-violet-300" aria-live="polite">
            {laterPhase ? `Consultando análisis · ${laterPhase}` : `Paso ${active + 1} de 3 · ${steps[active]?.title}`}
          </span><button type="button" onClick={onCollapse} aria-expanded="true" aria-label="Colapsar pasos" title="Colapsar pasos" className="inline-flex shrink-0 cursor-pointer items-center justify-center p-1.5 text-violet-200 focus-visible:outline-violet-500"><ChevronUp size={16} aria-hidden="true" /></button></div>
        </div>
        <ol className="flex min-w-0 items-stretch gap-1 sm:gap-3">
          {steps.map((step, index) => {
            const selected = current === step.key;
            const done = completed[step.key];
            const disabled = step.key === 'requirements' && !requirementsAvailable;
            const Icon = step.icon;
            return (
              <li key={step.key} className="flex min-w-0 flex-1 items-center gap-1 sm:gap-3">
                <button type="button" aria-label={step.title} aria-current={selected ? 'step' : undefined} disabled={disabled}
                  onClick={() => onNavigate(step.key)}
                  title={disabled ? 'Disponible después de generar los requisitos' : `Consultar ${step.title.toLowerCase()}`}
                  className={`flex h-full w-full min-w-0 items-center gap-2 rounded-xl border px-2 py-2.5 text-left transition-colors sm:gap-3 sm:px-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed ${selected ? 'border-violet-400/50 bg-violet-500/20 text-white shadow-sm' : disabled ? 'border-transparent bg-white/5 text-slate-500' : 'border-transparent text-slate-200 hover:border-white/15 hover:bg-white/10'}`}>
                  <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold sm:h-9 sm:w-9 ${selected ? 'bg-violet-600 text-white' : done ? 'bg-emerald-400/15 text-emerald-300' : 'bg-white/10 text-slate-400'}`}>
                    {done && !selected ? <Check size={16} aria-hidden="true" /> : <Icon size={16} aria-hidden="true" />}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-xs font-semibold leading-snug sm:text-sm">{step.title}</span>
                    <span className="mt-0.5 hidden text-[11px] text-slate-400 md:block">{step.description}</span>
                    <span className={`mt-0.5 block text-[10px] leading-tight ${selected ? 'text-violet-300' : done ? 'text-emerald-300' : 'text-slate-400'}`}>
                      {selected ? 'En pantalla' : done ? 'Completado' : disabled ? 'Pendiente' : 'Por revisar'}
                    </span>
                  </span>
                </button>
                {index < steps.length - 1 && <ChevronRight size={14} className="shrink-0 text-slate-600 max-sm:hidden" aria-hidden="true" />}
              </li>
            );
          })}
        </ol>
      </div>
    </nav></div></div></div>
  );
}
