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
  expect(menu.descripcion).toBe('El sistema debe permitir al cliente ver el menú con precios y disponibilidad actualizada.');
  expect(menu.nombre).toBe('Ver el menú con precios y disponibilidad actualizada');
  expect(menu.descripcion).not.toMatch(/agotad/);
  expect(menu.precondiciones).toBe('');
  expect(menu.poscondiciones).toBe('');
  expect(soldOut.descripcion).toBe('El sistema debe permitir al cocinero marcar platos como agotados.');
});

test('separa la prohibición que ya es regla y no trata la tecnología como regla', () => {
  const [users, auth, backups] = shape([
    { tipo: 'RF', necesidades_origen: ['N-24'], reglas_relacionadas: [], criterios_aceptacion: [{ descripcion: 'Gestiona usuarios', necesidades_origen: ['N-24'] }] },
    { tipo: 'RF', necesidades_origen: ['N-31'], reglas_relacionadas: ['N-10'], precondiciones: 'El usuario cuenta con credenciales válidas registradas en el sistema.', criterios_aceptacion: [] },
    { tipo: 'RF', identificador: 'RF-43', necesidades_origen: ['N-12'], precondiciones: 'Acceso con privilegios de administración al sistema de persistencia.', criterios_aceptacion: [] }
  ], inventory);
  expect(users.descripcion).toBe('El sistema debe permitir al administrador gestionar usuarios.');
  expect(users.reglas_relacionadas).toEqual(['N-33']);
  expect(auth.descripcion).toBe('El sistema debe autenticar el acceso de los roles del sistema.');
  expect(auth.reglas_relacionadas).toEqual([]);
  expect(auth.precondiciones).toBe('');
  expect(backups.descripcion).toBe('El sistema debe permitir respaldos de la base de datos y recuperación de información.');
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
    { id: 'N-28', tipo: 'RF', objetivo_id: 'O-28', necesidad: 'el administrador haga una reasignación', evidencia: 'salvo que el administrador haga una reasignación.' },
    { id: 'N-14', tipo: 'RNF', objetivo_id: 'O-14', necesidad: 'Las pantallas de cocina, meseros y caja deben ser simples, con botones claros, estados visibles y pocas acciones por pantalla' },
    { id: 'N-15', tipo: 'RNF', objetivo_id: 'O-15', necesidad: 'El cliente usará su celular, los meseros tabletas, y cocina y caja computadoras o pantallas grandes' },
    { id: 'N-07', tipo: 'RNF', objetivo_id: 'O-07', necesidad: 'El sistema debe reflejar cambios de disponibilidad en menos de un segundo.', evidencia: 'Idealmente menos de un segundo cuando el restaurante esté funcionando normalmente.' },
    { id: 'N-43', tipo: 'RNF', objetivo_id: 'O-43', necesidad: 'Si existe una caída breve se puede atender manualmente, pero queremos respaldos de la base de datos y poder recuperar la información.' }
  ];
  const [packages, points] = shape([{
    tipo: 'RF', actores: ['Cliente'], necesidades_origen: ['N-03', 'N-17'],
    criterios_aceptacion: [
      { descripcion: 'El cliente compra un paquete.', necesidades_origen: ['N-03'] },
      { descripcion: 'El sistema acredita puntos.', necesidades_origen: ['N-17'] }
    ]
  }], splitInventory);
  expect(packages.descripcion).toBe('El sistema debe permitir al cliente comprar paquetes semanales prepagados.');
  expect(packages.necesidades_origen).toEqual(['N-03']);
  expect(points.descripcion).toBe('El sistema debe permitir al cliente acumular puntos por sus compras.');
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
    'El sistema debe permitir al mesero ver sus mesas asignadas.',
    'El sistema debe permitir al mesero tomar pedidos.'
  ]);
  expect(waiter[0].criterios_aceptacion.map(item => item.descripcion)).toEqual(['El mesero visualiza sus mesas.']);

  const [reassign, screens, devices, latency, recovery] = shape([
    { tipo: 'RF', actores: [], necesidades_origen: ['N-28'], criterios_aceptacion: [{ descripcion: 'el administrador haga una reasignación', necesidades_origen: ['N-28'] }] },
    { tipo: 'RNF', necesidades_origen: ['N-14'], criterios_aceptacion: [{ descripcion: 'Pantallas simples.', necesidades_origen: ['N-14'] }] },
    { tipo: 'RNF', necesidades_origen: ['N-15'], criterios_aceptacion: [{ descripcion: 'Cada rol usa su dispositivo.', necesidades_origen: ['N-15'] }] },
    { tipo: 'RNF', necesidades_origen: ['N-07'], metrica_medible: 'Por confirmar con el usuario', requiere_confirmacion: true, criterios_aceptacion: [{ descripcion: 'La disponibilidad se actualiza en menos de un segundo.', necesidades_origen: ['N-07'] }] },
    { tipo: 'RNF', necesidades_origen: ['N-43'], criterios_aceptacion: [{ descripcion: 'Hay respaldo.', necesidades_origen: ['N-43'] }] }
  ], splitInventory);
  expect(reassign.descripcion).toBe('El sistema debe permitir al administrador hacer una reasignación.');
  expect(reassign.nombre).toBe('Una reasignación');
  expect(reassign.actores).toEqual(['Administrador']);
  expect(screens.descripcion).toBe('El sistema debe presentar las pantallas de cocina, meseros y caja simples, con botones claros, estados visibles y pocas acciones por pantalla.');
  expect(devices.descripcion).toBe('El sistema debe estar disponible según el dispositivo de cada rol: el cliente en su celular, los meseros tabletas, y cocina y caja computadoras o pantallas grandes.');
  expect(latency.metrica_medible).toBe('menos de un segundo');
  expect(latency.requiere_confirmacion).toBe(false);
  expect(recovery.descripcion).toBe('El sistema debe permitir respaldos de la base de datos y recuperar la información.');
});
