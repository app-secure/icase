import React from 'react';
import { Check, ChevronDown, ChevronRight, Files, ScanText, ListChecks } from 'lucide-react';

const steps = [
  { key: 'sources', title: 'Fuentes', description: 'Información del proyecto', icon: Files },
  { key: 'analysis', title: 'Análisis inicial', description: 'Comprender y aprobar', icon: ScanText },
  { key: 'requirements', title: 'Requisitos', description: 'Definir y validar RF / RNF', icon: ListChecks }
];

export default function AnalysisFlowProgress({ current, completed, requirementsAvailable, laterPhase, onNavigate, collapsed = false, onReveal }) {
  const active = steps.findIndex(step => step.key === current);
  return (
    <div className="shrink-0">
    {collapsed && <div className="border-b border-slate-200 bg-white px-4 py-3 md:px-8"><div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2"><span className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">Fase 1 · Análisis del proyecto</span><div className="flex flex-wrap items-center gap-4"><span className="text-xs font-medium text-violet-700">{laterPhase ? `Consultando análisis · ${laterPhase}` : `Paso ${active + 1} de 3 · ${steps[active]?.title}`}</span><button type="button" onClick={onReveal} aria-expanded="false" className="inline-flex items-center gap-1 rounded-lg border border-violet-200 px-2 py-1 text-[11px] font-medium text-violet-700 hover:bg-violet-50 focus-visible:outline-violet-500">Mostrar pasos<ChevronDown size={13} aria-hidden="true" /></button></div></div></div>}
    <div className={`grid transition-[grid-template-rows,opacity] duration-200 motion-reduce:transition-none ${collapsed ? 'grid-rows-[0fr] opacity-0' : 'grid-rows-[1fr] opacity-100'}`} inert={collapsed} aria-hidden={collapsed ? true : undefined}>
    <div className="min-h-0 overflow-hidden"><nav aria-label="Subfases del análisis" className="border-b border-slate-200 bg-white px-4 py-3 md:px-8">
      <div className="mx-auto max-w-6xl">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">Fase 1 · Análisis del proyecto</span>
          <span className="text-xs font-medium text-violet-700" aria-live="polite">
            {laterPhase ? `Consultando análisis · ${laterPhase}` : `Paso ${active + 1} de 3 · ${steps[active]?.title}`}
          </span>
        </div>
        <ol className="flex items-stretch gap-1 sm:gap-3">
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
                  className={`flex h-full w-full min-w-0 items-center gap-2 rounded-xl border px-2 py-2.5 text-left transition-colors sm:gap-3 sm:px-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed ${selected ? 'border-violet-200 bg-violet-50 text-violet-800 shadow-sm' : disabled ? 'border-transparent bg-slate-50 text-slate-400' : 'border-transparent text-slate-600 hover:border-slate-200 hover:bg-slate-50'}`}>
                  <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold sm:h-9 sm:w-9 ${selected ? 'bg-violet-600 text-white' : done ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                    {done && !selected ? <Check size={16} aria-hidden="true" /> : <Icon size={16} aria-hidden="true" />}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-xs font-semibold leading-snug sm:text-sm">{step.title}</span>
                    <span className="mt-0.5 hidden text-[11px] text-slate-500 md:block">{step.description}</span>
                    <span className={`mt-0.5 block text-[10px] leading-tight ${selected ? 'text-violet-600' : done ? 'text-emerald-700' : 'text-slate-400'}`}>
                      {selected ? 'En pantalla' : done ? 'Completado' : disabled ? 'Pendiente' : 'Por revisar'}
                    </span>
                  </span>
                </button>
                {index < steps.length - 1 && <ChevronRight size={14} className="shrink-0 text-slate-300 max-sm:hidden" aria-hidden="true" />}
              </li>
            );
          })}
        </ol>
      </div>
    </nav></div></div></div>
  );
}
