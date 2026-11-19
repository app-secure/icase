const repair = require('../src/infrastructure/services/RepairAnalysisEnvelope');
const sintesis = { contexto: 'Biblioteca', problema: '', alcance: '', objetivos: ['Consultar libros'] };
test('recupera secciones sin permitir sustitución del inventario', async () => {
  const original = { inventario_necesidades: [{ id: 'N-01' }] };
  const request = jest.fn().mockResolvedValue({ sintesis, actores: [], inventario_necesidades: [] });
  const result = await repair(original, 'Biblioteca', request);
  expect(result.value.inventario_necesidades).toEqual(original.inventario_necesidades);
  expect(result.value.sintesis).toEqual(sintesis);
  expect(original.sintesis).toBeUndefined();
  expect(request).toHaveBeenCalledTimes(1);
});
test('no repite extracción válida y conserva borrador si falla reparación', async () => {
  const request = jest.fn().mockRejectedValue(new Error('timeout'));
  const complete = { sintesis, actores: [], inventario_necesidades: [] };
  expect((await repair(complete, '', request)).estado).toBe('no_necesaria');
  expect(request).not.toHaveBeenCalled();
  const incomplete = { inventario_necesidades: [] };
  expect((await repair(incomplete, '', request)).value).toBe(incomplete);
});
