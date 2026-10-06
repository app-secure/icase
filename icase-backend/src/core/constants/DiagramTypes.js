const DIAGRAM_TYPES = Object.freeze({
  USE_CASES: 'casos_de_uso',
  DOMAIN_CLASSES: 'clases_dominio',
  SOFTWARE_ARCHITECTURE: 'arquitectura_software',
  SYSTEM_ARCHITECTURE: 'arquitectura_sistema',
  DESIGN_CLASSES: 'clases_diseno',
  NAVIGATION_TREE: 'arbol_navegacion'
});

const DIAGRAM_TYPE_VALUES = Object.freeze(Object.values(DIAGRAM_TYPES));

const LEGACY_DIAGRAM_TYPES = Object.freeze({
  clases: DIAGRAM_TYPES.DOMAIN_CLASSES,
  arquitectura: DIAGRAM_TYPES.SOFTWARE_ARCHITECTURE
});

const DIAGRAM_DEFINITIONS = Object.freeze({
  [DIAGRAM_TYPES.USE_CASES]: Object.freeze({
    label: 'Casos de Uso',
    order: 1,
    dependencies: Object.freeze([])
  }),
  [DIAGRAM_TYPES.DOMAIN_CLASSES]: Object.freeze({
    label: 'Clases de Dominio',
    order: 2,
    dependencies: Object.freeze([DIAGRAM_TYPES.USE_CASES])
  }),
  [DIAGRAM_TYPES.SOFTWARE_ARCHITECTURE]: Object.freeze({
    label: 'Arquitectura de Software',
    order: 3,
    dependencies: Object.freeze([
      DIAGRAM_TYPES.USE_CASES,
      DIAGRAM_TYPES.DOMAIN_CLASSES
    ])
  }),
  [DIAGRAM_TYPES.SYSTEM_ARCHITECTURE]: Object.freeze({
    label: 'Arquitectura del Sistema',
    order: 4,
    dependencies: Object.freeze([DIAGRAM_TYPES.SOFTWARE_ARCHITECTURE])
  }),
  [DIAGRAM_TYPES.DESIGN_CLASSES]: Object.freeze({
    label: 'Clases de Diseño',
    order: 5,
    dependencies: Object.freeze([
      DIAGRAM_TYPES.USE_CASES,
      DIAGRAM_TYPES.DOMAIN_CLASSES,
      DIAGRAM_TYPES.SOFTWARE_ARCHITECTURE
    ])
  }),
  [DIAGRAM_TYPES.NAVIGATION_TREE]: Object.freeze({
    label: 'Árbol de Navegación',
    order: 6,
    dependencies: Object.freeze([
      DIAGRAM_TYPES.USE_CASES,
      DIAGRAM_TYPES.SOFTWARE_ARCHITECTURE
    ])
  })
});

function normalizeDiagramType(type) {
  const normalized = String(type || '')
    .trim()
    .toLowerCase()
    .replace(/-/g, '_');

  return LEGACY_DIAGRAM_TYPES[normalized] || normalized;
}

function isValidDiagramType(type) {
  return DIAGRAM_TYPE_VALUES.includes(normalizeDiagramType(type));
}

module.exports = {
  DIAGRAM_TYPES,
  DIAGRAM_TYPE_VALUES,
  DIAGRAM_DEFINITIONS,
  LEGACY_DIAGRAM_TYPES,
  normalizeDiagramType,
  isValidDiagramType
};
