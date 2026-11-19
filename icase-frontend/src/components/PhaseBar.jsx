import React from 'react';
import { BookOpen, Check, ChevronRight, Code2, FileText, LockKeyhole, Network, Paperclip, ScanText } from 'lucide-react';
import { phasesOf } from './PhaseNav';

const ICONS = { 1: ScanText, 2: Network, 3: Code2, 4: FileText };

/**
 * Avance general del proyecto, arriba y siempre visible: las cuatro fases y su estado, para pasar de una a otra con un clic.
 * Los botones «Solo consulta» abren paneles de lectura (insumos y requisitos aprobados) y no cambian de fase ni modifican nada.
 */
export default function PhaseBar({ project, disabled = false, onSelect, onToggleRequirements, onToggleSources, requirementsAvailable = false, sourcesAvailable = false }) {
  const phases = phasesOf(project);
  return (
    <div className="shrink-0 border-b border-white/10 bg-[#171425] px-4 py-2">
      <div className="mx-auto flex max-w-[1600px] items-center gap-3">
        <nav aria-label="Fases del proyecto" className="flex min-w-0 flex-1 items-stretch gap-1 sm:gap-2">
          {phases.map((phase, index) => {
            const blocked = !phase.unlocked || disabled;
            const Icon = ICONS[phase.id];
            const status = phase.active ? 'En curso' : phase.done ? 'Completada' : phase.unlocked ? 'Disponible' : 'Bloqueada';
            return (
              <React.Fragment key={phase.id}>
                <button type="button" disabled={blocked} aria-current={phase.active ? 'step' : undefined} onClick={() => onSelect(phase.id)}
                  title={!phase.unlocked ? phase.lockedReason : `Ir a ${phase.label}`}
                  className={`flex min-w-0 flex-1 items-center gap-2.5 rounded-xl border px-2.5 py-1.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 ${
                    phase.active ? 'border-violet-400/50 bg-violet-500/20 text-white shadow-sm'
                      : blocked ? 'cursor-not-allowed border-transparent bg-white/5 text-slate-500'
                        : 'cursor-pointer border-transparent text-slate-200 hover:border-white/15 hover:bg-white/10'}`}>
                  <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                    phase.active ? 'bg-violet-600 text-white' : phase.done ? 'bg-emerald-400/15 text-emerald-300' : 'bg-white/10 text-slate-400'}`}>
                    {phase.done && !phase.active ? <Check size={15} aria-hidden="true" /> : !phase.unlocked ? <LockKeyhole size={13} aria-hidden="true" /> : <Icon size={15} aria-hidden="true" />}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold leading-tight">{phase.label}</span>
                    <span className={`block truncate text-[10px] leading-tight ${phase.active ? 'text-violet-300' : phase.done ? 'text-emerald-300' : 'text-slate-400'}`}>{status}</span>
                  </span>
                </button>
                {index < phases.length - 1 && <ChevronRight size={14} className="shrink-0 self-center text-slate-600 max-sm:hidden" aria-hidden="true" />}
              </React.Fragment>
            );
          })}
        </nav>

        {(sourcesAvailable || requirementsAvailable) && (
          <div role="group" aria-label="Solo consulta" className="flex shrink-0 items-center gap-1">
            {sourcesAvailable && <button type="button" onClick={onToggleSources} title="Ver los insumos del proyecto (solo lectura)" className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-white/15 px-2.5 py-1.5 text-xs font-medium text-slate-200 hover:bg-white/10"><Paperclip size={13} />Insumos</button>}
            {requirementsAvailable && <button type="button" onClick={onToggleRequirements} title="Ver los requisitos aprobados (solo lectura)" className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-white/15 px-2.5 py-1.5 text-xs font-medium text-slate-200 hover:bg-white/10"><BookOpen size={13} />Requisitos</button>}
          </div>
        )}
      </div>
    </div>
  );
}
