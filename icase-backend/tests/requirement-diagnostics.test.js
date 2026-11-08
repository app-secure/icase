const Coverage = require('../src/infrastructure/services/RequirementCoverageService');

test('prioriza funciones, conserva citas rechazadas y explica límites y falta de respuesta', async () => {
  const valid = { id: 'N-ok', tipo: 'RF', necesidad: 'Consultar', evidencia: 'Consultar', estado: 'confirmado' };
  const invalid = Array.from({ length: 7 }, (_, i) => ({ id: `N-${i}`, tipo: i === 6 ? 'RF' : 'contexto', necesidad: 'Necesidad', evidencia: 'Cita no existente', estado: 'confirmado' }));
  const request = jest.fn().mockResolvedValueOnce({ inventario_necesidades: [valid, ...invalid] })
    .mockResolvedValueOnce(null).mockResolvedValueOnce({ requerimientos: [{ identificador: 'RF-1', tipo: 'RF', nombre: 'Consultar', descripcion: 'Consultar', evidencia: 'Consultar', necesidades_origen: ['N-ok'] }] });
  const result = await new Coverage().generate({ input: 'Consultar', prompt: 'Consultar', request });
  const diagnostic = result.auditoria_requisitos.diagnostico_inventario;
  expect(diagnostic.reparacion.solicitados[0]).toBe('N-6');
  expect(diagnostic.reparacion.omitidos_por_limite).toHaveLength(2);
  expect(diagnostic.reparacion.estado).toBe('sin_respuesta_utilizable');
  expect(diagnostic.errores_pendientes[0].elemento.evidencia).toBe('Cita no existente');
  expect(result.auditoria_requisitos.advertencias[0]).toContain('no se encontró');
});

test('explica si la regla existe pero pertenece a otra categoría', () => {
  const problems = new Coverage().problems({ requerimientos: [{ identificador: 'RF-1', nombre: 'Consulta', descripcion: 'Consulta', evidencia: 'Consulta', reglas_relacionadas: ['N-2'] }] }, [{ id: 'N-2', tipo: 'restriccion_tecnica' }], 'Consulta');
  expect(problems.join(' ')).toContain('clasificado como restriccion_tecnica');
});
