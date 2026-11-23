const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const key = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const nameOf = actor => typeof actor === 'string' ? actor : actor?.nombre || actor?.name || actor?.rol || actor?.id || '';
const namesOf = actors => (Array.isArray(actors) ? actors : actors ? String(actors).split(/[,;|]/) : []).map(nameOf).map(name => String(name).trim()).filter(Boolean);
const verbs = { GET: 'Consultar', POST: 'Crear', PATCH: 'Actualizar', PUT: 'Actualizar', DELETE: 'Eliminar' };

function buildRoleFlows(requirements, decisions = {}) {
  const access = decisions.control_acceso || {};
  const catalog = [...new Map([{ id: 'administrador', name: 'Administrador' }, ...(access.roles || []).filter(role => role.incluir !== false).map(role => ({ id: key(role.id || role.nombre), name: role.nombre || role.id }))].map(role => [role.id, role])).values()];
  const canonical = name => catalog.find(role => role.id === key(name) || key(role.name) === key(name))
    || (key(name) === 'administradora' ? catalog.find(role => role.id === 'administrador') : { id: key(name), name });
  const confirmedActions = (decisions.especificacion_aplicacion?.operaciones || []).filter(action => action.estado_decision === 'confirmado');
  const groups = new Map();
  for (const requirement of requirements) {
    const id = String(requirement.identificador || requirement.id || '').toUpperCase();
    const permissions = (access.permisos || []).filter(permission => String(permission.operacion || '').toUpperCase() === id && permission.metodos?.length);
    const actors = [...namesOf(requirement.actores), ...permissions.map(permission => permission.rol), ...confirmedActions.filter(action => String(action.rf || '').toUpperCase() === id).flatMap(action => namesOf(action.actores))];
    const roles = new Map(actors.map(nameOf).filter(Boolean).map(name => { const role = canonical(name); return [role.id, role]; }));
    if (!roles.size) roles.set('por-confirmar', { id: 'por-confirmar', name: 'Rol por confirmar' });
    for (const role of roles.values()) {
      if (!groups.has(role.id)) groups.set(role.id, { id: role.id, role: role.name, pending: role.id === 'por-confirmar', steps: [] });
      const methods = [...new Set(permissions.filter(permission => canonical(permission.rol).id === role.id).flatMap(permission => permission.metodos))];
      groups.get(role.id).steps.push({ id, title: requirement.nombre || id,
        description: requirement.descripcion || 'Consulta el requisito aprobado para el detalle de esta función.',
        before: String(requirement.precondiciones || 'Revisa los datos y permisos necesarios para esta función.'),
        outcome: String(requirement.poscondiciones || 'Comprueba el resultado indicado en el requisito y registra cualquier incidencia.'),
        actions: methods.map(method => verbs[method]).filter((value, index, values) => value && values.indexOf(value) === index) });
    }
  }
  return [...groups.values()];
}

function renderRoleFlows(flows) {
  if (!flows.length) return '<p class="notice">Aprueba requisitos y asigna actores para generar los recorridos de cada rol.</p>';
  return '<p class="section-intro">Cada recorrido reúne únicamente funciones asignadas a ese rol en requisitos y permisos aprobados. Las precondiciones indican cuándo se puede ejecutar cada función.</p><nav class="role-links" aria-label="Recorridos por rol">' + flows.map(flow => `<a href="#rol-${flow.id}">${escape(flow.role)} <span>${flow.steps.length}</span></a>`).join('') + '</nav>' + flows.map(flow => `<article class="role-flow${flow.pending ? ' role-pending' : ''}" id="rol-${flow.id}" data-role="${escape(flow.role)}"><div class="role-heading"><span class="role-icon" aria-hidden="true">${escape(flow.role.slice(0, 1).toUpperCase())}</span><div><h3>${escape(flow.role)}</h3><p>${flow.steps.length} ${flow.steps.length === 1 ? 'función documentada' : 'funciones documentadas'}${flow.pending ? ' · requiere asignación de responsable' : ''}</p></div></div><ol class="role-steps">${flow.steps.map((step, index) => `<li><span class="step-number">${index + 1}</span><div class="step-content"><span class="requirement-id">${escape(step.id)}</span><h4>${escape(step.title)}</h4><p>${escape(step.description)}</p>${step.actions.length ? `<div class="allowed-actions">${step.actions.map(action => `<span>${escape(action)}</span>`).join('')}</div>` : ''}<dl class="step-checks"><div><dt>Antes de empezar</dt><dd>${escape(step.before)}</dd></div><div><dt>Resultado esperado</dt><dd>${escape(step.outcome)}</dd></div></dl></div></li>`).join('')}</ol></article>`).join('');
}

