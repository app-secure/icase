const Coverage = require('../src/infrastructure/services/RequirementCoverageService');
const Context = require('../src/infrastructure/services/ApprovedRequirementContext');
const Semantic = require('../src/infrastructure/services/RequirementSemanticReviewService');
const inventory = [
  { id: 'N-01', tipo: 'RF', objetivo_id: 'O-01', necesidad: 'Consultar el catálogo', evidencia: 'El cliente consulta el catálogo.', estado: 'confirmado', actor_id: 'ACT-01', reglas_ids: ['N-03'] },
  { id: 'N-02', tipo: 'RNF', objetivo_id: 'O-02', necesidad: 'Respaldar los datos cada 24 horas', evidencia: 'Se respaldan los datos cada 24 horas.', estado: 'confirmado' },
  { id: 'N-03', tipo: 'regla_negocio', necesidad: 'Mostrar solo productos disponibles.', evidencia: 'Se muestran productos disponibles.', estado: 'confirmado', objetivos_relacionados: ['O-01'] },
  { id: 'N-04', tipo: 'regla_negocio', necesidad: 'REGLA_AJENA_DE_COBRO', evidencia: 'El cobro se registra.', estado: 'confirmado', objetivos_relacionados: ['O-99'] }
];
const actors = [{ id: 'ACT-01', nombre: 'Cliente' }, { id: 'ACT-02', nombre: 'Operador no relacionado' }];
const source = `${inventory.map(n => n.evidencia).join(' ')} TEXTO_NO_NECESARIO_DEL_ORIGINAL`;
const reqs = inventory.slice(0, 2).map((n, i) => ({ tipo: n.tipo, identificador: `${n.tipo}-01`, nombre: i ? 'Periodicidad del respaldo' : 'Consultar catálogo',
  descripcion: i ? 'El sistema deberá respaldar los datos, bajo operación programada, cumpliendo una periodicidad de 24 horas.' : 'Cuando el cliente consulte el catálogo, el sistema deberá mostrar los productos disponibles, de modo que pueda conocer la oferta.',
  necesidades_origen: [n.id], evidencia: n.evidencia, actores: i ? [] : ['Cliente'],
  metrica_medible: i ? 'Cada 24 horas' : '', criterios_aceptacion: [{ descripcion: i ? 'Se comprueba la copia generada cada 24 horas.' : 'Los productos sin disponibilidad no aparecen en la oferta.', necesidades_origen: [n.id] }] }));

test('selecciona solo relaciones declaradas y actores pertinentes, sin inferir por palabras', () => {
  const context = Context.select([inventory[0]], inventory, actors);
  expect(context.elementos_relacionados.map(n => n.id)).toEqual(['N-03']);
  expect(context.actores.map(a => a.id)).toEqual(['ACT-01']);
  expect(Context.draft([inventory[0]], inventory, actors)).not.toContain('REGLA_AJENA_DE_COBRO');
});

test('redacta desde lo aprobado sin extraer ni reenviar originales, conservando prosa, métricas y criterios', async () => {
  const request = jest.fn(async prompt => ({ requerimientos: structuredClone(prompt.includes('"id":"N-02"') ? [reqs[1]] : [reqs[0]]) }));
  const result = await new Coverage().draftFromAnalysis({ input: source, prompt: 'PROMPT_ANTIGUO_CON_ORIGINAL', request }, { aprobado: true, inventario: inventory, actores: actors });
  expect(request).toHaveBeenCalledTimes(2);
  const [prompt, options] = request.mock.calls[0];
  expect(options.etapa).toBe('redaccion_lote_1');
  expect(options.promptGroq).toBe(prompt);
  expect(prompt).not.toContain('TEXTO_NO_NECESARIO_DEL_ORIGINAL');
  expect(prompt).not.toContain('PROMPT_ANTIGUO_CON_ORIGINAL');
  expect(prompt).not.toContain('REGLA_AJENA_DE_COBRO');
  for (const req of reqs) expect(result.requerimientos.find(r => r.tipo === req.tipo)).toMatchObject({ nombre: req.nombre, descripcion: req.descripcion, metrica_medible: req.metrica_medible, criterios_aceptacion: req.criterios_aceptacion });
});

test('audita la conversión contra análisis y citas; conserva el documento para validación local, no para reextracción', () => {
  const prompt = new Semantic().reviewPrompt(source, { requerimientos: reqs, auditoria_requisitos: {} }, inventory, [], true);
  expect(prompt).not.toContain('TEXTO_NO_NECESARIO_DEL_ORIGINAL');
  expect(prompt).toContain('No repitas la extracción');
  expect(prompt).toContain(inventory[1].evidencia);
});

