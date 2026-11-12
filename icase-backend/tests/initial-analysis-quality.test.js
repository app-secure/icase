const { review } = require('../src/core/services/InitialAnalysisQuality');
const Coverage = require('../src/infrastructure/services/RequirementCoverageService');
const input = 'Los usuarios consultan registros con filtros y estados visibles.';
const inventory = [{ id: 'N-01', tipo: 'RF', objetivo_id: 'O-01', necesidad: 'Consultar registros', estado: 'confirmado', evidencia: input }];
const inspect = (items, text) => new Coverage().inspectInventory(items, text);
test('revisa todo aunque no existan candidatos léxicos', async () => {
  const request = jest.fn().mockResolvedValue({ completa: true, elementos_revisados: ['N-01'], hallazgos: [] });
  const result = await review({ inventory, actors: [], summary: {}, input, request, inspect });
  expect(result.diagnostic.estado).toBe('completa'); expect(request).toHaveBeenCalledTimes(1);
});
test('no presenta fallo o citas inventadas como revisión satisfactoria', async () => {
  for (const response of [null, { completa: true, elementos_revisados: ['N-01'], hallazgos: [{ codigo: 'OMISION', elementos: [], descripcion: 'Falta algo', accion: 'Añadir', evidencia: 'Inventada' }] }]) {
    const result = await review({ inventory, actors: [], summary: {}, input, request: jest.fn().mockResolvedValue(response), inspect });
    expect(result.diagnostic.estado).toBe('parcial'); expect(result.inventario).toEqual(inventory);
  }
});
test('una reparación sin verificación se rechaza sin perder el original', async () => {
  const request = jest.fn().mockResolvedValueOnce({ completa: true, elementos_revisados: ['N-01'], hallazgos: [{ codigo: 'OMISION', elementos: [], descripcion: 'Revisar filtros', accion: 'Completar', evidencia: input }] }).mockResolvedValueOnce({ correcciones: [], adiciones: [] }).mockResolvedValueOnce(null);
  const result = await review({ inventory, actors: [], summary: {}, input, request, inspect });
  expect(result.diagnostic.estado).toBe('parcial'); expect(result.inventario).toEqual(inventory); expect(request).toHaveBeenCalledTimes(3);
});
test('aplica una sola reparación verificada y reserva IDs de elementos pendientes', async () => {
  const request = jest.fn().mockResolvedValueOnce({ completa: true, elementos_revisados: ['N-01'], hallazgos: [{ codigo: 'OMISION', elementos: [], descripcion: 'Falta una cualidad', accion: 'Añadir', evidencia: input }] }).mockResolvedValueOnce({ correcciones: [], adiciones: [{ tipo: 'RNF', necesidad: 'Controles claros', estado: 'confirmado', objetivo_id: 'temporal', evidencia: input }] }).mockResolvedValueOnce({ completa: true, elementos_revisados: ['N-01', 'N-17'], hallazgos: [] });
  const result = await review({ inventory, reserved: [{ elemento: { id: 'N-16', objetivo_id: 'O-10' } }], actors: [], summary: {}, input, request, inspect });
  expect(result.diagnostic.reparacion).toBe('aplicada');
  expect(result.inventario[1]).toMatchObject({ id: 'N-17', objetivo_id: 'O-11' });
  expect(result.inventario[0].id).toBe('N-01'); expect(request).toHaveBeenCalledTimes(3);
});
test('una revisión que no enumera lo revisado no afirma exhaustividad', async () => {
  const result = await review({ inventory, actors: [], summary: {}, input, request: jest.fn().mockResolvedValue({ completa: true, hallazgos: [] }), inspect });
  expect(result.diagnostic.estado).toBe('parcial');
});
test('conserva la propuesta rechazada y distingue problemas del verificador', async () => {
  const request = jest.fn().mockResolvedValueOnce({ completa: true, elementos_revisados: ['N-01'], hallazgos: [{ codigo: 'OMISION', elementos: [], descripcion: 'Revisar detalle', accion: 'Completar', evidencia: input }] }).mockResolvedValueOnce({ correcciones: [], adiciones: [] }).mockResolvedValueOnce({ completa: false, elementos_revisados: [], hallazgos: [] });
  const result = await review({ inventory, actors: [], summary: {}, input, request, inspect });
  expect(result.diagnostic.causa).toBe('verificacion_incompleta');
  expect(result.diagnostic.propuesta_rechazada).toEqual(expect.any(Array));
  expect(result.inventario).toEqual(inventory);
});
test('las señales no se limitan a los primeros cinco ni confunden estados visibles con operaciones', () => {
  const { candidates } = require('../src/core/services/RequirementInventoryReview');
  const items = Array.from({ length: 8 }, (_, i) => ({ id: `N-${i}`, tipo: 'RF', necesidad: 'Consultar solicitudes y modificar tarifas' }));
  expect(candidates(items)).toHaveLength(8);
  expect(candidates([...items, { id: 'N-17', tipo: 'RNF', necesidad: 'Seguridad y usabilidad como criterios base' }])).toHaveLength(9);
  expect(candidates([{ tipo: 'RF', necesidad: 'Ver menú con disponibilidad actualizada' }, { tipo: 'RF', necesidad: 'Visualizar comandas y tiempo desde la toma' }])).toHaveLength(0);
});
