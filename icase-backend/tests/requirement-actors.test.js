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
test('quien solo habla en la entrevista no queda como actor del sistema', () => {
  const input = 'Gerente:\nEl cliente debe poder reservar una mesa.\nAnalista:\nEl mesero podrá tomar pedidos. El administrador puede cambiar precios.';
  const actors = normalizeActors([
    { nombre: 'Gerente', origen: 'explicito', estado: 'confirmado', evidencia: 'Gerente:' },
    { nombre: 'Analista', origen: 'explicito', estado: 'confirmado', evidencia: 'Analista:' },
    { nombre: 'Cliente', origen: 'explicito', estado: 'confirmado', evidencia: 'El cliente debe poder reservar una mesa.' },
    { nombre: 'Administrador', origen: 'explicito', estado: 'confirmado', evidencia: 'El administrador puede cambiar precios.' }
  ], input);
  expect(actors.map(actor => actor.nombre)).toEqual(['Cliente', 'Administrador']);
});
test('un entrevistado que también usa el sistema se conserva', () => {
  const input = 'Gerente:\nEl gerente debe poder aprobar los cierres de caja.';
  const actors = normalizeActors([{ nombre: 'Gerente', origen: 'explicito', estado: 'confirmado', evidencia: 'El gerente debe poder aprobar los cierres de caja.' }], input);
  expect(actors.map(actor => actor.nombre)).toEqual(['Gerente']);
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
