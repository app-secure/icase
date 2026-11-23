const TestSuiteGenerator = require('../src/infrastructure/services/TestSuiteGenerator');

// Regeneración de Ventas: «Detalle de factura» (del vendedor) trae una lista de gestión de productos que solo lee el administrador.
test('la prueba de una pantalla consulta su operación con un rol que puede leerla', () => {
  const generator = new TestSuiteGenerator();
  generator._rolesByRoute = { '/detalle-de-factura': 'vendedor', '/listado-de-ventas': 'vendedor' };
  const contract = { operations: [{ key: 'rf-05', actions: [{ name: 'listarProductoGestion', type: 'consulta', path: '/api/actions/listar-producto-gestion', capability: 'rf-05', permission: 'rf-05' }] }, { key: 'rf-04', actions: [{ name: 'consultarVentas', type: 'consulta', path: '/api/actions/consultar-ventas', capability: 'rf-04', permission: 'rf-04' }] }] };
  const auth = { habilitada: true, operaciones: { 'rf-05': { vendedor: { metodos: [] } }, 'rf-04': { vendedor: { metodos: ['GET'] } } } };
  const screens = [
    { id: 'detalle-de-factura', route: '/detalle-de-factura', name: 'Detalle de factura', origen: 'especificacion', especificacion: { bloques: [{ tipo: 'tabla', operacion: 'listarProductoGestion' }] } },
    { id: 'listado-de-ventas', route: '/listado-de-ventas', name: 'Listado de ventas', origen: 'especificacion', especificacion: { bloques: [{ tipo: 'tabla', operacion: 'consultarVentas' }] } }
  ];
  const code = generator._specScreensE2eTest({ screens, contract, auth });
  const cases = JSON.parse(code.match(/const cases = (\[.*\]);/)[1]);
  expect(cases.find((item) => item.id === 'detalle-de-factura').readAs).toBe('administrador');
  expect(cases.find((item) => item.id === 'listado-de-ventas').readAs).toBeUndefined();
  expect(code).toContain('tokenFor(item.readAs || rolesByRoute[item.route])');
});
