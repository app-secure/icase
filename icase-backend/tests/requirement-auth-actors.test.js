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
