import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, Box, Loader2, Monitor, RefreshCw, Smartphone } from 'lucide-react';
import { fetchGenerationPreviewApi } from '../services/api';

const ORIGIN = {
  especificacion: { label: 'Desde la especificación', style: 'bg-emerald-100 text-emerald-700' },
  mockup: { label: 'Desde el mockup', style: 'bg-sky-100 text-sky-700' },
  crud: { label: 'Solo CRUD genérico', style: 'bg-amber-100 text-amber-700' }
};
const COMPONENT = { tabla: 'Tabla', tarjetas: 'Tarjetas', formulario: 'Formulario', detalle: 'Detalle', kpi: 'Indicador' };

function Stat({ label, value, warn }) {
  return <div className={`rounded-lg border p-3 ${warn ? 'border-amber-200 bg-amber-50' : 'border-slate-200 bg-white'}`}>
    <p className="text-[10px] font-semibold uppercase text-slate-400">{label}</p>
    <p className={`mt-0.5 text-lg font-semibold ${warn ? 'text-amber-700' : 'text-slate-900'}`}>{value}</p>
  </div>;
}

function ScreenCard({ screen }) {
  const origin = ORIGIN[screen.origen] || ORIGIN.crud;
  const Icon = screen.plataforma === 'móvil' ? Smartphone : Monitor;
  return <article className="rounded-xl border border-slate-200 bg-white p-4">
    <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
      <Icon size={13} className="text-slate-400" />
      <h4 className="text-sm font-semibold text-slate-900">{screen.nombre}</h4>
      <span className="font-mono text-slate-500">{screen.ruta}</span>
      <span className={`rounded px-1.5 py-0.5 font-medium ${origin.style}`}>{origin.label}</span>
      {screen.rf.map((id) => <span key={id} className="rounded border border-slate-200 px-1.5 py-0.5 text-slate-500">{id}</span>)}
      {screen.generada === false && <span className="rounded bg-red-100 px-1.5 py-0.5 font-medium text-red-700">No se generará: su plataforma no está en el alcance</span>}
    </div>

    {screen.origen === 'especificacion' && <ul className="mt-3 space-y-2">
      {screen.componentes.map((component, index) => <li key={index} className="rounded-lg border border-slate-100 bg-slate-50 p-3 text-xs">
        <p className="font-semibold text-slate-800">{COMPONENT[component.tipo] || component.tipo} <span className="font-mono font-normal text-slate-500">{component.endpoint}</span></p>
        {component.campos.length > 0 && <p className="mt-1 text-slate-600">Campos: {component.campos.join(', ')}</p>}
        {component.botones.length > 0 && <ul className="mt-1 space-y-0.5 text-slate-600">
          {component.botones.map((button) => <li key={`${button.etiqueta}-${button.operacion}`}>Botón «{button.etiqueta}» → <span className="font-mono">{button.endpoint}</span></li>)}
        </ul>}
      </li>)}
    </ul>}

    {screen.origen === 'mockup' && <div className="mt-3 text-xs text-slate-600">
      <p>{screen.enlaces.length} control(es) enlazado(s) a una operación del backend.</p>
      {screen.controles_sin_operacion.length > 0 && <p className="mt-1 text-amber-700"><AlertTriangle size={12} className="mr-1 inline" />Sin operación (no harán nada): {screen.controles_sin_operacion.slice(0, 8).join(', ')}{screen.controles_sin_operacion.length > 8 ? '…' : ''}</p>}
    </div>}

    {screen.origen === 'crud' && <p className="mt-3 text-xs text-amber-700">Sin componentes aprobados ni mockup con enlaces: la pantalla mostrará solo un editor de registros.</p>}
  </article>;
}

/**
 * Revisión previa a la generación: lo que se va a producir, calculado sin generar nada.
 * Permite detectar pantallas vacías, botones que no harán nada y requisitos sin cubrir antes de generar.
 */
