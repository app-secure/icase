const RequirementSemanticsService = require('../src/infrastructure/services/RequirementSemanticsService');
const ArquitecturaSistemaGeneratorService = require('../src/infrastructure/services/ArquitecturaSistemaGeneratorService');

describe('semántica de decisiones de requisitos', () => {
  test('una decisión negativa de alta disponibilidad no crea failover', () => {
    const semantics = new RequirementSemanticsService();
    const requirement = semantics.enrich({
      tipo: 'RNF',
      identificador: 'RNF-01',
      nombre: 'Disponibilidad',
      descripcion: 'Por ahora no se requiere alta disponibilidad; se evaluará más adelante.',
      evidencia: 'No necesitamos alta disponibilidad por ahora.'
    });

    expect(requirement.restricciones_excluidas).toContain('alta_disponibilidad');
    expect(semantics.requestsHighAvailability(requirement)).toBe(false);

    const result = new ArquitecturaSistemaGeneratorService().generar({
      nombreProyecto: 'Demo',
      requerimientos: [requirement]
    });
    expect(result.codigo_plantuml).not.toMatch(/trafficManager|Réplica de Datos|Failover/);
  });

  test('respaldo no implica alta disponibilidad y sí queda representado', () => {
    const result = new ArquitecturaSistemaGeneratorService().generar({
      nombreProyecto: 'Demo',
      requerimientos: [{
        tipo: 'RNF', identificador: 'RNF-02', nombre: 'Respaldo y recuperación',
        descripcion: 'El sistema debe generar respaldos diarios y permitir restauración.',
        metrica_medible: 'Frecuencia diaria'
      }, { tipo: 'RF', identificador: 'RF-01', descripcion: 'Registrar pedidos en la base de datos.' }]
    });

    expect(result.codigo_plantuml).toContain('backupStore');
    expect(result.codigo_plantuml).not.toContain('trafficManager');
  });
});
