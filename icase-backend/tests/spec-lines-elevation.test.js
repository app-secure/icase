const ApplicationSpecService = require('../src/infrastructure/services/ApplicationSpecService');
const DomainModelExtractor = require('../src/infrastructure/services/DomainModelExtractor');

// Dominio tal como lo dibujó el modelo: la línea (DetalleVenta) lleva referencias a Venta y a Producto.
const PLANTUML = `@startuml
class Usuario {
  +String id
  +String nombreUsuario
  +String rol
}
class Producto {
  +String codigo
  +String nombre
  +Decimal precioVenta
  +int stock
}
class Cliente {
  +String id
  +String nombre
  +String numeroDocumento
}
class Venta {
  +String id
  +DateTime fecha
  +String estado
  +Decimal total
  +Usuario vendedor
  +Cliente cliente
}
class DetalleVenta {
  +String id
  +Venta venta
  +Producto producto
  +int cantidad
  +Decimal precioUnitario
  +Decimal subtotal
}
Usuario "1" -- "*" Venta : registra
Venta "1" -- "1" Cliente : para
Venta "1" -- "*" DetalleVenta : contiene
DetalleVenta "*" -- "1" Producto : incluye
@enduml`;
const modelo = new DomainModelExtractor().fromDiagrams([{ tipo: 'clases_dominio', aprobado: true, estado: 'aprobado', desactualizado: false, codigo_plantuml: PLANTUML }]);
const rf = [
  { aprobado: true, tipo: 'RF', identificador: 'RF-01', nombre: 'Registrar venta con selección de cliente, productos y cálculo automático', descripcion: '', actores: ['Vendedor'] },
  { aprobado: true, tipo: 'RF', identificador: 'RF-06', nombre: 'Anular venta con motivo y reversión de stock', descripcion: '', actores: ['Administrador'] }
];

describe('la venta se registra con sus líneas', () => {
  const { especificacion, advertencias } = new ApplicationSpecService({}).depurar({
    operaciones: [{ nombre: 'crearDetalleVenta', rf: 'RF-01', tipo: 'crear', entidad: 'DetalleVenta', actores: ['Vendedor'], entradas: ['producto_id', 'cantidad', 'precioUnitario'] }]
  }, { modelo, rf, pantallas: [] });
  const op = (nombre) => especificacion.operaciones.find((item) => item.nombre === nombre);

  test('«crear DetalleVenta» pasa a «crear Venta» con sus líneas', () => {
    const alta = especificacion.operaciones.find((item) => item.rf === 'RF-01' && item.tipo === 'crear');
    expect(alta.entidad).toBe('Venta');
    expect(alta.lineas).toMatchObject({ entidad: 'DetalleVenta', cantidad: 'cantidad', stock: 'stock' });
    expect(advertencias.join(' ')).toMatch(/se aplicó a Venta/);
  });

  test('«Anular venta» se deriva como transición a «anulada», no como borrado', () => {
    const anular = especificacion.operaciones.find((item) => item.rf === 'RF-06');
    expect(anular.tipo).toBe('transicion');
    expect(anular.transicion).toMatchObject({ campo: 'estado', a: expect.stringMatching(/^anulad/) });
    expect(op('eliminarVenta')).toBeUndefined();
  });
});

describe('alta suelta de la línea', () => {
  test('si la IA propone «crearVenta» y «crearDetalleVenta», solo queda la venta con sus líneas', () => {
    const { especificacion } = new ApplicationSpecService({}).depurar({
      operaciones: [
        { nombre: 'crearVenta', rf: 'RF-01', tipo: 'crear', entidad: 'Venta', actores: ['Vendedor'], entradas: ['cliente_id'] },
        { nombre: 'crearDetalleVenta', rf: 'RF-01', tipo: 'crear', entidad: 'DetalleVenta', actores: ['Vendedor'], entradas: ['producto_id', 'cantidad'] }
      ]
    }, { modelo, rf, pantallas: [] });
    const altas = especificacion.operaciones.filter((item) => item.tipo === 'crear').map((item) => item.nombre);
    expect(altas).toContain('crearVenta');
    expect(altas).not.toContain('crearDetalleVenta');
  });
});

describe('actores de las operaciones', () => {
  test('«Administrador» (de la IA) se escribe como lo llaman los requisitos: «Administradora»', () => {
    const rfs = [{ aprobado: true, tipo: 'RF', identificador: 'RF-03', nombre: 'Gestionar productos', descripcion: '', actores: ['Administradora'] }];
    const modeloP = new DomainModelExtractor().fromDiagrams([{ tipo: 'clases_dominio', aprobado: true, estado: 'aprobado', desactualizado: false, codigo_plantuml: '@startuml\nclass Producto {\n  +String nombre\n  +int stock\n}\n@enduml' }]);
    const { especificacion } = new ApplicationSpecService({}).depurar({
      operaciones: [{ nombre: 'crearProducto', rf: 'RF-03', tipo: 'crear', entidad: 'Producto', actores: ['Administrador'], entradas: ['nombre', 'stock'] }]
    }, { modelo: modeloP, rf: rfs, pantallas: [] });
    expect(especificacion.operaciones.find((op) => op.nombre === 'crearProducto').actores).toEqual(['Administradora']);
  });
});
