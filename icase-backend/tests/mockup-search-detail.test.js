const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const { transformSync } = require('esbuild');

const load = (file, requireFn = () => ({})) => {
  const module = { exports: {} };
  new Function('module', 'exports', 'require', transformSync(fs.readFileSync(path.join(__dirname, '../src/infrastructure/templates/frontend', file), 'utf8'), { format: 'cjs' }).code)(module, module.exports, requireFn);
  return module.exports;
};
const actions = load('mockup-actions.js');
const live = load('live-tables.js', () => actions);

const html = `<main>
<form id="f"><input name="numero" value=""><button id="buscar" type="submit" data-accion="RF-04.consultar">Consultar</button></form>
<table><thead><tr><th>Número</th><th>Zona</th><th>Estado</th><th>Acciones</th></tr></thead><tbody>
<tr><td>Mesa 01</td><td>Principal</td><td>Libre</td><td><button type="button" data-accion="RF-04.consultar">Ver</button></td></tr></tbody></table></main>`;
const block = { tipo: 'tabla', operacion: 'listarMesas', campos: ['numero', 'zona', 'estado'], acciones: [] };
const action = { type: 'consulta', capability: 'rf-04', entity: 'mesa', path: '/api/actions/listar-mesas', output: ['numero', 'zona', 'estado'] };
const rows = [{ id: 1, numero: 'Mesa 1', zona: 'Principal', estado: 'LIBRE' }, { id: 2, numero: 'Mesa 2', zona: 'Terraza', estado: 'OCUPADA' }, { id: 5, numero: 'Mesa 5', zona: 'Principal', estado: 'LIBRE' }];

const setup = async (onAction = jest.fn()) => {
  const document = new JSDOM(html).window.document;
  const root = document.querySelector('main');
  await live.bindLiveTables({ root, blocks: [block], actions: { listarMesas: action }, api: jest.fn().mockResolvedValue(rows), can: () => true, onAction });
  return { document, root, onAction };
};
const text = (root) => [...root.querySelectorAll('tbody tr')].map((row) => row.textContent.replace(/\s+/g, ' ').trim());

describe('buscadores y filtros de las listas del diseño', () => {
  test('el buscador filtra la tabla ya cargada, por la columna del mismo nombre', async () => {
    const { root } = await setup();
    expect(live.filterLive(root, { numero: 'mesa 2' })).toBe(true);
    expect(text(root)).toHaveLength(1);
    expect(text(root)[0]).toContain('Mesa 2');
    live.filterLive(root, { numero: '' });
    expect(text(root)).toHaveLength(3);
  });

  test('un campo que no es una columna busca en todo el registro, y «Todos» no filtra', async () => {
    const { root } = await setup();
    live.filterLive(root, { busqueda: 'terraza' });
    expect(text(root)).toHaveLength(1);
    live.filterLive(root, { estado: 'Todos' });
    expect(text(root)).toHaveLength(3);
  });

  test('sin listas vivas no filtra (la consulta va al servidor)', () => {
    expect(live.filterLive(new JSDOM('<main></main>').window.document.querySelector('main'), { numero: 'x' })).toBe(false);
  });

  test('«Consultar» con un filtro no abre un listado aparte: filtra la tabla', async () => {
    const { root, document } = await setup();
    document.querySelector('[name="numero"]').value = 'Mesa 5';
    const results = [];
    await actions.runAction({ event: { preventDefault() {}, currentTarget: document.getElementById('buscar') }, operation: 'rf-04', verb: 'consultar', api: jest.fn(), can: () => true, acciones: {}, filtrar: (fields) => live.filterLive(root, fields), onResult: (value) => results.push(value) });
    expect(results).toEqual([null]);
    expect(text(root)).toHaveLength(1);
  });
});

describe('consulta con parámetro (código QR)', () => {
  const qr = new JSDOM('<main><form><input name="codigoQr" value="Reserva 1"><button id="b" type="submit">Escanear</button></form></main>').window.document;
  const named = { 'rf-05.consultar': { name: 'validarReservaQr', method: 'GET', path: '/api/actions/validar-reserva-qr', byId: false, inputs: [], parametros: ['codigoQr'] } };
  const call = async (api) => {
    const results = [];
    await actions.runAction({ event: { preventDefault() {}, currentTarget: qr.getElementById('b') }, operation: 'rf-05', verb: 'consultar', api, can: () => true, acciones: named, filtrar: () => true, onResult: (value) => results.push(value) });
    return results[0];
  };

  test('el código escrito viaja como parámetro y se muestra lo encontrado', async () => {
    const api = jest.fn().mockResolvedValue([{ id: 1, codigoQr: 'Reserva 1' }]);
    const result = await call(api);
    expect(api).toHaveBeenCalledWith('/api/actions/validar-reserva-qr?codigoQr=Reserva+1');
    expect(result).toMatchObject({ estado: 'ok', mensaje: 'Encontrado', registros: [{ id: 1 }] });
  });

  test('sin coincidencias avisa en lugar de mostrar «0 registros»', async () => {
    expect(await call(jest.fn().mockResolvedValue([]))).toMatchObject({ estado: 'aviso', mensaje: 'No se encontró ningún registro con ese valor.' });
  });
});

