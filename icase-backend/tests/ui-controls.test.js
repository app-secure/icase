const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const { transformSync } = require('esbuild');

const load = (file, requireFn = () => ({})) => {
  const source = fs.readFileSync(path.join(__dirname, '../src/infrastructure/templates', file), 'utf8');
  const module = { exports: {} };
  new Function('module', 'exports', 'require', transformSync(source, { format: 'cjs' }).code)(module, module.exports, requireFn);
  return module.exports;
};
const actions = load('frontend/mockup-actions.js');
const ui = load('frontend/ui-controls.js', () => actions);

// Árbol de pantallas del caso Ventas.
const views = [
  { route: '/listado-de-clientes', name: 'Listado de clientes' },
  { route: '/formulario-de-registro-de-cliente', name: 'Formulario de registro de cliente' },
  { route: '/detalle-de-cliente', name: 'Detalle de cliente' },
  { route: '/formulario-de-edicion-de-cliente', name: 'Formulario de edición de cliente' },
  { route: '/catalogo-de-productos', name: 'Catálogo de productos' },
  { route: '/formulario-de-creacion-de-producto', name: 'Formulario de creación de producto' }
];
const dom = (html) => new JSDOM(`<body><div class="mockup-content">${html}</div></body>`).window.document;

describe('controles de interfaz del diseño: ningún botón inerte', () => {
  test('reconoce el dato y el papel de cada pantalla', () => {
    expect(views.map((view) => [ui.nounOf(view.name), ui.kindOf(view.name)])).toEqual([
      ['cliente', 'lista'], ['cliente', 'crear'], ['cliente', 'detalle'], ['cliente', 'editar'], ['producto', 'lista'], ['producto', 'crear']
    ]);
  });

  test('Nuevo lleva al alta del mismo dato; Volver/Cancelar regresan; Limpiar reinicia', () => {
    const document = dom('<button data-accion="ui">+ Nuevo</button><button data-accion="ui">Cancelar</button><button data-accion="ui">Limpiar</button>');
    const [nuevo, cancelar, limpiar] = document.querySelectorAll('button');
    expect(ui.uiTarget(nuevo, { views, current: '/catalogo-de-productos' })).toEqual({ to: '/formulario-de-creacion-de-producto' });
    expect(ui.uiTarget(cancelar, { views, current: '/formulario-de-registro-de-cliente' })).toEqual({ back: true, fallback: '/listado-de-clientes' });
    expect(ui.uiTarget(limpiar, { views, current: '/listado-de-clientes' })).toEqual({ reset: true });
  });

  test('Ver y Editar en una fila real abren detalle y edición con su id; sin id no inventan uno', () => {
    const document = dom('<table><tbody><tr data-id="7"><td><button data-accion="RF-07.consultar">Ver</button><button aria-label="Editar cliente"><svg></svg></button></td></tr></tbody></table><button data-accion="ui">Editar</button>');
    const [ver, editar, suelto] = document.querySelectorAll('button');
    expect(ui.uiTarget(ver, { views, current: '/listado-de-clientes' })).toEqual({ to: '/detalle-de-cliente?id=7' });
    expect(ui.uiTarget(editar, { views, current: '/listado-de-clientes' })).toEqual({ to: '/formulario-de-edicion-de-cliente?id=7' });
    expect(ui.uiTarget(suelto, { views, current: '/listado-de-clientes' })).toBeNull();
    expect(ui.uiTarget(suelto, { views, current: '/detalle-de-cliente', search: '?id=7' })).toEqual({ to: '/formulario-de-edicion-de-cliente?id=7' });
  });

  test('el clic navega solo si nadie más lo atendió; los botones que guardan no se tocan', () => {
    const document = dom('<button data-accion="ui">Nuevo cliente</button><button data-accion="RF-07.crear">Guardar</button>');
    const navigate = jest.fn();
    const click = (button, prevented = false) => {
      const event = new document.defaultView.MouseEvent('click', { bubbles: true, cancelable: true });
      if (prevented) event.preventDefault();
      Object.defineProperty(event, 'target', { value: button });
      ui.handleUiClick(event, { views, current: '/listado-de-clientes', navigate });
    };
    const [nuevo, guardar] = document.querySelectorAll('button');
    click(nuevo, true);
    expect(navigate).not.toHaveBeenCalled();
    click(guardar);
    expect(navigate).not.toHaveBeenCalled();
    click(nuevo);
    expect(navigate).toHaveBeenCalledWith('/formulario-de-registro-de-cliente');
  });

  test('el detalle con ?id= muestra el registro real en lugar de los valores de ejemplo', async () => {
    const document = dom('<dl><dt>Nombre</dt><dd>Juan Mendoza</dd><dt>Número de documento</dt><dd>12345678</dd><dt>Correo electrónico</dt><dd>juan@email.com</dd></dl>');
    const api = jest.fn(async (url) => { if (/\/7$/.test(url)) throw new Error('sin ruta'); return { data: [{ id: '7', data: { nombre: 'Ana Ríos', numeroDocumento: '40112233', correo: 'ana@tienda.pe' } }] }; });
    const record = await ui.hydrateRecord(document.querySelector('.mockup-content'), { api, views, current: '/detalle-de-cliente', search: '?id=7', registries: [{ key: 'rf-07', entity: 'cliente' }] });
    expect(record).toMatchObject({ id: '7', nombre: 'Ana Ríos' });
    expect([...document.querySelectorAll('dd')].map((item) => item.textContent)).toEqual(['Ana Ríos', '40112233', 'ana@tienda.pe']);
  });
});

