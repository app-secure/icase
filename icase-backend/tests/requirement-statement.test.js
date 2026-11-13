const { shape } = require('../src/core/services/RequirementStatement');

const inventory = [
  { id: 'N-01', tipo: 'RF', necesidad: 'El cliente debe poder ver el menú con precios y disponibilidad actualizada', evidencia: 'El cliente debe poder ver el menú. Si un plato se agotó, no debe poder pedirlo.' },
  { id: 'N-21', tipo: 'RF', necesidad: 'El cocinero puede marcar platos como agotados', evidencia: 'También podrán marcar un plato como agotado.' },
  { id: 'N-24', tipo: 'RF', necesidad: 'El administrador debe poder gestionar usuarios, solo él puede modificar precios' },
  { id: 'N-33', tipo: 'regla_negocio', necesidad: 'solamente el administrador podrá modificar precios, consultar reportes globales y gestionar usuarios' },
  { id: 'N-10', tipo: 'restriccion_tecnica', necesidad: 'El sistema debe autenticar usuarios con JWT' },
  { id: 'N-31', tipo: 'RF', necesidad: 'Autenticar el acceso de los roles del sistema.' },
  { id: 'N-12', tipo: 'RF', necesidad: 'El sistema debe permitir respaldos de la base de datos y recuperación de información.' }
];

test('redacta todas las declaraciones con el mismo patrón y solo con su necesidad', () => {
  const [menu, soldOut] = shape([
    { identificador: 'RF-09', tipo: 'RF', nombre: 'Gestionar comandas y marcar agotados', descripcion: 'El cocinero ve comandas y marca platos como agotados', actores: ['Cocinero'], necesidades_origen: ['N-01'], precondiciones: 'El administrador ha iniciado sesión.', poscondiciones: 'La mesa queda reasignada.', criterios_aceptacion: [{ descripcion: 'El cliente visualiza el menú', necesidades_origen: ['N-01'] }] },
    { identificador: 'RF-21', tipo: 'RF', nombre: 'Marcar', descripcion: 'marca', necesidades_origen: ['N-21'], criterios_aceptacion: [] }
  ], inventory);
  expect(menu.descripcion).toBe('El sistema deberá permitir al cliente ver el menú con precios y disponibilidad actualizada.');
  expect(menu.nombre).toBe('Ver el menú con precios y disponibilidad actualizada');
  expect(menu.descripcion).not.toMatch(/agotad/);
  expect(menu.precondiciones).toBe('');
  expect(menu.poscondiciones).toBe('');
  expect(soldOut.descripcion).toBe('El sistema deberá permitir al cocinero marcar platos como agotados.');
});

test('separa la prohibición que ya es regla y no trata la tecnología como regla', () => {
  const [users, auth, backups] = shape([
    { tipo: 'RF', necesidades_origen: ['N-24'], reglas_relacionadas: [], criterios_aceptacion: [{ descripcion: 'Gestiona usuarios', necesidades_origen: ['N-24'] }] },
    { tipo: 'RF', necesidades_origen: ['N-31'], reglas_relacionadas: ['N-10'], precondiciones: 'El usuario cuenta con credenciales válidas registradas en el sistema.', criterios_aceptacion: [] },
    { tipo: 'RF', identificador: 'RF-43', necesidades_origen: ['N-12'], precondiciones: 'Acceso con privilegios de administración al sistema de persistencia.', criterios_aceptacion: [] }
  ], inventory);
  expect(users.descripcion).toBe('El sistema deberá permitir al administrador gestionar usuarios, conforme a solamente el administrador podrá gestionar usuarios.');
  expect(users.reglas_relacionadas).toEqual(['N-33']);
  expect(auth.descripcion).toBe('El sistema deberá autenticar el acceso de los roles del sistema.');
  expect(auth.reglas_relacionadas).toEqual([]);
  expect(auth.precondiciones).toBe('');
  expect(backups.descripcion).toBe('El sistema deberá permitir respaldos de la base de datos y recuperación de información.');
  expect(backups.actores).toEqual(['Sistema']);
  expect(backups.precondiciones).toBe('');
});

