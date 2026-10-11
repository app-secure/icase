const MarkdownCompilerService = require('../src/infrastructure/services/MarkdownCompilerService');

describe('MarkdownCompilerService', () => {
  const compiler = new MarkdownCompilerService();

  test('exporta los seis tipos canónicos, incluida la clase de diseño', () => {
    const diagramas = [
      ['casos_de_uso', 'USE_CASES'],
      ['clases_dominio', 'DOMAIN_CLASSES'],
      ['arquitectura_software', 'SOFTWARE_ARCHITECTURE'],
      ['arquitectura_sistema', 'SYSTEM_ARCHITECTURE'],
      ['clases_diseno', 'DESIGN_CLASSES'],
      ['arbol_navegacion', 'NAVIGATION_TREE']
    ].map(([tipo, marker]) => ({
      tipo,
      aprobado: true,
      version: 1,
      codigo_plantuml: `@startuml\n' ${marker}\n@enduml`
    }));

    const markdown = compiler.compilar({
      proyecto: { nombre: 'Proyecto trazable' },
      diagramas
    });

    for (const marker of [
      'USE_CASES',
      'DOMAIN_CLASSES',
      'SOFTWARE_ARCHITECTURE',
      'SYSTEM_ARCHITECTURE',
      'DESIGN_CLASSES',
      'NAVIGATION_TREE'
    ]) {
      expect(markdown).toContain(marker);
    }
    expect(markdown).toContain('Diagrama de Clases de Diseño');
  });

  test('elige la última versión aprobada y normaliza tipos legados', () => {
    const markdown = compiler.compilar({
      proyecto: { nombre: 'Proyecto versionado' },
      diagramas: [
        {
          tipo: 'clases',
          aprobado: true,
          version: 2,
          codigo_plantuml: '@startuml\nclass VERSION_APROBADA\n@enduml'
        },
        {
          tipo: 'clases_dominio',
          aprobado: false,
          version: 3,
          codigo_plantuml: '@startuml\nclass BORRADOR_NO_APROBADO\n@enduml'
        },
        {
          tipo: 'arquitectura',
          aprobado: true,
          version: 1,
          codigo_plantuml: '@startuml\nrectangle LEGACY_ARCH\n@enduml'
        }
      ]
    });

    expect(markdown).toContain('VERSION_APROBADA');
    expect(markdown).not.toContain('BORRADOR_NO_APROBADO');
    expect(markdown).toContain('LEGACY_ARCH');
  });

  test('no inventa alta disponibilidad ni precondiciones al completar datos ausentes', () => {
    const markdown = compiler.compilar({
      proyecto: { nombre: 'Proyecto mínimo' },
      requerimientos: [{
        tipo: 'RF',
        identificador: 'RF-01',
        nombre: 'Consultar catálogo',
        descripcion: 'El sistema DEBE mostrar el catálogo.',
        prioridad: 'Alta',
        actores: ['Cliente']
      }]
    });

    expect(markdown.toLowerCase()).not.toContain('alta disponibilidad');
    expect(markdown.toLowerCase()).not.toContain('infraestructura redundante');
    expect(markdown).toContain('No especificadas en los insumos');
  });

  test('incluye una matriz de trazabilidad con versiones y vacíos visibles', () => {
    const markdown = compiler.compilar({
      proyecto: { nombre: 'Proyecto trazable' },
      requerimientos: [
        { tipo: 'RF', identificador: 'RF-01', nombre: 'Crear reserva', prioridad: 'Alta' },
        { tipo: 'RNF', identificador: 'RNF-01', nombre: 'Rendimiento', prioridad: 'Alta' }
      ],
      diagramas: [
        { tipo: 'casos_de_uso', aprobado: true, version: 2, requisitos_relacionados: ['RF-01'], codigo_plantuml: '@startuml\n@enduml' },
        { tipo: 'arquitectura_software', aprobado: true, version: 3, trazabilidad_rnf: [{ rnf_id: 'RNF-01' }], codigo_plantuml: '@startuml\n@enduml' }
      ]
    });

    expect(markdown).toContain('7.4 Matriz de Trazabilidad entre Fases');
    expect(markdown).toContain('| **RF-01** | Sí (v2) | — | — | — | — | — |');
    expect(markdown).toContain('| **RNF-01** | — | — | Sí (v3) | — | — | — |');
  });
});
