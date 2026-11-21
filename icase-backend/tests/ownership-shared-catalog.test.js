const ownership = require('../src/infrastructure/templates/auth/ownership');

// Caso Ventas: el vendedor ve solo sus ventas (propios) pero consulta todo el catálogo de clientes y productos.
const policy = {
  habilitada: true,
  operaciones: {
    'rf-01': { vendedor: { metodos: ['GET', 'POST'], alcance: 'propios' } },
    'rf-05': { vendedor: { metodos: ['GET'], alcance: 'todos' } },
    'rf-07': { vendedor: { metodos: ['GET', 'POST'], alcance: 'todos' } },
    'rf-08': { vendedor: { metodos: ['POST'], alcance: 'todos' } }
  }
};
const model = { identity: { table: 'usuario' }, operations: { 'rf-01': 'venta', 'rf-05': 'producto', 'rf-07': 'cliente', 'rf-08': 'anulacion_venta' } };
const vendedor = { id: 4, rol: 'vendedor' };

describe('un registro propio puede referenciar el catálogo compartido', () => {
  test('las tablas que el rol consulta completas y la de cuentas son compartidas', () => {
    expect(ownership.sharedTables(policy, vendedor, model).sort()).toEqual(['cliente', 'producto', 'usuario']);
  });

  test('el alcance «propios» lleva las tablas compartidas; una tabla que solo escribe no lo es', () => {
    expect(ownership.scopeOf(policy, vendedor, 'rf-01', model)).toEqual({ ownerId: '4', shared: ['usuario', 'producto', 'cliente'] });
  });

  test('el administrador y las operaciones con alcance «todos» no llevan alcance', () => {
    expect(ownership.scopeOf(policy, { id: 1, rol: 'administrador' }, 'rf-01', model)).toBeNull();
    expect(ownership.scopeOf(policy, vendedor, 'rf-07', model)).toBeNull();
  });
});
