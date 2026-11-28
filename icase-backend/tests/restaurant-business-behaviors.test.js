// Caso Restaurante (insumo de 16 requisitos): lo que el generador deduce del modelo y de los requisitos, y que antes no existía.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Extractor = require('../src/infrastructure/services/DomainModelExtractor');
const Spec = require('../src/infrastructure/services/ApplicationSpecService');

const modelo = new Extractor().extract(`@startuml
enum CategoriaPlato {
  ALMUERZO
  BEBIDA
}
enum DisponibilidadPlato {
  DISPONIBLE
  AGOTADO
}
enum EstadoMesa {
  LIBRE
  OCUPADA
}
enum TipoReserva {
  MESA_COMPLETA
  SILLA
}
enum EstadoReserva {
  PENDIENTE
  VALIDADA
}
enum EstadoPedido {
  PENDIENTE
  LISTO
  PAGADO
}
enum MetodoPago {
  EFECTIVO
  SALDO_PREPAGADO
}
enum EstadoPaquete {
  SOLICITADO
  ACTIVO
}
class Usuario {
  +String nombre
  +String correo
  +String passwordHash
}
class Plato {
  +String nombre
  +CategoriaPlato categoria
  +Decimal precio
  +DisponibilidadPlato disponibilidad
}
class Mesa {
  +Integer numero
  +Integer cantidadSillas
  +EstadoMesa estado
  +Usuario mesero
}
class Reserva {
  +Usuario cliente
  +Mesa mesa
  +TipoReserva tipo
  +DateTime fechaHora
  +String codigoReserva
  +EstadoReserva estado
}
class Pedido {
  +Mesa mesa
  +Usuario mesero
  +Usuario? cliente
  +DateTime fechaHora
  +EstadoPedido estado
  +Decimal total
}
class DetallePedido {
  +Plato plato
  +Integer cantidad
  +Decimal precioUnitario
}
class Cobro {
  +Pedido pedido
  +Usuario cajero
  +DateTime fecha
  +MetodoPago metodo
  +Decimal monto
}
class CierreCaja {
  +Usuario cajero
  +Date fecha
  +Decimal montoEfectivo
}
class PaquetePrepagado {
  +Usuario cliente
  +Date fechaInicio
  +Date fechaFin
  +Decimal montoPagado
  +Decimal saldo
  +EstadoPaquete estado
}
class CuentaPuntos {
  +Usuario cliente
  +Integer puntos
}
Pedido "1" *-- "1..*" DetallePedido
@enduml`);

const rf = (identificador, nombre, descripcion, actores) => ({ identificador, tipo: 'RF', aprobado: true, nombre, descripcion, actores });
const requisitos = [
  rf('RF-01', 'Reserva de mesa o silla', 'El Cliente reserva una mesa completa o una silla. El sistema asigna un código de reserva.', ['Cliente']),
  rf('RF-02', 'Validación de reserva por código', 'El Mesero busca la reserva por su código y la marca como validada, de pendiente a validada.', ['Mesero']),
  rf('RF-03', 'Actualización de estado de mesa', 'El Mesero marca una mesa como libre u ocupada.', ['Mesero']),
  rf('RF-04', 'Gestionar pedido', 'El Cliente o el Mesero registran un pedido.', ['Cliente', 'Mesero']),
  rf('RF-05', 'Registrar cobro de pedido', 'El Cajero cobra un pedido listo.', ['Cajero']),
  rf('RF-06', 'Solicitud de paquete prepagado semanal', 'El Cliente solicita un paquete prepagado de una semana.', ['Cliente']),
  rf('RF-07', 'Activación de paquete prepagado', 'El Cajero activa el paquete con su saldo.', ['Cajero']),
  rf('RF-08', 'Consulta de reportes de ventas por rango de fechas', 'El Administrador ve las ventas con su total y los platos más vendidos.', ['Administrador']),
  rf('RF-09', 'Gestión de mesas', 'El Administrador crea mesas y asigna su mesero.', ['Administrador'])
];
const analisis = { reglas_negocio: [{ necesidad: 'Cliente gana 1 punto por cada unidad de plato de categoría almuerzo en un pedido pagado.' }] };
const op = (rfId, nombre, tipo, entidad, actores, extra = {}) => ({ rf: rfId, nombre, tipo, entidad, actores, entradas: [], salida: [], filtros: [], ...extra });
const propuesta = {
  operaciones: [
    op('RF-01', 'crearReserva', 'crear', 'Reserva', ['Cliente'], { entradas: ['tipo', 'fechaHora', 'mesa_id'] }),
    op('RF-02', 'validarReserva', 'transicion', 'Reserva', ['Mesero'], { transicion: { campo: 'estado', de: ['PENDIENTE'], a: 'VALIDADA' }, filtros: [{ campo: 'codigoReserva', operador: '==', origen: 'parametro', valor: 'codigo' }] }),
    op('RF-03', 'editarMesaDelMesero', 'actualizar', 'Mesa', ['Mesero'], { entradas: ['numero', 'estado'] }),
    op('RF-04', 'crearPedidoCliente', 'crear', 'Pedido', ['Cliente'], { entradas: ['mesa_id'] }),
    op('RF-04', 'crearPedidoMesero', 'crear', 'Pedido', ['Mesero'], { entradas: ['mesa_id'] }),
    op('RF-05', 'registrarCobro', 'crear', 'Cobro', ['Cajero'], { entradas: ['pedido_id', 'metodo', 'monto'] }),
    op('RF-06', 'solicitarPaquete', 'crear', 'PaquetePrepagado', ['Cliente'], { entradas: ['montoPagado'] }),
    op('RF-07', 'activarPaquete', 'transicion', 'PaquetePrepagado', ['Cajero'], { transicion: { campo: 'estado', de: ['SOLICITADO'], a: 'ACTIVO' }, entradas: ['montoPagado'] }),
    op('RF-08', 'consultarVentas', 'consulta', 'Pedido', ['Administrador'], { salida: ['total'] }),
    op('RF-09', 'crearMesa', 'crear', 'Mesa', ['Administrador'], { entradas: ['numero', 'cantidadSillas'] })
  ],
  pantallas: []
};

