const select = require('../src/infrastructure/services/MockupRequirementSelector');
test('conserva referencias más allá de los primeros veinte RF', () => {
  const requirements = Array.from({ length: 35 }, (_, i) => ({ tipo: 'RF', identificador: `RF-${i + 1}`, nombre: `Función ${i}` }));
  expect(select(requirements, [{ rf_trazabilidad: ['RF-35'] }])).toEqual([requirements[34]]);
});
test('incluye funciones por rol y conserva RNF sin recorte', () => {
  const rf = { tipo: 'RF', identificador: 'RF-02', actores: ['Médico'] };
  const rnf = { tipo: 'RNF' };
  expect(select([rf, rnf], [{ roles: ['medico'] }])).toEqual([rf, rnf]);
});
test('sin asociaciones fiables conserva los RF en lugar de truncarlos', () => {
  const requirements = Array.from({ length: 40 }, () => ({ tipo: 'RF' }));
  expect(select(requirements, [{ nombre: 'Pantalla' }])).toHaveLength(40);
});
