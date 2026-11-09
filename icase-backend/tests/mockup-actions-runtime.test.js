const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const { transformSync } = require('esbuild');

const source = fs.readFileSync(path.join(__dirname, '../src/infrastructure/templates/frontend/mockup-actions.js'), 'utf8');
const runtime = (() => {
  const module = { exports: {} };
  new Function('module', 'exports', transformSync(source, { format: 'cjs' }).code)(module, module.exports);
  return module.exports;
})();
const page = (html) => new JSDOM(`<body><main>${html}</main></body>`).window.document;
const run = async (button, { verb, api, can = () => true, confirmar = () => true }) => {
  const event = { preventDefault: jest.fn(), currentTarget: button };
  const results = [];
  await runtime.runAction({ event, operation: 'rf-03', verb, api, can, confirmar, onResult: (result) => results.push(result) });
  return { event, results };
};

describe('mockup-actions: campos del formulario', () => {
  test('recoge los campos con name del formulario del control y convierte tipos', () => {
    const document = page(`<form><input name="sala" value="A"><input name="capacidad" type="number" value="12">
      <input name="activo" type="checkbox"><input name="vip" type="checkbox" checked><input name="tipo" type="radio" value="a"><input name="tipo" type="radio" value="b" checked>
      <select name="turno"><option value="m">M</option><option value="t" selected>T</option></select><input name="vacio" value="">
      <button id="b" type="submit">Enviar</button></form><input name="fuera" value="x">`);
    expect(runtime.collectFields(document.getElementById('b'))).toEqual({ sala: 'A', capacidad: 12, activo: false, vip: true, tipo: 'b', turno: 't' });
  });

  test('sin formulario recoge los campos de la pantalla', () => {
    const document = page('<input name="fuera" value="x"><button id="b">Ir</button>');
    expect(runtime.collectFields(document.getElementById('b'))).toEqual({ fuera: 'x' });
  });
});

describe('mockup-actions: ejecución', () => {
  const form = '<form><input name="sala" value="A"><button id="b" type="submit">Enviar</button></form>';

  test('crear envía POST con los campos, evita el envío nativo y muestra el éxito', async () => {
    const api = jest.fn().mockResolvedValue({ id: 1 });
    const { event, results } = await run(page(form).getElementById('b'), { verb: 'crear', api });
    expect(event.preventDefault).toHaveBeenCalled();
    expect(api).toHaveBeenCalledWith('/api/operations/rf-03', { method: 'POST', body: JSON.stringify({ sala: 'A' }) });
    expect(results.at(-1)).toEqual({ estado: 'ok', mensaje: 'Registro creado' });
  });

  test('sin permiso no llama a la API y lo informa', async () => {
    const api = jest.fn();
    const { results } = await run(page(form).getElementById('b'), { verb: 'crear', api, can: (_op, method) => method === 'GET' });
    expect(api).not.toHaveBeenCalled();
    expect(results.at(-1).estado).toBe('error');
    expect(results.at(-1).mensaje).toContain('permiso');
  });

  test('consultar hace GET con límite y usa un campo buscar como search', async () => {
    const api = jest.fn().mockResolvedValue({ data: [{ id: 1, data: { sala: 'A' } }] });
    const document = page('<input name="buscar" value="ana"><button id="b">Buscar</button>');
    const { results } = await run(document.getElementById('b'), { verb: 'consultar', api });
    expect(api).toHaveBeenCalledWith('/api/operations/rf-03?limit=20&search=ana');
    expect(results.at(-1)).toEqual(expect.objectContaining({ estado: 'ok', mensaje: '1 registro', registros: [{ id: 1, data: { sala: 'A' } }] }));
  });

  test('consultar acepta una respuesta en arreglo y cuenta en plural', async () => {
    const api = jest.fn().mockResolvedValue([{ id: 1 }, { id: 2 }]);
    const { results } = await run(page('<button id="b">Ver</button>').getElementById('b'), { verb: 'consultar', api });
    expect(api).toHaveBeenCalledWith('/api/operations/rf-03?limit=20');
    expect(results.at(-1).mensaje).toBe('2 registros');
  });

  test('editar y eliminar sin data-id avisan y no llaman a la API', async () => {
    for (const verb of ['editar', 'eliminar']) {
      const api = jest.fn();
      const { results } = await run(page(form).getElementById('b'), { verb, api });
      expect(api).not.toHaveBeenCalled();
      expect(results.at(-1).estado).toBe('aviso');
    }
  });

  test('editar con data-id en un ancestro envía PATCH con los campos', async () => {
    const api = jest.fn().mockResolvedValue({});
    const document = page('<form data-id="7"><input name="sala" value="B"><button id="b">Guardar</button></form>');
    const { results } = await run(document.getElementById('b'), { verb: 'editar', api });
    expect(api).toHaveBeenCalledWith('/api/operations/rf-03/7', { method: 'PATCH', body: JSON.stringify({ sala: 'B' }) });
    expect(results.at(-1)).toEqual({ estado: 'ok', mensaje: 'Registro actualizado' });
  });

  test('eliminar con data-id pide confirmación y solo entonces envía DELETE', async () => {
    const document = page('<table><tr data-id="7"><td><button id="b">Eliminar</button></td></tr></table>');
    const rejected = jest.fn();
    await run(document.getElementById('b'), { verb: 'eliminar', api: rejected, confirmar: () => false });
    expect(rejected).not.toHaveBeenCalled();
    const api = jest.fn().mockResolvedValue({});
    const { results } = await run(document.getElementById('b'), { verb: 'eliminar', api });
    expect(api).toHaveBeenCalledWith('/api/operations/rf-03/7', { method: 'DELETE' });
    expect(results.at(-1)).toEqual({ estado: 'ok', mensaje: 'Registro eliminado' });
  });

  test('un fallo de la API se muestra como error con su mensaje', async () => {
    const api = jest.fn().mockRejectedValue(Object.assign(new Error('Campo sala requerido'), { details: ['sala'] }));
    const { results } = await run(page(form).getElementById('b'), { verb: 'crear', api });
    expect(results.at(-1)).toEqual({ estado: 'error', mensaje: 'Campo sala requerido', detalles: ['sala'] });
  });

  test('un verbo desconocido no llama a la API', async () => {
    const api = jest.fn();
    const { results } = await run(page(form).getElementById('b'), { verb: 'reservar', api });
    expect(api).not.toHaveBeenCalled();
    expect(results.at(-1).estado).toBe('error');
  });
});
