import React from 'react';
import { CheckCircle2, CircleDashed, XCircle } from 'lucide-react';

const ROWS = [
  ['backend', 'Backend (API)'], ['frontend', 'Frontend web y móvil'], ['tests', 'Pruebas'],
  ['infrastructure', 'Infraestructura Docker'], ['pipeline', 'CI/CD'], ['delivery', 'Paquete final']
];

function status(artifact) {
  if (!artifact) return { label: 'Sin generar', icon: CircleDashed, style: 'text-slate-400' };
  if (artifact.aprobado) return { label: 'Aprobado', icon: CheckCircle2, style: 'text-emerald-600' };
  if (artifact.estado === 'rechazado') return { label: 'Rechazado', icon: XCircle, style: 'text-red-600' };
  return { label: 'En revisión', icon: CircleDashed, style: 'text-amber-600' };
}

/** Verificación en Docker: «fallida» se marca en rojo; sin resultado, aún no se ejecutó. */
function verification(artifact) {
  const result = artifact?.verificacion?.estado;
  if (!artifact) return null;
  if (artifact.pendiente_reverificacion) return { label: 'Corrección por verificar', style: 'text-amber-700' };
  if (!result) return { label: 'Sin verificar', style: 'text-slate-500' };
  return { label: result, style: /fall|error/i.test(result) ? 'text-red-700' : 'text-emerald-700' };
}

/**
 * «Qué se generó»: una sola mirada al estado de cada pieza de la entrega (versión, archivos, aprobación y verificación),
 * para no recorrer las seis etapas una por una.
 */
export default function GeneratedSummary({ artifacts }) {
  const items = ROWS.map(([key, label]) => ({ key, label, artifact: artifacts[key] }));
  if (!items.some((item) => item.artifact)) return null;
  const approved = items.filter((item) => item.artifact?.aprobado).length;
  return <section aria-label="Qué se generó" className="rounded-xl border border-slate-200 bg-white p-4">
    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
      <h3 className="text-sm font-semibold text-slate-900">Qué se generó</h3>
      <span className="text-xs text-slate-500">{approved} de {ROWS.length} piezas aprobadas</span>
    </div>
    <ul className="divide-y divide-slate-100 text-xs">
      {items.map(({ key, label, artifact }) => {
        const state = status(artifact);
        const check = verification(artifact);
        const Icon = state.icon;
        return <li key={key} className="flex flex-wrap items-center justify-between gap-2 py-2">
          <span className="flex items-center gap-2 font-medium text-slate-800"><Icon size={14} className={state.style} />{label}</span>
          <span className="flex flex-wrap items-center gap-3 text-slate-500">
            {artifact && <span>v{artifact.version} · {artifact.archivos?.length || 0} archivos</span>}
            <span className={state.style}>{state.label}</span>
            {check && <span className={check.style}>Verificación: {check.label}</span>}
          </span>
        </li>;
      })}
    </ul>
  </section>;
}
