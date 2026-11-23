const fs = require('node:fs');
const path = require('node:path');
const { transformSync } = require('esbuild');
const ApplicationSpecService = require('../src/infrastructure/services/ApplicationSpecService');
const DomainModelExtractor = require('../src/infrastructure/services/DomainModelExtractor');

// Dominio de la presentación (Ventas): asociación simple Venta–LineaVenta (no composición) y Venta "1" -- "0..1" Factura.
const PLANTUML = `@startuml
class Producto {
  +String id
  +String nombre
  +Decimal precioVenta
  +int stock
  +String estado
}
class Venta {
  +String id
  +DateTime fecha
  +String medioPago
  +String estado
  +Decimal total
}
class LineaVenta {
  +String id
  +int cantidad
  +Decimal precioUnitario
}
class Factura {
  +String id
  +String numero
  +DateTime fecha
  +Decimal subtotal
  +Decimal igv
  +Decimal total
  +String estado
}
Venta "1" -- "*" LineaVenta : contiene
LineaVenta "*" -- "1" Producto : incluye
Venta "1" -- "0..1" Factura : genera
@enduml`;
const modelo = new DomainModelExtractor().fromDiagrams([{ tipo: 'clases_dominio', aprobado: true, estado: 'aprobado', desactualizado: false, codigo_plantuml: PLANTUML }]);
const rf = ['RF-01', 'RF-03', 'RF-08'].map((identificador) => ({ aprobado: true, tipo: 'RF', identificador, nombre: identificador, descripcion: '', actores: ['Vendedor'] }));
const spec = new ApplicationSpecService({}).validar({
  operaciones: [
    { nombre: 'registrarVenta', rf: 'RF-01', tipo: 'crear', entidad: 'Venta', actores: ['Vendedor'], estado_decision: 'confirmado', origen: 'ia', entradas: ['medioPago', 'total'] },
    { nombre: 'emitirFactura', rf: 'RF-03', tipo: 'crear', entidad: 'Factura', actores: ['Vendedor'], estado_decision: 'confirmado', origen: 'ia', entradas: ['venta_id'] },
    { nombre: 'anularVenta', rf: 'RF-08', tipo: 'transicion', entidad: 'Venta', actores: ['Administrador'], estado_decision: 'confirmado', origen: 'ia', entradas: ['venta_id'], transicion: { campo: 'estado', de: ['activa'], a: 'anulada' } }
  ],
  pantallas: []
}, { modelo, rf, cablear: false });
const op = (nombre) => spec.operaciones.find((item) => item.nombre === nombre);

describe('especificación de Ventas', () => {
  test('las operaciones centrales ya no se descartan', () => {
    expect(spec.errores).toEqual([]);
    expect(op('registrarVenta').lineas).toMatchObject({ entidad: 'LineaVenta', referencia: 'producto_id', cantidad: 'cantidad', total: 'total', stock: 'stock', activo: { campo: 'estado', valor: 'activo' } });
    expect(op('emitirFactura').vincula).toMatchObject({ entidad: 'Venta', parametro: 'venta_id', campo: 'factura_id' });
    expect(op('emitirFactura').autoEntradas).toEqual(expect.arrayContaining([{ campo: 'numero', valor: 'correlativo', prefijo: 'F001-', digitos: 5 }, { campo: 'subtotal', valor: 'vinculado', desde: 'total' }]));
    expect(op('anularVenta').transicion).toEqual({ campo: 'estado', de: ['activa'], a: 'anulada' });
    expect(op('anularVenta').reponer).toMatchObject({ stock: 'stock', referencia: 'producto_id' });
  });
});

const load = (defs) => {
  const source = fs.readFileSync(path.join(__dirname, '../src/infrastructure/templates/actions/actions-runtime.js'), 'utf8').replace('__DEFINITIONS__', JSON.stringify(defs));
  const module = { exports: {} };
  new Function('module', 'exports', 'require', transformSync(source, { format: 'cjs' }).code)(module, module.exports, require);
  return module.exports;
};

/** Almacén en memoria por capacidad. */
function memoryStore(seed) {
  const tables = new Map(Object.entries(seed).map(([capability, rows]) => [capability, new Map(rows.map((row) => [row.id, { id: row.id, data: { ...row } }]))]));
  const table = (capability) => { if (!tables.has(capability)) tables.set(capability, new Map()); return tables.get(capability); };
  let seq = 100;
  return {
    tables,
    getRecord: async (capability, id) => table(capability).get(String(id)) || null,
    list: async (capability, equality = {}) => [...table(capability).values()].filter((row) => Object.entries(equality).every(([key, value]) => String(row.data[key]) === String(value))),
    // Como el motor de reglas generado (valor_por_defecto): la venta nace «activa» y la factura «emitida».
    create: async (capability, values) => { const id = String(++seq); const defaults = capability === 'rf-01' ? { estado: 'activa' } : capability === 'rf-03' ? { estado: 'emitida' } : {}; const record = { id, data: { ...defaults, ...values } }; table(capability).set(id, record); return record; },
    update: async (capability, id, values) => { const record = table(capability).get(String(id)); if (!record) return null; Object.assign(record.data, values); return record; },
    remove: async (capability, id) => table(capability).delete(String(id))
  };
}