function buildTutorials(flows, project) {
  const tutorials = [];
  for (const flow of flows.filter(item => !item.pending)) {
    for (let offset = 0; offset < flow.steps.length; offset += 4) tutorials.push({
      id: `rol-${flow.id}-${Math.floor(offset / 4) + 1}`, roleId: flow.id, role: flow.role, project,
      title: flow.steps.length > 4 ? `${flow.role} · parte ${Math.floor(offset / 4) + 1}` : `Guía de ${flow.role}`,
      description: `Recorrido de ${flow.role} a partir de sus requisitos aprobados.`,
      steps: flow.steps.slice(offset, offset + 4)
    });
  }
  tutorials.push({ id: 'mantenimiento', roleId: 'mantenimiento-documentacion', role: 'Mantenimiento', project, title: 'Cuidar y actualizar el proyecto', description: 'Guía del manual de mantenimiento; no representa un rol de negocio aprobado.', steps: [
    { title: 'Comprobar el estado del servicio', description: 'Revisa disponibilidad y errores antes de aplicar cambios.', before: 'Identifica la versión instalada y el responsable.', outcome: 'Registra el estado inicial del servicio.' },
    { title: 'Respaldar y verificar la recuperación', description: 'Usa el procedimiento documentado para la base y los archivos de esta entrega.', before: 'Confirma el alcance y la ubicación de las copias.', outcome: 'Comprueba la restauración en un entorno separado.' },
    { title: 'Actualizar y validar', description: 'Revisa cambios, aplica la versión aprobada y prueba las funciones críticas.', before: 'Prepara un plan de reversión.', outcome: 'Documenta la versión, el resultado y cualquier incidencia.' }
  ] });
  return tutorials;
}

function renderFlowSvg(flows) {
  if (!flows.length) return '<svg xmlns="http://www.w3.org/2000/svg" width="1120" height="140" role="img" aria-label="Flujos pendientes"><rect width="100%" height="100%" fill="#faf9fc"/><text x="40" y="70" fill="#736c82" font-family="sans-serif" font-size="20">Aprueba requisitos y asigna roles para generar sus recorridos.</text></svg>';
  const wrap = (text, limit = 82) => {
    const lines = []; let line = '';
    for (const word of String(text).split(/\s+/)) { if ((line + ' ' + word).length > limit && line) { lines.push(line); line = word; } else line = line ? line + ' ' + word : word; }
    if (line) lines.push(line); return lines;
  };
  let y = 52;
  const content = [];
  for (const flow of flows) {
    content.push(`<text x="40" y="${y}" fill="#6d28d9" font-family="sans-serif" font-size="25" font-weight="bold">${escape(flow.role)}</text>`); y += 24;
    for (const [index, step] of flow.steps.entries()) {
      const lines = wrap(step.title);
      const height = Math.max(92, 52 + lines.length * 25);
      content.push(`<rect x="40" y="${y}" width="1040" height="${height}" rx="14" fill="white" stroke="#e5ddf3"/><circle cx="74" cy="${y + 34}" r="18" fill="#7c3aed"/><text x="74" y="${y + 40}" text-anchor="middle" fill="white" font-family="sans-serif" font-size="16">${index + 1}</text><text x="110" y="${y + 27}" fill="#7c3aed" font-family="sans-serif" font-size="15">${escape(step.id)}</text><text x="110" y="${y + 53}" fill="#272037" font-family="sans-serif" font-size="20">${lines.map((line, i) => `<tspan x="110" dy="${i ? 25 : 0}">${escape(line)}</tspan>`).join('')}</text>`); y += height + 14;
    }
    y += 35;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1120" height="${Math.max(y, 120)}" viewBox="0 0 1120 ${Math.max(y, 120)}" role="img" aria-label="Flujos de trabajo separados por rol"><rect width="100%" height="100%" fill="#faf9fc"/>${content.join('')}</svg>`;
}
module.exports = { buildRoleFlows, renderRoleFlows, buildTutorials, renderFlowSvg };
