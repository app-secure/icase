const contract = require('../src/infrastructure/services/InitialAnalysisContract');
test('router admite síntesis objeto y exige las tres secciones', () => {
  const schema = require('../src/infrastructure/services/RequirementStageSchema');
  expect(schema.validate('clasificacion_consolidacion', { inventario_necesidades: [] })).toHaveLength(2);
  expect(schema.validate('clasificacion_consolidacion', { actores: [], inventario_necesidades: [], sintesis: { contexto: '', problema: '', alcance: '', objetivos: [] } })).toEqual([]);
});
test('no acepta inventario aislado como extracción completa', () => {
  expect(contract.errors({ inventario_necesidades: [] })).toHaveLength(2);
});
test('distingue secciones presentes de ausentes y rechaza códigos como objetivos', () => {
  const value = { actores: [], inventario_necesidades: [], sintesis: { contexto: '', problema: '', alcance: '', objetivos: [] } };
  expect(contract.errors(value)).toEqual([]);
  value.sintesis.objetivos = ['O-01'];
  expect(contract.errors(value)[0]).toContain('resultados legibles');
});
