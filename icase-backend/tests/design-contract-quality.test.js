const Validator = require('../src/infrastructure/services/ClasesDisenoValidatorService');
const Plant = require('../src/infrastructure/services/PlantUMLValidatorService');
const Procesar = require('../src/core/use-cases/ProcesarConIA');
const Modelos = require('../src/infrastructure/services/ModelosIaService');
const code = `@startuml
package "Aplicacion" {
class EntradaController {
+consultar(): Promise<RespuestaDTO>
}
class ConsultarUseCase {
+ejecutar(): Promise<RespuestaDTO>
}
interface IRegistroRepository {
+listar(): Promise<Registro[]>
}
class SqlRegistroRepository implements IRegistroRepository {}
class Registro {
+String nombre
}
class SolicitudDTO {
+List<DetalleDTO> detalles
}
}
EntradaController ..> ConsultarUseCase
SqlRegistroRepository ..|> IRegistroRepository
note bottom of ConsultarUseCase : RF-01. Sin puerto propio: la operación no declara persistencia adicional.
@enduml`;

test('detecta DTO ausentes en respuestas y colecciones sin fabricarlos', () => {
  const result = new Validator().validar(code);
  expect(result.valido).toBe(true);
  expect(result.advertencias.join(' ')).toContain('RespuestaDTO, DetalleDTO');
  expect(result.advertencias.join(' ')).toContain('ConsultarUseCase no declara dependencias');
});
test('DTO concretos y un puerto reutilizado resuelven los avisos estructurales', () => {
  const fixed = code.replace('@enduml', 'class RespuestaDTO {\n+String nombre\n}\nclass DetalleDTO {\n+int cantidad\n}\nConsultarUseCase --> IRegistroRepository\n@enduml');
  expect(new Validator().validar(fixed).advertencias).toEqual([]);
});
test('acepta dependencia inyectada o cálculo puro justificado sin exigir otro repositorio', () => {
  const injected = code.replace('class ConsultarUseCase {', 'class ConsultarUseCase {\n-repository: IRegistroRepository');
  expect(new Validator().validar(injected).advertencias.join(' ')).not.toContain('no declara dependencias');
  const pure = code.replace('RF-01. Sin puerto propio: la operación no declara persistencia adicional.', 'RF-01. Operación pura: transforma los valores de entrada sin leer ni escribir datos externos.');
  expect(new Validator().validar(pure).advertencias.join(' ')).not.toContain('no declara dependencias');
});
test('los DTO mencionados solo en comentarios o notas no cuentan como tipos usados', () => {
  const result = new Validator().validar(code.replace('+List<DetalleDTO> detalles', "' DetalleImaginarioDTO\n+String nombre").replace('@enduml', 'note top of Registro : OtraRespuestaDTO\n@enduml'));
  expect(result.advertencias.join(' ')).not.toContain('DetalleImaginarioDTO');
  expect(result.advertencias.join(' ')).not.toContain('OtraRespuestaDTO');
});
test('envía las carencias a reparación acotada sin bloquear por una sospecha semántica', () => {
  const service = new Procesar({ plantumlValidatorService: new Plant() });
  const result = service._detectarProblemasDiagrama({ diagramas: [{ tipo: 'clases_diseno', codigo_plantuml: code }] }, 'clases_diseno', [], []);
  expect(result).toContain('DTO referenciados sin declaración');
  expect(result).toContain('no declara dependencias');
});
test('el prompt exige firmas completas, consistencia y dependencias sin módulos de un sector', () => {
  const prompt = new Modelos({ env: {} }).construirPrompt({ objetivo: 'diagramas', tipoDiagrama: 'clases_diseno' });
  for (const text of ['Verifica cierre de tipos', 'límite transaccional', 'prevención de doble ejecución', 'contexto autenticado', 'después de confirmar cambios', 'ejecutores de reglas temporales']) expect(prompt).toContain(text);
  expect(prompt).not.toContain('Almuerzo');
});
test('copiar atributos sin comportamiento del dominio no oculta las operaciones perdidas', () => {
  const quality = new (require('../src/infrastructure/services/DomainModelQualityService'))();
  const domain = 'class Solicitud {\n+String nombre\n+liberar(): void\n}';
  const design = 'class SolicitudEntity {\n+String nombre\n}';
  expect(quality.comparar(domain, design).join(' ')).toContain('liberar');
  expect(quality.comparar(domain, design.replace('+String nombre', '+String nombre\n+liberar(): void'))).toEqual([]);
});