describe('servidor de Ventas: la prueba manual de la guía', () => {
  const lineas = { ...op('registrarVenta').lineas, capability: 'op-lineaventa', destinoCapability: 'rf-05' };
  const defs = {
    registrar: { name: 'registrarVenta', type: 'crear', capability: 'rf-01', inputs: ['medioPago'], autoInputs: op('registrarVenta').autoEntradas, lineas },
    factura: { name: 'emitirFactura', type: 'crear', capability: 'rf-03', entity: 'Factura', inputs: [], autoInputs: op('emitirFactura').autoEntradas, vincula: { ...op('emitirFactura').vincula, capability: 'rf-01' } },
    anular: { name: 'anularVenta', type: 'transicion', capability: 'rf-01', transition: op('anularVenta').transicion, reponer: { ...op('anularVenta').reponer, capability: 'op-lineaventa', destinoCapability: 'rf-05' } }
  };
  const runtime = load(Object.values(defs));
  const seed = () => memoryStore({
    'rf-05': [
      { id: 'p1', nombre: 'Arroz', precioVenta: 4.5, stock: 10, estado: 'activo' },
      { id: 'p2', nombre: 'Aceite', precioVenta: 12, stock: 3, estado: 'activo' },
      { id: 'p3', nombre: 'Leche', precioVenta: 5, stock: 20, estado: 'inactivo' }
    ]
  });
  const stock = (store, id) => store.tables.get('rf-05').get(id).data.stock;

  test('venta con 2 productos: guarda líneas, calcula total y baja el stock', async () => {
    const store = seed();
    const venta = await runtime.run(store, defs.registrar, { body: { medioPago: 'efectivo', lineas: [{ producto_id: 'p1', cantidad: 2 }, { producto_id: 'p2', cantidad: 1 }] } });
    expect(venta.total).toBe(21);
    expect(venta.estado).toBe('activa');
    expect(stock(store, 'p1')).toBe(8);
    expect(stock(store, 'p2')).toBe(2);
  });

  test('vender más de lo que hay o un producto desactivado se rechaza sin tocar el stock', async () => {
    const store = seed();
    await expect(runtime.run(store, defs.registrar, { body: { medioPago: 'efectivo', lineas: [{ producto_id: 'p2', cantidad: 2 }, { producto_id: 'p2', cantidad: 2 }] } })).rejects.toMatchObject({ status: 409 });
    await expect(runtime.run(store, defs.registrar, { body: { medioPago: 'efectivo', lineas: [{ producto_id: 'p3', cantidad: 1 }] } })).rejects.toMatchObject({ status: 409 });
    expect(stock(store, 'p2')).toBe(3);
    expect(store.tables.get('rf-01')?.size || 0).toBe(0);
  });

  test('factura F001-00001 con subtotal de la venta; una sola por venta; la siguiente es F001-00002', async () => {
    const store = seed();
    const venta = await runtime.run(store, defs.registrar, { body: { medioPago: 'efectivo', lineas: [{ producto_id: 'p1', cantidad: 2 }] } });
    const factura = await runtime.run(store, defs.factura, { body: { venta_id: venta.id } });
    expect(factura).toMatchObject({ numero: 'F001-00001', subtotal: 9 });
    expect(store.tables.get('rf-01').get(venta.id).data.factura_id).toBe(factura.id);
    await expect(runtime.run(store, defs.factura, { body: { venta_id: venta.id } })).rejects.toMatchObject({ status: 409 });
    const otra = await runtime.run(store, defs.registrar, { body: { medioPago: 'transferencia', lineas: [{ producto_id: 'p1', cantidad: 1 }] } });
    expect((await runtime.run(store, defs.factura, { body: { venta_id: otra.id } })).numero).toBe('F001-00002');
  });

  test('anular la venta devuelve el stock y no se puede anular dos veces', async () => {
    const store = seed();
    const venta = await runtime.run(store, defs.registrar, { body: { medioPago: 'efectivo', lineas: [{ producto_id: 'p1', cantidad: 3 }, { producto_id: 'p2', cantidad: 2 }] } });
    expect(stock(store, 'p1')).toBe(7);
    const anulada = await runtime.run(store, defs.anular, { id: venta.id, body: {} });
    expect(anulada.estado).toBe('anulada');
    expect(stock(store, 'p1')).toBe(10);
    expect(stock(store, 'p2')).toBe(3);
    await expect(runtime.run(store, defs.anular, { id: venta.id, body: {} })).rejects.toMatchObject({ status: 409 });
    expect(stock(store, 'p1')).toBe(10);
  });
});

