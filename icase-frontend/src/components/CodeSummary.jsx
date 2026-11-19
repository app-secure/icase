import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Box, Database, Layers3, Monitor, Smartphone } from 'lucide-react';
import { fetchGenerationPreviewApi } from '../services/api';

function Item({ icon: Icon, title, children }) {
  return <div className="rounded-lg border border-slate-200 bg-white p-3 text-xs">
    <p className="flex items-center gap-1.5 font-semibold text-slate-800"><Icon size={13} className="text-violet-500" />{title}</p>
    <div className="mt-1 text-slate-600">{children}</div>
  </div>;
}

/**
 * Resumen de lo que producirá la codificación: tecnologías, módulos (requisitos y entidades), pantallas por
 * aplicación y contenedores. Sale de la misma vista previa que la revisión previa.
 */
export default function CodeSummary({ projectId, refreshKey = 0, onError }) {
  const [preview, setPreview] = useState(null);
  const notify = useRef(onError);
  useEffect(() => { notify.current = onError; });
  const load = useCallback(async () => {
    try { setPreview(await fetchGenerationPreviewApi(projectId)); } catch (error) { notify.current?.(error.message); }
  }, [projectId]);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load, refreshKey]);

  if (!preview) return null;
  const { resumen, contenedores, aplicaciones } = preview;
  const container = (id) => contenedores.find((item) => item.id === id);
  return <section aria-label="Qué se generará" className="mb-4 space-y-2">
    <h3 className="text-sm font-semibold text-slate-900">Qué se generará</h3>
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
      <Item icon={Layers3} title="Módulos">{resumen.requisitos} requisitos · {resumen.entidades} entidades · {resumen.operaciones_negocio} operaciones de negocio</Item>
      <Item icon={Monitor} title="Pantallas">{aplicaciones.web.generadas} web{aplicaciones['móvil'].pantallas ? ` · ${aplicaciones['móvil'].generadas} móviles` : ''}{resumen.pantallas_sin_generar ? ` · ${resumen.pantallas_sin_generar} sin generar` : ''}</Item>
      <Item icon={Database} title="Tecnologías">{container('backend')?.tecnologia}<br />{container('base_datos')?.tecnologia}{container('web') ? <><br />{container('web').tecnologia}</> : null}</Item>
      <Item icon={container('movil') ? Smartphone : Box} title="Contenedores">{contenedores.map((item) => item.id).join(', ')}</Item>
    </div>
  </section>;
}
