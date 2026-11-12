const Repair = require('../src/infrastructure/services/RequirementObjectiveRepair');
const Coverage = require('../src/infrastructure/services/RequirementCoverageService');
const Approval = require('../src/core/services/RequirementApprovalService');
const texts = ['Las contraseñas deben estar protegidas', 'Las pantallas tendrán controles etiquetados', 'El catálogo responde en menos de dos segundos'];
const fixture = () => {
  const inventory = texts.map((text, i) => ({ id: `N-${i}`, tipo: 'RNF', estado: 'confirmado', objetivo_id: 'O-01', necesidad: text, evidencia: text }));
  const requerimientos = inventory.map((n, i) => ({ identificador: `RNF-${i}`, tipo: 'RNF', nombre: n.necesidad, descripcion: n.necesidad, evidencia: n.evidencia,
    metrica_medible: 'Por confirmar con el usuario', necesidades_origen: [n.id], criterios_aceptacion: [{ descripcion: n.necesidad, necesidades_origen: [n.id] }] }));
  return { inventory, data: { requerimientos }, input: texts.join('. '), coverage: new Coverage() };
};
const assignments = texts.map((_, i) => ({ necesidad_id: `N-${i}`, objetivo_id: `O-${i + 2}` }));

test('separa objetivos distintos sin modificar requisitos, evidencias ni métricas', async () => {
  const args = fixture(); const before = JSON.stringify(args.data);
  const result = await new Repair().run({ ...args, request: async () => ({ asignaciones_objetivos: assignments, vinculos_auxiliares: [] }) });
  expect(result.estado).toBe('aplicada');
  expect(new Set(args.inventory.map(n => n.objetivo_id)).size).toBe(3);
  expect(JSON.stringify(args.data)).toBe(before);
  expect(new Approval().evaluate(args.data.requerimientos, { version: 2, inventario: args.inventory }).bloqueado).toBe(false);
});

test('rechaza fusiones y asignaciones parciales sin alterar el inventario', async () => {
  for (const patch of [{ asignaciones_objetivos: [], eliminar_identificadores: ['RNF-1'], vinculos_auxiliares: [] },
    { asignaciones_objetivos: assignments.slice(0, 1), vinculos_auxiliares: [] }]) {
    const args = fixture(); const before = JSON.stringify(args.inventory);
    expect((await new Repair().run({ ...args, request: async () => patch })).estado).toBe('rechazada');
    expect(JSON.stringify(args.inventory)).toBe(before);
  }
});

test('revisa explícitamente las asociaciones auxiliares en lugar de expandirlas a todos', async () => {
  const args = fixture();
  args.inventory.push({ id: 'N-pregunta', tipo: 'pregunta', estado: 'pendiente', necesidad: 'Acordar métrica', objetivos_relacionados: ['O-01'] });
  const request = jest.fn().mockResolvedValueOnce({ asignaciones_objetivos: assignments, vinculos_auxiliares: [] })
    .mockResolvedValueOnce({ asignaciones_objetivos: assignments, vinculos_auxiliares: [{ id: 'N-pregunta', objetivos_relacionados: ['O-3'] }] });
  expect((await new Repair().run({ ...args, request })).estado).toBe('rechazada');
  expect((await new Repair().run({ ...args, request })).estado).toBe('aplicada');
  expect(args.inventory.at(-1).objetivos_relacionados).toEqual(['O-3']);
});

test('no separa automáticamente requisitos duplicados sobre las mismas necesidades', async () => {
  const args = fixture(); args.data.requerimientos = [args.data.requerimientos[0], { ...args.data.requerimientos[0], identificador: 'RNF-99' }];
  const request = jest.fn();
  expect((await new Repair().run({ ...args, request })).estado).toBe('no_necesaria');
  expect(request).not.toHaveBeenCalled();
});

test('la generación conserva las cualidades cuando no hay reparación verificable', async () => {
  const args = fixture();
  const request = jest.fn().mockResolvedValueOnce({ inventario_necesidades: args.inventory })
    .mockResolvedValueOnce(args.data).mockResolvedValueOnce(null);
  const result = await args.coverage.generate({ input: args.input, prompt: 'Generar', request });
  expect(result.requerimientos).toHaveLength(3);
  expect(result.auditoria_requisitos.estado).toBe('revision_requerida');
  expect(result.auditoria_requisitos.diagnostico_objetivos.estado).toBe('rechazada');
  expect(request).toHaveBeenCalledTimes(3);
});
