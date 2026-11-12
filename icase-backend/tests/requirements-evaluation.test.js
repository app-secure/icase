const fixtures = require('./fixtures/requirements-evaluation.json');
const { evaluate } = require('../scripts/lib/requirements-evaluation.cjs');
const Budget = require('../src/infrastructure/services/AiRequestBudget');
test('el evaluador no atribuye calidad semántica a coincidencias léxicas ni inventa coste', () => {
  const fixture = fixtures[0];
  const result = evaluate(fixture, { requerimientos: [{ tipo: 'RF', identificador: 'RF-1', nombre: 'Consulta', descripcion: 'Consultar expedientes', evidencia: 'Texto no existente' }] });
  expect(result.evidencias_no_verificables).toEqual(['RF-1']);
  expect(result.objetivos_heuristicos.find(item => item.id === 'consulta').estado).toBe('coincidencia_lexica');
  expect(result.objetivos_heuristicos.some(item => item.estado === 'revisar_posible_omision')).toBe(true);
  expect(result.limites).toContain('No mide corrección semántica');
  expect(result.solicitudes_http).toBeNull();
});
test('la telemetría distingue límite de entrada sin guardar el mensaje ni credenciales', async () => {
  const budget = new Budget();
  const result = await budget.run(async () => {
    await budget.logical('redaccion_lote_1', async () => { throw new Error('Prompt estimado en 5000 tokens; supera el presupuesto Groq de 3000. secreto-que-no-debe-guardarse'); });
    return {};
  });
  expect(result.auditoria_requisitos.metricas_ejecucion.etapas[0].causa).toBe('limite_entrada_proveedor');
  expect(JSON.stringify(result)).not.toContain('secreto-que-no-debe-guardarse');
});

test('evalúa calidad y recuperación sin atribuir exhaustividad al modelo', () => {
  const result = evaluate(fixtures[0], { requerimientos: [{ tipo: 'RF', identificador: 'RF-01', nombre: 'Consulta', descripcion: 'Consultar expedientes' }],
    auditoria_requisitos: { diagnostico_generacion: { lotes: [{ estado: 'parcial' }], necesidades_pendientes: ['N-02'] } } });
  expect(result.calidad_requisitos.hallazgos.some(f => f.codigo === 'ACTOR_AUSENTE')).toBe(true);
  expect(result.recuperacion.lotes_parciales_iniciales).toBe(1);
  expect(result.recuperacion.necesidades_sin_referencia_final).toEqual(['N-02']);
});
