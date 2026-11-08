const Coverage = require('../src/infrastructure/services/RequirementCoverageService');
const policy = require('../src/infrastructure/services/RequirementGranularityPolicy');

test('mantiene detalles juntos y resultados independientes separados sin otra llamada de IA', async () => {
  const input = 'El operador consulta expedientes por fecha y estado, autoriza solicitudes y modifica tarifas. Usará tabletas.';
  const inventory = [
    ['N-1', 'O-1', 'Consultar expedientes'],
    ['N-2', 'O-1', 'Filtrar por fecha y mostrar estado'],
    ['N-3', 'O-2', 'Autorizar solicitudes'],
    ['N-4', 'O-3', 'Modificar tarifas']
  ].map(([id, objetivo_id, necesidad]) => ({ id, objetivo_id, necesidad, tipo: 'RF', estado: 'confirmado', evidencia: input }));
  const requirements = [['N-1', 'N-2'], ['N-3'], ['N-4']].map((refs, index) => ({
    identificador: `RF-${index + 1}`, tipo: 'RF', nombre: 'Resultado', descripcion: 'El sistema DEBE cumplir el resultado.',
    evidencia: input, necesidades_origen: refs,
    criterios_aceptacion: refs.map(ref => ({ descripcion: inventory.find(item => item.id === ref).necesidad, necesidades_origen: [ref] }))
  }));
  inventory.push({ id: 'N-5', tipo: 'restriccion_tecnica', necesidad: 'Tabletas', evidencia: 'Usará tabletas.', estado: 'confirmado', objetivo_id: null });
  const request = jest.fn().mockResolvedValueOnce({ inventario_necesidades: inventory }).mockResolvedValueOnce({ requerimientos: requirements });
  const result = await new Coverage().generate({ input, prompt: input, request });
  expect(request).toHaveBeenCalledTimes(2);
  for (const [prompt] of request.mock.calls) expect(prompt).toContain(policy);
  expect(request.mock.calls[0][0]).toContain('divídela aquí');
  expect(result.requerimientos).toHaveLength(3);
  expect(result.requerimientos[0].criterios_aceptacion).toHaveLength(2);
  expect(result.auditoria_requisitos.estado).toBe('cobertura_verificada');
});

test.each([null, '', '   '])('objetivo opcional %p no elimina contexto pero sigue siendo inválido para RF', value => {
  const item = { id: 'N-1', necesidad: 'Centralizar', evidencia: 'Centralizar', estado: 'confirmado', objetivo_id: value };
  const service = new Coverage();
  expect(service.inspectInventory([{ ...item, tipo: 'contexto' }], 'Centralizar').invalid).toEqual([]);
  expect(service.inspectInventory([{ ...item, tipo: 'RF' }], 'Centralizar').invalid[0].errores).toContain('objetivo_invalido');
});
