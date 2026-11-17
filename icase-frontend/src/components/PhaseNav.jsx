import React from 'react';
import { BookOpen, Check, LockKeyhole, Paperclip } from 'lucide-react';

/**
 * Navegación entre las fases del proyecto. Cada fase es un destino directo (si ya está habilitada) y se distingue
 * de los paneles de «solo consulta» (insumos y requisitos aprobados), que no cambian de fase ni modifican nada.
 */
export function phasesOf(project) {
  const analysisDone = Boolean(project.isAnalysisApproved);
  const designDone = Boolean(project.isDiagramsApproved && project.isMockupsApproved);
  return [
    { id: 1, label: 'Análisis', done: analysisDone, unlocked: true, active: project.currentPhase <= 1 },
    { id: 2, label: 'Modelamiento', done: designDone, unlocked: analysisDone, lockedReason: 'Aprueba el análisis y los requisitos para habilitarla.', active: project.currentPhase === 2 },
    { id: 3, label: 'Codificación', done: false, unlocked: designDone, lockedReason: 'Aprueba los diagramas y los mockups para habilitarla.', active: project.currentPhase === 3 },
    { id: 4, label: 'Documento', done: false, unlocked: designDone, lockedReason: 'Aprueba los diagramas y los mockups para habilitarla.', active: project.currentPhase === 4 }
  ];
}

export default function PhaseNav({ project, disabled = false, onSelect, onToggleRequirements, onToggleSources, requirementsAvailable = false, sourcesAvailable = false }) {
  const phases = phasesOf(project);
  return <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-white px-4 py-2">
    <nav aria-label="Fases del proyecto" className="flex items-center gap-1">
      {phases.map((phase, index) => {
        const blocked = !phase.unlocked || disabled;
        return <React.Fragment key={phase.id}>
          {index > 0 && <span aria-hidden="true" className="text-slate-300">›</span>}
          <button type="button" disabled={blocked} aria-current={phase.active ? 'step' : undefined}
            title={!phase.unlocked ? phase.lockedReason : `Ir a ${phase.label}`}
            onClick={() => onSelect(phase.id)}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
              phase.active ? 'bg-violet-100 text-violet-800' : blocked ? 'cursor-not-allowed text-slate-400' : 'cursor-pointer text-slate-600 hover:bg-slate-100'}`}>
            {phase.done ? <Check size={13} className="text-emerald-600" /> : !phase.unlocked ? <LockKeyhole size={12} /> : null}
            {phase.label}
          </button>
        </React.Fragment>;
      })}
    </nav>

    {/* Estos botones solo abren paneles de lectura: no cambian de fase ni editan nada. */}
    <div role="group" aria-label="Solo consulta" className="flex items-center gap-1 rounded-lg border border-dashed border-slate-300 px-2 py-1">
      <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Solo consulta</span>
      {sourcesAvailable && <button type="button" onClick={onToggleSources} title="Ver los insumos del proyecto" className="flex cursor-pointer items-center gap-1 rounded px-2 py-1 text-xs text-slate-600 hover:bg-slate-100"><Paperclip size={12} />Insumos</button>}
      {requirementsAvailable && <button type="button" onClick={onToggleRequirements} title="Ver los requisitos aprobados (solo lectura)" className="flex cursor-pointer items-center gap-1 rounded px-2 py-1 text-xs text-slate-600 hover:bg-slate-100"><BookOpen size={12} />Requisitos</button>}
      {!requirementsAvailable && !sourcesAvailable && <span className="px-2 py-1 text-xs text-slate-300">Sin paneles en esta vista</span>}
    </div>
  </div>;
}