test('un filtro con un campo ajeno en un alta o transición se ignora; en una consulta sigue siendo un error', () => {
  const result = new ApplicationSpecService({}).validar({ operaciones: [
    { nombre: 'emitirFactura', rf: 'RF-03', tipo: 'crear', entidad: 'Factura', actores: ['Vendedor'], estado_decision: 'confirmado', origen: 'ia', entradas: ['venta_id'], filtros: [{ campo: 'factura_id', operador: '==', origen: 'parametro', valor: 'x' }] },
    { nombre: 'listarFacturas', rf: 'RF-03', tipo: 'consulta', entidad: 'Factura', actores: ['Vendedor'], estado_decision: 'confirmado', origen: 'ia', filtros: [{ campo: 'inexistente', operador: '==', origen: 'parametro', valor: 'x' }] }
  ], pantallas: [] }, { modelo, rf, cablear: false });
  expect(result.operaciones.map((item) => item.nombre)).toEqual(['emitirFactura']);
  expect(result.errores.join(' ')).toMatch(/listarFacturas/);
});

describe('anular con motivo (alta de AnulacionVenta vinculada a la venta)', () => {
  const MODEL = PLANTUML.replace('Venta "1" -- "0..1" Factura : genera', 'Venta "1" -- "0..1" Factura : genera\nclass AnulacionVenta {\n  +String id\n  +String motivo\n}\nVenta "1" -- "0..1" AnulacionVenta : puede tener');
  const modeloA = new DomainModelExtractor().fromDiagrams([{ tipo: 'clases_dominio', aprobado: true, estado: 'aprobado', desactualizado: false, codigo_plantuml: MODEL }]);
  const specA = new ApplicationSpecService({}).validar({ operaciones: [
    { nombre: 'registrarVenta', rf: 'RF-01', tipo: 'crear', entidad: 'Venta', actores: ['Vendedor'], estado_decision: 'confirmado', origen: 'ia', entradas: ['medioPago'] },
    { nombre: 'anularVenta', rf: 'RF-08', tipo: 'crear', entidad: 'AnulacionVenta', actores: ['Administrador'], estado_decision: 'confirmado', origen: 'ia', entradas: ['venta_id', 'motivo'] }
  ], pantallas: [] }, { modelo: modeloA, rf, cablear: false });
  const anular = specA.operaciones.find((item) => item.nombre === 'anularVenta');

  test('la especificación marca que anular cambia el estado, repone stock y anula la factura', () => {
    expect(anular.anula).toMatchObject({ estado: 'estado', valor: 'anulada', reponer: { stock: 'stock' }, documentos: [{ campo: 'factura_id', entidad: 'Factura', valor: 'anulada' }] });
  });

  test('en el servidor: venta anulada, stock devuelto y factura anulada', async () => {
    const lineasA = { ...specA.operaciones.find((item) => item.nombre === 'registrarVenta').lineas, capability: 'op-lineaventa', destinoCapability: 'rf-05' };
    const defsA = {
      registrar: { name: 'registrarVenta', type: 'crear', capability: 'rf-01', inputs: ['medioPago'], autoInputs: [{ campo: 'total', valor: 'lineas' }], lineas: lineasA },
      anular: { name: 'anularVenta', type: 'crear', capability: 'op-anulacion', inputs: ['motivo'], vincula: { ...anular.vincula, capability: 'rf-01' },
        anula: { ...anular.anula, reponer: { ...anular.anula.reponer, capability: 'op-lineaventa', destinoCapability: 'rf-05' }, documentos: anular.anula.documentos.map((doc) => ({ ...doc, capability: 'rf-03' })) } }
    };
    const rt = load(Object.values(defsA));
    const store = memoryStore({ 'rf-05': [{ id: 'p1', nombre: 'Arroz', precioVenta: 4.5, stock: 10, estado: 'activo' }], 'rf-03': [{ id: 'f1', numero: 'F001-00001', estado: 'emitida' }] });
    const venta = await rt.run(store, defsA.registrar, { body: { medioPago: 'efectivo', lineas: [{ producto_id: 'p1', cantidad: 4 }] } });
    await store.update('rf-01', venta.id, { factura_id: 'f1' });
    expect(store.tables.get('rf-05').get('p1').data.stock).toBe(6);
    await rt.run(store, defsA.anular, { body: { venta_id: venta.id, motivo: 'Error de cobro' } });
    expect(store.tables.get('rf-01').get(venta.id).data.estado).toBe('anulada');
    expect(store.tables.get('rf-05').get('p1').data.stock).toBe(10);
    expect(store.tables.get('rf-03').get('f1').data.estado).toBe('anulada');
    await expect(rt.run(store, defsA.anular, { body: { venta_id: venta.id, motivo: 'otra vez' } })).rejects.toMatchObject({ status: 409 });
    expect(store.tables.get('rf-05').get('p1').data.stock).toBe(10);
  });
});

