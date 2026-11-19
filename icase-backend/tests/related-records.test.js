const fs = require('node:fs');
const path = require('node:path');
const { transformSync } = require('esbuild');
const ApplicationSpecService = require('../src/infrastructure/services/ApplicationSpecService');
const ApplicationContractBuilder = require('../src/infrastructure/services/ApplicationContractBuilder');
const GenericBackendGenerator = require('../src/infrastructure/services/GenericBackendGenerator');
const DomainModelExtractor = require('../src/infrastructure/services/DomainModelExtractor');

const PLANTUML = `@startuml
enum EstadoPedido {
  PENDIENTE
  EN_PREPARACION
  SERVIDO
  CANCELADO
}
class Mesa {
  +String id
  +String numero
}
class Plato {
  +String id
  +String nombre
  +float precio
}
class Comanda {
  +String id
  +DateTime horaCreacion
}
class Pedido {
  +String id
  +EstadoPedido estado
  +float total
}
class DetallePedido {
  +String id
  +int cantidad
  +float precioUnitario
}
Mesa "1" -- "0..*" Pedido : atiende
Pedido "1" -- "0..1" Comanda : genera
Pedido "1" *-- "1..*" DetallePedido : contiene
DetallePedido "0..*" -- "1" Plato : referencia
@enduml`;
const dominio = { tipo: 'clases_dominio', aprobado: true, estado: 'aprobado', desactualizado: false, codigo_plantuml: PLANTUML };
const rf = [
  { aprobado: true, tipo: 'RF', identificador: 'RF-01', nombre: 'Platos del menú', descripcion: 'Platos.', actores: ['Mesero'] },
  { aprobado: true, tipo: 'RF', identificador: 'RF-04', nombre: 'Mesas', descripcion: 'Mesas.', actores: ['Mesero'] },
  { aprobado: true, tipo: 'RF', identificador: 'RF-06', nombre: 'Comandas en cocina', descripcion: 'La cocina ve las comandas.', actores: ['Cocinero'] },
  { aprobado: true, tipo: 'RF', identificador: 'RF-15', nombre: 'Pedidos', descripcion: 'Pedidos.', actores: ['Mesero'] }
];
const modelo = new DomainModelExtractor().fromDiagrams([dominio]);
const guardada = {
  operaciones: [{ nombre: 'listarComandasPendientes', rf: 'RF-06', tipo: 'consulta', entidad: 'Comanda', actores: ['Cocinero'], estado_decision: 'confirmado', origen: 'ia', filtros: [], salida: ['horaCreacion'] }],
  pantallas: [{ id: 'kds', componentes: [{ tipo: 'tarjetas', operacion: 'listarComandasPendientes', campos: ['horaCreacion'], acciones: [] }] }]
};
const normalizar = (verbos = { 'RF-06': ['consultar', 'editar'] }) => new ApplicationSpecService({}).validar(guardada, { modelo, rf, pantallas: [{ pantalla_id: 'kds', roles: ['Personal de Cocina'], rf_trazabilidad: ['RF-06'] }], verbosPorRf: verbos });