test('resuelve IDs de actores a nombres sin inventar roles', () => {
  expect(Context.normalizeActors({ tipo: 'RF', actores: ['ACT-01'], necesidades_origen: ['N-01'] }, inventory, actors).actores).toEqual(['Cliente']);
  expect(Context.normalizeActors({ tipo: 'RF', actores: [], necesidades_origen: ['N-01'] }, inventory, actors).actores).toEqual(['Cliente']);
});

test('cada objetivo tiene sus propias reglas; no se comparten por pertenecer al mismo lote', () => {
  const grouped = Context.select(inventory.slice(0, 2), inventory, actors);
  expect(grouped.objetivos.map(n => n.reglas_permitidas)).toEqual([['N-03'], []]);
  const wrongRule = { ...reqs[1], reglas_relacionadas: ['N-03'] };
  expect(new Coverage().problems({ requerimientos: [reqs[0], wrongRule] }, inventory, source, true).join(' ')).toContain('regla N-03 ajena');
});

test('fallo del lote RNF conserva RF como checkpoint, pausa y recupera solo el lote pendiente', async () => {
  const Execution = require('../src/infrastructure/services/RequirementExecutionContext');
  const checkpoints = {};
  const context = () => ({ checkpoints, assertCurrent: async () => {}, progress: async () => {}, save: async () => {} });
  let failure = true;
  const transport = jest.fn(async prompt => {
    if (prompt.includes('"id":"N-02"')) return failure ? null : { requerimientos: [structuredClone(reqs[1])] };
    return { requerimientos: [{ ...structuredClone(reqs[0]), actores: ['ACT-01'] }] };
  });
  const request = (prompt, opts) => Execution.request(opts.etapa, prompt, () => transport(prompt));
  const options = { input: source, request };
  const analysis = { aprobado: true, inventario: inventory, actores: actors };
  const first = context();
  const partial = await Execution.run(first, () => new Coverage().draftFromAnalysis(options, analysis));
  expect(first.pending).toBe(true);
  expect(first.draft).toBe(partial);
  expect(partial.auditoria_requisitos.estado).toBe('redaccion_incompleta');
  expect(partial.auditoria_requisitos.diagnostico_generacion.necesidades_pendientes).toEqual(['N-02']);
  expect(Object.values(checkpoints).some(c => c.validated)).toBe(true);
  failure = false;
  const second = context();
  const completed = await Execution.run(second, () => new Coverage().draftFromAnalysis(options, analysis));
  expect(completed.requerimientos.map(r => r.tipo)).toEqual(['RF', 'RNF']);
  expect(completed.requerimientos[0].actores).toEqual(['Cliente']);
  expect(second.pending).toBeUndefined();
  expect(transport).toHaveBeenCalledTimes(3);
});

test('el tamaño del lote no limita el total y cada lote conserva una sola categoría aprobada', async () => {
  const needs = Array.from({ length: 9 }, (_, i) => ({ id: `N-${i + 1}`, objetivo_id: `O-${i + 1}`,
    tipo: i < 5 ? 'RF' : 'RNF', estado: 'confirmado', necesidad: `Objetivo específico ${i + 1}`,
    evidencia: `Se acuerda el objetivo específico número ${i + 1}.` }));
  const request = jest.fn(async prompt => {
    const batch = JSON.parse(prompt.split('CONTEXTO APROBADO DEL LOTE:\n')[1]).objetivos;
    expect(batch.length).toBeLessThanOrEqual(4);
    expect(new Set(batch.map(n => n.tipo)).size).toBe(1);
    return { requerimientos: batch.map(n => ({ tipo: n.tipo, identificador: `${n.tipo}-${n.id.slice(2)}`, nombre: n.necesidad,
      descripcion: `El sistema deberá cumplir ${n.necesidad}.`, necesidades_origen: [n.id], evidencia: n.evidencias[0].texto,
      criterios_aceptacion: [{ descripcion: `Comprobar ${n.necesidad}.`, necesidades_origen: [n.id] }] })) };
  });
  const result = await new Coverage().draftFromAnalysis({ input: needs.map(n => n.evidencia).join(' '), request }, { aprobado: true, inventario: needs });
  expect(result.requerimientos).toHaveLength(9);
  expect(result.requerimientos.filter(r => r.tipo === 'RNF')).toHaveLength(4);
  expect(request).toHaveBeenCalledTimes(3);
});
