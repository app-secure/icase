// Caso Restaurante: un pedido tiene mesero y cliente (ambos cuentas). El extractor generaba una sola clave usuario_id y se perdía uno.
const Extractor = require('../src/infrastructure/services/DomainModelExtractor');

const modelo = new Extractor().extract(`@startuml
class Usuario {
  +String id
  +String nombre
}
class Mesa {
  +int numero
  +Usuario mesero
}
class Pedido {
  +Mesa mesa
  +Usuario mesero
  +Usuario? cliente
}
class Paquete {
  +int saldo
}
Usuario "1" -- "0..*" Mesa : atiende
Usuario "1" -- "0..*" Pedido : registra
Usuario "1" -- "0..*" Paquete : posee
@enduml`);
const campos = (nombre) => modelo.entities.find((item) => item.name === nombre).references.map((item) => `${item.field}:${item.entity}`).sort();

test('cada papel sobre la cuenta es su propia clave', () => {
  expect(campos('Pedido')).toEqual(['cliente_id:Usuario', 'mesa_id:Mesa', 'mesero_id:Usuario']);
  expect(campos('Mesa')).toEqual(['mesero_id:Usuario']);
});

test('sin atributo, la relación conserva la clave por el nombre de la entidad', () => {
  expect(campos('Paquete')).toEqual(['usuario_id:Usuario']);
});
