const { asegurarAsociacionesCasosUso } = require('../src/core/use-cases/ProcesarConIA');

const plantuml = `@startuml
actor "Administrador" as Admin
actor "Vendedor" as Vendedor
rectangle "Sistema" {
  usecase "Registrar venta" as UC01
  usecase "Emitir factura interna con IGV" as UC03
}
Vendedor --> UC01
Admin --> UC03
note right of UC03
  RF-03: Emitir factura interna
end note
@enduml`;
const requisitos = [
  { tipo: 'RF', identificador: 'RF-01', nombre: 'Registrar venta', actores: ['Vendedor'] },
  { tipo: 'RF', identificador: 'RF-03', nombre: 'Emitir factura interna, con número correlativo', actores: ['Vendedor', 'Administrador'] }
];

test('añade la asociación de un actor del RF que la IA omitió (Vendedor → Emitir factura)', () => {
  const [diagram] = asegurarAsociacionesCasosUso([{ tipo: 'casos_de_uso', codigo_plantuml: plantuml }], requisitos);
  expect(diagram.codigo_plantuml).toMatch(/Vendedor --> UC03/);
  expect(diagram.codigo_plantuml.match(/Vendedor --> UC01/g)).toHaveLength(1);
  expect(diagram.codigo_plantuml.match(/Admin --> UC03/g)).toHaveLength(1);
  expect(diagram.codigo_plantuml.trim().endsWith('@enduml')).toBe(true);
});

test('si todas las asociaciones existen, el diagrama no cambia', () => {
  const complete = plantuml.replace('Admin --> UC03', 'Admin --> UC03\nVendedor --> UC03');
  const [diagram] = asegurarAsociacionesCasosUso([{ tipo: 'casos_de_uso', codigo_plantuml: complete }], requisitos);
  expect(diagram.codigo_plantuml).toBe(complete);
});

test('si un RF quedó repartido en varios casos, no se concede el actor a todos (el vendedor solo consulta)', () => {
  const split = `@startuml
actor "Administrador" as Admin
actor "Vendedor" as Vendedor
usecase "Crear producto" as UC05
usecase "Consultar catálogo de productos" as UC06
Admin --> UC05
Admin --> UC06
Vendedor --> UC06
note right of UC05
  RF-05: Gestionar productos
end note
note right of UC06
  RF-05: consulta del catálogo
end note
@enduml`;
  const reqs = [{ tipo: 'RF', identificador: 'RF-05', nombre: 'Gestionar productos', actores: ['Administrador', 'Vendedor'] }];
  const [diagram] = asegurarAsociacionesCasosUso([{ tipo: 'casos_de_uso', codigo_plantuml: split }], reqs);
  expect(diagram.codigo_plantuml).not.toMatch(/Vendedor --> UC05/);
});