const { especificacion } = new Spec({}).depurar(propuesta, { modelo, rf: requisitos, analisis });
const get = (nombre) => especificacion.operaciones.find((item) => item.nombre === nombre);
const role = (nombre, campo) => get(nombre).rolEntradas.find((item) => item.campo === campo);

test('cada campo con nombre de rol se llena, se hereda o se elige según quién registra', () => {
  expect(role('crearPedidoCliente', 'cliente_id')).toMatchObject({ rol: 'cliente' });
  expect(role('crearPedidoCliente', 'mesero_id')).toMatchObject({ rol: 'mesero', heredar: { via: 'mesa_id', entidad: 'Mesa' } });
  expect(role('crearPedidoMesero', 'mesero_id').heredar).toBeUndefined();
  expect(role('crearPedidoMesero', 'cliente_id')).toMatchObject({ elegido: true });
  expect(role('crearMesa', 'mesero_id')).toMatchObject({ elegido: true });
  expect(get('crearMesa').entradas).toContain('mesero_id');
  expect(get('crearMesa').sesionEntradas).toBeUndefined();
});

test('el pedido ofrece solo platos disponibles', () => {
  expect(get('crearPedidoCliente').lineas.activo).toEqual({ campo: 'disponibilidad', valor: 'DISPONIBLE' });
});

test('el cobro exige el pedido listo, usa su total, descuenta el saldo y suma puntos', () => {
  const cobro = get('registrarCobro');
  expect(cobro.entradas).toEqual(['pedido_id', 'metodo']);
  expect(cobro.liquida).toMatchObject({ documento: { de: 'LISTO', a: 'PAGADO', total: 'total' }, saldo: { valor: 'SALDO_PREPAGADO', activo: 'ACTIVO' }, puntos: { porUnidad: 1, lineas: { campo: 'categoria', valor: 'ALMUERZO' } } });
});

test('el paquete semanal nace con 7 días y sin saldo; al activarlo, lo pagado es su saldo', () => {
  expect(get('solicitarPaquete').periodo).toEqual({ inicio: 'fechaInicio', fin: 'fechaFin', dias: 7, saldo: 'saldo', positivo: 'montoPagado' });
  expect(get('activarPaquete').alCambiar).toEqual({ exigir: ['montoPagado'], copiar: { saldo: 'montoPagado' } });
});

test('la reserva controla el cupo y recibe un código del sistema', () => {
  expect(get('crearReserva').cupo).toMatchObject({ recurso: 'mesa_id', completo: 'MESA_COMPLETA', capacidad: { campo: 'cantidadSillas' } });
  expect(get('crearReserva').autoEntradas).toContainEqual({ campo: 'codigoReserva', valor: 'generado' });
});

