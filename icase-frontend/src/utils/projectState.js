// La identidad es el ID, nunca el nombre ni el proyecto seleccionado previamente.
export function upsertProject(projects, updated, previousDraftId) {
  const targetId = updated.backendId || updated.id;
  if (!targetId) return projects;
  const normalized = {
    ...updated,
    id: targetId,
    backendId: updated.backendId || (/^[a-f\d]{24}$/i.test(targetId) ? targetId : undefined)
  };
  const matches = (project) => project.id === targetId || project.backendId === targetId || project.id === updated.id;
  // Solo se permite reemplazar otro ID en la transición explícita borrador → persistido.
  const isDraft = previousDraftId?.startsWith('draft-') && normalized.backendId;
  let index = projects.findIndex(matches);
  if (index < 0 && isDraft) index = projects.findIndex((project) => project.id === previousDraftId);
  if (index < 0) return [normalized, ...projects];
  const result = [];
  projects.forEach((project, position) => {
    if (position === index) result.push({ ...project, ...normalized });
    else if (!matches(project) && !(isDraft && project.id === previousDraftId)) result.push(project);
  });
  return result;
}
