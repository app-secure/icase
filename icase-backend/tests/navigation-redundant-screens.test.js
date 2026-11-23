const { removeRedundantScreens } = require('../src/core/services/NavigationTreeReview');
const nl = String.fromCharCode(10);
const tree = (lines) => ['@startwbs', ...lines, '@endwbs'].join(nl);

test('una pantalla repetida en varios módulos se conserva una vez, en el módulo con más pantallas', () => {
  const out = removeRedundantScreens(tree([
    '* Sistema', '** Aplicación Web', '*** Ventas', '**** Registro de Venta', '**** Productos', '**** Detalle de Producto',
    '*** Administración', '**** Productos', '**** Detalle de Producto', '**** Formulario de Producto', '**** Clientes'
  ]));
  expect(out.quitadas).toEqual(['Productos', 'Detalle de Producto']);
  expect(out.codigo.split(nl).filter((line) => /Productos$/.test(line))).toHaveLength(1);
  expect(out.codigo).toContain('**** Registro de Venta');
});

test('el formulario de un reporte o de una anulación sobra si la pantalla ya existe', () => {
  const out = removeRedundantScreens(tree([
    '* Sistema', '** Aplicación Web', '*** Reportes', '**** Reporte de Ventas por Fechas', '**** Formulario de Reporte de Ventas',
    '*** Operaciones', '**** Anulación de Ventas', '**** Formulario de Anulación de Venta', '**** Productos', '**** Formulario de Producto'
  ]));
  expect(out.quitadas).toEqual(['Formulario de Reporte de Ventas', 'Formulario de Anulación de Venta']);
  expect(out.codigo).toContain('Formulario de Producto');
});

test('un árbol sin repetidos no cambia', () => {
  const code = tree(['* Sistema', '** Aplicación Web', '*** Ventas', '**** Registro de Venta', '**** Ventas']);
  expect(removeRedundantScreens(code)).toEqual({ codigo: code, quitadas: [] });
});
