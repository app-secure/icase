const Coverage = require('../src/infrastructure/services/RequirementCoverageService');
const input = 'El operador consulta expedientes.';
const inventory = [{ id: 'N-01', objetivo_id: 'O-01', tipo: 'RF', necesidad: 'Consultar expedientes', evidencia: input, estado: 'confirmado' }];
test('reprocesar desde cero aísla caché y reanudar el mismo trabajo recupera etapas', async () => {
  const execution = require('../src/infrastructure/services/RequirementExecutionContext');
  const checkpoints = {};
  const generate = jest.fn().mockResolvedValue({ contenido: 'nuevo' });
  const run = cacheNamespace => execution.run({ cacheNamespace, checkpoints, progress: jest.fn(), assertCurrent: jest.fn(), save: jest.fn() }, async () => {
    const value = await execution.request('clasificacion_consolidacion', 'mismo prompt', generate);
    await execution.confirm('clasificacion_consolidacion'); return value;
  });
  await run('anterior'); await run('desde-cero'); await run('desde-cero');
  expect(generate).toHaveBeenCalledTimes(2);
});

test('la redacción no confirma silenciosamente una necesidad pendiente aunque aporte una cita', () => {
  const req = { identificador: 'RF-01', tipo: 'RF', necesidades_origen: ['N-01'], evidencia: input, estado_decision: 'confirmado' };
  const result = new Coverage()._preserveEvidence(req, [{ ...inventory[0], estado: 'pendiente' }], input);
  expect(result.estado_decision).toBe('pendiente');
  expect(result.requiere_confirmacion).toBe(true);
});
test('extrae sin redactar requisitos ni generar diagramas', async () => {
  const request = jest.fn().mockResolvedValue({ inventario_necesidades: inventory, actores: [], sintesis: { contexto: input, problema: '', alcance: '', objetivos: ['Consultar expedientes'] } });
  const result = await new Coverage().extractAnalysis({ input, prompt: '', request });
  expect(result.tipo).toBe('analisis_inicial');
  expect(result.inventario).toHaveLength(1);
  expect(result.requerimientos).toBeUndefined();
  expect(result.diagramas).toBeUndefined();
  expect(request).toHaveBeenCalledTimes(1);
});
test('no redacta sin aprobación ni repara un análisis aprobado con evidencia obsoleta', async () => {
  const request = jest.fn();
  await expect(new Coverage().draftFromAnalysis({ input, request }, {})).rejects.toMatchObject({ code: 'INITIAL_ANALYSIS_REQUIRED' });
  await expect(new Coverage().draftFromAnalysis({ input: 'Contenido modificado', request }, { aprobado: true, inventario: inventory })).rejects.toMatchObject({ code: 'INITIAL_ANALYSIS_STALE' });
  expect(request).not.toHaveBeenCalled();
});
test('redacción puntual conserva requisitos no seleccionados y el inventario aprobado', async () => {
  const text = 'El operador consulta expedientes. El operador registra solicitudes.';
  const needs = [...inventory, { ...inventory[0], id: 'N-02', objetivo_id: 'O-02', necesidad: 'Registrar solicitudes', evidencia: 'El operador registra solicitudes.' }];
  const first = { identificador: 'RF-14', tipo: 'RF', nombre: 'Consulta manual', descripcion: 'Consultar expedientes', actores: ['Operador'], necesidades_origen: ['N-01'], evidencia: input, criterios_aceptacion: [{ descripcion: 'Expedientes visibles.', necesidades_origen: ['N-01'] }] };
  const second = { ...first, identificador: 'RF-19', nombre: 'Registrar solicitudes', descripcion: 'Registrar solicitudes', necesidades_origen: ['N-02'], evidencia: 'El operador registra solicitudes.', criterios_aceptacion: [{ descripcion: 'Solicitud registrada.', necesidades_origen: ['N-02'] }] };
  const approved = { aprobado: true, inventario: needs, actores: [], requisitos_previos: [first, second], actualizar_ids: ['RF-19'] };
  const before = JSON.stringify(approved);
  const request = jest.fn().mockResolvedValue({ requerimientos: [{ ...second, identificador: 'RF-99', descripcion: 'El sistema DEBE registrar la solicitud.' }] });
  const result = await new Coverage().draftFromAnalysis({ input: text, prompt: '', request }, approved);
  expect(result.requerimientos.find(r => r.identificador === 'RF-14').nombre).toBe('Consulta manual');
  expect(result.requerimientos.find(r => r.identificador === 'RF-19').descripcion).toContain('DEBE');
  expect(JSON.stringify(approved)).toBe(before);
  expect(request).toHaveBeenCalledTimes(1);
});
