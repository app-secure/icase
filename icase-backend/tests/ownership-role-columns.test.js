// Caso Restaurante: «solo lo propio» filtraba por quién creó el registro. Las mesas las crea el administrador, así que el mesero no veía
// ninguna, y su pedido quedaba con el mesero equivocado. Una columna «<rol>_id» que apunta a la cuenta manda sobre el creador.
const { ownerColumn, assignOwner, matchesOwner } = require('../src/infrastructure/templates/data-layer/store-support');
const { scopeOf } = require('../src/infrastructure/templates/auth/ownership');
const BackendDataLayerGenerator = require('../src/infrastructure/services/BackendDataLayerGenerator');

const mesa = { columns: [{ name: 'numero', column: 'numero', type: 'integer' }, { name: 'mesero_id', column: 'mesero_id', type: 'id' }, { name: '__owner', column: 'owner_id', type: 'id', internal: true }], roles: { mesero: 'mesero_id' } };

test('el mesero es dueño de la mesa que tiene asignada, no de la que creó otro', () => {
  const scope = { ownerId: '5', rol: 'mesero' };
  expect(ownerColumn(mesa, scope)).toBe('mesero_id');
  expect(matchesOwner({ owner_id: 1, mesero_id: 5 }, mesa, scope)).toBe(true);
  expect(matchesOwner({ owner_id: 5, mesero_id: 9 }, mesa, scope)).toBe(false);
});

test('nadie registra algo a nombre de otra persona de su rol', () => {
  expect(() => assignOwner(mesa, { mesero_id: '9' }, {}, { ownerId: '5', rol: 'mesero' })).toThrow(/dato ajeno/);
  const values = {};
  assignOwner(mesa, values, {}, { ownerId: '5', rol: 'mesero' });
  expect(values).toEqual({ owner_id: '5', mesero_id: '5' });
});

test('sin columna del rol se conserva la propiedad por quien lo creó', () => {
  expect(ownerColumn(mesa, { ownerId: '5', rol: 'cliente' })).toBe('owner_id');
});

test('el modelo físico marca las columnas de rol que apuntan a la cuenta', () => {
  const model = { tables: { mesa: { entity: 'Mesa', columns: [{ name: 'mesero_id', column: 'mesero_id' }] } } };
  const contract = { entities: [{ name: 'Usuario', schema: { properties: {} } }, { name: 'Mesa', schema: { properties: { mesero_id: { 'x-references': 'Usuario' } } } }] };
  new BackendDataLayerGenerator()._markRoleColumns(model, contract, { roles: { mesero: {}, cajero: {} } });
  expect(model.tables.mesa.roles).toEqual({ mesero: 'mesero_id' });
});

test('el alcance lleva el rol y lo que ese rol registra, solo si el modelo tiene columnas de rol', () => {
  const policy = { operaciones: { 'rf-1': { mesero: { metodos: ['GET', 'POST'], alcance: 'propios' } } } };
  const user = { id: 5, rol: 'mesero' };
  expect(scopeOf(policy, user, 'rf-1', { tables: { pedido: { roles: { mesero: 'mesero_id' } } }, operations: { 'rf-1': 'pedido' } }))
    .toEqual({ ownerId: '5', rol: 'mesero', creates: ['pedido'] });
  expect(scopeOf(policy, user, 'rf-1', { tables: { pedido: {} }, operations: { 'rf-1': 'pedido' } })).toEqual({ ownerId: '5' });
});
