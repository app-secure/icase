const { inspectEvidence } = require('../src/infrastructure/services/SourceEvidence');
const Coverage = require('../src/infrastructure/services/RequirementCoverageService');
const input = '[Fuente enriquecida]\nArchivo: entrevista.txt\n[contenido_original]\nEl operador puede cerrar caja al finalizar. Solo la supervisora autoriza cerrar caja fuera de horario.';
test('expone coincidencias literales sin elegir ni validar una arbitrariamente', () => {
  const result = inspectEvidence({ evidencia: 'cerrar caja' }, input);
  expect(result.valido).toBe(false);
  expect(result.invalid[0].total_coincidencias).toBe(2);
  for (const candidate of result.invalid[0].candidatos) {
    expect(candidate.fuente).toBe('entrevista.txt');
    expect(input.slice(candidate.contexto_inicio, candidate.contexto_fin)).toBe(candidate.contexto);
    expect(candidate.contexto).not.toContain('[Fuente enriquecida]');
  }
});
test('reparación recibe candidatos también con evidencia simple', () => {
  const result = new Coverage().inspectInventory([{ id: 'N-01', tipo: 'RF', objetivo_id: 'O-01', necesidad: 'Cerrar caja', estado: 'confirmado', evidencia: 'cerrar caja' }], input);
  expect(result.invalid[0].elemento.evidencias[0].candidatos).toHaveLength(2);
  expect(inspectEvidence({ evidencias: [{ texto: 'El operador puede cerrar caja al finalizar.', fuente: 'entrevista.txt' }] }, input).valido).toBe(true);
});
