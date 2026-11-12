const Approval = require('../../src/core/services/RequirementApprovalService');
const { inspectEvidence } = require('../../src/infrastructure/services/SourceEvidence');
const normalize = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

function evaluate(fixture, result) {
  const requirements = result.requerimientos || [];
  const audit = result.auditoria_requisitos || {};
  const objectives = fixture.objectives.map(objective => {
    const matching = requirements.filter(req => {
      const text = normalize([req.nombre, req.descripcion, ...(req.criterios_aceptacion || []).map(item => item.descripcion)].join(' '));
      return req.tipo === objective.type && objective.terms.every(aliases => aliases.some(term => text.includes(normalize(term))));
    });
    return { id: objective.id, coincidencias: matching.map(req => req.identificador), estado: matching.length ? 'coincidencia_lexica' : 'revisar_posible_omision' };
  });
  const invalidEvidence = requirements.filter(req => !inspectEvidence(req, fixture.input).valido).map(req => req.identificador);
  const descriptions = requirements.map(req => normalize(req.descripcion).replace(/\s+/g, ' ').trim());
  const approval = new Approval().evaluate(requirements, audit);
  return {
    rf: requirements.filter(req => req.tipo === 'RF').length, rnf: requirements.filter(req => req.tipo === 'RNF').length,
    duracion_ms: audit.metricas_ejecucion?.duracion_ms ?? null, solicitudes_http: audit.metricas_ejecucion?.intentos_http ?? null,
    presupuesto_agotado: audit.metricas_ejecucion?.presupuesto_agotado ?? null,
    objetivos_heuristicos: objectives, cobertura_lexica: objectives.length ? objectives.filter(item => item.coincidencias.length).length / objectives.length : null,
    evidencias_no_verificables: invalidEvidence, duplicados_textuales: descriptions.length - new Set(descriptions).size,
    necesidades_pendientes: (audit.necesidades_pendientes || []).filter(item => item.estado_validacion === 'pendiente').length,
    revision_semantica: audit.revision_semantica?.estado || 'sin_registro',
    hallazgos_pendientes: audit.revision_semantica?.hallazgos?.filter(item => !['corregido', 'aceptado', 'resuelto', 'descartado'].includes(item.estado)).length ?? null,
    calidad_requisitos: approval.calidad,
    recuperacion: {
      lotes_parciales_iniciales: (audit.diagnostico_generacion?.lotes || []).filter(batch => batch.estado !== 'respondido').length,
      necesidades_sin_referencia_final: audit.diagnostico_generacion?.necesidades_pendientes || [],
      refinamiento: audit.diagnostico_refinamiento?.estado || 'sin_registro'
    },
    control_aprobacion: approval,
    limites: 'Coincidencia léxica solo para orientar revisión humana. No mide corrección semántica, tasa real de invención ni precisión de clasificación. Tokens y coste no se estiman si el proveedor no los informa.'
  };
}
module.exports = { evaluate };