test('conserva una precondición solo cuando la evidencia la dice', () => {
  const [kept] = shape([{
    tipo: 'RF', necesidades_origen: ['N-01'], precondiciones: 'Si un plato se agotó, no debe poder pedirlo.', criterios_aceptacion: []
  }], inventory);
  expect(kept.precondiciones).toBe('Si un plato se agotó, no debe poder pedirlo.');
});

test('descarta un requisito que solo cita una restricción técnica', () => {
  expect(shape([{ tipo: 'RF', necesidades_origen: ['N-10'], criterios_aceptacion: [] }], inventory)).toEqual([]);
});

test('separa objetivos independientes y redacta cualidades como enunciado del sistema', () => {
  const splitInventory = [
    { id: 'N-03', tipo: 'RF', objetivo_id: 'O-03', necesidad: 'El cliente debe poder comprar paquetes semanales prepagados' },
    { id: 'N-17', tipo: 'RF', objetivo_id: 'O-17', necesidad: 'El cliente debe poder acumular puntos por sus compras' },
    { id: 'N-04', tipo: 'RF', objetivo_id: 'O-04', necesidad: 'El mesero puede ver sus mesas asignadas', evidencia: 'ver las mesas asignadas' },
    { id: 'N-18', tipo: 'RF', objetivo_id: 'O-18', necesidad: 'El mesero puede tomar pedidos' },
    { id: 'N-28', tipo: 'RF', objetivo_id: 'O-28', actor_id: 'ACT-05', necesidad: 'Reasignar mesas entre meseros', reglas_ids: ['N-05'], evidencia: 'salvo que el administrador haga una reasignación.' },
    { id: 'N-05', tipo: 'regla_negocio', necesidad: 'El mesero no puede ver ni modificar las mesas de otro mesero, salvo reasignación por administrador.' },
    { id: 'N-14', tipo: 'RNF', objetivo_id: 'O-14', necesidad: 'Facilidad de uso de las pantallas de cocina, meseros y caja', evidencia: 'proponemos que las pantallas de cocina, meseros y caja sean simples, con botones claros, estados visibles y pocas acciones por pantalla.', preguntas_ids: ['N-41'] },
    { id: 'N-41', tipo: 'pregunta', estado: 'pendiente', necesidad: '¿Qué métricas concretas faltan todavía para la seguridad y la facilidad de uso?' },
    { id: 'N-15', tipo: 'restriccion_tecnica', necesidad: 'El cliente usará su celular, los meseros tabletas, y cocina y caja computadoras o pantallas grandes' },
    { id: 'N-07', tipo: 'RNF', objetivo_id: 'O-07', necesidad: 'El sistema debe reflejar cambios de disponibilidad en menos de un segundo.', evidencia: 'Idealmente menos de un segundo cuando el restaurante esté funcionando normalmente.' },
    { id: 'N-08', tipo: 'RF', objetivo_id: 'O-08', actor_id: 'ACT-04', necesidad: 'El cajero puede cobrar en efectivo o por transferencia', reglas_ids: ['N-50'] },
    { id: 'N-50', tipo: 'regla_negocio', necesidad: 'comprobar el saldo del paquete prepagado antes de cobrar' }
  ];
  const [packages, points] = shape([{
    tipo: 'RF', actores: ['Cliente'], necesidades_origen: ['N-03', 'N-17'],
    criterios_aceptacion: [
      { descripcion: 'El cliente compra un paquete.', necesidades_origen: ['N-03'] },
      { descripcion: 'El sistema acredita puntos.', necesidades_origen: ['N-17'] }
    ]
  }], splitInventory);
  expect(packages.descripcion).toBe('El sistema deberá permitir al cliente comprar paquetes semanales prepagados.');
  expect(packages.necesidades_origen).toEqual(['N-03']);
  expect(points.descripcion).toBe('El sistema deberá permitir al cliente acumular puntos por sus compras.');
  expect(points.necesidades_origen).toEqual(['N-17']);

  const waiter = shape([{
    tipo: 'RF', necesidades_origen: ['N-04', 'N-18'],
    criterios_aceptacion: [
      { descripcion: 'El mesero visualiza sus mesas.', necesidades_origen: ['N-04'] },
      { descripcion: 'El mesero registra pedidos.', necesidades_origen: ['N-18'] },
      { descripcion: 'El cocinero marca un plato como agotado.', necesidades_origen: ['N-04'] }
    ]
  }], [...splitInventory, { id: 'N-21', tipo: 'RF', objetivo_id: 'O-21', necesidad: 'El cocinero puede marcar platos como agotados' }]);
  expect(waiter.map(item => item.descripcion)).toEqual([
    'El sistema deberá permitir al mesero ver sus mesas asignadas.',
    'El sistema deberá permitir al mesero tomar pedidos.'
  ]);
  expect(waiter[0].criterios_aceptacion.map(item => item.descripcion)).toEqual(['El mesero visualiza sus mesas.']);

  const [reassign, screens, latency, charge] = shape([
    { tipo: 'RF', actores: [], necesidades_origen: ['N-28'], criterios_aceptacion: [{ descripcion: 'Reasignar mesas entre meseros', necesidades_origen: ['N-28'] }] },
    { tipo: 'RNF', necesidades_origen: ['N-14'], criterios_aceptacion: [{ descripcion: 'Pantallas simples.', necesidades_origen: ['N-14'] }] },
    { tipo: 'RNF', necesidades_origen: ['N-07'], metrica_medible: 'Por confirmar con el usuario', requiere_confirmacion: true, criterios_aceptacion: [{ descripcion: 'La disponibilidad se actualiza en menos de un segundo.', necesidades_origen: ['N-07'] }] },
    { tipo: 'RF', prioridad: 'Media', necesidades_origen: ['N-08'], criterios_aceptacion: [{ descripcion: '', necesidades_origen: ['N-08'] }] }
  ], splitInventory, [{ id: 'ACT-05', nombre: 'Administrador', tipo: 'persona' }, { id: 'ACT-04', nombre: 'Cajero', tipo: 'persona' }]);
  expect(shape([{ tipo: 'RNF', necesidades_origen: ['N-15'], criterios_aceptacion: [] }], splitInventory)).toEqual([]);
  expect(reassign.descripcion).toBe('El sistema deberá reasignar mesas entre meseros, conforme a el mesero no puede ver ni modificar las mesas de otro mesero, salvo reasignación por administrador.');
  expect(reassign.nombre).toBe('Reasignar mesas entre meseros');
  expect(reassign.actores).toEqual(['Administrador']);
  expect(reassign.criterios_aceptacion).toEqual([{ descripcion: 'Queda comprobado: reasignar mesas entre meseros.', necesidades_origen: ['N-28'] }]);
  expect(screens.descripcion).toBe('El sistema deberá ser fácil de usar en las pantallas de cocina, meseros y caja, cumpliendo botones claros, estados visibles y pocas acciones por pantalla.');
  expect(screens.nombre).toBe('Facilidad de uso de las pantallas de cocina, meseros y caja');
  expect(screens.preguntas_relacionadas).toEqual(['N-41']);
  expect(screens.metrica_medible).toBeUndefined();
  expect(latency.descripcion).toBe('El sistema deberá reflejar cambios de disponibilidad, bajo el funcionamiento normal, cumpliendo un tiempo menor a un segundo.');
  expect(latency.metrica_medible).toBe('menos de un segundo');
  expect(latency.requiere_confirmacion).toBe(false);
  expect(charge.descripcion).toBe('Cuando el cajero va a cobrar, el sistema deberá cobrar en efectivo o por transferencia, conforme a comprobar el saldo del paquete prepagado antes de cobrar.');
  const [menuWithForeignRule] = shape([{ tipo: 'RF', necesidades_origen: ['N-01'], reglas_relacionadas: ['N-50'], criterios_aceptacion: [{ descripcion: 'El cliente visualiza el menú con precios.', necesidades_origen: ['N-01'] }] }], [...inventory, { id: 'N-50', tipo: 'regla_negocio', necesidad: 'comprobar el saldo del paquete prepagado antes de cobrar' }]);
  expect(menuWithForeignRule.descripcion).not.toMatch(/saldo|conforme/);
  expect(menuWithForeignRule.reglas_relacionadas).toEqual([]);
  expect(charge.prioridad).toBe('Alta');
  const drafted = shape([
    { tipo: 'RF', necesidades_origen: ['N-67'], criterios_aceptacion: [] },
    { tipo: 'RF', necesidades_origen: ['N-60'], criterios_aceptacion: [] },
    { tipo: 'RF', necesidades_origen: ['N-61'], criterios_aceptacion: [] },
    { tipo: 'RF', necesidades_origen: ['N-62'], criterios_aceptacion: [] },
    { tipo: 'RF', necesidades_origen: ['N-63'], reglas_relacionadas: ['N-70', 'N-71'], criterios_aceptacion: [] },
    { tipo: 'RNF', necesidades_origen: ['N-64'], criterios_aceptacion: [] },
    { tipo: 'RNF', necesidades_origen: ['N-65'], criterios_aceptacion: [] }
  ], [
    { id: 'N-60', tipo: 'RF', necesidad: 'Los meseros podrán el mesero visualiza las mesas asignadas y toma pedidos' },
    { id: 'N-61', tipo: 'RF', necesidad: 'El cocinero visualiza las comandas nuevas y el resumen de platos pendientes' },
    { id: 'N-62', tipo: 'RF', necesidad: 'El cajero procesa cobros en efectivo o por transferencia y cierra la caja' },
    { id: 'N-63', tipo: 'RF', actor_id: 'ACT-01', necesidad: 'El cliente debe poder visualizar el menú con precios y solo puede ordenar platos disponibles', reglas_ids: ['N-70', 'N-71'] },
    { id: 'N-70', tipo: 'regla_negocio', necesidad: 'Si un plato se agotó, no debe poder pedirlo.' },
    { id: 'N-71', tipo: 'regla_negocio', necesidad: 'Los cocineros solamente trabajan con las comandas y la disponibilidad de los platos.' },
    { id: 'N-64', tipo: 'RNF', necesidad: 'La actualización de disponibilidad de platos se refleja', evidencia: 'Idealmente menos de un segundo cuando el restaurante esté funcionando normalmente.' },
    { id: 'N-65', tipo: 'RNF', necesidad: 'El sistema debe realizar copias de seguridad de la base de datos', evidencia: 'queremos respaldos de la base de datos' },
    { id: 'N-66', tipo: 'RF', necesidad: 'Permitir respaldos de la base de datos y recuperación de información.' },
    { id: 'N-67', tipo: 'RF', necesidad: 'Los meseros pueden tomar pedidos' }
  ], [{ id: 'ACT-01', nombre: 'Cliente', tipo: 'persona' }]);
  expect(drafted.find(item => item.necesidades_origen.includes('N-60')).descripcion).toBe('El sistema deberá permitir al mesero visualizar las mesas asignadas y tomar pedidos.');
  expect(drafted.find(item => item.necesidades_origen.includes('N-61')).descripcion).toBe('El sistema deberá permitir al cocinero visualizar las comandas nuevas y el resumen de platos pendientes.');
  expect(drafted.find(item => item.necesidades_origen.includes('N-62')).descripcion).toBe('El sistema deberá permitir al cajero procesar cobros en efectivo o por transferencia y cerrar la caja.');
  expect(drafted.find(item => item.necesidades_origen.includes('N-63')).descripcion).toBe('El sistema deberá permitir al cliente visualizar el menú con precios y solo puede ordenar platos disponibles, conforme a si un plato se agotó, no debe poder pedirlo.');
  expect(drafted.find(item => item.necesidades_origen.includes('N-64')).descripcion).toBe('El sistema deberá reflejar la actualización de disponibilidad de platos, bajo el funcionamiento normal, cumpliendo un tiempo menor a un segundo.');
  expect(drafted.some(item => item.necesidades_origen.includes('N-65'))).toBe(false);
  expect(drafted.some(item => item.necesidades_origen.includes('N-67'))).toBe(false);
  expect(charge.criterios_aceptacion).toEqual([{ descripcion: 'Queda comprobado: cobrar en efectivo o por transferencia.', necesidades_origen: ['N-08'] }]);
});
