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

describe('detalle de venta con sus datos reales', () => {
  const detailViews = [{ route: '/detalle-de-venta', name: 'Detalle de venta' }];
  const registries = [{ key: 'rf-04', entity: 'venta' }, { key: 'rf-02', entity: 'lineaventa', linea: true }, { key: 'rf-03', entity: 'factura' }, { key: 'rf-07', entity: 'cliente' }, { key: 'rf-05', entity: 'producto' }];
  const data = {
    'rf-04': [{ id: '16', fecha: '2026-11-21T10:00:00Z', total: 120, estado: 'anulada', cliente_id: '5', factura_id: '4' }, { id: '15', fecha: '2026-11-21T09:00:00Z', total: 150, estado: 'activa', cliente_id: '5' }],
    'rf-02': [{ id: '1', venta_id: '16', producto_id: '2', cantidad: 2, precioUnitario: 50 }, { id: '2', venta_id: '15', producto_id: '2', cantidad: 3, precioUnitario: 50 }],
    'rf-03': [{ id: '4', numero: 'F001-00004', estado: 'anulada' }],
    'rf-07': [{ id: '5', nombre: 'Ana Ríos' }],
    'rf-05': [{ id: '2', nombre: 'Polo' }]
  };
  const api = jest.fn(async (url) => { if (/\/\d+$/.test(url.split('?')[0])) throw new Error('sin ruta'); const key = url.match(/operations\/([^/?]+)/)[1]; return { data: data[key].map(({ id, ...rest }) => ({ id, data: rest })) }; });
  const html = `<p>Parte de esta vista muestra datos de ejemplo del diseño.</p><div><p>VENTA N.º 000184</p><span><span class="dot"></span>Activa</span><div><p>Cliente</p><p>Comercial Andina</p></div></div>
    <section><h2>Factura interna</h2><span><span class="dot"></span>Emitida</span><div><p>Número</p><p>F001-00128</p></div></section>
    <table><thead><tr><th>Producto</th><th>Cantidad</th><th>Precio unitario</th><th>Importe</th></tr></thead><tbody><tr><td>Laptop</td><td>1</td><td>S/ 2290.00</td><td>S/ 2290.00</td></tr></tbody></table>
    <div><p>Subtotal</p><p>S/ 2445.00</p></div><p>La factura F001-00128 quedará anulada.</p>`;

  test('venta anulada con factura: número, estado, cliente, líneas y factura reales; sin cifras de ejemplo', async () => {
    const document = dom(html);
    const root = document.querySelector('.mockup-content');
    await ui.hydrateRecord(root, { api, views: detailViews, current: '/detalle-de-venta', search: '?id=16', registries });
    const text = root.textContent.replace(/\s+/g, ' ');
    expect(text).toContain('VENTA N.º 000016');
    expect(text).toContain('Ana Ríos');
    expect(text).toContain('F001-00004');
    expect(text).toContain('La factura F001-00004 quedará anulada.');
    expect(root.querySelector('tbody').textContent).toBe('Polo2S/ 50.00S/ 100.00');
    expect([...root.querySelectorAll('span')].map((item) => item.textContent.trim()).filter(Boolean)).toEqual(['Anulada', 'Anulada']);
    expect(text).not.toMatch(/2445|2290|F001-00128|Comercial Andina/);
    expect(root.querySelector('p').style.display).toBe('none');
  });

  test('venta sin factura: la tarjeta de factura queda «Sin emitir» y sin número', async () => {
    const document = dom(html);
    const root = document.querySelector('.mockup-content');
    await ui.hydrateRecord(root, { api, views: detailViews, current: '/detalle-de-venta', search: '?id=15', registries });
    const card = root.querySelector('section').textContent.replace(/\s+/g, ' ');
    expect(card).toContain('Sin emitir');
    expect(card).not.toContain('F001-00128');
    expect(root.textContent).toContain('La factura asociada quedará anulada.');
  });
});
