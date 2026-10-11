const { DiagramWorkflowService } = require('../../core/services/DiagramWorkflowService');

class FinalProjectAuditService {
  constructor({ mockupTraceabilityService } = {}) {
    this.diagramWorkflowService = new DiagramWorkflowService();
    this.mockupTraceabilityService = mockupTraceabilityService;
  }

  auditar({ proyecto = {}, requerimientos = [], diagramas = [], diseno = null } = {}) {
    const erroresCriticos = [];
    const advertencias = [];
    const aprobados = requerimientos.filter((requirement) => requirement?.aprobado !== false);
    const requirementsApproved = aprobados.length > 0 && aprobados.length === requerimientos.length;
    if (!requirementsApproved) erroresCriticos.push('Los requisitos deben estar revisados y aprobados.');

    const flujo = this.diagramWorkflowService.build({ requirementsApproved, diagrams: diagramas });
    const diagramasPendientes = flujo.items
      .filter((item) => item.estado !== 'aprobado')
      .map((item) => `${item.label}: ${item.estado}`);
    if (diagramasPendientes.length) {
      erroresCriticos.push(`Faltan diagramas vigentes y aprobados: ${diagramasPendientes.join(', ')}.`);
    }

    for (const diagram of diagramas) {
      if (diagram?.aprobado && diagram?.estado_calidad === 'invalido') {
        erroresCriticos.push(`${diagram.titulo || diagram.tipo} conserva errores de validación.`);
      }
      if (diagram?.aprobado) {
        for (const warning of diagram?.advertencias_validacion || []) {
          advertencias.push(`${diagram.titulo || diagram.tipo}: ${warning}`);
        }
      }
    }

    let trazabilidadMockups = diseno?.trazabilidad_mockups || null;
    if (this.mockupTraceabilityService && diseno) {
      const manifest = this.mockupTraceabilityService.buildManifest(diseno.manifiesto_navegacion || [], aprobados);
      const mockups = this.mockupTraceabilityService.enrichAll(diseno.mockups || [], manifest, aprobados);
      trazabilidadMockups = this.mockupTraceabilityService.validate({ manifest, mockups, requirements: aprobados });
    }
    if (!diseno?.mockups?.length) erroresCriticos.push('No existen mockups generados para el documento final.');
    if (trazabilidadMockups && !trazabilidadMockups.valido) {
      erroresCriticos.push(...(trazabilidadMockups.errores || []).map((error) => `Mockups: ${error}`));
    }
    advertencias.push(...(trazabilidadMockups?.advertencias || []).map((warning) => `Mockups: ${warning}`));

    const erroresUnicos = [...new Set(erroresCriticos)];
    const advertenciasUnicas = [...new Set(advertencias)];
    return {
      exportable: erroresUnicos.length === 0,
      estado: erroresUnicos.length ? 'critico' : (advertenciasUnicas.length ? 'advertencia' : 'valido'),
      errores_criticos: erroresUnicos,
      advertencias: advertenciasUnicas,
      resumen: {
        requisitos_aprobados: aprobados.length,
        requisitos_totales: requerimientos.length,
        diagramas_aprobados: flujo.items.filter((item) => item.estado === 'aprobado').length,
        diagramas_requeridos: flujo.items.length,
        mockups_generados: diseno?.mockups?.length || 0,
        cobertura_rf_mockups: trazabilidadMockups?.metricas?.cobertura_rf_altos_porcentaje ?? null
      },
      flujo_diagramas: flujo,
      trazabilidad_mockups: trazabilidadMockups,
      proyecto_id: proyecto?.id || proyecto?._id || null,
      auditado_en: new Date()
    };
  }
}

module.exports = FinalProjectAuditService;
