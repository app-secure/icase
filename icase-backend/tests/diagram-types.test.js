const {
  DIAGRAM_TYPES,
  DIAGRAM_TYPE_VALUES,
  DIAGRAM_DEFINITIONS,
  normalizeDiagramType,
  isValidDiagramType
} = require('../src/core/constants/DiagramTypes');
const Diagrama = require('../src/core/entities/Diagrama');
const DiagramaModel = require('../src/infrastructure/database/schemas/DiagramaSchema');
const { DiagramWorkflowService } = require('../src/core/services/DiagramWorkflowService');

describe('Contrato de tipos de diagramas', () => {
  test('expone los seis tipos oficiales sin duplicados', () => {
    expect(DIAGRAM_TYPE_VALUES).toHaveLength(6);
    expect(new Set(DIAGRAM_TYPE_VALUES).size).toBe(6);
    expect(DIAGRAM_TYPE_VALUES).toEqual(expect.arrayContaining([
      'casos_de_uso',
      'clases_dominio',
      'arquitectura_software',
      'arquitectura_sistema',
      'clases_diseno',
      'arbol_navegacion'
    ]));
  });

  test('normaliza los nombres heredados sin cambiar tipos oficiales', () => {
    expect(normalizeDiagramType('clases')).toBe(DIAGRAM_TYPES.DOMAIN_CLASSES);
    expect(normalizeDiagramType('arquitectura')).toBe(DIAGRAM_TYPES.SOFTWARE_ARCHITECTURE);
    expect(normalizeDiagramType('ARQUITECTURA-SISTEMA')).toBe(DIAGRAM_TYPES.SYSTEM_ARCHITECTURE);
    expect(isValidDiagramType('clases')).toBe(true);
    expect(isValidDiagramType('desconocido')).toBe(false);
  });

  test('declara dependencias que solo apuntan a tipos oficiales', () => {
    for (const [type, definition] of Object.entries(DIAGRAM_DEFINITIONS)) {
      expect(DIAGRAM_TYPE_VALUES).toContain(type);
      for (const dependency of definition.dependencies) {
        expect(DIAGRAM_TYPE_VALUES).toContain(dependency);
      }
    }
    expect(DIAGRAM_DEFINITIONS[DIAGRAM_TYPES.SYSTEM_ARCHITECTURE].dependencies)
      .toEqual([DIAGRAM_TYPES.SOFTWARE_ARCHITECTURE]);
  });

  test('el esquema acepta tipos oficiales y heredados durante la transición', () => {
    const enumValues = DiagramaModel.schema.path('tipo').enumValues;
    expect(enumValues).toEqual(expect.arrayContaining(DIAGRAM_TYPE_VALUES));
    expect(enumValues).toEqual(expect.arrayContaining(['clases', 'arquitectura']));
  });

  test('la entidad conserva metadatos de trazabilidad y versiones', () => {
    const diagram = new Diagrama({
      proyecto_id: 'project-1',
      tipo: DIAGRAM_TYPES.DESIGN_CLASSES,
      titulo: 'Clases de Diseño',
      codigo_mermaid: 'classDiagram',
      requisitos_relacionados: ['RF-01'],
      versiones_origen: { clases_dominio: 2 }
    });

    expect(diagram.requisitos_relacionados).toEqual(['RF-01']);
    expect(diagram.versiones_origen).toEqual({ clases_dominio: 2 });
  });

  test('el flujo habilita cada diagrama solamente después de aprobar sus dependencias', () => {
    const service = new DiagramWorkflowService();
    const initial = service.build({ requirementsApproved: true, diagrams: [] });
    expect(initial.siguiente).toBe(DIAGRAM_TYPES.USE_CASES);
    expect(initial.items.find((item) => item.tipo === DIAGRAM_TYPES.DOMAIN_CLASSES).estado).toBe('bloqueado');

    const afterUseCases = service.build({
      requirementsApproved: true,
      diagrams: [{ id: 'd1', tipo: 'casos_de_uso', aprobado: true, estado: 'aprobado', version: 1 }]
    });
    expect(afterUseCases.siguiente).toBe(DIAGRAM_TYPES.DOMAIN_CLASSES);
    expect(afterUseCases.items.find((item) => item.tipo === DIAGRAM_TYPES.DOMAIN_CLASSES).estado).toBe('disponible');
    expect(afterUseCases.items.find((item) => item.tipo === DIAGRAM_TYPES.SOFTWARE_ARCHITECTURE).estado).toBe('bloqueado');
  });

  test('el flujo conserva la versión más reciente por tipo', () => {
    const service = new DiagramWorkflowService();
    const latest = service.latestByType([
      { id: 'v1', tipo: 'clases', version: 1, aprobado: true },
      { id: 'v2', tipo: 'clases_dominio', version: 2, aprobado: false }
    ]);
    expect(latest.get(DIAGRAM_TYPES.DOMAIN_CLASSES).id).toBe('v2');
  });

  test('detecta automáticamente una versión de origen desactualizada', () => {
    const service = new DiagramWorkflowService();
    const flow = service.build({
      requirementsApproved: true,
      diagrams: [
        { id: 'cu2', tipo: 'casos_de_uso', version: 2, aprobado: true, estado: 'aprobado' },
        {
          id: 'cd1', tipo: 'clases_dominio', version: 1, aprobado: true, estado: 'aprobado',
          versiones_origen: { casos_de_uso: 1 }
        }
      ]
    });
    const domain = flow.items.find((item) => item.tipo === DIAGRAM_TYPES.DOMAIN_CLASSES);

    expect(domain.estado).toBe('desactualizado');
    expect(domain.motivos_desactualizacion[0]).toContain('casos_de_uso v1');
    expect(flow.todos_aprobados).toBe(false);
  });
});
