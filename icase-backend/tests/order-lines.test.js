const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const { transformSync } = require('esbuild');
const ApplicationSpecService = require('../src/infrastructure/services/ApplicationSpecService');
const ApplicationContractBuilder = require('../src/infrastructure/services/ApplicationContractBuilder');
const DomainModelExtractor = require('../src/infrastructure/services/DomainModelExtractor');

const PLANTUML = `@startuml
enum EstadoPedido {
  PENDIENTE
  SERVIDO
}
class Plato {
  +String id
  +String nombre
  +float precio
  +boolean disponible
}
class Pedido {
  +String id
  +DateTime fechaHora
  +EstadoPedido estado
  +float total
}
class DetallePedido {
  +String id
  +int cantidad
  +float precioUnitario
}
Pedido "1" *-- "1..*" DetallePedido : contiene
DetallePedido "0..*" -- "1" Plato : referencia
@enduml`;
const dominio = { tipo: 'clases_dominio', aprobado: true, estado: 'aprobado', desactualizado: false, codigo_plantuml: PLANTUML };
const rf = [
  { aprobado: true, tipo: 'RF', identificador: 'RF-01', nombre: 'Menú de platos', descripcion: 'Se consultan los platos.', actores: ['Mesero'] },
  { aprobado: true, tipo: 'RF', identificador: 'RF-15', nombre: 'Registro de pedidos', descripcion: 'El mesero registra pedidos.', actores: ['Mesero'] }
];
const modelo = new DomainModelExtractor().fromDiagrams([dominio]);
const guardada = {
  operaciones: [
    { nombre: 'listarPlatos', rf: 'RF-01', tipo: 'consulta', entidad: 'Plato', actores: ['Mesero'], estado_decision: 'confirmado', origen: 'ia', filtros: [], salida: ['nombre', 'precio'] },
    { nombre: 'registrarPedido', rf: 'RF-15', tipo: 'crear', entidad: 'Pedido', actores: ['Mesero'], estado_decision: 'confirmado', origen: 'ia', entradas: ['fechaHora', 'total'] }
  ],
  pantallas: []
};
const normalizada = () => new ApplicationSpecService({}).validar(guardada, { modelo, rf, cablear: false });

describe('pedido con líneas: especificación y contrato', () => {
  test('la composición del dominio hace que el alta del pedido reciba sus líneas y calcule el total', () => {
    const operacion = normalizada().operaciones.find((op) => op.nombre === 'registrarPedido');
    expect(operacion.lineas).toMatchObject({ entidad: 'DetallePedido', fk: 'pedido_id', referencia: 'plato_id', cantidad: 'cantidad', total: 'total', precio: { campo: 'precioUnitario', desde: 'precio' } });
    expect(operacion.lineas.filtros).toEqual([{ campo: 'disponible', operador: '==', origen: 'constante', valor: true }]);
    expect(operacion.autoEntradas).toEqual(expect.arrayContaining([{ campo: 'total', valor: 'lineas' }]));
    expect(operacion.entradas).not.toContain('total');
  });

  test('es idempotente al revalidar', () => {
    const otra = new ApplicationSpecService({}).validar({ operaciones: normalizada().operaciones, pantallas: [] }, { modelo, rf, cablear: false });
    expect(otra.operaciones.find((op) => op.nombre === 'registrarPedido').lineas.entidad).toBe('DetallePedido');
  });

  test('el contrato crea el almacén de soporte de las líneas y ata la acción a él y al del plato', () => {
    const spec = ApplicationSpecService.confirmada({ operaciones: normalizada().operaciones, pantallas: [] });
    const contrato = new ApplicationContractBuilder().build({ proyecto: { nombre: 'x' }, requerimientos: rf, domainModel: modelo, spec });
    const soporte = contrato.operations.find((op) => op.support && op.entity === 'detallepedido');
    expect(soporte).toBeTruthy();
    const accion = contrato.operations.flatMap((op) => op.actions || []).find((item) => item.name === 'registrarPedido');
    expect(accion.lineas).toMatchObject({ capability: soporte.key, destinoCapability: 'rf-01' });
  });
});

const load = (file, requireFn = () => ({}), replace = null) => {
  let source = fs.readFileSync(path.join(__dirname, '../src/infrastructure/templates', file), 'utf8');
  if (replace) source = source.replace(replace[0], replace[1]);
  const module = { exports: {} };
  new Function('module', 'exports', 'require', transformSync(source, { format: 'cjs' }).code)(module, module.exports, requireFn);
  return module.exports;
};