describe('altas vinculadas desde el botón de un registro (factura de una venta, anulación)', () => {
  const emitir = { name: 'emitirFactura', method: 'POST', path: '/api/actions/emitir-factura', inputs: ['venta_id'], vincula: { parametro: 'venta_id', entidad: 'Venta' } };
  const anular = { name: 'anularVenta', method: 'POST', path: '/api/actions/anular-venta', inputs: ['motivo', 'venta_id'], vincula: { parametro: 'venta_id', entidad: 'Venta' }, anula: { estado: 'estado', valor: 'anulada' } };

  test('«Emitir factura» en la fila de una venta la emite con ese id y muestra el número', async () => {
    const document = dom('<table><tbody><tr data-id="3"><td><button>Emitir factura</button></td></tr></tbody></table>');
    const api = jest.fn().mockResolvedValue({ id: '9', numero: 'F001-00009' });
    const onResult = jest.fn();
    await actions.runAction({ event: { currentTarget: document.querySelector('button') }, operation: 'rf-03', verb: 'crear', api, onResult, acciones: { 'rf-03.crear': emitir } });
    expect(api).toHaveBeenCalledWith('/api/actions/emitir-factura', { method: 'POST', body: JSON.stringify({ venta_id: '3' }) });
    expect(onResult).toHaveBeenCalledWith({ estado: 'ok', mensaje: 'Registro creado (F001-00009)' });
  });

  test('«Cancelar venta» enlazado como eliminar llama a la anulación con su motivo, no al borrado', async () => {
    const document = dom('<table><tbody><tr data-id="3"><td><button>Cancelar venta</button></td></tr></tbody></table>');
    const api = jest.fn().mockResolvedValue({ id: '1' });
    const onResult = jest.fn();
    const originalPrompt = globalThis.prompt;
    globalThis.prompt = () => 'Devolución';
    try {
      await actions.runAction({ event: { currentTarget: document.querySelector('button') }, operation: 'rf-08', verb: 'eliminar', api, onResult, confirmar: () => true, acciones: { 'rf-08.eliminar': anular } });
    } finally { globalThis.prompt = originalPrompt; }
    expect(api).toHaveBeenCalledWith('/api/actions/anular-venta', { method: 'POST', body: JSON.stringify({ venta_id: '3', motivo: 'Devolución' }) });
    expect(onResult).toHaveBeenCalledWith({ estado: 'ok', mensaje: 'Venta #3 anulada' });
  });
});
