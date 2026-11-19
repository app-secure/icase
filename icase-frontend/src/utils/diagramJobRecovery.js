export function completedDiagramAlreadyLoaded(job, result, diagrams, keys) {
  const stored = diagrams?.[keys[job.tipo_diagrama]];
  if (!stored) return false;
  const generated = (result.diagramas || []).filter(d => d.tipo === job.tipo_diagrama)
    .sort((a, b) => Number(b.version || 1) - Number(a.version || 1))[0];
  if (!generated || Number(stored.version || 1) < Number(generated.version || 1)) return false;
  if (stored.id && generated.id) return String(stored.id) === String(generated.id);
  const code = stored.plantumlCode || stored.code;
  return Boolean(code && code === (generated.codigo_plantuml || generated.codigo_mermaid));
}
