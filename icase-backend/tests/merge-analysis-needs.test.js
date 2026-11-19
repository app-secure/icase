const merge = require('../src/core/services/MergeAnalysisNeeds');
const content = { inventario: [
  { id: 'N-13', tipo: 'RF', necesidad: 'Cerrar caja', objetivo_id: 'O-18', estado: 'confirmado', evidencias: [{ texto: 'cerrar caja', fuente: 'uno.txt' }] },
  { id: 'N-45', tipo: 'RF', necesidad: 'Cierre', objetivo_id: 'O-10', estado: 'confirmado', evidencias: [{ texto: 'Los cajeros cierran caja', fuente: 'dos.txt' }] },
  { id: 'N-50', tipo: 'regla_negocio', objetivos_relacionados: ['O-10'], elementos_relacionados: ['N-45'] }
] };
test('conserva evidencias, objetivo destino, originales y referencias', () => {
  const result = merge(content, { id: 'N-13', ids: ['N-45'], contenido: 'Registrar el cierre de caja' });
  expect(result.inventario[0].evidencias).toHaveLength(2);
  expect(result.inventario[0].objetivo_id).toBe('O-18');
  expect(result.inventario[1].estado).toBe('rechazado');
  expect(result.inventario[1].fusionado_en).toBe('N-13');
  expect(result.inventario[2].objetivos_relacionados).toEqual(['O-18']);
  expect(result.inventario[2].elementos_relacionados).toEqual(['N-13']);
  expect(result.historial_fusiones[0].originales).toHaveLength(2);
  expect(content.inventario[1].estado).toBe('confirmado');
});
test('rechaza tipos distintos, selección inexistente y contenido vacío', () => {
  for (const ids of [['N-50'], ['N-99'], []]) expect(() => merge(content, { id: 'N-13', ids, contenido: 'Final' })).toThrow();
  expect(() => merge(content, { id: 'N-13', ids: ['N-45'], contenido: '' })).toThrow();
});
