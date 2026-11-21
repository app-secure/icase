const { mergeSamePlatformApps, parse } = require('../src/core/services/NavigationTreeReview');

const tree = `@startwbs
* Sistema de Gestión de Ventas
** Aplicación Web Vendedor
*** Acceso
**** Inicio de sesión
*** Clientes
**** Clientes
**** Formulario de cliente
** Aplicación Web Administrador
*** Acceso
**** Inicio de sesión
*** Clientes
**** Clientes
**** Detalle de cliente
*** Usuarios
**** Usuarios
@endwbs`;

test('dos aplicaciones web por rol se unen en una sola, sin pantallas repetidas', () => {
  const { codigo, unidas } = mergeSamePlatformApps(tree);
  expect(unidas).toEqual(['Aplicación Web Administrador']);
  const nodes = parse(codigo);
  expect(nodes.filter((n) => n.level === 2).map((n) => n.name)).toEqual(['Aplicación Web']);
  expect(nodes.filter((n) => n.name === 'Inicio de sesión')).toHaveLength(1);
  expect(nodes.filter((n) => n.level === 4 && n.name === 'Clientes')).toHaveLength(1);
  expect(nodes.filter((n) => n.level === 4).map((n) => n.name)).toEqual(['Inicio de sesión', 'Clientes', 'Formulario de cliente', 'Detalle de cliente', 'Usuarios']);
  expect(codigo.startsWith('@startwbs')).toBe(true);
  expect(codigo.trim().endsWith('@endwbs')).toBe(true);
});

test('una aplicación web y otra móvil no se unen', () => {
  const mixed = tree.replace('Aplicación Web Administrador', 'Aplicación Móvil de Clientes');
  expect(mergeSamePlatformApps(mixed).unidas).toEqual([]);
});

test('«Módulo de Vendedor» y «Módulo de Administrador» con submódulos se aplanan sin repetir pantallas', () => {
  const roleTree = `@startwbs
* Sistema de Gestión de Ventas
** Aplicación Web
*** Acceso
**** Inicio de sesión
*** Módulo de Vendedor
**** Ventas
***** Ventas
***** Detalle de venta
**** Clientes
***** Clientes
*** Módulo de Administrador
**** Ventas
***** Ventas
***** Detalle de venta
***** Anulación de venta
**** Reportes
***** Reporte de ventas por fechas
@endwbs`;
  const { codigo, unidas } = mergeSamePlatformApps(roleTree);
  expect(unidas).toEqual(['Módulo de Vendedor', 'Módulo de Administrador']);
  const nodes = parse(codigo);
  expect(Math.max(...nodes.map((n) => n.level))).toBe(4);
  expect(nodes.filter((n) => n.level === 3).map((n) => n.name)).toEqual(['Acceso', 'Ventas', 'Clientes', 'Reportes']);
  expect(nodes.filter((n) => n.name === 'Detalle de venta')).toHaveLength(1);
  expect(nodes.filter((n) => n.name === 'Anulación de venta')).toHaveLength(1);
});

test('un módulo de rol con pantallas directas (restaurante) no se toca', () => {
  const flat = `@startwbs
* Restaurante
** Aplicación Web Interna
*** Módulo de Mesero
**** Mesas asignadas
*** Módulo de Caja
**** Cobros
@endwbs`;
  expect(mergeSamePlatformApps(flat).unidas).toEqual([]);
});

const { removeUnrequested } = require('../src/core/services/NavigationTreeReview');
const accountTree = `@startwbs
* Ventas
** Aplicación Web
*** Acceso
**** Inicio de sesión
**** Recuperación de contraseña
*** Clientes
**** Clientes
*** Configuración
**** Perfil de usuario
@endwbs`;

test('se quitan pantallas de cuenta que ningún RF pide, y el módulo que queda vacío', () => {
  const { codigo, quitadas } = removeUnrequested(accountTree, 'Gestionar clientes. Autenticar acceso según rol con usuario y contraseña.');
  expect(quitadas).toEqual(['Recuperación de contraseña', 'Perfil de usuario']);
  expect(codigo).not.toMatch(/Configuración/);
  expect(codigo).toMatch(/Inicio de sesión/);
  expect(codigo).toMatch(/\*\*\*\* Clientes/);
});

test('si un RF pide recuperar la contraseña, la pantalla se conserva', () => {
  expect(removeUnrequested(accountTree, 'El usuario puede recuperar su contraseña por correo. Editar su perfil.').quitadas).toEqual([]);
});