describe('pedido con líneas: servidor', () => {
  const def = {
    name: 'registrarPedido', type: 'crear', method: 'POST', byId: false, capability: 'rf-15', inputs: ['fechaHora'], autoInputs: [{ campo: 'total', valor: 'lineas' }],
    lineas: { entidad: 'DetallePedido', fk: 'pedido_id', referencia: 'plato_id', destino: 'Plato', destinoClave: 'plato', cantidad: 'cantidad', precio: { campo: 'precioUnitario', desde: 'precio' }, total: 'total', capability: 'op-detallepedido', destinoCapability: 'rf-01', filtros: [{ campo: 'disponible', operador: '==', origen: 'constante', valor: true }] }
  };
  const runtime = () => load('actions/actions-runtime.js', require, ['__DEFINITIONS__', JSON.stringify([def])]);
  const makeStore = (platos) => {
    const created = [];
    const removed = [];
    return {
      created, removed,
      getRecord: async (capability, id) => (capability === 'rf-01' ? platos[id] || null : null),
      list: async (capability) => (capability === 'rf-01' ? Object.entries(platos).map(([id, record]) => ({ id, data: record.data })) : []),
      create: async (capability, values) => { const record = { id: String(created.length + 1), data: values }; created.push({ capability, values }); return record; },
      remove: async (capability, id) => { removed.push({ capability, id }); return true; }
    };
  };
  const platos = { 1: { id: '1', data: { nombre: 'Lomo', precio: 15.5, disponible: true } }, 2: { id: '2', data: { nombre: 'Ají', precio: 12, disponible: false } } };

  test('guarda el pedido y cada línea con el precio del plato, y el total es la suma', async () => {
    const store = makeStore(platos);
    const result = await runtime().run(store, def, { body: { fechaHora: '2026-01-01T10:00', lineas: [{ plato_id: '1', cantidad: 2 }, { plato_id: '1', cantidad: 1 }] } });
    expect(store.created[0]).toEqual({ capability: 'rf-15', values: expect.objectContaining({ total: 46.5 }) });
    expect(store.created.slice(1).map((item) => item.values)).toEqual([{ plato_id: '1', cantidad: 2, precioUnitario: 15.5, pedido_id: '1' }, { plato_id: '1', cantidad: 1, precioUnitario: 15.5, pedido_id: '1' }]);
    expect(result.lineas).toBe(2);
  });

  test('sin líneas, con cantidad inválida o con un plato no disponible no se crea nada', async () => {
    const { run } = runtime();
    const store = makeStore(platos);
    await expect(run(store, def, { body: { fechaHora: 'x', lineas: [] } })).rejects.toMatchObject({ status: 400 });
    await expect(run(store, def, { body: { fechaHora: 'x', lineas: [{ plato_id: '1', cantidad: 0 }] } })).rejects.toMatchObject({ status: 400 });
    await expect(run(store, def, { body: { fechaHora: 'x', lineas: [{ plato_id: '2', cantidad: 1 }] } })).rejects.toMatchObject({ status: 409 });
    await expect(run(store, def, { body: { fechaHora: 'x', lineas: [{ plato_id: '9', cantidad: 1 }] } })).rejects.toMatchObject({ status: 400 });
    expect(store.created).toEqual([]);
  });

  test('si una línea falla, el pedido no queda a medias', async () => {
    const store = makeStore(platos);
    const create = store.create;
    store.create = async (capability, values) => { if (capability === 'op-detallepedido') throw new Error('falló'); return create(capability, values); };
    await expect(runtime().run(store, def, { body: { fechaHora: 'x', lineas: [{ plato_id: '1', cantidad: 1 }] } })).rejects.toThrow('falló');
    expect(store.removed).toEqual([{ capability: 'rf-15', id: '1' }]);
  });

  test('GET del alta devuelve los platos que se pueden elegir, con el permiso de quien lo crea', async () => {
    const { find, run } = runtime();
    const options = find('registrar-pedido', 'GET', false);
    expect(options).toMatchObject({ type: 'consulta', capability: 'rf-15', fuente: 'rf-01' });
    const rows = await run(makeStore(platos), options, {});
    expect(rows.map((row) => row.nombre)).toContain('Lomo');
  });
});

describe('pedido con líneas: formulario del diseño', () => {
  const actions = load('frontend/mockup-actions.js');
  const live = load('frontend/live-tables.js', () => actions);
  const named = { inputs: ['fechaHora', 'mesa_id'], lineas: { referencia: 'plato_id', cantidad: 'cantidad' }, path: '/api/actions/registrar-pedido' };
  const html = `<form data-accion="RF-15.crear"><select name="mesa_id"><option value="1">M1</option></select><div id="lineas">
    <div class="fila"><select name="item"><option value="">-</option></select><input type="number" name="cantidad" value="1"><button type="button">Eliminar</button></div>
  </div><button type="button">+ Añadir otro plato</button><button type="submit">Registrar</button></form>`;
  const setup = () => { const document = new JSDOM(`<body>${html}</body>`).window.document; return { document, form: document.querySelector('form') }; };

  test('reconoce una fila por cada selector de plato con su cantidad', () => {
    const { form } = setup();
    expect(actions.lineRows(form, named.inputs)).toHaveLength(1);
    expect(actions.lineRows(form, named.inputs)[0].quantity.getAttribute('name')).toBe('cantidad');
  });

  test('los selectores se llenan con los platos reales; «Añadir» copia la fila, «Eliminar» la quita y el envío recoge las líneas', async () => {
    const { form, document } = setup();
    const api = jest.fn().mockResolvedValue([{ id: 1, nombre: 'Lomo', precio: 15.5 }, { id: 2, nombre: 'Ají', precio: 12 }]);
    await live.bindLines({ root: form.ownerDocument.body, specMap: { 'rf-15.crear': named }, api });
    expect(api).toHaveBeenCalledWith('/api/actions/registrar-pedido');
    const first = form.querySelector('select[name="item"]');
    expect([...first.options].map((option) => option.textContent)).toEqual(['Selecciona…', 'Lomo — 15.50', 'Ají — 12.00']);
    first.value = '1';
    const click = () => new document.defaultView.MouseEvent('click', { bubbles: true, cancelable: true });
    form.querySelectorAll('button')[1].dispatchEvent(click());
    expect(form.querySelectorAll('select[name="item"]')).toHaveLength(2);
    const second = form.querySelectorAll('select[name="item"]')[1];
    second.value = '2';
    form.querySelectorAll('input[name="cantidad"]')[1].value = '4';
    expect(actions.collectLines(form, named)).toEqual([{ plato_id: '1', cantidad: 1 }, { plato_id: '2', cantidad: 4 }]);
    form.querySelectorAll('button')[0].dispatchEvent(click());
    expect(form.querySelectorAll('select[name="item"]')).toHaveLength(1);
    expect(actions.collectLines(form, named)).toEqual([{ plato_id: '2', cantidad: 4 }]);
  });
});
