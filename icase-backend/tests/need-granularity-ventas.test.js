const fs = require('node:fs');
const path = require('node:path');
const { refine } = require('../src/core/services/NeedGranularity');
const identifiers = require('../src/core/services/AnalysisIdentifiers');

// Insumo de la presentación (tienda de ventas y facturación).
const input = fs.readFileSync(path.join(__dirname, '../../docs/pruebas/ventas/entrevista_tienda_ventas.txt'), 'utf8');
const quote = fragment => {
  const at = input.indexOf(fragment);
  if (at < 0) throw new Error(`Fragmento no encontrado en el insumo: ${fragment}`);
  return input.slice(at, at + fragment.length);
};
const item = (id, tipo, necesidad, fragment, extra = {}) => ({ id, tipo, estado: 'confirmado', necesidad, evidencia: quote(fragment), ...extra });

const base = [
  item('N-04', 'RF', 'El vendedor puede registrar una venta seleccionando un cliente y agregando varios productos con su cantidad.', 'El vendedor elige un cliente, agrega varios productos', { objetivo_id: 'O-01' }),
  item('N-10', 'RF', 'La administradora puede anular una venta indicando el motivo.', 'Solo la administradora puede anular una venta, indicando el motivo.', { objetivo_id: 'O-02' }),
  item('N-11', 'regla_negocio', 'Una venta anulada no se puede modificar.', 'Una venta anulada no se puede modificar.'),
  { id: 'N-27', tipo: 'pregunta', estado: 'pendiente', necesidad: '¿Con qué recurrencia se harán las copias de seguridad de la base de datos (por ejemplo, diarias)?', evidencia: quote('queda pendiente definir cada cuánto se harán') },
  { id: 'N-28', tipo: 'pregunta', estado: 'pendiente', necesidad: '¿Cuánto tiempo puede permanecer el sistema inactivo antes de volver a funcionar?', evidencia: quote('cuánto tiempo máximo puede tardar una recuperación') }
];

const run = () => refine(base, input, identifiers([base]));
const plain = text => String(text).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

test('una prohibición con «no se puede» no se recupera como RF ni recibe un actor inventado', () => {
  const functional = run().filter(entry => entry.tipo === 'RF').map(entry => plain(entry.necesidad));
  expect(functional.some(text => /no se puede/.test(text))).toBe(false);
  expect(functional.some(text => /puede una venta anulada/.test(text))).toBe(false);
});

test('las copias de seguridad cuya política queda pendiente no se convierten en un RF', () => {
  const inventory = run();
  expect(inventory.some(entry => entry.tipo === 'RF' && /respaldo|copias de seguridad|recuperacion/.test(plain(entry.necesidad)))).toBe(false);
  expect(inventory.filter(entry => entry.tipo === 'pregunta')).toHaveLength(2);
});

test('«Ver y consultar la factura» es una sola operación, sin un requisito «Ver» suelto', () => {
  const inventory = [item('N-14', 'RF', 'Ver y consultar la factura interna generada dentro del sistema.', 'Por ahora solo una factura interna que se pueda ver y consultar.', { objetivo_id: 'O-09' })];
  const functional = refine(inventory, input, identifiers([inventory])).filter(entry => entry.tipo === 'RF').map(entry => plain(entry.necesidad));
  expect(functional.some(text => /^ver\.?$/.test(text.trim()))).toBe(false);
  expect(functional.filter(text => /factura interna/.test(text))).toHaveLength(1);
  expect(functional.find(text => /factura interna/.test(text))).toMatch(/ver y consultar/);
});

test('una necesidad que ya tiene sujeto no recibe otro actor delante', () => {
  const inventory = [item('N-07', 'RF', 'Administrador y vendedores registran y editan clientes, y los buscan por nombre o documento.', 'Tanto el administrador como los vendedores pueden registrar y editar clientes', { objetivo_id: 'O-04' })];
  const functional = refine(inventory, input, identifiers([inventory])).filter(entry => entry.tipo === 'RF').map(entry => plain(entry.necesidad));
  expect(functional.some(text => /pueden administrador/.test(text))).toBe(false);
});

test('una acción sin sujeto sigue recibiendo el actor de su evidencia', () => {
  const inventory = [item('N-19', 'RF', 'Visualizar una lista de productos con stock bajo.', 'Quiero ver una lista de los productos con stock bajo', { objetivo_id: 'O-11' })];
  const [first] = refine(inventory, input, identifiers([inventory])).filter(entry => entry.tipo === 'RF');
  expect(plain(first.necesidad)).toMatch(/stock bajo/);
});