export default function GenerationPreviewPanel({ projectId, refreshKey = 0, onError }) {
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(true);
  const notify = useRef(onError);
  useEffect(() => { notify.current = onError; });

  const load = useCallback(async () => {
    setLoading(true);
    try { setPreview(await fetchGenerationPreviewApi(projectId)); } catch (error) { notify.current?.(error.message); } finally { setLoading(false); }
  }, [projectId]);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load, refreshKey]);

  if (loading && !preview) return <p className="flex items-center gap-2 text-sm text-slate-500"><Loader2 size={14} className="animate-spin" />Calculando lo que se va a generar…</p>;
  if (!preview) return null;
  const { resumen } = preview;

  return <div className="space-y-6">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <p className="text-sm text-slate-600">Esto es lo que se generará con las decisiones actuales. No se ha generado nada todavía.</p>
      <button type="button" onClick={load} disabled={loading} className="flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 disabled:opacity-50"><RefreshCw size={12} className={loading ? 'animate-spin' : ''} />Recalcular</button>
    </div>

    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      <Stat label="Requisitos" value={resumen.requisitos} />
      <Stat label="Pantallas" value={resumen.pantallas} />
      <Stat label="Operaciones de negocio" value={resumen.operaciones_negocio} />
      <Stat label="Entidades" value={resumen.entidades} />
      <Stat label="Desde la especificación" value={resumen.pantallas_por_origen.especificacion} />
      <Stat label="Desde el mockup" value={resumen.pantallas_por_origen.mockup} />
      <Stat label="Solo CRUD genérico" value={resumen.pantallas_por_origen.crud} warn={resumen.pantallas_por_origen.crud > 0} />
      <Stat label="Controles sin operación" value={resumen.controles_sin_operacion} warn={resumen.controles_sin_operacion > 0} />
      <Stat label="Pantallas sin generar" value={resumen.pantallas_sin_generar} warn={resumen.pantallas_sin_generar > 0} />
    </div>

    <section aria-label="Contenedores">
      <h3 className="mb-2 text-sm font-semibold text-slate-900">Qué se levantará</h3>
      <div className="grid gap-2 sm:grid-cols-2">
        {preview.contenedores.map((container) => <div key={container.id} className="flex items-start gap-2 rounded-lg border border-slate-200 bg-white p-3 text-xs">
          <Box size={14} className="mt-0.5 text-violet-500" />
          <div><p className="font-semibold text-slate-800">{container.id} · {container.tecnologia}</p><p className="text-slate-500">{container.descripcion}</p></div>
        </div>)}
      </div>
    </section>

    {preview.rf_sin_cubrir.length > 0 && <section aria-label="Requisitos sin cubrir" className="rounded-xl border border-amber-300 bg-amber-50/60 p-4">
      <h3 className="text-sm font-semibold text-slate-900"><AlertTriangle size={14} className="mr-1 inline text-amber-600" />{preview.rf_sin_cubrir.length} requisito(s) solo tendrán CRUD genérico</h3>
      <ul className="mt-2 space-y-1 text-xs text-slate-700">{preview.rf_sin_cubrir.map((item) => <li key={item.id}><span className="font-mono font-semibold">{item.id}</span> {item.nombre}. {item.motivo}</li>)}</ul>
    </section>}

    {[['web', 'Aplicación web', Monitor], ['móvil', 'Aplicación móvil', Smartphone]].map(([app, title, AppIcon]) => {
      const own = preview.pantallas.filter((screen) => screen.plataforma === app);
      if (!own.length) return null;
      const info = preview.aplicaciones?.[app];
      return <section key={app} aria-label={title} className="space-y-3">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-900"><AppIcon size={15} className="text-slate-400" />{title} ({own.length} pantallas)
          {info && !info.en_alcance && <span className="rounded bg-red-100 px-1.5 py-0.5 text-[11px] font-medium text-red-700">fuera del alcance</span>}</h3>
        {own.map((screen) => <ScreenCard key={screen.id} screen={screen} />)}
      </section>;
    })}

    {preview.operaciones.length > 0 && <section aria-label="Operaciones" className="space-y-2">
      <h3 className="text-sm font-semibold text-slate-900">Operaciones de negocio ({preview.operaciones.length})</h3>
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-50 text-slate-500"><tr><th className="px-3 py-2">Operación</th><th className="px-3 py-2">Endpoint</th><th className="px-3 py-2">RF</th><th className="px-3 py-2">Pantallas</th></tr></thead>
          <tbody>{preview.operaciones.map((item) => <tr key={item.nombre} className="border-t border-slate-100">
            <td className="px-3 py-2 font-mono">{item.nombre}</td><td className="px-3 py-2 font-mono text-slate-600">{item.endpoint}</td><td className="px-3 py-2">{item.requisito}</td>
            <td className="px-3 py-2">{item.pantallas.length ? item.pantallas.join(', ') : <span className="text-amber-700">ninguna</span>}</td>
          </tr>)}</tbody>
        </table>
      </div>
    </section>}

    {preview.advertencias.length > 0 && <details className="text-xs text-slate-600">
      <summary className="cursor-pointer font-semibold">{preview.advertencias.length} advertencia(s) del contrato</summary>
      <ul className="mt-2 list-disc space-y-1 pl-5">{preview.advertencias.map((warning, index) => <li key={index}>{warning}</li>)}</ul>
    </details>}
  </div>;
}
