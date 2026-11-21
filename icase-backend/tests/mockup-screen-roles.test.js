const GenerarMockups = require('../src/core/use-cases/GenerarMockups');

const casosUso = `@startuml
actor "Administrador" as Admin
actor "Vendedor" as Vendedor
usecase "Registrar venta con selección de cliente" as UC01
usecase "Consultar ventas" as UC04
usecase "Gestionar clientes" as UC07
usecase "Anular venta con reversión de stock" as UC08
usecase "Visualizar productos con stock bajo" as UC09
usecase "Generar reporte de ventas por fechas" as UC10
usecase "Gestionar usuarios y roles" as UC13
Vendedor --> UC01
Admin --> UC01
Vendedor --> UC04
Admin --> UC04
Vendedor --> UC07
Admin --> UC07
Admin --> UC08
Admin --> UC09
Admin --> UC10
Admin --> UC13
@enduml`;
const arbol = `@startwbs
* Sistema de Gestión de Ventas
** Aplicación Web
*** Acceso
**** Inicio de sesión
*** Ventas
**** Ventas
**** Anulación de venta
*** Clientes
**** Clientes
*** Inventario
**** Productos con stock bajo
*** Reportes
**** Reporte de ventas por fechas
*** Usuarios
**** Usuarios
@endwbs`;

test('los roles de cada pantalla salen de los actores del proyecto, no de una lista fija', () => {
  const { pantallas } = new GenerarMockups({})._pantallasDelProyecto([
    { tipo: 'casos_de_uso', aprobado: true, codigo_plantuml: casosUso },
    { tipo: 'arbol_navegacion', aprobado: true, codigo_plantuml: arbol }
  ]);
  const roles = Object.fromEntries(pantallas.map((p) => [p.nombre, [...p.roles].sort()]));
  expect(roles['Ventas']).toEqual(['Administrador', 'Vendedor']);
  expect(roles['Clientes']).toEqual(['Administrador', 'Vendedor']);
  expect(roles['Anulación de venta']).toEqual(['Administrador']);
  expect(roles['Productos con stock bajo']).toEqual(['Administrador']);
  expect(roles['Reporte de ventas por fechas']).toEqual(['Administrador']);
  expect(roles['Usuarios']).toEqual(['Administrador']);
  expect(roles['Inicio de sesión']).toEqual(['Administrador', 'Vendedor']);
  expect(pantallas.some((p) => p.roles.includes('Cliente') || p.roles.includes('Usuario'))).toBe(false);
});
