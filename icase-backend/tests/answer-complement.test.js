const apply = require('../src/core/services/ApplyAnswerElements');
const allocator = require('../src/core/services/AnalysisIdentifiers');
const inventory = [{ id: 'N-27', tipo: 'RNF', objetivo_id: 'O-13', necesidad: 'Pantallas claras.', estado: 'confirmado', evidencias: [{ texto: 'Pantallas claras.', fuente: 'original.txt' }] }];
const answer = 'Botones claros. Estados visibles.';
const elements = ['Botones claros.', 'Estados visibles.'].map(text => ({ tipo: 'RNF', necesidad: text, evidencia: text, estado: 'confirmado', destino_id: 'N-27' }));
const options = () => ({ answer, questionId: 'N-46', related: ['N-27'], identifiers: allocator([inventory]) });
test('dos complementos actualizan una sola necesidad conservando ID, objetivo y evidencias', () => {
  const result = apply(inventory, elements, options());
  expect(result.inventory).toHaveLength(1);
  expect(result.ids).toEqual(['N-27']);
  expect(result.inventory[0]).toMatchObject({ id: 'N-27', objetivo_id: 'O-13' });
  expect(result.inventory[0].evidencias).toHaveLength(3);
  expect(result.inventory[0].necesidad).toContain('Pantallas claras.');
  expect(result.inventory[0].necesidad).toContain('Estados visibles.');
  expect(inventory[0].necesidad).toBe('Pantallas claras.');
  expect(apply(result.inventory, elements, options()).inventory[0].complementos).toHaveLength(2);
});
test('objetivo nuevo crea una necesidad; un objetivo compartido exige destino explícito', () => {
  expect(apply(inventory, [{ ...elements[0], destino_id: undefined }], options()).inventory).toHaveLength(2);
  const shared = [...inventory, { ...inventory[0], id: 'N-28' }];
  expect(() => apply(shared, [{ ...elements[0], destino_id: undefined, objetivo_id: 'O-13' }], options())).toThrow(/compartido/);
});
test('rechaza destino inactivo, de otra categoría o evidencia no sustentada', () => {
  expect(() => apply([{ ...inventory[0], estado: 'rechazado' }], elements, options())).toThrow();
  expect(() => apply(inventory, [{ ...elements[0], tipo: 'RF' }], options())).toThrow();
  expect(() => apply(inventory, [{ ...elements[0], evidencia: 'Texto inventado' }], options())).toThrow();
});
