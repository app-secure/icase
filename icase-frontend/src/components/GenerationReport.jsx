import React, { useMemo, useState } from 'react';
import { ClipboardList, Loader2 } from 'lucide-react';
import { fetchGenerationReportApi } from '../services/api';

const REPORT_FILE = 'backend/GENERATION-REPORT.json';

const LEVELS = {
  completo: { label: 'Completo', style: 'border-emerald-200 bg-emerald-50 text-emerald-700' },
  solo_datos: { label: 'Solo datos', style: 'border-amber-200 bg-amber-50 text-amber-700' },
  no_soportado: { label: 'No soportado', style: 'border-red-200 bg-red-50 text-red-700' }
};

function storedReport(artifact) {
  const file = (artifact?.archivos || []).find((item) => item.ruta === REPORT_FILE);
  if (!file) return null;
  try { return JSON.parse(file.contenido); } catch { return null; }
}

/** Qué se genera de cada requisito: el del backend ya generado o una vista previa con las decisiones actuales. */
export default function GenerationReport({ projectId, artifact }) {
  const stored = useMemo(() => storedReport(artifact), [artifact]);
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const report = preview || stored;

  const refresh = async () => {
    setLoading(true); setError('');
    try { setPreview(await fetchGenerationReportApi(projectId)); }
    catch (failure) { setError(failure.message); }
    finally { setLoading(false); }
  };

  return <div className="mt-3 rounded-lg border border-slate-200 bg-white p-3 text-xs">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <span className="flex items-center gap-1.5 font-semibold text-slate-700"><ClipboardList size={14} />Informe de lo que se genera{preview ? ' (vista previa con las decisiones actuales)' : stored ? ' (de esta versión)' : ''}</span>
      <button type="button" disabled={loading} onClick={refresh} className="flex items-center gap-1.5 rounded-lg border border-violet-200 px-3 py-1.5 font-semibold text-violet-700 disabled:opacity-50">
        {loading && <Loader2 size={12} className="animate-spin" />}{report ? 'Actualizar informe' : 'Ver qué se generará'}
      </button>
    </div>
    {error && <p role="alert" className="mt-2 text-red-600">{error}</p>}
    {report && <div className="mt-3 space-y-3">
      <div className="flex flex-wrap gap-2">
        {Object.entries(LEVELS).map(([id, level]) => <span key={id} className={`rounded-full border px-2 py-0.5 font-semibold ${level.style}`}>{level.label}: {report.resumen?.[id] ?? 0}</span>)}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead><tr className="border-b border-slate-200 text-slate-500"><th scope="col" className="py-1 pr-3">RF</th><th scope="col" className="py-1 pr-3">Nombre</th><th scope="col" className="py-1 pr-3">Nivel</th><th scope="col" className="py-1 pr-3">Entidad</th><th scope="col" className="py-1">Reglas</th></tr></thead>
          <tbody>{(report.requisitos || []).map((item) => <React.Fragment key={item.id}>
            <tr className="border-b border-slate-100 align-top">
              <td className="py-1 pr-3 font-mono">{item.id}</td>
              <td className="py-1 pr-3">{item.nombre}</td>
              <td className="py-1 pr-3"><span className={`rounded-full border px-2 py-0.5 ${LEVELS[item.nivel]?.style || ''}`}>{LEVELS[item.nivel]?.label || item.nivel}</span></td>
              <td className="py-1 pr-3">{item.entidad || '—'}</td>
              <td className="py-1">{item.reglas}</td>
            </tr>
            {item.nivel !== 'completo' && <tr className="border-b border-slate-100"><td /><td colSpan={4} className="pb-2 text-slate-600">
              <ul className="list-disc space-y-0.5 pl-4">{(item.motivos || []).map((reason) => <li key={reason}>{reason}</li>)}</ul>
              {(item.capacidades || []).length > 0 && <p className="mt-1 text-slate-500">Detectado en {item.capacidades.map((capability) => capability.evidencia).join('; ')}.</p>}
            </td></tr>}
          </React.Fragment>)}</tbody>
        </table>
      </div>
      {(report.capacidades_no_generadas || []).length > 0 && <div>
        <p className="font-semibold text-slate-700">Pedido y no generado</p>
        <ul className="mt-1 list-disc space-y-0.5 pl-4 text-slate-600">{report.capacidades_no_generadas.map((item) => <li key={item.id}><span className="font-medium">{item.etiqueta}</span> — {[item.requisitos?.length ? `en ${item.requisitos.join(', ')}` : '', item.stack ? `en el stack (${item.stack})` : ''].filter(Boolean).join(' y ')}. {item.alternativa}</li>)}</ul>
      </div>}
      {(report.entidades_sin_requisito || []).length > 0 && <p className="text-amber-700">Entidades del modelo sin requisito (tienen tabla, pero no API ni pantalla): {report.entidades_sin_requisito.join(', ')}.</p>}
      {(report.notas || []).map((note) => <p key={note} className="text-slate-600">• {note}</p>)}
      <details>
        <summary className="cursor-pointer font-medium text-violet-700">Límites de toda la aplicación generada</summary>
        <ul className="mt-2 list-disc space-y-0.5 pl-4 text-slate-600">{(report.limites_generales || []).map((limit) => <li key={limit}>{limit}</li>)}</ul>
        <p className="mt-2 text-slate-500">{report.deteccion}</p>
      </details>
    </div>}
  </div>;
}