describe('registro relacionado en una consulta con botón de editar', () => {
  test('la lista de comandas muestra los datos de su pedido y se propone, pendiente, la transición que ejecuta el botón', () => {
    const resultado = normalizar();
    const consulta = resultado.operaciones.find((op) => op.nombre === 'listarComandasPendientes');
    expect(consulta.relacionadas[0]).toMatchObject({ entidad: 'Pedido', via: 'comanda_id', estado: 'estado', excluir: ['SERVIDO', 'CANCELADO'] });
    expect(consulta.relacionadas[0].campos).toEqual(['mesa_id', 'estado', 'total']);
    expect(consulta.relacionadas[0].items).toMatchObject({ entidad: 'DetallePedido', fk: 'pedido_id' });
    expect(consulta.salida).toEqual(['pedido_mesa_id', 'pedido_estado', 'pedido_total', 'pedido_items', 'horaCreacion']);
    const transicion = resultado.operaciones.find((op) => op.tipo === 'transicion');
    expect(transicion).toMatchObject({ nombre: 'marcarPedidoServido', rf: 'RF-06', entidad: 'Pedido', estado_decision: 'pendiente', origen: 'derivado', sobre: { entidad: 'Comanda', via: 'comanda_id' }, transicion: { campo: 'estado', a: 'SERVIDO', de: ['PENDIENTE', 'EN_PREPARACION'] } });
    expect(resultado.pantallas[0].componentes[0].acciones).toEqual([{ etiqueta: 'Marcar servido', operacion: 'marcarPedidoServido' }]);
  });

  test('sin botones de editar en el mockup, o si la entidad ya tiene estado propio, no se deriva nada', () => {
    expect(normalizar({ 'RF-06': ['consultar'] }).operaciones).toHaveLength(1);
    expect(normalizar(null).operaciones).toHaveLength(1);
  });

  test('es idempotente al revalidar lo ya normalizado', () => {
    const primera = normalizar();
    const otra = new ApplicationSpecService({}).validar({ operaciones: primera.operaciones, pantallas: primera.pantallas }, { modelo, rf, pantallas: [{ pantalla_id: 'kds', roles: ['Personal de Cocina'], rf_trazabilidad: ['RF-06'] }], verbosPorRf: { 'RF-06': ['consultar', 'editar'] } });
    expect(otra.errores).toEqual([]);
    expect(otra.operaciones.filter((op) => op.tipo === 'transicion')).toHaveLength(1);
    expect(otra.operaciones.find((op) => op.nombre === 'listarComandasPendientes').salida).toContain('pedido_items');
  });

  test('el contrato ata los almacenes y el permiso de la transición es el del requisito de la cocina', () => {
    const spec = ApplicationSpecService.confirmada({ operaciones: normalizar().operaciones.map((op) => ({ ...op, estado_decision: 'confirmado' })), pantallas: [] });
    const contrato = new ApplicationContractBuilder().build({ proyecto: { nombre: 'x' }, requerimientos: rf, domainModel: modelo, spec });
    const acciones = contrato.operations.flatMap((op) => op.actions || []);
    const consulta = acciones.find((item) => item.name === 'listarComandasPendientes');
    expect(consulta.relacionadas[0]).toMatchObject({ capability: 'rf-15', referencias: { mesa_id: 'rf-04' }, items: { capability: expect.stringMatching(/^op-detallepedido/), destinoCapability: expect.any(String) } });
    const transicion = acciones.find((item) => item.name === 'marcarPedidoServido');
    expect(transicion).toMatchObject({ capability: 'rf-15', permission: 'rf-06', sobre: { via: 'comanda_id' } });
  });
});

describe('permisos que la especificación confirmada exige', () => {
  test('el rol que ejecuta la operación recibe el método que le faltaba y queda constancia', () => {
    const contract = { warnings: [], operations: [{ key: 'rf-06', actions: [{ name: 'marcarPedidoServido', type: 'transicion', capability: 'rf-15', permission: 'rf-06', actors: ['Cocinero'] }] }] };
    const policy = { habilitada: true, roles: { cocinero: { nombre: 'Cocinero' }, cliente: { nombre: 'Cliente' } }, operaciones: { 'rf-06': { cocinero: { metodos: ['GET'], alcance: 'todos' } } } };
    new GenericBackendGenerator()._syncActionPermissions(contract, policy);
    expect(policy.operaciones['rf-06'].cocinero.metodos).toEqual(['GET', 'PATCH']);
    expect(contract.warnings[0]).toContain('PATCH');
  });

  test('a un cliente no se le concede nada de forma automática', () => {
    const contract = { warnings: [], operations: [{ key: 'rf-02', actions: [{ name: 'borrarReserva', type: 'eliminar', capability: 'rf-02', permission: 'rf-02', actors: ['Cliente'] }] }] };
    const policy = { habilitada: true, roles: { cliente: { nombre: 'Cliente' } }, operaciones: { 'rf-02': { cliente: { metodos: ['GET'], alcance: 'propios' } } } };
    new GenericBackendGenerator()._syncActionPermissions(contract, policy);
    expect(policy.operaciones['rf-02'].cliente.metodos).toEqual(['GET']);
  });
});

