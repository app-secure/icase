const AccessControlService = require('../src/core/services/AccessControlService');

const rf = (identificador, nombre, actores, descripcion, criterios = []) => ({ aprobado: true, tipo: 'RF', identificador, nombre, actores, descripcion, criterios_aceptacion: criterios.map((descripcion) => ({ descripcion })) });
const requerimientos = [
  rf('RF-05', 'Gestionar productos', ['Administrador', 'Vendedor'],
    'Cuando el administrador inicia la creación de un producto, el sistema deberá registrarlo. Cuando el administrador modifica un producto existente, el sistema deberá actualizarlo. Cuando el vendedor o administrador consulta el catálogo, el sistema deberá mostrar productos activos.',
    ['Solo el administrador puede crear productos; un vendedor que intente crear un producto recibe rechazo.', 'Solo el administrador puede editar productos; un vendedor que intente editar recibe rechazo.', 'El vendedor consulta el catálogo.']),
  rf('RF-04', 'Consultar ventas', ['Vendedor', 'Administrador'],
    'Cuando el vendedor accede a la consulta de histórico de ventas, el sistema deberá mostrar exclusivamente las ventas que él mismo registró. Cuando el administrador accede a la consulta de ventas, el sistema deberá mostrar todas las ventas.'),
  rf('RF-07', 'Gestionar clientes', ['Administrador', 'Vendedor'],
    'Cuando el administrador o vendedor registra un cliente, el sistema deberá capturar sus datos. Cuando modifica un cliente, deberá actualizarlo. Cuando busca un cliente, deberá permitir búsqueda por nombre.')
];
const verbosPorRf = { 'RF-05': ['consultar', 'crear', 'editar', 'eliminar'], 'RF-04': ['consultar', 'eliminar', 'crear'], 'RF-07': ['consultar', 'crear', 'editar', 'eliminar'] };
const permisos = new AccessControlService().proponer({ requerimientos, verbosPorRf }).valor.permisos;
const de = (operacion) => permisos.find((item) => item.operacion === operacion && item.rol === 'vendedor');

test('el vendedor solo consulta productos: crear y editar están reservados al administrador', () => {
  expect(de('RF-05').metodos).toEqual(['GET']);
});

test('el vendedor ve solo sus propias ventas (alcance propios)', () => {
  expect(de('RF-04').alcance).toBe('propios');
  expect(permisos.find((item) => item.operacion === 'RF-04' && item.rol !== 'vendedor')).toBeUndefined();
});

test('sin reserva expresa, los verbos de los mockups se conservan (clientes)', () => {
  expect(de('RF-07').metodos).toEqual(['GET', 'POST', 'PATCH', 'DELETE']);
  expect(de('RF-07').alcance).toBe('todos');
});
