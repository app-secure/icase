const Quality = require('../src/infrastructure/services/DomainModelQualityService');
const Validator = require('../src/infrastructure/services/PlantUMLValidatorService');
const quality = new Quality();

test('detecta cascarones sin inventar atributos ni invalidar conceptos mínimos', () => {
  const result = quality.validar('@startuml\nclass Solicitud {\n-id: String\n-estado: String\n}\n@enduml');
  expect(result.errores).toEqual([]);
  expect(result.advertencias.join(' ')).toContain('Solicitud');
  expect(quality.validar('class Solicitud {\n+id: String\n+fecha: DateTime\n}').advertencias).toEqual([]);
});

test('rechaza nombres o atributos duplicados para una extracción inequívoca', () => {
  const result = quality.validar('class Solicitud {\n+id: String\n+id: int\n}\nclass Solicitud');
  expect(result.errores).toHaveLength(2);
});

test('detecta atributos perdidos en diseño, admite entidad con sufijo Entity', () => {
  const source = 'class Solicitud {\n+id: String\n+fecha: DateTime\n}';
  expect(quality.comparar(source, 'class Solicitud {\n+id: String\n}').join(' ')).toContain('fecha');
  expect(quality.comparar(source, 'class SolicitudEntity {\n+id: String\n+fecha: DateTime\n}')).toEqual([]);
});

test('integra el control de extracción sin exigir un dominio específico', () => {
  const result = new Validator().validar('@startuml\nclass Solicitud\nclass Solicitante\nclass Expediente\nSolicitud -- Solicitante\nSolicitud -- Expediente\n@enduml', { tipo: 'clases_dominio' });
  expect(result.metricas.entidades_extraibles).toBe(3);
  expect(result.advertencias.join(' ')).toContain('Modelo de dominio por verificar');
});

test('una entidad completamente omitida no pasa inadvertida ni se sustituye por un DTO', () => {
  const source = 'class Solicitud {\n+id: String\n}\nclass Expediente {\n+id: String\n}\nSolicitud "1" -- "0..*" Expediente';
  const messages = quality.comparar(source, 'class Solicitud {\n+id: String\n}\nclass ExpedienteResponseDTO {\n+id: String\n}');
  expect(messages.join(' ')).toContain('falta una realización explícita de la entidad aprobada Expediente');
  expect(messages.join(' ')).toContain('relación aprobada Solicitud — Expediente');
  expect(quality.comparar(source, source.replace(/Solicitud/g, 'SolicitudEntity').replace(/Expediente/g, 'ExpedienteEntity'))).toEqual([]);
});
