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
