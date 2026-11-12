const fields = {
  revision_inventario: 'correcciones',
  clasificacion_consolidacion: 'inventario_necesidades', revision_semantica: 'hallazgos',
  verificacion_correccion_semantica: 'hallazgos', reparacion_objetivos: 'asignaciones_objetivos',
  reparacion_acotada_requisitos: 'requerimientos_corregidos', correccion_semantica: 'necesidades_corregidas',
  reparacion_generacion: 'requerimientos_corregidos'
};
module.exports = stage => {
  if (stage === 'clasificacion_consolidacion') return {
    type: 'object', required: ['sintesis', 'actores', 'inventario_necesidades'],
    properties: {
      sintesis: { type: 'object', required: ['contexto', 'problema', 'objetivos', 'alcance'], properties: { contexto: { type: 'string' }, problema: { type: 'string' }, alcance: { type: 'string' }, objetivos: { type: 'array', items: { type: 'string' } } } },
      actores: { type: 'array', items: { type: 'object' } }, inventario_necesidades: { type: 'array', items: { type: 'object' } }
    }, additionalProperties: true
  };
  const field = stage.startsWith('redaccion_lote_') || stage === 'borrador_directo' ? 'requerimientos' : fields[stage];
  return { type: 'object', ...(field ? { required: [field], properties: { [field]: { type: 'array', items: { type: 'object' } } } } : {}), additionalProperties: true };
};
module.exports.validate = (stage, value) => {
  if (stage === 'clasificacion_consolidacion') return require('./InitialAnalysisContract').errors(value);
  return (module.exports(stage).required || []).filter(field => !Array.isArray(value?.[field])).map(field => `${field}: debe ser un arreglo`);
};
