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
const run = async (button, { verb, api, can = () => true, confirmar = () => true, selected = null, onSelect = () => {} }) => {
  const event = { preventDefault: jest.fn(), currentTarget: button };
  const results = [];
  await runtime.runAction({ event, operation: 'rf-03', verb, api, can, confirmar, selected, onSelect, onResult: (result) => results.push(result) });
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

  describe('registro seleccionado', () => {
    const selected = { operation: 'rf-03', id: '9', etiqueta: 'Sala 9' };
    const rowButton = '<table><tr data-id="7"><td><button id="b">Acción</button></td></tr></table>';

    test('consultar informa la operación para que la tabla pueda seleccionar', async () => {
      const api = jest.fn().mockResolvedValue({ data: [] });
      const { results } = await run(page('<button id="b">Ver</button>').getElementById('b'), { verb: 'consultar', api });
      expect(results.at(-1)).toEqual(expect.objectContaining({ operacion: 'rf-03', registros: [] }));
    });

    test('editar usa el registro seleccionado y este gana sobre un data-id', async () => {
      const api = jest.fn().mockResolvedValue({});
      const document = page('<form data-id="7"><input name="sala" value="B"><button id="b">Guardar</button></form>');
      await run(document.getElementById('b'), { verb: 'editar', api, selected });
      expect(api).toHaveBeenCalledWith('/api/operations/rf-03/9', { method: 'PATCH', body: JSON.stringify({ sala: 'B' }) });
    });

    test('un registro seleccionado de otra operación se ignora', async () => {
      const api = jest.fn();
      const { results } = await run(page(rowButton.replace('data-id="7"', '')).getElementById('b'), { verb: 'eliminar', api, selected: { ...selected, operation: 'rf-99' } });
      expect(api).not.toHaveBeenCalled();
      expect(results.at(-1).estado).toBe('aviso');
      expect(results.at(-1).mensaje).toContain('Selecciona');
    });

    test('eliminar confirma indicando qué registro y limpia la selección al terminar', async () => {
      const api = jest.fn().mockResolvedValue({});
      const confirmar = jest.fn(() => true);
      const onSelect = jest.fn();
      const { results } = await run(page('<button id="b">Eliminar</button>').getElementById('b'), { verb: 'eliminar', api, selected, confirmar, onSelect });
      expect(confirmar.mock.calls[0][0]).toContain('Sala 9');
      expect(api).toHaveBeenCalledWith('/api/operations/rf-03/9', { method: 'DELETE' });
      expect(onSelect).toHaveBeenCalledWith(null);
      expect(results.at(-1)).toEqual({ estado: 'ok', mensaje: 'Registro eliminado' });
    });

    test('un fallo al eliminar conserva la selección', async () => {
      const onSelect = jest.fn();
      const { results } = await run(page('<button id="b">Eliminar</button>').getElementById('b'), { verb: 'eliminar', api: jest.fn().mockRejectedValue(new Error('No existe')), selected, onSelect });
      expect(onSelect).not.toHaveBeenCalled();
      expect(results.at(-1)).toEqual({ estado: 'error', mensaje: 'No existe' });
    });

    test('si el usuario no confirma no se llama a la API ni se pierde la selección', async () => {
      const api = jest.fn();
      const onSelect = jest.fn();
      await run(page('<button id="b">Eliminar</button>').getElementById('b'), { verb: 'eliminar', api, selected, confirmar: () => false, onSelect });
      expect(api).not.toHaveBeenCalled();
      expect(onSelect).not.toHaveBeenCalled();
    });
  });

  describe('fillFields', () => {
    test('rellena por name texto, número, casilla, radio y select, e ignora claves sin campo', () => {
      const document = page(`<div id="c"><input name="sala"><input name="capacidad" type="number"><input name="activo" type="checkbox">
        <input name="tipo" type="radio" value="a"><input name="tipo" type="radio" value="b">
        <select name="turno"><option value="m">M</option><option value="t">T</option></select></div>`);
      runtime.fillFields(document.getElementById('c'), { sala: 'Sala 9', capacidad: 5, activo: true, tipo: 'b', turno: 't', desconocido: 'x' });
      expect(runtime.collectFields(document.getElementById('c').querySelector('input'))).toEqual({ sala: 'Sala 9', capacidad: 5, activo: true, tipo: 'b', turno: 't' });
    });

    test('un valor nulo deja el campo vacío', () => {
      const document = page('<div id="c"><input name="sala" value="vieja"></div>');
      runtime.fillFields(document.getElementById('c'), { sala: null });
      expect(document.querySelector('input').value).toBe('');
    });
  });

  test('un verbo desconocido no llama a la API', async () => {
    const api = jest.fn();
    const { results } = await run(page(form).getElementById('b'), { verb: 'reservar', api });
    expect(api).not.toHaveBeenCalled();
    expect(results.at(-1).estado).toBe('error');
  });
});
