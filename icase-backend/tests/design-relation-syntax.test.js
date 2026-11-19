const Validator = require('../src/infrastructure/services/ClasesDisenoValidatorService');
const Generate = require('../src/core/use-cases/ProcesarConIA');
const PlantValidator = require('../src/infrastructure/services/PlantUMLValidatorService');

const code = relation => `@startuml
package "Aplicación" {
class PedidoController
class CrearPedidoUseCase
interface IPedidoRepository
class SqlPedidoRepository
class Pedido
class PedidoDTO
class Plato
class DetallePedido
}
PedidoController --> CrearPedidoUseCase
CrearPedidoUseCase ..> IPedidoRepository
SqlPedidoRepository ..|> IPedidoRepository
${relation}
note top of PedidoController : RF-01
@enduml`;

test.each(['Plato "1" -- "0..*": corresponde', 'Plato --> : usa', 'Plato ..>'])('rechaza relación sin destino: %s', relation => {
  const result = new Validator().validar(code(relation));
  expect(result.valido).toBe(false);
  expect(result.error).toContain('Falta la clase destino');
  expect(result.error).toContain('línea');
});

test.each(['Plato "1" -- "0..*" DetallePedido : corresponde', 'Plato --> DetallePedido', 'Plato ..> DetallePedido : usa', 'Plato -[hidden]-> DetallePedido'])('acepta relación completa: %s', relation => {
  expect(new Validator().validar(code(relation)).valido).toBe(true);
});

test('no interpreta comentarios ni notas como relaciones', () => {
  expect(new Validator().validar(code("' Plato -->\nnote right of Plato\nPlato -->\nend note\n/'\nPlato -->\n'/")).valido).toBe(true);
});

test('la relación inválida llega al mecanismo de reparación del flujo', () => {
  const generator = new Generate({ plantumlValidatorService: new PlantValidator() });
  expect(generator._detectarProblemasDiagrama({ diagramas: [{ tipo: 'clases_diseno', codigo_plantuml: code('Plato "1" -- "0..*": corresponde') }] }, 'clases_diseno', [], [])).toContain('Falta la clase destino');
});
