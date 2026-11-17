import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, Loader2, ShieldAlert } from 'lucide-react';
import { acceptFunctionalGateApi, fetchFunctionalGateApi } from '../services/api';

/**
 * Puerta de calidad funcional: muestra qué impediría una entrega correcta y dónde corregirlo.
 * Cada bloqueo puede aceptarse de forma explícita; los avisos solo informan.
 */
export default function FunctionalGatePanel({ projectId, refreshKey = 0, onError }) {
  const [gate, setGate] = useState(null);
  const [busy, setBusy] = useState(false);

  // El aviso de error llega como función nueva en cada render: se guarda en una referencia para no repetir la consulta.
  const notify = useRef(onError);
  useEffect(() => { notify.current = onError; });
  const load = useCallback(async () => {
    try { setGate(await fetchFunctionalGateApi(projectId)); } catch (error) { notify.current?.(error.message); }
  }, [projectId]);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load, refreshKey]);

  if (!gate || gate.estado === 'sin_artefactos') return null;

  const accepted = new Set(gate.excepciones || []);
  const blockers = gate.hallazgos.filter((item) => item.severidad === 'bloqueo');
  const warnings = gate.hallazgos.filter((item) => item.severidad === 'aviso');

  const toggle = async (id) => {
    const next = accepted.has(id) ? [...accepted].filter((item) => item !== id) : [...accepted, id];
    try { setBusy(true); setGate(await acceptFunctionalGateApi(projectId, next)); } catch (error) { notify.current?.(error.message); } finally { setBusy(false); }
  };

  const blocked = gate.estado === 'bloqueada';
  return <section aria-label="Puerta de calidad funcional" className={`rounded-xl border p-4 ${blocked ? 'border-amber-300 bg-amber-50/60' : 'border-emerald-200 bg-emerald-50/50'}`}>
    <div className="flex items-start gap-2">
      {blocked ? <ShieldAlert size={18} className="mt-0.5 text-amber-600" /> : <CheckCircle2 size={18} className="mt-0.5 text-emerald-600" />}
      <div className="min-w-0 flex-1">
        <h3 className="text-sm font-semibold text-slate-900">Puerta de calidad funcional</h3>
        <p className="mt-0.5 text-xs text-slate-600" role="status">
          {blocked
            ? `${gate.pendientes.length} problema(s) impiden empaquetar. Corrígelos o acepta de forma explícita los que no vayas a corregir.`
            : blockers.length ? 'Todos los problemas están aceptados explícitamente: se puede empaquetar.' : 'Sin problemas funcionales detectados.'}
        </p>
      </div>
      {busy && <Loader2 size={14} className="animate-spin text-slate-400" />}
    </div>

    {blockers.length > 0 && <ul className="mt-3 space-y-2">
      {blockers.map((item) => <li key={item.id} className="rounded-lg border border-slate-200 bg-white p-3 text-xs">
        <p className="font-medium text-slate-900">{item.mensaje}</p>
        <p className="mt-1 text-slate-500">Dónde corregirlo: {item.donde}</p>
        <label className="mt-2 flex items-center gap-2 text-slate-600">
          <input type="checkbox" disabled={busy} checked={accepted.has(item.id)} onChange={() => toggle(item.id)} />
          Acepto entregar con este problema (<span className="font-mono">{item.id}</span>)
        </label>
      </li>)}
    </ul>}

    {warnings.length > 0 && <details className="mt-3 text-xs text-slate-600">
      <summary className="cursor-pointer font-semibold"><AlertTriangle size={12} className="mr-1 inline text-amber-500" />{warnings.length} aviso(s)</summary>
      <ul className="mt-2 list-disc space-y-1 pl-5">{warnings.map((item) => <li key={item.id}>{item.mensaje}</li>)}</ul>
    </details>}
  </section>;
}
