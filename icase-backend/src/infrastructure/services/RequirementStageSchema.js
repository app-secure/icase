const fields = {
  revision_inventario: 'correcciones',
  clasificacion_consolidacion: 'inventario_necesidades', revision_semantica: 'hallazgos',
  verificacion_correccion_semantica: 'hallazgos', reparacion_objetivos: 'asignaciones_objetivos',
  reparacion_acotada_requisitos: 'requerimientos_corregidos', correccion_semantica: 'necesidades_corregidas',
  reparacion_generacion: 'requerimientos_corregidos'
};
module.exports = stage => {
  const field = stage.startsWith('redaccion_lote_') || stage === 'borrador_directo' ? 'requerimientos' : fields[stage];
  return { type: 'object', ...(field ? { required: [field], properties: { [field]: { type: 'array', items: { type: 'object' } } } } : {}), additionalProperties: true };
};
