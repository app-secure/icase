const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function wrap(value, size = 65) {
  return String(value || '').match(new RegExp(`.{1,${size}}(?:\\s|$)|.{1,${size}}`, 'g'))?.map(line => line.trim()) || ['Sin información aprobada'];
}
function infographic(title, groups, connect = true) {
  let y = 110;
  const body = groups.map((group, index) => {
    const lines = wrap(group.title, 65), details = group.items.flatMap(item => wrap(item, 85));
    const height = 60 + lines.length * 26 + details.length * 23;
    const result = `<g><rect x="35" y="${y}" width="1050" height="${height}" rx="18" fill="#fff" stroke="#ddd6fe"/><circle cx="70" cy="${y + 32}" r="17" fill="#7c3aed"/><text x="70" y="${y + 38}" text-anchor="middle" fill="white" font-size="15">${index + 1}</text><text x="105" y="${y + 36}" font-size="22" font-weight="700" fill="#5b21b6">${lines.map((line, i) => `<tspan x="105" dy="${i ? 26 : 0}">${esc(line)}</tspan>`).join('')}</text><text x="60" y="${y + 66 + lines.length * 26}" font-size="18" fill="#334155">${details.map((line, i) => `<tspan x="60" dy="${i ? 23 : 0}">${esc(line)}</tspan>`).join('')}</text></g>`;
    y += height + 38;
    return result + (connect && index < groups.length - 1 ? `<path d="M560 ${y - 36}v26" stroke="#8b5cf6" stroke-width="3" marker-end="url(#arrow)"/>` : '');
  }).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1120" height="${Math.max(y, 190)}" viewBox="0 0 1120 ${Math.max(y, 190)}" role="img" aria-label="${esc(title)}"><defs><marker id="arrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6" fill="#8b5cf6"/></marker></defs><rect width="100%" height="100%" fill="#faf9ff"/><g font-family="Arial,sans-serif"><text x="35" y="55" font-size="28" font-weight="700" fill="#312e81">${esc(title)}</text>${body}</g></svg>`;
}
function buildInfographics(flows, screens, facts, captions = []) {
  const modules = new Map();
  for (const screen of screens) { const name = screen.modulo || 'Pantallas aprobadas'; if (!modules.has(name)) modules.set(name, []); modules.get(name).push(screen.nombre_visible || screen.nombre_pantalla); }
  const groups = {
    flujo: ['Flujo principal por rol', flows.map(flow => ({ title: flow.role, items: flow.steps.map((step, i) => `${i + 1}. ${step.id}: ${step.title}`) }))],
    modulos: ['Mapa de módulos y pantallas', [...modules].map(([title, items]) => ({ title, items }))],
    datos: ['Modelo de datos simplificado', facts.models.map(model => ({ title: model.name, items: model.fields.length ? model.fields : ['Sin propiedades declaradas en OpenAPI'] }))],
    arquitectura: ['Arquitectura de la entrega', facts.services.map(service => ({ title: service.name, items: [`Origen: ${service.source}`, `Puertos: ${service.ports.map(port => typeof port === 'object' ? JSON.stringify(port) : port).join(', ') || 'Internos'}`, `Dependencias: ${service.depends.join(', ') || 'No declaradas'}`] }))]
  };
  return Object.entries(groups).map(([id, [title, entries]]) => ({ id, title, ruta: `documentation/docs/assets/${id}.svg`, contenido: infographic(title, [...(entries.length ? entries : [{ title: 'Información pendiente', items: ['No consta en los artefactos aprobados de esta entrega.'] }]), ...captions.map(section => ({ title: `Redacción asistida por IA · ${section.rol || section.id}`, items: [section.texto, `Fuentes: ${section.referencias.join(', ')}`] }))], id === 'arquitectura') }));
}
module.exports = { buildInfographics };
