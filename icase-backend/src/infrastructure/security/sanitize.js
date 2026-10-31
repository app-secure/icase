/** Evita la asignación masiva: solo pasan los campos que el cliente tiene derecho a cambiar. */
function pick(source, allowed) {
  const result = {};
  const input = source && typeof source === 'object' && !Array.isArray(source) ? source : {};
  for (const field of allowed) if (Object.prototype.hasOwnProperty.call(input, field)) result[field] = input[field];
  return result;
}

function omit(source, forbidden) {
  const result = { ...(source && typeof source === 'object' && !Array.isArray(source) ? source : {}) };
  for (const field of forbidden) delete result[field];
  return result;
}

// Campos que pertenecen al sistema o al dueño: el cliente nunca los fija.
const PROJECT_EDITABLE = ['nombre', 'descripcion', 'insumo_bruto', 'parametros'];
const REQUIREMENT_FORBIDDEN = ['id', '_id', 'proyecto_id', 'aprobado', 'createdAt', 'updatedAt', '__v'];
const DIAGRAM_EDITABLE = ['codigo_plantuml', 'codigo_mermaid', 'titulo', 'descripcion', 'rnfList', 'trazabilidad_rnf', 'requisitos_relacionados'];

module.exports = { pick, omit, PROJECT_EDITABLE, REQUIREMENT_FORBIDDEN, DIAGRAM_EDITABLE };
