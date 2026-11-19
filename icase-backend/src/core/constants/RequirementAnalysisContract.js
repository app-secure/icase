const ANALYSIS_TYPES = Object.freeze(['RF', 'RNF', 'regla_negocio', 'restriccion_tecnica', 'contexto', 'pregunta', 'decision']);
const isRequirementNeed = (item) => ['RF', 'RNF'].includes(item?.tipo) && !['rechazado', 'fuera_de_alcance'].includes(item.estado);
const objectiveOf = (item) => `${item.tipo}:${item.objetivo_id || item.id}`;

function analysisSections(inventory) {
  return {
    reglas_negocio: inventory.filter((item) => item.tipo === 'regla_negocio'),
    restricciones_tecnicas: inventory.filter((item) => item.tipo === 'restriccion_tecnica'),
    contexto: inventory.filter((item) => item.tipo === 'contexto'),
    preguntas_pendientes: inventory.filter((item) => item.tipo === 'pregunta' && !item.respuesta && !['rechazado', 'fuera_de_alcance'].includes(item.estado)),
    decisiones: inventory.filter((item) => item.tipo === 'decision' || ['rechazado', 'fuera_de_alcance'].includes(item.estado)),
    pendientes: inventory.filter((item) => item.estado === 'pendiente')
  };
}

module.exports = { ANALYSIS_TYPES, isRequirementNeed, objectiveOf, analysisSections };
