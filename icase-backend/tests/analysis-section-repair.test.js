const repair = require('../src/core/services/AnalysisSectionRepair');
const input = 'La operadora consulta registros.';
const actor = { id: 'ACT-01', nombre: 'Operadora', tipo: 'persona', estado: 'confirmado', alias: [], evidencia: input };
const base = { actores: [actor], inventario: [], sintesis: {} };
test('repara actor con evidencia sin mutar el original ni cambiar su ID', () => {
  const result = repair(base, { correcciones_actores: [{ id: actor.id, actor: { descripcion: 'Consulta registros' } }] }, new Set([actor.id]), input);
  expect(result.actores[0].id).toBe(actor.id);
  expect(result.actores[0].descripcion).toBe('Consulta registros');
  expect(base.actores[0].descripcion).toBeUndefined();
});
test('rechaza cambios fuera de alcance y evidencia inventada', () => {
  expect(() => repair(base, { sintesis: {} }, new Set(), input)).toThrow('alcance');
  expect(() => repair(base, { correcciones_actores: [{ id: actor.id, actor: { evidencia: 'No existe' } }] }, new Set([actor.id]), input)).toThrow('evidencia');
});
test('síntesis señalada debe conservar contrato legible', () => {
  const sintesis = { contexto: input, problema: '', alcance: '', objetivos: ['Consultar registros'] };
  expect(repair(base, { sintesis }, new Set(['sintesis']), input).sintesis).toEqual(sintesis);
});