describe('reportes (resumen): derivación y servidor', () => {
  const rfReportes = [
    { aprobado: true, tipo: 'RF', identificador: 'RF-01', nombre: 'Registrar venta', descripcion: '', actores: ['Vendedor'] },
    { aprobado: true, tipo: 'RF', identificador: 'RF-10', nombre: 'Generar reporte de ventas por rango de fechas', descripcion: 'Total vendido y número de ventas.', actores: ['Administrador'] },
    { aprobado: true, tipo: 'RF', identificador: 'RF-11', nombre: 'Generar reporte de productos más vendidos por rango de fechas', descripcion: 'Cantidad total vendida de cada producto.', actores: ['Administrador'] }
  ];
  const depurada = new ApplicationSpecService({}).depurar({ operaciones: [
    { nombre: 'registrarVenta', rf: 'RF-01', tipo: 'crear', entidad: 'Venta', actores: ['Vendedor'], entradas: ['medioPago'] },
    { nombre: 'consultarVentasPorFecha', rf: 'RF-10', tipo: 'consulta', entidad: 'Venta', actores: ['Administrador'], filtros: [], salida: ['fecha', 'total'] }
  ], pantallas: [] }, { modelo, rf: rfReportes });
  const de = (rfId) => depurada.especificacion.operaciones.find((item) => item.rf === rfId && item.tipo === 'resumen');

  test('«más vendidos» agrupa las líneas por producto y suma la cantidad, con la fecha de la venta', () => {
    expect(de('RF-11')).toMatchObject({ entidad: 'LineaVenta', resumen: { agruparPor: 'producto_id', medidas: [{ funcion: 'sumar', campo: 'cantidad', nombre: 'cantidadVendida' }], via: { entidad: 'Venta', campo: 'venta_id' }, excluir: { campo: 'estado', en: 'via' } } });
    expect(de('RF-11').filtros).toEqual([
      { campo: 'fecha', operador: '>=', origen: 'parametro', valor: 'desde', en: 'via' },
      { campo: 'fecha', operador: '<=', origen: 'parametro', valor: 'hasta', en: 'via' }
    ]);
  });

  test('«reporte de ventas» cuenta y suma el total aunque la IA solo propusiera una consulta plana', () => {
    expect(de('RF-10')).toMatchObject({ entidad: 'Venta', salida: ['numeroVentas', 'totalVendido'], resumen: { medidas: [{ funcion: 'contar' }, { funcion: 'sumar', campo: 'total' }] } });
    expect(new ApplicationSpecService({}).validar({ operaciones: depurada.especificacion.operaciones, pantallas: [] }, { modelo, rf: rfReportes, cablear: false }).errores).toEqual([]);
  });

  test('en el servidor: rango de fechas de la venta (día completo), sin anuladas, ordenado y con el nombre del producto', async () => {
    const masVendidos = { name: 'masVendidos', type: 'resumen', capability: 'op-lineaventa', filters: de('RF-11').filtros, resumen: { ...de('RF-11').resumen, via: { ...de('RF-11').resumen.via, capability: 'rf-01' }, agrupadoCapability: 'rf-05' } };
    const ventas = { name: 'reporteVentas', type: 'resumen', capability: 'rf-01', filters: de('RF-10').filtros, resumen: de('RF-10').resumen };
    const rt = load([masVendidos, ventas]);
    const store = memoryStore({
      'rf-05': [{ id: 'p1', nombre: 'Arroz' }, { id: 'p2', nombre: 'Aceite' }],
      'rf-01': [
        { id: 'v1', fecha: '2026-11-10T09:00:00Z', estado: 'activa', total: 30 },
        { id: 'v2', fecha: '2026-11-21T18:30:00Z', estado: 'activa', total: 12.5 },
        { id: 'v3', fecha: '2026-11-15T10:00:00Z', estado: 'anulada', total: 100 },
        { id: 'v4', fecha: '2026-10-01T10:00:00Z', estado: 'activa', total: 7 }
      ],
      'op-lineaventa': [
        { id: 'l1', venta_id: 'v1', producto_id: 'p1', cantidad: 2 }, { id: 'l2', venta_id: 'v1', producto_id: 'p2', cantidad: 5 },
        { id: 'l3', venta_id: 'v2', producto_id: 'p1', cantidad: 4 }, { id: 'l4', venta_id: 'v3', producto_id: 'p2', cantidad: 50 },
        { id: 'l5', venta_id: 'v4', producto_id: 'p2', cantidad: 9 }
      ]
    });
    const query = { desde: '2026-11-01', hasta: '2026-11-21' };
    expect(await rt.run(store, masVendidos, { query })).toEqual([
      { id: 'p1', producto_id: 'p1', producto_id__etiqueta: 'Arroz', cantidadVendida: 6 },
      { id: 'p2', producto_id: 'p2', producto_id__etiqueta: 'Aceite', cantidadVendida: 5 }
    ]);
    expect(await rt.run(store, ventas, { query })).toEqual([{ id: 'total', numeroVentas: 2, totalVendido: 42.5 }]);
    expect(await rt.run(store, ventas, { query: { desde: '2030-01-01' } })).toEqual([{ id: 'total', numeroVentas: 0, totalVendido: 0 }]);
  });
});

