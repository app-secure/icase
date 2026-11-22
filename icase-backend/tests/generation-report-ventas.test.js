const GenerationReportService = require('../src/core/services/GenerationReportService');

// Caso Ventas: los RF piden cálculos y reportes que la especificación aprobada sí implementa.
const requisitos = [
  { identificador: 'RF-01', tipo: 'RF', nombre: 'Registrar venta con cálculo automático', descripcion: 'El sistema deberá calcular el total.' },
  { identificador: 'RF-03', tipo: 'RF', nombre: 'Emitir factura interna con cálculos de IGV', descripcion: 'Calcula el IGV.' },
  { identificador: 'RF-05', tipo: 'RF', nombre: 'Gestionar productos', descripcion: 'El producto quede disponible en el catálogo.' },
  { identificador: 'RF-10', tipo: 'RF', nombre: 'Generar reporte de ventas por rango de fechas' },
  { identificador: 'RF-20', tipo: 'RF', nombre: 'Generar reporte de devoluciones' }
];
const contrato = {
  entities: [{ key: 'venta', name: 'Venta' }, { key: 'factura', name: 'Factura' }, { key: 'producto', name: 'Producto' }, { key: 'devolucion', name: 'Devolucion' }],
  operations: [
    { id: 'RF-01', entity: 'venta', actions: [{ name: 'crearVenta', type: 'crear', lineas: { entidad: 'LineaVenta' } }] },
    { id: 'RF-03', entity: 'factura', rules: [{ tipo: 'calculo', campo: 'igv' }], actions: [{ name: 'emitirFactura', type: 'crear', vincula: { entidad: 'Venta' } }] },
    { id: 'RF-05', entity: 'producto', actions: [] },
    { id: 'RF-10', entity: 'venta', actions: [{ name: 'generarReporte', type: 'resumen' }] },
    { id: 'RF-20', entity: 'devolucion', actions: [] }
  ]
};

describe('informe de generación con lo que implementa la especificación (caso Ventas)', () => {
  const items = Object.fromEntries(new GenerationReportService().build({ requisitos, contrato }).requisitos.map((item) => [item.id, item]));

  test('cálculos con líneas, IGV y reportes resumen cuentan como generados', () => {
    expect(items['RF-01'].nivel).toBe('completo');
    expect(items['RF-03'].nivel).toBe('completo');
    expect(items['RF-10'].nivel).toBe('completo');
    expect(items['RF-01'].motivos.join(' ')).toContain('Implementado por la especificación aprobada');
  });

  test('«catálogo» no es una petición de logo (archivos)', () => {
    expect(items['RF-05'].nivel).toBe('completo');
    expect(items['RF-05'].capacidades).toEqual([]);
  });

  test('un reporte sin operación resumen sigue marcado como no generado', () => {
    expect(items['RF-20'].nivel).toBe('solo_datos');
    expect(items['RF-20'].capacidades.map((item) => item.id)).toEqual(['reportes']);
  });
});