test('«libre u ocupada» son dos botones que sustituyen la edición; «de pendiente a validada» va en un solo sentido', () => {
  expect(get('marcarMesaLibre')).toBeDefined();
  expect(get('marcarMesaOcupada')).toBeDefined();
  expect(get('editarMesaDelMesero')).toBeUndefined();
  expect(especificacion.operaciones.some((item) => item.nombre === 'marcarReservaPendiente')).toBe(false);
  expect(especificacion.operaciones.some((item) => item.tipo === 'consulta' && item.entidad === 'Reserva' && item.exigeParametro)).toBe(true);
});

test('las ventas son lo pagado: total y platos más vendidos del mismo requisito', () => {
  const resumenes = especificacion.operaciones.filter((item) => item.rf === 'RF-08');
  expect(resumenes.map((item) => item.tipo)).toEqual(['resumen', 'resumen']);
  expect(resumenes.every((item) => item.resumen.excluir.patron === '^(?!PAGADO$)')).toBe(true);
});

test('lo cobrado y los cierres quedan bloqueados y un pedido se cobra una sola vez', () => {
  const Behaviors = require('../src/infrastructure/services/BusinessBehaviors');
  const entities = new Map(modelo.entities.map((entity) => [entity.name, entity]));
  const locks = Behaviors.locks([get('registrarCobro'), { tipo: 'crear', entidad: 'CierreCaja' }], entities);
  expect(locks.map((item) => `${item.entidad}:${item.tipo}`).sort()).toEqual(['CierreCaja:solo_insercion', 'Cobro:solo_insercion', 'Cobro:unico', 'Pedido:bloqueo']);
});

describe('motor de operaciones generado', () => {
  const load = () => {
    const source = fs.readFileSync(path.join(__dirname, '../src/infrastructure/templates/actions/actions-runtime.js'), 'utf8').replace('__DEFINITIONS__', '[]');
    const sandbox = { module: { exports: {} }, require, console, Map, Promise };
    vm.runInNewContext(source, sandbox);
    return sandbox.module.exports;
  };
  const memory = (tables) => ({
    list: async (name, filter = {}) => (tables[name] || []).filter((row) => Object.entries(filter).every(([key, value]) => String(row.data[key]) === String(value))),
    getRecord: async (name, id) => (tables[name] || []).find((row) => String(row.id) === String(id)) || null,
    create: async (name, data) => { await new Promise((resolve) => setTimeout(resolve, 5)); const row = { id: String((tables[name] ||= []).length + 1), data: { ...data } }; tables[name].push(row); return row; },
    update: async (name, id, data) => { const row = tables[name].find((item) => String(item.id) === String(id)); Object.assign(row.data, data); return row; }
  });
  const cupo = { name: 'reservar', type: 'crear', method: 'POST', capability: 'reserva', inputs: ['mesa_id', 'tipo', 'fechaHora'], cupo: { recurso: 'mesa_id', momento: 'fechaHora', tipo: 'tipo', completo: 'MESA_COMPLETA', capacidad: { capability: 'mesa', entidad: 'Mesa', campo: 'cantidadSillas' } } };

  test('dos reservas simultáneas de la última silla: solo entra una', async () => {
    const store = memory({ mesa: [{ id: '1', data: { cantidadSillas: 1 } }], reserva: [] });
    const body = { mesa_id: '1', tipo: 'SILLA', fechaHora: '2026-12-01T18:00:00Z' };
    const runtime = load();
    const results = await Promise.allSettled([runtime.run(store, cupo, { body }), runtime.run(store, cupo, { body })]);
    expect(results.map((item) => item.status).sort()).toEqual(['fulfilled', 'rejected']);
  });

  test('el cobro rechaza un pedido que no está listo y no cobra dos veces', async () => {
    const tables = { pedido: [{ id: '7', data: { estado: 'PENDIENTE', total: 10 } }], cobro: [] };
    const def = { name: 'cobrar', type: 'crear', method: 'POST', capability: 'cobro', inputs: ['pedido_id', 'metodo'], liquida: { documento: { campo: 'pedido_id', entidad: 'Pedido', capability: 'pedido', estado: 'estado', de: 'LISTO', a: 'PAGADO', total: 'total' }, monto: 'monto', metodo: 'metodo' } };
    const runtime = load();
    const body = { pedido_id: '7', metodo: 'EFECTIVO', monto: 0.01 };
    await expect(runtime.run(memory(tables), def, { body })).rejects.toThrow(/Solo se cobra/);
    tables.pedido[0].data.estado = 'LISTO';
    await expect(runtime.run(memory(tables), def, { body })).resolves.toMatchObject({ monto: 10 });
    expect(tables.pedido[0].data.estado).toBe('PAGADO');
    await expect(runtime.run(memory(tables), def, { body })).rejects.toThrow(/una sola vez/);
  });
});