test('el contrato ata el reporte a los almacenes de la venta (fecha) y del producto (nombre) y lo expone por GET', () => {
  const ApplicationContractBuilder = require('../src/infrastructure/services/ApplicationContractBuilder');
  const rfC = [
    { aprobado: true, tipo: 'RF', identificador: 'RF-01', nombre: 'Registrar venta', descripcion: 'Registrar venta con productos', actores: ['Vendedor'] },
    { aprobado: true, tipo: 'RF', identificador: 'RF-05', nombre: 'Gestionar productos', descripcion: 'Productos del catálogo', actores: ['Administrador'] },
    { aprobado: true, tipo: 'RF', identificador: 'RF-11', nombre: 'Generar reporte de productos más vendidos', descripcion: 'Cantidad vendida por producto', actores: ['Administrador'] }
  ];
  const { especificacion } = new ApplicationSpecService({}).depurar({ operaciones: [
    { nombre: 'registrarVenta', rf: 'RF-01', tipo: 'crear', entidad: 'Venta', actores: ['Vendedor'], entradas: ['medioPago'] },
    { nombre: 'listarProductos', rf: 'RF-05', tipo: 'consulta', entidad: 'Producto', actores: ['Administrador'], filtros: [], salida: ['nombre'] }
  ], pantallas: [] }, { modelo, rf: rfC });
  const confirmada = ApplicationSpecService.confirmada({ operaciones: especificacion.operaciones.map((item) => ({ ...item, estado_decision: 'confirmado' })), pantallas: [] });
  const contrato = new ApplicationContractBuilder().build({ proyecto: { nombre: 'x' }, requerimientos: rfC, domainModel: modelo, spec: confirmada });
  const accion = contrato.operations.flatMap((item) => item.actions || []).find((item) => item.type === 'resumen');
  expect(accion).toBeTruthy();
  expect(accion.method).toBe('GET');
  expect(accion.resumen.via.capability).toBeTruthy();
  expect(accion.resumen.agrupadoCapability).toBeTruthy();
});

test('«desactivarProducto» sin campo ni estados se completa: estado activo → inactivo', () => {
  const result = new ApplicationSpecService({}).validar({ operaciones: [
    { nombre: 'desactivarProducto', rf: 'RF-01', tipo: 'transicion', entidad: 'Producto', actores: ['Administrador'], estado_decision: 'confirmado', origen: 'ia', transicion: { campo: '' } }
  ], pantallas: [] }, { modelo, rf, cablear: false });
  expect(result.errores).toEqual([]);
  expect(result.operaciones[0].transicion).toEqual({ campo: 'estado', de: ['activo'], a: 'inactivo' });
});

test('el reporte derivado se muestra como tabla en su pantalla de reporte aunque la IA no la cablee', () => {
  const rfR = [
    { aprobado: true, tipo: 'RF', identificador: 'RF-01', nombre: 'Registrar venta', descripcion: '', actores: ['Vendedor'] },
    { aprobado: true, tipo: 'RF', identificador: 'RF-11', nombre: 'Generar reporte de productos más vendidos', descripcion: '', actores: ['Administrador'] }
  ];
  const pantallas = [{ pantalla_id: 'reporte-de-productos-mas-vendidos', slug: 'reporte-de-productos-mas-vendidos', nombre: 'Reporte de productos más vendidos', rf_trazabilidad: ['RF-11'], roles: ['Administrador'] }];
  const { especificacion } = new ApplicationSpecService({}).depurar({ operaciones: [{ nombre: 'registrarVenta', rf: 'RF-01', tipo: 'crear', entidad: 'Venta', actores: ['Vendedor'], entradas: ['medioPago'] }], pantallas: [] }, { modelo, rf: rfR, pantallas });
  const resumen = especificacion.operaciones.find((item) => item.tipo === 'resumen');
  const vista = especificacion.pantallas.find((item) => item.id === 'reporte-de-productos-mas-vendidos');
  expect(vista.componentes[0]).toMatchObject({ tipo: 'tabla', operacion: resumen.nombre });
});

