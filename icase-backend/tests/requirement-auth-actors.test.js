const { normalizeActors } = require('../src/infrastructure/services/ApprovedRequirementContext');

const actors = [
  { id: 'ACT-01', nombre: 'Administrador', tipo: 'persona', estado: 'confirmado' },
  { id: 'ACT-02', nombre: 'Vendedor', tipo: 'persona', estado: 'confirmado' },
  { id: 'ACT-03', nombre: 'SUNAT', tipo: 'sistema_externo', estado: 'confirmado' }
];

test('el RF de autenticación sin actor lo usan todas las personas del sistema', () => {
  const req = normalizeActors({ tipo: 'RF', nombre: 'Autenticar acceso según rol', descripcion: 'El sistema autentica con usuario y contraseña.', actores: [], necesidades_origen: ['N018'] }, [{ id: 'N018' }], actors);
  expect(req.actores).toEqual(['Administrador', 'Vendedor']);
});

test('otro RF sin actor sigue vacío (no se inventan roles)', () => {
  const req = normalizeActors({ tipo: 'RF', nombre: 'Consultar catálogo', descripcion: 'Muestra productos.', actores: [], necesidades_origen: [] }, [], actors);
  expect(req.actores).toEqual([]);
});

describe('actores de un RF: una sola forma de cada rol', () => {
  const people = [
    { id: 'ACT-01', nombre: 'Administradora', tipo: 'persona', estado: 'confirmado', descripcion: 'Dueña que gestiona productos y anula ventas' },
    { id: 'ACT-02', nombre: 'Vendedor', tipo: 'persona', estado: 'confirmado', descripcion: 'Registra ventas, atiende clientes, emite facturas, consulta productos' }
  ];
  const actorsOf = (req) => normalizeActors({ tipo: 'RF', necesidades_origen: [], ...req }, [], people).actores;
  test('«Administrador» y «vendedores» se unifican con los actores del proyecto', () => {
    expect(actorsOf({ nombre: 'Anular venta', actores: ['Administrador'] })).toEqual(['Administradora']);
    expect(actorsOf({ nombre: 'Registrar venta', actores: ['vendedores'] })).toEqual(['Vendedor']);
  });
  test('«Usuario» en el RF de acceso se reemplaza por todas las personas', () => {
    expect(actorsOf({ nombre: 'Autenticar usuarios mediante JWT', actores: ['Usuario'] })).toEqual(['Administradora', 'Vendedor']);
  });
  test('sin actor, lo toma quien tiene esa función en su descripción; si nadie, queda vacío', () => {
    expect(actorsOf({ nombre: 'Emitir factura con número correlativo', actores: [] })).toEqual(['Vendedor']);
    expect(actorsOf({ nombre: 'Gestionar clientes', actores: [] })).toEqual([]);
  });
});
