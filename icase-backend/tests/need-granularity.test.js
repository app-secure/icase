const fs = require('node:fs');
const path = require('node:path');
const { refine } = require('../src/core/services/NeedGranularity');
const identifiers = require('../src/core/services/AnalysisIdentifiers');
const Coverage = require('../src/infrastructure/services/RequirementCoverageService');

const input = fs.readFileSync(path.join(__dirname, '../uploads/1794501013619-821112327-entrevista_gerente.txt'), 'utf8');
const quote = fragment => input.slice(input.indexOf(fragment), input.indexOf(fragment) + fragment.length);
const need = (id, objetivo, text, fragment) => ({ id, objetivo_id: objetivo, tipo: 'RF', estado: 'confirmado', necesidad: text, evidencia: quote(fragment) });
const coarse = [
  need('N-01', 'O-01', 'El cliente puede ver el menú con precios y disponibilidad actualizada y no pedir platos agotados.', 'En la aplicación móvil el cliente debe poder ver el menú'),
  need('N-02', 'O-02', 'El cliente puede reservar una mesa completa o una silla a través de la aplicación móvil.', 'También debe poder reservar una mesa completa o una silla'),
  need('N-03', 'O-03', 'El cliente puede comprar paquetes semanales prepagados y acumular puntos por sus compras.', 'comprar paquetes semanales prepagados y acumular puntos'),
  need('N-04', 'O-04', 'El mesero puede ver las mesas que tienen asignadas, revisar si una mesa está libre u ocupada, tomar pedidos y validar reservas escaneando el código QR del cliente.', 'Los meseros podrán ver las mesas que tienen asignadas'),
  need('N-06', 'O-06', 'El cocinero puede ver comandas nuevas, tiempo transcurrido, resumen de platos pendientes y marcar platos como agotados, actualizando el menú y notificando a los meseros.', 'En cocina se incluirá una pantalla KDS'),
  need('N-07', 'O-07', 'El cajero puede cobrar en efectivo o por transferencia, cerrar la caja y comprobar el saldo de paquetes prepagados antes de cobrar.', 'el cajero pueda cobrar en efectivo o por transferencia'),
  need('N-08', 'O-08', 'El administrador puede revisar ventas, platos más vendidos, ventas por fecha, cambiar precios del menú y gestionar usuarios, sin que otros puedan borrar ventas o modificar precios.', 'El administrador debe poder revisar ventas')
];

test('separa operaciones independientes y conserva medios, estados y la comprobación del cobro', () => {
  const inventory = refine(coarse, input, identifiers([coarse]));
  const text = item => item.necesidad.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const functional = inventory.filter(item => item.tipo === 'RF').map(text);
  expect(functional.some(item => /ver el menu/.test(item) && !/pedir/.test(item))).toBe(true);
  expect(functional.filter(item => /reservar una mesa/.test(item))).toHaveLength(1);
  expect(functional.some(item => /comprar paquetes/.test(item) && !/puntos/.test(item))).toBe(true);
  expect(functional.some(item => /el cliente debe poder acumular puntos por sus compras/.test(item))).toBe(true);
  expect(functional.some(item => /tienen asignadas/.test(item) && !/libre|tomar pedidos|validar/.test(item))).toBe(true);
  expect(functional.some(item => /libre u ocupada/.test(item) && !/mesas asignadas|tomar pedidos/.test(item))).toBe(true);
  expect(functional.some(item => /^tomar pedidos$/.test(item) || /tomar pedidos/.test(item) && !/validar|mesas asignadas/.test(item))).toBe(true);
  expect(functional.some(item => /validar reservas/.test(item) && !/tomar pedidos/.test(item))).toBe(true);
  expect(functional.some(item => /comandas nuevas/.test(item) && !/marcar/.test(item))).toBe(true);
  expect(functional.some(item => /marcar platos como agotados/.test(item))).toBe(true);
  expect(functional.some(item => /cobrar en efectivo/.test(item) && !/saldo/.test(item) && !/cerrar/.test(item))).toBe(true);
  expect(inventory.some(item => item.tipo === 'regla_negocio' && /saldo/.test(text(item)) && /antes de/.test(text(item)))).toBe(true);
  expect(functional.some(item => /cerrar la caja/.test(item) && !/cobrar/.test(item))).toBe(true);
  expect(functional.some(item => /revisar ventas/.test(item) && !/cambiar precios|gestionar usuarios/.test(item))).toBe(true);
  expect(functional.some(item => /cambiar precios/.test(item) && !/gestionar usuarios|revisar ventas/.test(item))).toBe(true);
  expect(functional.some(item => /el administrador debe poder gestionar usuarios/.test(item) && !/cambiar precios/.test(item))).toBe(true);
  expect(functional.filter(item => /cerrar/.test(item))).toHaveLength(1);
  expect(inventory.some(item => item.tipo === 'regla_negocio' && /borrar ventas|modificar precios/.test(text(item)))).toBe(true);
});

