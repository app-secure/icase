// Caso Restaurante: los roles de cada pantalla salían del parecido de nombres con los casos de uso. «Pedidos listos para cobrar» quedaba
// del cocinero y «Formulario de mesa» (Módulo Administrador) del cliente y el mesero; de ahí salían menús y permisos equivocados.
const GenerarMockups = require('../src/core/use-cases/GenerarMockups');

const casos = { tipo: 'casos_de_uso', aprobado: true, codigo_plantuml: `@startuml
actor "Cliente" as C
actor "Mesero" as M
actor "Cocinero" as K
actor "Cajero" as J
actor "Administrador" as A
usecase "Marcar pedido como listo" as U1
usecase "Registrar cobro de pedido" as U2
usecase "Consultar mesas asignadas" as U3
K --> U1
J --> U2
M --> U3
@enduml` };
const generador = () => { const g = new GenerarMockups({}); g._cargarActoresCasosUso([casos]); return g; };

test.each([
  [['Sistema', 'Aplicación Web Interna', 'Módulo Cajero', 'Pedidos listos para cobrar'], ['Cajero']],
  [['Sistema', 'Aplicación Web Interna', 'Módulo Administrador', 'Formulario de mesa'], ['Administrador']],
  [['Sistema', 'Aplicación Móvil de Clientes', 'Acceso', 'Registro de cuenta'], ['Cliente']]
])('la rama que nombra al actor decide el rol: %j', (ruta, roles) => {
  expect(generador()._inferirRoles(ruta)).toEqual(roles);
});

test('sin una rama que nombre a un actor se conserva la inferencia por casos de uso', () => {
  expect(generador()._inferirRoles(['Sistema', 'Aplicación Web Interna', 'Cobros', 'Registrar cobro de pedido'])).toEqual(['Cajero']);
});
