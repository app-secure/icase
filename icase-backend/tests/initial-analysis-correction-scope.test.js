const scope = require('../src/core/services/InitialAnalysisCorrectionScope');
const previous = { sintesis: { contexto: 'Proyecto' }, actores: [{ id: 'ACT-01' }, { id: 'ACT-02' }], inventario: [{ id: 'N-01', actor_id: 'ACT-01', reglas_ids: ['N-03'], objetivo_id: 'O-01' }, { id: 'N-02', actor_id: 'ACT-02' }, { id: 'N-03', tipo: 'regla_negocio' }] };
test('incluye solo el ítem y contexto relacionado', () => {
  const result = scope(previous, ['N-01']);
  expect(result.inventario.map(n => n.id)).toEqual(['N-01', 'N-03']);
  expect(result.actores.map(a => a.id)).toEqual(['ACT-01']);
  expect(result.alcance_correccion.editables).toEqual(['N-01']);
});
test('apartado permite varios IDs sin incluir otros editables', () => {
  expect(scope(previous, ['N-01', 'N-02']).alcance_correccion.editables).toEqual(['N-01', 'N-02']);
});
test('revisión de actor incluye sus necesidades como contexto', () => {
  expect(scope(previous, ['ACT-01']).inventario.map(n => n.id)).toEqual(['N-01']);
});
