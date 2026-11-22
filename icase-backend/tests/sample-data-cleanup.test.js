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
const dashboard = load('frontend/dashboard.js');
const actions = load('frontend/mockup-actions.js');
const live = load('frontend/live-tables.js', () => actions);

const hoy = new Date().toISOString();
const ventas = [
  { id: '1', fecha: hoy, total: 150, estado: 'activa', factura_id: '9' },
  { id: '2', fecha: hoy, total: 120, estado: 'anulada', factura_id: '8' },
  { id: '3', fecha: hoy, total: 80, estado: 'activa' },
  { id: '4', fecha: '2020-01-01T10:00:00Z', total: 999, estado: 'activa' }
];
const facturas = [{ id: '9', numero: 'F001-00001', total: 177, estado: 'emitida' }, { id: '8', numero: 'F001-00002', total: 141.6, estado: 'anulada' }];
const registries = [{ key: 'rf-04', entity: 'venta' }, { key: 'rf-03', entity: 'factura' }];
const api = jest.fn(async (url) => ({ data: (/rf-04/.test(url) ? ventas : facturas).map(({ id, ...data }) => ({ id, data })) }));

describe('tablero con datos reales (caso Ventas)', () => {
  test('cada cifra sale de los registros según su etiqueta; lo que no se puede calcular queda en «—»', async () => {
    const document = new JSDOM(`<body><div class="mockup-content">
      <div><p>Total vendido hoy</p><p>S/ 4,860.50</p></div>
      <div><p>Transacciones</p><p>18</p></div>
      <div><p>Facturas emitidas</p><p>16</p><p>88.9% de las ventas activas</p></div>
      <div><p>Facturas pendientes</p><p>2</p></div>
      <div><span>Anuladas</span><span>1</span></div>
      <div><p>Transferencia</p><p>S/ 3,742.00</p></div>
      <table><thead><tr><th>Fecha</th><th>Total</th><th>Estado</th></tr></thead><tbody><tr><td>21/11 13:20</td><td>S/ 4,368.00</td><td>Activa</td></tr><tr><td>x</td><td>y</td><td>z</td></tr></tbody></table>
    </div></body>`).window.document;
    const root = document.querySelector('.mockup-content');
    await dashboard.bindDashboard(root, { api, registries });
    const values = [...root.querySelectorAll('div > p:nth-child(2), div > span:nth-child(2)')].map((item) => item.textContent);
    // «hoy»: 150 + 80 (la anulada y la de 2020 no cuentan). Sin «hoy»: 4 transacciones, 1 factura vigente, 2 ventas activas sin factura.
    expect(values).toEqual(['S/ 230.00', '4', '1', '2', '1', '—']);
    expect(root.textContent).toContain('— de las ventas activas');
    expect(root.textContent).not.toMatch(/4,860|4,368|3,742|88\.9/);
    expect(root.querySelectorAll('tbody tr')).toHaveLength(2);
    expect(root.querySelector('tbody tr').textContent).toContain('S/ 150.00');
  });
});

describe('listados sin restos del diseño', () => {
  const html = `<div class="mockup-content"><form><input type="date" value="2026-11-01"><label for="cliente">Cliente</label><select id="cliente"><option>Todos los clientes</option><option>Comercial Andina</option></select>
    <label for="vendedor">Vendedor</label><select id="vendedor"><option>Todos los vendedores</option><option>María Torres</option></select></form>
    <section><span>24 registros</span><table><thead><tr><th>Cliente</th><th>Vendedor</th><th>Total</th></tr></thead><tbody><tr><td>Comercial Andina</td><td>María</td><td>S/ 10.00</td></tr></tbody></table></section></div>`;
  const rows = [{ id: '1', cliente_id: '5', cliente_id__etiqueta: 'Ana Ríos', usuario_id: '2', usuario_id__etiqueta: 'Vendedor', total: 50 }, { id: '2', cliente_id: '6', cliente_id__etiqueta: 'Luis Paz', usuario_id: '2', usuario_id__etiqueta: 'Vendedor', total: 20 }];

  test('el contador cuenta los registros reales, las fechas de ejemplo se vacían y los filtros ofrecen valores reales', async () => {
    const document = new JSDOM(`<body>${html}</body>`).window.document;
    const root = document.querySelector('.mockup-content');
    await live.bindLiveTables({ root, blocks: [{ tipo: 'tabla', operacion: 'consultarVentas', campos: ['cliente_id', 'usuario_id', 'total'] }], actions: { consultarVentas: { type: 'consulta', capability: 'rf-04', path: '/api/actions/consultar-ventas', output: ['cliente_id', 'usuario_id', 'total'] } }, api: async () => rows });
    expect(root.querySelector('span').textContent).toBe('2 registros');
    expect(root.querySelector('input[type="date"]').value).toBe('');
    const [cliente, vendedor] = root.querySelectorAll('select');
    expect([...cliente.options].map((option) => option.textContent)).toEqual(['Todos los clientes', 'Ana Ríos', 'Luis Paz']);
    expect([...vendedor.options].map((option) => option.textContent)).toEqual(['Todos los vendedores', 'Vendedor']);
    expect(root.querySelector('tbody tr').textContent).toContain('Vendedor'); // la columna «Vendedor» muestra la cuenta (usuario_id)
  });
});
