const { normalizeActors } = require('../src/core/services/RequirementActors');
const { actorCatalog, changeActor } = require('../src/core/services/RequirementActors');
test('fusiona conservando alias, evidencias y responsabilidad', () => {
  const result = changeActor([
    { id: 'A', nombre: 'Gerente', descripcion: 'Supervisa', evidencias: [{ texto: 'gerente' }], alias: ['Responsable'] },
    { id: 'B', nombre: 'Administrador', descripcion: 'Administra', evidencias: [{ texto: 'administrador' }], alias: [] }
  ], { accion: 'fusionar_actor', id: 'A', destino_id: 'B' });
  expect(result.actors).toHaveLength(1);
  expect(result.actors[0].alias).toEqual(['Gerente', 'Responsable']);
  expect(result.actors[0].evidencias).toHaveLength(2);
  expect(result.replacements).toEqual([['Gerente', 'Administrador'], ['Responsable', 'Administrador']]);
});
test('deriva actores heredados sin inventar evidencia y permite confirmar sin alterar origen', () => {
  const actors = actorCatalog({}, [{ actores: ['Mesero', ' mesero '] }]);
  expect(actors).toHaveLength(1);
  expect(actors[0].heredado).toBe(true);
  const result = changeActor(actors, { accion: 'confirmar_actor', id: 'legacy-0' });
  expect(result.actors[0]).toMatchObject({ estado: 'confirmado', origen: 'inferido', evidencias: [] });
});
test('rechaza renombrar a un nombre existente y fusionar consigo mismo', () => {
  const actors = [{ id: 'A', nombre: 'Cliente' }, { id: 'B', nombre: 'Administrador' }];
  expect(() => changeActor(actors, { accion: 'editar_actor', id: 'A', cambios: { nombre: 'administrador' } })).toThrow();
  expect(() => changeActor(actors, { accion: 'fusionar_actor', id: 'A', destino_id: 'A' })).toThrow();
});
test('normaliza variantes sin fusionar nombres distintos y deja inferidos pendientes', () => {
  const actors = normalizeActors([
    { nombre: 'Administrador', origen: 'inferido', estado: 'confirmado' },
    { nombre: ' administrador ' },
    { nombre: 'Gerente' }
  ], '');
  expect(actors).toHaveLength(2);
  expect(actors[0].estado).toBe('pendiente');
  expect(actors[0].evidencias).toEqual([]);
});
