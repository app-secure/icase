const identifiers = require('../src/core/services/AnalysisIdentifiers');
test('normaliza IDs numéricos nuevos y sus referencias sin alterar IDs existentes', () => {
  expect(identifiers.normalizeNew([{ id: '1', objetivo_id: '4', objetivos_relacionados: ['4', 'O-06'] }])).toEqual([{ id: 'N-01', objetivo_id: 'O-04', objetivos_relacionados: ['O-04', 'O-06'] }]);
});
test('separar manualmente no consume el ID de un elemento pendiente', () => {
  const current = { inventario: [{ id: 'N-01', objetivo_id: 'O-01' }], necesidades_pendientes: [{ id: 'N-02', elemento: { id: 'N-02', objetivo_id: 'O-02' } }] };
  const result = identifiers.reserveManualAdditions(current, [], [...current.inventario, { id: 'N-02', objetivo_id: 'O-02', origenes: ['N-01'] }]);
  expect(result[1]).toMatchObject({ id: 'N-03', objetivo_id: 'O-03' });
  const corrected = identifiers.reserveManualAdditions(current, [], [...current.inventario, { id: 'N-02', objetivo_id: 'O-02' }]);
  expect(corrected[1].id).toBe('N-02');
});
test('reserva objetivos pendientes e históricos sin reciclar identificadores', () => {
  const ids = identifiers([{ inventario: [{ id: 'N-01', objetivo_id: 'O-01' }], necesidades_pendientes: [{ elemento: { id: 'N-16', objetivo_id: 'O-10' } }] }, { inventario: [{ id: 'N-25', objetivo_id: 'O-18' }], actores: [{ id: 'ACT-05' }] }]);
  expect(ids.next('N')).toBe('N-26'); expect(ids.next('O')).toBe('O-19');
  expect(ids.next('O')).toBe('O-20'); expect(ids.next('ACT')).toBe('ACT-06');
});
