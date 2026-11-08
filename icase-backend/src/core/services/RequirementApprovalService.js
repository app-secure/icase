const { isRequirementNeed, objectiveOf } = require('../constants/RequirementAnalysisContract');

/** Bloquea problemas comprobables, no supuestas omisiones inferidas por palabras clave. */
class RequirementApprovalService {
  evaluate(requirements = [], audit = null) {
    requirements = Array.isArray(requirements) ? requirements : [];
    const errors = [], warnings = [];
    if (audit?.revision_semantica?.estado === 'no_completada') warnings.push('La auditoría semántica no se completó; no se ha certificado exhaustividad.');
    if (audit?.revision_semantica?.hallazgos?.some(item => ['pendiente', 'confirmado'].includes(item.estado))) warnings.push('Hay hallazgos semánticos pendientes de resolución. Solo los críticos confirmados por el usuario bloquean la aprobación.');
    const refsOf = (req) => Array.isArray(req?.necesidades_origen) ? req.necesidades_origen : [];
    const criteriaOf = (req) => Array.isArray(req?.criterios_aceptacion) ? req.criterios_aceptacion : [];
    const add = (codigo, mensaje, necesidad = null) => errors.push({ codigo, mensaje, necesidad });
    for (const finding of audit?.revision_semantica?.hallazgos || []) {
      if (finding.estado === 'confirmado' && finding.severidad === 'critico') add('HALLAZGO_CRITICO_CONFIRMADO', `${finding.id}: ${finding.descripcion}`);
    }
    const pending = audit?.necesidades_pendientes || audit?.diagnostico_inventario?.errores_pendientes || [];
    for (const item of pending) {
      if (['corregida', 'descartada'].includes(item.estado_validacion)) continue;
      if (['RF', 'RNF'].includes(item.elemento?.tipo) && !['rechazado', 'fuera_de_alcance'].includes(item.elemento?.estado)) {
        add('NECESIDAD_PENDIENTE_VALIDACION', `${item.id || 'Necesidad'}: falta validar su evidencia o clasificación antes de aprobar. ${item.elemento.necesidad || ''}`, item.id);
      }
    }
    if (!requirements.length) add('SIN_REQUISITOS', 'No existen requisitos para aprobar.');
    const ids = new Set();
    for (const req of requirements) {
      if (!req || typeof req !== 'object') { add('REQUISITO_INVALIDO', 'Existe un requisito vacío o inválido.'); continue; }
      if (!req.identificador || ids.has(req.identificador)) add('IDENTIFICADOR_INVALIDO', `Identificador ausente o duplicado: ${req.identificador || '(vacío)'}.`);
      ids.add(req.identificador);
      if (!req.nombre || !req.descripcion || !['RF', 'RNF'].includes(req.tipo)) add('REQUISITO_INVALIDO', `${req.identificador}: falta nombre, descripción o tipo válido.`);
      if (req.tipo === 'RNF' && !String(req.metrica_medible || '').trim()) add('METRICA_AUSENTE', `${req.identificador}: indica una métrica sustentada o Por confirmar con el usuario.`);
    }
    requirements = requirements.filter((req) => req && typeof req === 'object');
    const inventory = Array.isArray(audit?.inventario) ? audit.inventario : [];
    if (audit?.version >= 2 && inventory.length) {
      const expected = inventory.filter(isRequirementNeed);
      const validRefs = new Set(expected.map((need) => need.id));
      for (const req of requirements) {
        const refs = refsOf(req);
        if (refs.some((id) => !validRefs.has(id))) add('REFERENCIA_INVALIDA', `${req.identificador}: referencia una necesidad inexistente o que no debe convertirse en requisito.`);
        const related = expected.filter((need) => refs.includes(need.id));
        if (new Set(related.map(objectiveOf)).size > 1) add('OBJETIVOS_INDEPENDIENTES', `${req.identificador}: combina objetivos independientes.`);
        if (related.some((need) => need.tipo !== req.tipo)) add('CLASIFICACION_INCONSISTENTE', `${req.identificador}: el tipo no coincide con las necesidades referenciadas.`);
        for (const criterion of criteriaOf(req)) {
          if (!criterion || !String(criterion.descripcion || '').trim() || !refsOf(criterion).length || refsOf(criterion).some((id) => !refs.includes(id))) {
            add('CRITERIO_INVALIDO', `${req.identificador}: un criterio está vacío o referencia necesidades ajenas.`);
          }
        }
      }
      for (const need of expected) {
        const covering = requirements.filter((req) => req.tipo === need.tipo &&
          !['rechazado', 'fuera_de_alcance'].includes(req.estado_decision) && refsOf(req).includes(need.id));
        if (!covering.length) add('NECESIDAD_NO_CUBIERTA', `Falta ${need.id}: ${need.necesidad}`, need.id);
        else if (need.objetivo_id && !covering.some((req) => criteriaOf(req).some((criterion) =>
          criterion?.descripcion && refsOf(criterion).includes(need.id)))) {
          add('CRITERIO_NO_CUBIERTO', `Falta un criterio de aceptación para ${need.id}: ${need.necesidad}`, need.id);
        }
      }
      const groups = new Map();
      for (const req of requirements) {
        for (const group of new Set(expected.filter((need) => need.objetivo_id && refsOf(req).includes(need.id)).map(objectiveOf))) {
          if (groups.has(group)) add('OBJETIVO_DUPLICADO', `${req.identificador}: duplica el objetivo de ${groups.get(group)}.`);
          else groups.set(group, req.identificador);
        }
      }
    } else warnings.push('La cobertura no tiene un inventario validado de esta versión; requiere revisión humana.');
    if (requirements.some((req) => req.requiere_confirmacion)) warnings.push('Hay detalles o métricas pendientes de confirmar. No se han inventado sus valores.');
    if (Array.isArray(audit?.necesidades_pendientes) ? audit.necesidades_pendientes.some(item => item.estado_validacion === 'pendiente') : audit?.diagnostico_inventario?.errores_pendientes?.length) warnings.push('Quedan elementos del análisis sin validar; consulta sus diagnósticos.');
    return { bloqueado: errors.length > 0, errores_criticos: errors, advertencias: warnings,
      requisitos: requirements.length, necesidades_evaluadas: inventory.filter(isRequirementNeed).length };
  }
}
module.exports = RequirementApprovalService;
