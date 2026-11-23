import React from 'react';
import { ArrowLeft, Check, ChevronsLeft, ChevronsRight, LockKeyhole, RefreshCw } from 'lucide-react';

/**
 * Avance de la fase actual, a la izquierda y con el mismo aspecto en todas las fases (análisis, modelamiento, codificación):
 * una lista de pasos con su estado y un conector entre ellos. Se puede contraer a una columna de iconos para dar más espacio al contenido.
 *
 * `steps`: [{ key, label, state: 'done' | 'pending' | 'blocked' | 'stale', hint?, title? }]. El paso actual lo marca `currentKey`.
 */
export default function StepSidebar({ title, steps, currentKey, onSelect, collapsed = false, onToggleCollapsed = null, footer = null, onExit = null, ariaLabel }) {
  return (
    <aside aria-label={ariaLabel || title} className={`${collapsed ? 'w-14' : 'w-64'} flex shrink-0 select-none flex-col overflow-y-auto border-r border-slate-100 bg-white transition-[width] duration-150 motion-reduce:transition-none`}>
      <div className={`flex items-center ${collapsed ? 'justify-center px-2' : 'justify-between px-5'} pt-5 pb-3`}>
        {!collapsed && <h2 className="text-[11px] font-bold uppercase tracking-wider text-slate-400">{title}</h2>}
        {onToggleCollapsed && (
          <button type="button" onClick={onToggleCollapsed} aria-label={collapsed ? 'Mostrar los pasos' : 'Ocultar los pasos'} title={collapsed ? 'Mostrar los pasos' : 'Ocultar los pasos'}
            className="inline-flex cursor-pointer items-center justify-center rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
            {collapsed ? <ChevronsRight size={16} /> : <ChevronsLeft size={16} />}
          </button>
        )}
      </div>

      <nav className="flex flex-1 flex-col pb-4">
        {steps.map((step, index) => {
          const selected = step.key === currentKey;
          const done = step.state === 'done';
          const blocked = step.state === 'blocked';
          const stale = step.state === 'stale';
          const next = steps[index + 1];
          return (
            <React.Fragment key={step.key}>
              <button type="button" disabled={blocked} onClick={() => !blocked && onSelect(step.key)} aria-current={selected ? 'step' : undefined}
                title={step.title || (blocked ? `${step.label}: aún no disponible` : step.label)}
                className={`group flex w-full items-center gap-3 ${collapsed ? 'justify-center px-0' : 'px-5'} py-2.5 text-left text-[13px] transition-colors ${
                  selected ? 'bg-[#F8F4FF] font-bold text-[#6D28D9]' : done ? 'cursor-pointer font-semibold text-slate-800 hover:bg-slate-50/80'
                    : blocked ? 'cursor-not-allowed text-slate-400 opacity-65' : 'cursor-pointer font-medium text-slate-500 hover:bg-slate-50/80'}`}>
                <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ${
                  done ? 'bg-emerald-500 text-white' : stale ? 'border border-amber-400 bg-amber-50 text-amber-600'
                    : selected ? 'border border-violet-500 bg-violet-100 text-violet-700' : 'border border-slate-300 bg-white text-slate-500'}`}>
                  {done ? <Check size={12} strokeWidth={3} /> : stale ? <RefreshCw size={10} /> : blocked && collapsed ? <LockKeyhole size={10} /> : index + 1}
                </span>
                {!collapsed && <>
                  <span className="min-w-0 flex-1 truncate">{step.label}</span>
                  {step.hint && <span className="shrink-0 text-[10px] font-medium text-slate-400">{step.hint}</span>}
                  {blocked && <LockKeyhole size={12} className="ml-auto shrink-0 text-slate-400" />}
                </>}
              </button>
              {next && (
                <div className={`pointer-events-none flex items-center ${collapsed ? 'justify-center' : 'px-5'}`} aria-hidden="true">
                  <div className="flex w-5 justify-center"><span className={`block h-2.5 w-[2px] rounded-full ${done && next.state === 'done' ? 'bg-emerald-500' : 'bg-slate-200'}`} /></div>
                </div>
              )}
            </React.Fragment>
          );
        })}
      </nav>
      {footer && !collapsed && <div className="border-t border-slate-100 p-3">{footer}</div>}
      {onExit && (
        <div className="border-t border-slate-100 p-2">
          <button type="button" onClick={onExit} title="Volver a la lista de proyectos" aria-label="Volver a la lista de proyectos"
            className={`flex w-full cursor-pointer items-center ${collapsed ? 'justify-center' : 'gap-2 px-3'} rounded-lg py-2 text-[12px] font-medium text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-800`}>
            <ArrowLeft size={15} className="shrink-0" />{!collapsed && <span className="truncate">Mis proyectos</span>}
          </button>
        </div>
      )}
    </aside>
  );
}