describe('«Ver» en una fila', () => {
  test('despliega los datos del registro ahí mismo y un segundo clic los oculta, sin lanzar la acción', async () => {
    const { root, onAction } = await setup();
    const ver = () => root.querySelector('tbody tr[data-id="2"] button');
    ver().click();
    const detail = root.querySelector('[data-icase-detail]');
    expect(detail.textContent).toContain('Terraza');
    expect(detail.textContent).toContain('Numero');
    expect(onAction).not.toHaveBeenCalled();
    ver().click();
    expect(root.querySelector('[data-icase-detail]')).toBeNull();
  });
});

describe('paginación del diseño con el total real', () => {
  const page = `<main><div><table><thead><tr><th>Número</th></tr></thead><tbody>
<tr><td>Mesa 01</td></tr><tr><td>Mesa 02</td></tr></tbody></table>
<div><p>Mostrando 2 de 18 mesas</p><div><button type="button">Anterior</button><button type="button" class="bg-blue-600 text-white">1</button><button type="button" class="border">2</button><button type="button" class="border">3</button><button type="button">Siguiente</button></div></div></div></main>`;
  const data = Array.from({ length: 5 }, (_, index) => ({ id: index + 1, numero: `Mesa ${index + 1}` }));
  const bind = async () => {
    const document = new JSDOM(page).window.document;
    const root = document.querySelector('main');
    await live.bindLiveTables({ root, blocks: [{ tipo: 'tabla', operacion: 'l', campos: ['numero'], acciones: [] }], actions: { l: { type: 'consulta', capability: 'rf-04', entity: 'mesa', path: '/x', output: ['numero'] } }, api: jest.fn().mockResolvedValue(data), can: () => true });
    return { root, info: () => root.querySelector('p').textContent, labels: () => [...root.querySelectorAll('button')].map((button) => button.textContent), rows: () => [...root.querySelectorAll('tbody tr')].map((row) => row.textContent.trim()) };
  };

  test('el texto y los botones de página reflejan el total real y paginan con el tamaño del diseño', async () => {
    const view = await bind();
    expect(view.info()).toBe('Mostrando 2 de 5 mesas');
    expect(view.labels()).toEqual(['Anterior', '1', '2', '3', 'Siguiente']);
    expect(view.rows()).toEqual(['Mesa 1', 'Mesa 2']);
    [...view.root.querySelectorAll('button')].find((button) => button.textContent === '3').click();
    expect(view.rows()).toEqual(['Mesa 5']);
    expect(view.info()).toBe('Mostrando 1 de 5 mesas');
    [...view.root.querySelectorAll('button')].find((button) => button.textContent === 'Anterior').click();
    expect(view.rows()).toEqual(['Mesa 3', 'Mesa 4']);
  });

  test('al filtrar vuelve a la primera página, recalcula el total y oculta los botones si cabe en una', async () => {
    const view = await bind();
    live.filterLive(view.root, { numero: 'Mesa 4' });
    expect(view.rows()).toEqual(['Mesa 4']);
    expect(view.info()).toBe('Mostrando 1 de 1 mesas');
    expect(view.root.querySelector('button').parentElement.style.display).toBe('none');
  });
});

describe('paginación de una tabla que no se llenó con datos reales', () => {
  test('sin listado real, el pie de paginación del diseño se oculta: sus botones no harían nada', async () => {
    const html = '<main><table><thead><tr><th>Factura</th></tr></thead><tbody><tr><td>F001-00001</td></tr><tr><td>F001-00002</td></tr></tbody></table>'
      + '<div><span>Mostrando 1 a 4 de 42 facturas</span><div><button type="button" disabled>Anterior</button><button type="button">Siguiente</button></div></div></main>';
    const document = new JSDOM(html).window.document;
    const root = document.querySelector('main');
    await live.bindLiveTables({ root, blocks: [], actions: {}, api: async () => [], can: () => true, onAction: () => {}, onShowOperations: () => {} });
    expect(root.querySelector('span').style.display).toBe('none');
    const siguiente = [...root.querySelectorAll('button')].find((button) => button.textContent === 'Siguiente');
    expect(siguiente.parentElement.style.display).toBe('none');
  });
});
