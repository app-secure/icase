const {
  DIAGRAM_TYPES,
  DIAGRAM_TYPE_VALUES,
  DIAGRAM_DEFINITIONS,
  normalizeDiagramType,
  isValidDiagramType
} = require('../src/core/constants/DiagramTypes');
const Diagrama = require('../src/core/entities/Diagrama');
const DiagramaModel = require('../src/infrastructure/database/schemas/DiagramaSchema');

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
});
