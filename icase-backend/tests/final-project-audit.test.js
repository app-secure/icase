const FinalProjectAuditService = require('../src/infrastructure/services/FinalProjectAuditService');
const MockupTraceabilityService = require('../src/infrastructure/services/MockupTraceabilityService');
const { DIAGRAM_TYPE_VALUES } = require('../src/core/constants/DiagramTypes');

describe('auditoría final del proyecto', () => {
  const service = new FinalProjectAuditService({ mockupTraceabilityService: new MockupTraceabilityService() });
  const requirements = [{
    identificador: 'RF-01', tipo: 'RF', nombre: 'Consultar catálogo', descripcion: 'El cliente puede consultar catálogo',
    actores: ['Cliente'], prioridad: 'Alta', aprobado: true
  }];
  const diagrams = DIAGRAM_TYPE_VALUES.map((tipo) => ({
    tipo, aprobado: true, estado: 'aprobado', estado_calidad: 'valido', version: 1
  }));

  test('permite exportar con advertencias no críticas', () => {
    const result = service.auditar({
      proyecto: { id: 'p1' }, requerimientos: requirements,
      diagramas: [{ ...diagrams[0], advertencias_validacion: ['Revisar etiqueta'] }, ...diagrams.slice(1)],
      diseno: {
        manifiesto_navegacion: [{ pantalla_id: 'catalogo', nombre: 'Catálogo', obligatoria: true }],
        mockups: [{ pantalla_id: 'catalogo', nombre_pantalla: 'catalogo', nombre_visible: 'Consultar catálogo', roles: ['Cliente'], acciones_principales: ['Consultar'], rf_trazabilidad: ['RF-01'] }]
      }
    });
    expect(result.exportable).toBe(true);
    expect(result.estado).toBe('advertencia');
  });

  test('bloquea sólo cuando existen errores críticos', () => {
    const result = service.auditar({ proyecto: { id: 'p1' }, requerimientos: requirements, diagramas: [], diseno: null });
    expect(result.exportable).toBe(false);
    expect(result.errores_criticos.length).toBeGreaterThan(0);
  });
});