test('lo declarado fuera de alcance se conserva como decisión aunque la IA solo lo mencione en el alcance', () => {
  const inventory = refine(base, input, identifiers([base]));
  const decisions = inventory.filter(entry => entry.tipo === 'decision');
  expect(decisions.some(entry => /sunat/.test(plain(entry.necesidad)) && /sucursales/.test(plain(entry.necesidad)))).toBe(true);
  expect(inventory.some(entry => entry.tipo === 'RF' && /sunat|sucursal/.test(plain(entry.necesidad)))).toBe(false);
});

test('una decisión fuera de alcance que ya existe no se duplica', () => {
  const withDecision = [...base, item('N-26', 'decision', 'Excluir del alcance la aplicación móvil, los pagos en línea, varias sucursales y la SUNAT.', 'Anoto como fuera de alcance la facturación electrónica con la SUNAT', { estado: 'fuera_de_alcance' })];
  const decisions = refine(withDecision, input, identifiers([withDecision])).filter(entry => entry.tipo === 'decision');
  expect(decisions.filter(entry => /sunat/.test(plain(entry.necesidad)))).toHaveLength(1);
});

test('no se antepone un actor que la necesidad ya nombra («…, por administrador y vendedor»)', () => {
  const inventory = [
    item('N011', 'RF', 'Editar datos de clientes existentes (nombre, tipo de documento, número, correo, teléfono), por administrador y vendedor.', 'Tanto el administrador como los vendedores pueden registrar y editar clientes', { objetivo_id: 'O-11' }),
    item('N013', 'RF', 'Anular una venta registrando el motivo, solo por administrador, revirtiendo el stock.', 'Solo la administradora puede anular una venta, indicando el motivo.', { objetivo_id: 'O-13' })
  ];
  const functional = refine(inventory, input, identifiers([inventory])).filter(entry => entry.tipo === 'RF').map(entry => plain(entry.necesidad));
  expect(functional.some(text => /^los vendedores pueden/.test(text))).toBe(false);
  expect(functional.some(text => /^la administradora puede/.test(text))).toBe(false);
});

test('«gestiona productos, usuarios, anula ventas» conserva la gestión de usuarios', () => {
  const inventory = [item('N-03', 'RF', 'Gestionar productos permitiendo crear, editar, desactivar y consultar.', 'el administrador gestiona los productos (crear, editar, desactivar y consultar)', { objetivo_id: 'O-03' })];
  const functional = refine(inventory, input, identifiers([inventory])).filter(entry => entry.tipo === 'RF').map(entry => plain(entry.necesidad));
  expect(functional.filter(text => /usuario/.test(text))).toHaveLength(1);
  expect(functional.some(text => /^gestionar (anula|revisa)/.test(text))).toBe(false);
});

test('si la gestión de usuarios ya existe no se duplica', () => {
  const inventory = [
    item('N-03', 'RF', 'Gestionar productos permitiendo crear, editar, desactivar y consultar.', 'el administrador gestiona los productos (crear, editar, desactivar y consultar)', { objetivo_id: 'O-03' }),
    item('N-17', 'RF', 'Gestionar usuarios y roles en el sistema.', 'gestionar usuarios y roles', { objetivo_id: 'O-17' })
  ];
  const functional = refine(inventory, input, identifiers([inventory])).filter(entry => entry.tipo === 'RF').map(entry => plain(entry.necesidad));
  expect(functional.filter(text => /usuario/.test(text))).toHaveLength(1);
});

test('«Capturar en cada venta: fecha, vendedor…» es un detalle de datos (regla), no otro RF', () => {
  const inventory = [
    item('N001', 'RF', 'Registrar una venta seleccionando un cliente y agregando varios productos.', 'El vendedor elige un cliente, agrega varios productos', { objetivo_id: 'O001' }),
    item('N002', 'RF', 'Capturar en cada venta: fecha, vendedor, cliente, medio de pago y líneas de producto con cantidad y precio unitario.', 'Una venta tiene fecha, vendedor, cliente, medio de pago', { objetivo_id: 'O002' })
  ];
  const result = refine(inventory, input, identifiers([inventory]));
  expect(result.find(entry => /capturar en cada venta/i.test(entry.necesidad)).tipo).toBe('regla_negocio');
  expect(result.some(entry => entry.tipo === 'RF' && /capturar/i.test(entry.necesidad))).toBe(false);
});