describe('servidor: consulta con registro relacionado y transición sobre él', () => {
  const consulta = {
    name: 'listarComandasPendientes', type: 'consulta', method: 'GET', byId: false, capability: 'rf-06', filters: [], output: ['pedido_mesa_id', 'pedido_estado', 'pedido_items', 'horaCreacion'],
    relacionadas: [{ clave: 'pedido', capability: 'rf-15', via: 'comanda_id', campos: ['mesa_id', 'estado'], estado: 'estado', excluir: ['SERVIDO'], referencias: { mesa_id: 'rf-04' }, items: { fk: 'pedido_id', referencia: 'plato_id', cantidad: 'cantidad', capability: 'op-detalle', destinoCapability: 'rf-01' } }]
  };
  const transicion = { name: 'marcarPedidoServido', type: 'transicion', method: 'POST', byId: true, capability: 'rf-15', transition: { campo: 'estado', de: ['PENDIENTE'], a: 'SERVIDO' }, sobre: { via: 'comanda_id' } };
  const runtime = () => {
    const source = fs.readFileSync(path.join(__dirname, '../src/infrastructure/templates/actions/actions-runtime.js'), 'utf8').replace('__DEFINITIONS__', JSON.stringify([consulta, transicion]));
    const module = { exports: {} };
    new Function('module', 'exports', 'require', transformSync(source, { format: 'cjs' }).code)(module, module.exports, require);
    return module.exports;
  };
  const makeStore = () => {
    const tables = {
      'rf-06': [{ id: '1', data: { horaCreacion: 'a' } }, { id: '2', data: { horaCreacion: 'b' } }, { id: '3', data: { horaCreacion: 'c' } }],
      'rf-15': [{ id: '10', data: { comanda_id: '1', mesa_id: '7', estado: 'PENDIENTE' } }, { id: '11', data: { comanda_id: '2', mesa_id: '7', estado: 'SERVIDO' } }],
      'rf-04': [{ id: '7', data: { numero: 'Mesa 7' } }],
      'op-detalle': [{ id: '1', data: { pedido_id: '10', plato_id: '5', cantidad: 2 } }],
      'rf-01': [{ id: '5', data: { nombre: 'Lomo' } }]
    };
    return {
      tables,
      list: async (capability, equality = {}) => tables[capability].filter((row) => Object.entries(equality).every(([key, value]) => String(row.data[key]) === String(value))),
      getRecord: async (capability, id) => tables[capability].find((row) => row.id === String(id)) || null,
      update: async (capability, id, values) => { const row = tables[capability].find((item) => item.id === String(id)); row.data = { ...row.data, ...values }; return row; }
    };
  };

  test('cada fila trae mesa (con nombre), estado y platos de su pedido, y se oculta lo ya servido', async () => {
    const rows = await runtime().run(makeStore(), consulta, {});
    expect(rows.map((row) => row.id)).toEqual(['1', '3']); // la comanda 2 ya está servida
    expect(rows[0]).toMatchObject({ pedido_mesa_id: '7', pedido_mesa_id__etiqueta: 'Mesa 7', pedido_estado: 'PENDIENTE', pedido_items: '2× Lomo' });
    expect(rows[1]).toEqual({ id: '3', horaCreacion: 'c' }); // sin pedido: queda sin esos datos
  });

  test('«marcar lista» usa el id de la comanda y cambia el estado de su pedido', async () => {
    const store = makeStore();
    const result = await runtime().run(store, transicion, { id: '1' });
    expect(result.estado).toBe('SERVIDO');
    expect(store.tables['rf-15'][0].data.estado).toBe('SERVIDO');
    await expect(runtime().run(store, transicion, { id: '1' })).rejects.toMatchObject({ status: 409 });
    await expect(runtime().run(store, transicion, { id: '3' })).rejects.toMatchObject({ status: 404 });
  });
});
