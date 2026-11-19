const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const { transformSync } = require('esbuild');

const source = fs.readFileSync(path.join(__dirname, '../src/infrastructure/templates/frontend/live-tables.js'), 'utf8');
const live = (() => {
  const module = { exports: {} };
  new Function('module', 'exports', transformSync(source, { format: 'cjs' }).code)(module, module.exports);
  return module.exports;
})();

const html = `<main><table><thead><tr><th>Plato</th><th>Precio actual</th><th>Disponibilidad</th><th>Acciones</th></tr></thead><tbody>
  <tr><td>Lomo Saltado</td><td>35.00</td><td><span><i class="dot-ok"></i> Disponible</span></td><td><form data-accion="RF-12.editar"><input name="precio" value="35"><button type="submit">Guardar</button></form></td></tr>
  <tr><td>Ceviche</td><td>42.00</td><td><span><i class="dot-no"></i> Agotado</span></td><td><form data-accion="RF-12.editar"><input name="precio" value="42"><button type="submit">Guardar</button></form></td></tr>
</tbody></table></main>`;

const block = { tipo: 'tabla', operacion: 'listarPlatos', campos: ['nombre', 'precio', 'disponible'], acciones: [] };
const action = { type: 'consulta', capability: 'rf-12', entity: 'plato', path: '/api/actions/listar-platos', output: ['nombre', 'precio', 'disponible'] };
const setup = () => { const document = new JSDOM(html).window.document; return { document, root: document.querySelector('main') }; };

describe('tablas del mockup con datos reales', () => {
  test('relaciona el encabezado con el campo: nombre de la entidad, raíz de la palabra y coincidencia parcial', () => {
    const fields = ['nombre', 'precio', 'disponible', 'mesa_id'];
    expect(live.matchField('Plato', fields, 'plato')).toBe('nombre');
    expect(live.matchField('Precio actual', fields, 'plato')).toBe('precio');
    expect(live.matchField('Disponibilidad', fields, 'plato')).toBe('disponible');
    expect(live.matchField('Mesa', fields, 'plato')).toBe('mesa_id');
    expect(live.matchField('Observaciones', fields, 'plato')).toBeNull();
  });

  test('sustituye las filas de ejemplo por los registros, conservando la insignia de estado y los campos de la fila', async () => {
    const { root } = setup();
    const api = jest.fn().mockResolvedValue([{ id: 7, nombre: 'Seco de res', precio: 30, disponible: false }, { id: 8, nombre: 'Causa', precio: 18, disponible: true }]);
    await live.bindLiveTables({ root, blocks: [block], actions: { listarPlatos: action }, api, can: () => true });
    const rows = [...root.querySelectorAll('tbody tr')];
    expect(rows).toHaveLength(2);
    expect(rows[0].getAttribute('data-id')).toBe('7');
    expect(rows[0].textContent).toContain('Seco de res');
    expect(rows[0].textContent).toContain('Agotado'); // eligió la fila de ejemplo «Agotado» y conservó su punto de color
    expect(rows[0].querySelector('.dot-no')).not.toBeNull();
    expect(rows[1].querySelector('.dot-ok')).not.toBeNull();
    expect(rows[0].querySelector('input[name="precio"]').value).toBe('30');
    expect(root.querySelector('[data-icase-sample-notice]')).toBeNull();
  });

  test('la acción de una fila copiada se atiende sin navegar y sobre el registro de la fila', async () => {
    const { root, document } = setup();
    const api = jest.fn().mockResolvedValue([{ id: 7, nombre: 'Seco de res', precio: 30, disponible: true }]);
    const onAction = jest.fn();
    await live.bindLiveTables({ root, blocks: [block], actions: { listarPlatos: action }, api, can: () => true, onAction });
    const submit = new document.defaultView.Event('submit', { bubbles: true, cancelable: true });
    root.querySelector('tbody button').dispatchEvent(submit);
    expect(submit.defaultPrevented).toBe(true);
    expect(onAction).toHaveBeenCalledWith(expect.objectContaining({ currentTarget: root.querySelector('tbody button') }), 'rf-12', 'editar');
  });

  test('sin registros muestra el estado vacío; si no se pueden leer, avisa que lo mostrado es de ejemplo', async () => {
    const empty = setup();
    await live.bindLiveTables({ root: empty.root, blocks: [block], actions: { listarPlatos: action }, api: jest.fn().mockResolvedValue([]), can: () => true });
    expect(empty.root.querySelector('tbody').textContent).toContain('No hay registros');

    const denied = setup();
    await live.bindLiveTables({ root: denied.root, blocks: [block], actions: { listarPlatos: action }, api: jest.fn().mockRejectedValue(new Error('403')), can: () => true, onShowOperations: () => {} });
    expect(denied.root.querySelector('[data-icase-sample-notice]')).not.toBeNull();
    expect(denied.root.querySelectorAll('tbody tr')).toHaveLength(2); // el diseño queda como estaba
  });
});