test('revalidar la especificación guardada conserva la vinculación de emitirFactura', () => {
  const service = new ApplicationSpecService({});
  const primera = service.validar({ operaciones: [{ nombre: 'emitirFactura', rf: 'RF-03', tipo: 'crear', entidad: 'Factura', actores: ['Vendedor'], estado_decision: 'confirmado', origen: 'ia', entradas: ['venta_id'] }], pantallas: [] }, { modelo, rf, cablear: false });
  const segunda = service.validar({ operaciones: primera.operaciones, pantallas: [] }, { modelo, rf, cablear: false });
  expect(segunda.errores).toEqual([]);
  expect(segunda.operaciones[0].vincula).toMatchObject({ entidad: 'Venta', campo: 'factura_id', parametro: 'venta_id' });
  expect(segunda.operaciones[0].autoEntradas).toEqual(expect.arrayContaining([{ campo: 'numero', valor: 'correlativo', prefijo: 'F001-', digitos: 5 }]));
});

test('cada reporte va a su propia pantalla aunque la trazabilidad cite ambos RF en una', () => {
  const rfR = [
    { aprobado: true, tipo: 'RF', identificador: 'RF-01', nombre: 'Registrar venta', descripcion: '', actores: ['Vendedor'] },
    { aprobado: true, tipo: 'RF', identificador: 'RF-10', nombre: 'Generar reporte de ventas por rango de fechas', descripcion: '', actores: ['Administrador'] },
    { aprobado: true, tipo: 'RF', identificador: 'RF-11', nombre: 'Generar reporte de productos más vendidos por rango de fechas', descripcion: '', actores: ['Administrador'] }
  ];
  const pantallas = [
    { pantalla_id: 'reporte-de-ventas-por-fechas', nombre: 'Reporte de ventas por fechas', rf_trazabilidad: ['RF-10', 'RF-11'] },
    { pantalla_id: 'reporte-de-productos-mas-vendidos', nombre: 'Reporte de productos más vendidos', rf_trazabilidad: ['RF-11'] }
  ];
  const { especificacion } = new ApplicationSpecService({}).depurar({ operaciones: [{ nombre: 'registrarVenta', rf: 'RF-01', tipo: 'crear', entidad: 'Venta', actores: ['Vendedor'], entradas: ['medioPago'] }], pantallas: [] }, { modelo, rf: rfR, pantallas });
  const de = (id) => especificacion.pantallas.find((item) => item.id === id).componentes.map((c) => especificacion.operaciones.find((op) => op.nombre === c.operacion).rf);
  expect(de('reporte-de-ventas-por-fechas')).toEqual(['RF-10']);
  expect(de('reporte-de-productos-mas-vendidos')).toEqual(['RF-11']);
});