test('recupera permisos, reasignación, autenticación y tecnologías que no estaban en el inventario', () => {
  const inventory = refine(coarse, input, identifiers([coarse]));
  const text = item => `${item.tipo} ${item.necesidad}`.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  expect(inventory.some(item => item.tipo === 'RF' && /reasignar mesas entre meseros/.test(text(item)))).toBe(true);
  expect(inventory.some(item => item.tipo === 'RF' && /autentic/.test(text(item)))).toBe(true);
  expect(inventory.some(item => item.tipo === 'restriccion_tecnica' && /jwt/.test(text(item)))).toBe(true);
  expect(inventory.some(item => item.tipo === 'restriccion_tecnica' && /redis/.test(text(item)) && item.estado === 'pendiente')).toBe(true);
  expect(inventory.some(item => item.tipo === 'decision' && /alta disponibilidad|balanceador/.test(text(item)))).toBe(true);
  expect(inventory.some(item => item.tipo === 'pregunta' && /recurrencia se haran las copias/.test(text(item)))).toBe(true);
  expect(inventory.some(item => item.tipo === 'pregunta' && /permanecer el sistema inactivo/.test(text(item)))).toBe(true);
  expect(inventory.some(item => item.tipo === 'pregunta' && /150 personas/.test(text(item)))).toBe(false);
  expect(inventory.some(item => item.tipo === 'regla_negocio' && /otro mesero|reportes historicos|cambiar precios/.test(text(item)))).toBe(true);
  for (const item of inventory) expect(input.includes(item.evidencia)).toBe(true);
});

test('completa un fragmento de permiso con el actor de la confirmación', () => {
  const question = '¿Confirma que solamente el administrador podrá modificar precios, consultar reportes globales y gestionar usuarios?';
  const inventory = refine([{ id: 'N-39', objetivo_id: 'O-07', tipo: 'RF', estado: 'confirmado', necesidad: 'gestionar usuarios', evidencia: question }], input, identifiers([]));
  expect(inventory.find(item => item.id === 'N-39').necesidad).toMatch(/El administrador podrá gestionar usuarios/);
});

test('reclasifica dispositivos, nombra la facilidad de uso y no duplica el respaldo', () => {
  const inventory = refine([
    { id: 'N-15', objetivo_id: 'O-15', tipo: 'RNF', estado: 'confirmado', necesidad: 'El cliente usará su celular, los meseros tabletas, y cocina y caja computadoras o pantallas grandes.', evidencia: quote('Los meseros usarán tabletas') },
    { id: 'N-14', objetivo_id: 'O-14', tipo: 'RNF', estado: 'confirmado', necesidad: 'Las pantallas de cocina, meseros y caja deben ser simples, con botones claros, estados visibles y pocas acciones por pantalla.', evidencia: quote('pantallas de cocina, meseros y caja sean simples') },
    { id: 'N-12', objetivo_id: 'O-12', tipo: 'RF', estado: 'confirmado', necesidad: 'El sistema debe permitir respaldos de la base de datos y recuperación de información.', evidencia: quote('queremos respaldos de la base de datos') },
    { id: 'N-43', objetivo_id: 'O-28', tipo: 'RNF', estado: 'confirmado', necesidad: 'Si existe una caída breve se puede atender manualmente, pero queremos respaldos de la base de datos y poder recuperar la información.', evidencia: quote('Si existe una caída breve') },
    { id: 'N-08', objetivo_id: 'O-08', tipo: 'RF', estado: 'confirmado', necesidad: 'El cajero puede cobrar en efectivo o por transferencia.', evidencia: quote('el cajero pueda cobrar') }
  ], input, identifiers([]), [{ id: 'ACT-04', nombre: 'Cajero', tipo: 'persona', estado: 'confirmado' }]);
  expect(inventory.find(item => item.id === 'N-15')).toMatchObject({ tipo: 'restriccion_tecnica' });
  expect(inventory.find(item => item.id === 'N-15').objetivo_id).toBeUndefined();
  expect(inventory.find(item => item.id === 'N-14').necesidad).toMatch(/Facilidad de uso de las pantallas de cocina, meseros y caja/);
  expect(inventory.filter(item => item.tipo === 'RNF' && /respaldo|recuper/.test(item.necesidad.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()))).toHaveLength(0);
  expect(inventory.some(item => item.tipo === 'decision' && /caída breve|caida breve/i.test(item.necesidad))).toBe(true);
  expect(inventory.find(item => item.id === 'N-08').actor_id).toBe('ACT-04');
  expect(inventory.find(item => item.id === 'N-08').reglas_ids || []).toEqual(expect.any(Array));
});

test('la extracción deja el inventario granular sin otra llamada al modelo', async () => {
  const request = jest.fn().mockResolvedValue({ inventario_necesidades: coarse, actores: [], sintesis: { contexto: input, problema: '', alcance: '', objetivos: ['Operar el restaurante'] } });
  const result = await new Coverage().extractAnalysis({ input, prompt: '', request });
  expect(request).toHaveBeenCalledTimes(1);
  expect(result.inventario.filter(item => item.tipo === 'RF').length).toBeGreaterThan(coarse.length);
  expect(result.requerimientos).toBeUndefined();
  expect(result.inventario.find(item => item.id === 'N-02').necesidad).toMatch(/reservar una mesa completa o una silla/);
});
