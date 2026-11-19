const { analysisSections } = require('../constants/RequirementAnalysisContract');

function contextOf(audit = {}, { includeContext = false } = {}) {
  audit = audit || {};
  const sections = Array.isArray(audit.inventario) ? analysisSections(audit.inventario) : audit;
  return Object.fromEntries(['reglas_negocio', 'restricciones_tecnicas', ...(includeContext ? ['contexto'] : []), 'decisiones', 'preguntas_pendientes'].map(section => [section,
    (sections[section] || []).map(item => ({ id: item.id, tipo: item.tipo, necesidad: item.necesidad, estado: item.estado,
      ...(item.objetivos_relacionados ? { objetivos_relacionados: [...item.objetivos_relacionados].sort() } : {})
    })).sort((a, b) => String(a.id).localeCompare(String(b.id)))
  ]));
}
module.exports = { contextOf };