describe('regeneración: «Anular factura y restaurar stock» y operaciones que el sistema ya hace', () => {
  const rfR = [
    { aprobado: true, tipo: 'RF', identificador: 'RF-01', nombre: 'Registrar venta con cliente y productos', actores: ['Vendedor'] },
    { aprobado: true, tipo: 'RF', identificador: 'RF-02', nombre: 'Emitir factura interna', actores: ['Vendedor'] },
    { aprobado: true, tipo: 'RF', identificador: 'RF-07', nombre: 'Anular factura y restaurar stock', actores: ['Administrador'] },
    { aprobado: true, tipo: 'RF', identificador: 'RF-11', nombre: 'Autenticar usuario con nombre de usuario y contraseña cifrada', actores: ['Vendedor'] },
    { aprobado: true, tipo: 'RF', identificador: 'RF-13', nombre: 'Autorizar acciones según rol asignado', actores: ['Administrador'] }
  ];
  const MODEL_R = PLANTUML.replace('+String estado\n  +Decimal total\n}', '+String estado\n  +Decimal total\n  +Boolean modificable\n}') + '\n';
  const modeloR = new DomainModelExtractor().fromDiagrams([{ tipo: 'clases_dominio', aprobado: true, estado: 'aprobado', desactualizado: false, codigo_plantuml: MODEL_R.replace('@enduml', 'class Usuario {\n  +String id\n  +String nombre\n  +String correo\n  +String passwordHash\n}\n@enduml') }]);
  const specR = new ApplicationSpecService({}).validar({ operaciones: [
    { nombre: 'crearVenta', rf: 'RF-01', tipo: 'crear', entidad: 'Venta', actores: ['Vendedor'], estado_decision: 'confirmado', origen: 'ia', entradas: ['medioPago'] },
    { nombre: 'decrementarStockProducto', rf: 'RF-01', tipo: 'actualizar', entidad: 'Producto', actores: ['Vendedor'], estado_decision: 'confirmado', origen: 'ia', entradas: ['stock'] },
    { nombre: 'crearFactura', rf: 'RF-02', tipo: 'crear', entidad: 'Factura', actores: ['Vendedor'], estado_decision: 'confirmado', origen: 'ia', entradas: ['venta_id'] },
    { nombre: 'anularFactura', rf: 'RF-07', tipo: 'transicion', entidad: 'Factura', actores: ['Administrador'], estado_decision: 'confirmado', origen: 'ia', entradas: [], transicion: { campo: 'estado', de: ['emitida'], a: 'anulada' } },
    { nombre: 'restaurarStockProducto', rf: 'RF-07', tipo: 'actualizar', entidad: 'Producto', actores: ['Administrador'], estado_decision: 'confirmado', origen: 'ia', entradas: ['stock'] },
    { nombre: 'marcarVentaNoModificable', rf: 'RF-07', tipo: 'actualizar', entidad: 'Venta', actores: ['Administrador'], estado_decision: 'confirmado', origen: 'ia', entradas: ['modificable'] },
    { nombre: 'autenticarUsuario', rf: 'RF-11', tipo: 'consulta', entidad: 'Usuario', actores: ['Vendedor'], estado_decision: 'confirmado', origen: 'ia', salida: ['nombre'] },
    { nombre: 'registrarUsuario', rf: 'RF-13', tipo: 'crear', entidad: 'Usuario', actores: ['Administrador'], estado_decision: 'confirmado', origen: 'derivado', entradas: ['nombre', 'correo', 'passwordHash'] }
  ], pantallas: [] }, { modelo: modeloR, rf: rfR, cablear: false });
  const nombres = specR.operaciones.map((item) => item.nombre);

  test('quedan la venta, la factura y su anulación; se quitan el stock manual, el marcado manual, el acceso y la autorización', () => {
    expect(nombres.sort()).toEqual(['anularFactura', 'crearFactura', 'crearVenta']);
    expect(specR.avisos.join(' ')).toContain('decrementarStockProducto');
  });

  test('anular la factura anula su venta y repone su stock (cascada)', async () => {
    const anularF = specR.operaciones.find((item) => item.nombre === 'anularFactura');
    expect(anularF.cascada).toMatchObject({ entidad: 'Venta', campo: 'factura_id', estado: 'estado', valor: 'anulada', reponer: { stock: 'stock' } });
    const lineasR = { ...specR.operaciones.find((item) => item.nombre === 'crearVenta').lineas, capability: 'op-lineaventa', destinoCapability: 'rf-05' };
    const defs = {
      venta: { name: 'crearVenta', type: 'crear', capability: 'rf-01', inputs: ['medioPago'], autoInputs: [{ campo: 'total', valor: 'lineas' }], lineas: lineasR },
      anular: { name: 'anularFactura', type: 'transicion', capability: 'rf-02', byId: true, transition: anularF.transicion, cascada: { ...anularF.cascada, capability: 'rf-01', reponer: { ...anularF.cascada.reponer, capability: 'op-lineaventa', destinoCapability: 'rf-05' } } }
    };
    const rt = load(Object.values(defs));
    const store = memoryStore({ 'rf-05': [{ id: 'p1', nombre: 'Arroz', precioVenta: 4.5, stock: 10, estado: 'activo' }], 'rf-02': [{ id: 'f1', numero: 'F001-00001', estado: 'emitida' }] });
    const venta = await rt.run(store, defs.venta, { body: { medioPago: 'efectivo', lineas: [{ producto_id: 'p1', cantidad: 3 }] } });
    await store.update('rf-01', venta.id, { factura_id: 'f1' });
    expect(store.tables.get('rf-05').get('p1').data.stock).toBe(7);
    await rt.run(store, defs.anular, { id: 'f1', body: {} });
    expect(store.tables.get('rf-02').get('f1').data.estado).toBe('anulada');
    expect(store.tables.get('rf-01').get(venta.id).data.estado).toBe('anulada');
    expect(store.tables.get('rf-05').get('p1').data.stock).toBe(10);
  });
});

