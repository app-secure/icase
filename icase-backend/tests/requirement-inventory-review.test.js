const { candidates, review } = require('../src/core/services/RequirementInventoryReview');
const Coverage = require('../src/infrastructure/services/RequirementCoverageService');
const input = 'El cajero registra cobros y cierra caja.';
const need = { id: 'N-01', tipo: 'RF', objetivo_id: 'O-01', necesidad: 'Registrar cobros y cerrar caja', evidencia: input, estado: 'confirmado' };
const inspect = (items, text) => new Coverage().inspectInventory(items, text);
test('selecciona objetivos sospechosos sin separar filtros o medios alternativos por código', () => {
  expect(candidates([need])).toEqual([need]);
  expect(candidates([{ ...need, necesidad: 'Consultar registros con filtros y estados' }, { ...need, necesidad: 'Cobrar en efectivo o transferencia verificando saldo' }])).toEqual([]);
});
test('aplica separación sustentada conservando IDs y elementos no seleccionados', async () => {
  const request = jest.fn().mockResolvedValue({ correcciones: [{ id: 'N-01', elementos: [{ ...need, necesidad: 'Registrar cobros' }, { ...need, id: 'N-02', objetivo_id: 'O-02', necesidad: 'Cerrar caja' }] }] });
  const result = await review({ inventory: [need], input, request, inspect });
  expect(result.inventory.map(n => n.id)).toEqual(['N-01', 'N-02']);
  expect(result.diagnostic.estado).toBe('aplicada');
});
test('fallos o evidencia inventada conservan el inventario y un diagnóstico pendiente', async () => {
  const failed = await review({ inventory: [need], input, inspect, request: async () => { throw new Error('timeout'); } });
  expect(failed.inventory).toEqual([need]);
  expect(failed.diagnostic.estado).toBe('pendiente');
  const invalid = await review({ inventory: [need], input, inspect, request: async () => ({ correcciones: [{ id: 'N-01', elementos: [{ ...need, evidencia: 'Texto inventado' }] }] }) });
  expect(invalid.inventory).toEqual([need]);
  expect(invalid.diagnostic.estado).toBe('respuesta_invalida');
});
