const { singular } = require('../src/core/services/SpanishPlural');
const MockupTraceabilityService = require('../src/infrastructure/services/MockupTraceabilityService');

test('singular español: «-es» solo tras consonante', () => {
  expect(singular('clientes')).toBe('cliente');
  expect(singular('reportes')).toBe('reporte');
  expect(singular('vendedores')).toBe('vendedor');
  expect(singular('operaciones')).toBe('operacion');
  expect(singular('productos')).toBe('producto');
});

test('«Formulario de registro de cliente» se traza a «Gestionar clientes»', () => {
  const service = new MockupTraceabilityService();
  const requisitos = [
    { tipo: 'RF', identificador: 'RF-07', nombre: 'Gestionar clientes', descripcion: 'Registrar, editar y buscar clientes por nombre o documento.', prioridad: 'Alta', actores: ['Administrador', 'Vendedor'], aprobado: true },
    { tipo: 'RF', identificador: 'RF-10', nombre: 'Generar reporte de ventas por rango de fechas', descripcion: 'Reporte de ventas.', prioridad: 'Alta', actores: ['Administrador'], aprobado: true }
  ];
  const [screen] = service.buildManifest([{ nombre: 'Formulario de registro de cliente', ruta: 'Sistema / Aplicación Web / Clientes / Formulario de registro de cliente', modulo: 'Clientes', slug: 'formulario-de-registro-de-cliente', tipo: 'form', roles: ['Administrador', 'Vendedor'] }], requisitos);
  const ids = (screen.rf_trazabilidad || screen.requisitos || []).map((item) => item.identificador || item);
  expect(ids).toContain('RF-07');
  expect(ids).not.toContain('RF-10');
});

test('un RF de acción sin pantalla propia («Anular ventas») se asigna al detalle de su entidad', () => {
  const service = new MockupTraceabilityService();
  const requisitos = [
    { tipo: 'RF', identificador: 'RF-04', nombre: 'Consultar ventas', descripcion: 'El vendedor consulta sus ventas y el administrador todas.', prioridad: 'Alta', actores: ['Administrador', 'Vendedor'], aprobado: true },
    { tipo: 'RF', identificador: 'RF-08', nombre: 'Anular ventas con reversión de stock', descripcion: 'El administrador anula una venta indicando el motivo; el stock vuelve y la factura queda anulada.', prioridad: 'Alta', actores: ['Administrador'], aprobado: true }
  ];
  const screen = (nombre, tipo) => ({ nombre, tipo, ruta: `Sistema / Aplicación Web / Ventas / ${nombre}`, modulo: 'Ventas', slug: nombre.toLowerCase().replace(/\s+/g, '-'), roles: ['Administrador', 'Vendedor'], plataforma: 'web' });
  const manifest = service.buildManifest([screen('Listado de ventas', 'list'), screen('Detalle de venta', 'detail')], requisitos);
  const byName = Object.fromEntries(manifest.map((item) => [item.nombre, item.rf_trazabilidad]));
  expect(byName['Detalle de venta']).toContain('RF-08');
  expect(byName['Listado de ventas']).not.toContain('RF-08');
});

test('cada RF de acción llega a la pantalla de su objeto aunque comparta palabras con otra', () => {
  const service = new MockupTraceabilityService();
  const rf = (identificador, nombre, descripcion, actores = ['Administrador']) => ({ tipo: 'RF', identificador, nombre, descripcion, prioridad: 'Alta', actores, aprobado: true });
  const requisitos = [
    rf('RF-08', 'Anular ventas con reversión de stock', 'El administrador anula una venta indicando el motivo y el stock de los productos vuelve.'),
    rf('RF-06', 'Desactivar productos sin eliminarlos', 'Un producto desactivado no aparece al vender pero se conserva en ventas antiguas.'),
    rf('RF-03', 'Emitir factura interna con número correlativo', 'Tras registrar la venta se emite la factura con IGV.', ['Vendedor', 'Administrador']),
    rf('RF-09', 'Visualizar lista de productos con stock bajo', 'Productos con menos de 5 unidades.')
  ];
  const screen = (nombre, tipo, modulo) => ({ nombre, tipo, modulo, ruta: `Sistema / Aplicación Web / ${modulo} / ${nombre}`, slug: nombre, roles: ['Administrador', 'Vendedor'], plataforma: 'web' });
  const manifest = service.buildManifest([
    screen('Detalle de venta', 'detail', 'Ventas'), screen('Detalle de producto', 'detail', 'Productos'),
    screen('Formulario de emisión de factura', 'form', 'Ventas'), screen('Productos con stock bajo', 'list', 'Inventario')
  ], requisitos);
  const rfsOf = (name) => manifest.find((item) => item.nombre === name).rf_trazabilidad;
  expect(rfsOf('Detalle de venta')).toContain('RF-08');
  expect(rfsOf('Detalle de producto')).toContain('RF-06');
  expect(rfsOf('Detalle de venta')).not.toContain('RF-06');
  expect(rfsOf('Formulario de emisión de factura')).toContain('RF-03');
});