describe('regeneración: venta sin estado (solo «modificable»)', () => {
  test('anular la factura deja la venta no modificable y repone su stock', () => {
    const MODEL_M = PLANTUML.replace('+String medioPago\n  +String estado\n  +Decimal total', '+String medioPago\n  +Decimal total\n  +Boolean modificable');
    const modeloM = new DomainModelExtractor().fromDiagrams([{ tipo: 'clases_dominio', aprobado: true, estado: 'aprobado', desactualizado: false, codigo_plantuml: MODEL_M }]);
    const specM = new ApplicationSpecService({}).validar({ operaciones: [
      { nombre: 'crearVenta', rf: 'RF-01', tipo: 'crear', entidad: 'Venta', actores: ['Vendedor'], estado_decision: 'confirmado', origen: 'ia', entradas: ['medioPago'] },
      { nombre: 'crearFactura', rf: 'RF-03', tipo: 'crear', entidad: 'Factura', actores: ['Vendedor'], estado_decision: 'confirmado', origen: 'ia', entradas: ['venta_id'] },
      { nombre: 'anularFactura', rf: 'RF-08', tipo: 'transicion', entidad: 'Factura', actores: ['Administrador'], estado_decision: 'confirmado', origen: 'ia', entradas: [], transicion: { campo: 'estado', de: ['emitida'], a: 'anulada' } }
    ], pantallas: [] }, { modelo: modeloM, rf, cablear: false });
    expect(specM.operaciones.find((item) => item.nombre === 'anularFactura').cascada).toMatchObject({ entidad: 'Venta', campo: 'factura_id', estado: 'modificable', valor: false, reponer: { stock: 'stock' } });
  });
});

describe('regeneración: estado inicial desde la transición', () => {
  test('la factura nace en el estado que exige su anulación (texto sin valores en el modelo)', () => {
    const MODEL_T = PLANTUML.replace('+Decimal total\n  +String estado\n}', '+Decimal total\n  +String estado\n}');
    const modeloT = new DomainModelExtractor().fromDiagrams([{ tipo: 'clases_dominio', aprobado: true, estado: 'aprobado', desactualizado: false, codigo_plantuml: MODEL_T }]);
    const specT = new ApplicationSpecService({}).validar({ operaciones: [
      { nombre: 'crearVenta', rf: 'RF-01', tipo: 'crear', entidad: 'Venta', actores: ['Vendedor'], estado_decision: 'confirmado', origen: 'ia', entradas: ['medioPago'] },
      { nombre: 'crearFactura', rf: 'RF-03', tipo: 'crear', entidad: 'Factura', actores: ['Vendedor'], estado_decision: 'confirmado', origen: 'ia', entradas: ['venta_id'] },
      { nombre: 'anularFactura', rf: 'RF-08', tipo: 'transicion', entidad: 'Factura', actores: ['Administrador'], estado_decision: 'confirmado', origen: 'ia', entradas: [], transicion: { campo: 'estado', de: ['activa'], a: 'anulada' } }
    ], pantallas: [] }, { modelo: modeloT, rf, cablear: false });
    expect(specT.operaciones.find((item) => item.nombre === 'crearFactura').autoEntradas).toEqual(expect.arrayContaining([{ campo: 'estado', valor: 'inicial', opciones: ['activa'] }]));
  });
});

describe('regeneración: reportes sin estado en la venta', () => {
  test('«más vendidos» excluye las ventas bloqueadas (modificable = false) si la venta no tiene estado', () => {
    const MODEL_M = PLANTUML.replace('+String medioPago\n  +String estado\n  +Decimal total', '+String medioPago\n  +Decimal total\n  +Boolean modificable');
    const modeloM = new DomainModelExtractor().fromDiagrams([{ tipo: 'clases_dominio', aprobado: true, estado: 'aprobado', desactualizado: false, codigo_plantuml: MODEL_M }]);
    const specM = new ApplicationSpecService({}).validar({ operaciones: [
      { nombre: 'crearVenta', rf: 'RF-01', tipo: 'crear', entidad: 'Venta', actores: ['Vendedor'], estado_decision: 'confirmado', origen: 'ia', entradas: ['medioPago'] },
      { nombre: 'masVendidos', rf: 'RF-03', tipo: 'resumen', entidad: 'LineaVenta', actores: ['Administrador'], estado_decision: 'confirmado', origen: 'derivado', entradas: [], salida: ['producto_id', 'cantidadVendida'],
        resumen: { agruparPor: 'producto_id', medidas: [{ funcion: 'sumar', campo: 'cantidad', nombre: 'cantidadVendida' }], via: { entidad: 'Venta', campo: 'venta_id' }, orden: 'desc' } }
    ], pantallas: [] }, { modelo: modeloM, rf, cablear: false });
    expect(specM.operaciones.find((item) => item.nombre === 'masVendidos').resumen.excluir).toEqual({ campo: 'modificable', patron: '^false$', en: 'via' });
  });
});
