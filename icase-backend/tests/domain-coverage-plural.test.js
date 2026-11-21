const Validator = require('../src/infrastructure/services/DiagramSemanticValidatorService');

const codigo = `@startuml
class Cliente {
  +String nombre
}
class Producto {
  +String codigo
}
@enduml`;

test('«Gestionar clientes» se reconoce en la clase Cliente (plural en -es tras vocal)', () => {
  const result = new Validator().validarClasesDominio(codigo, [
    { identificador: 'RF-07', nombre: 'Gestionar clientes', prioridad: 'Alta' },
    { identificador: 'RF-05', nombre: 'Gestionar productos', prioridad: 'Alta' }
  ]);
  expect(result.advertencias.join(' ')).not.toMatch(/RF-07|RF-05/);
});
