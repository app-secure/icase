const Validator = require('../src/infrastructure/services/ArquitecturaSoftwareValidatorService');
const Procesar = require('../src/core/use-cases/ProcesarConIA');
const PlantValidator = require('../src/infrastructure/services/PlantUMLValidatorService');
const code = description => `@startuml\n!include <C4/C4_Container>\nContainer(api, "Backend", "NestJS", "${description}")\nContainer(web, "Web", "React", "Canal operativo")\nRel(web, api, "Consulta", "HTTPS")\n@enduml`;

test('una lista o rango de RF no sustituye responsabilidades', () => {
  const validator = new Validator();
  expect(validator.validar({ codigo: code('Realiza RF-01, RF-03, RF-04') }).errores.join(' ')).toContain('Claridad funcional');
  expect(validator.validar({ codigo: code('Procesa RF-01 a RF-23') }).valido).toBe(false);
  expect(validator.validar({ codigo: code('Reservas, pedidos y cobros (RF-01, RF-03)') }).valido).toBe(true);
});

test('Socket.IO confirmado puede estar integrado, no exige otro contenedor', () => {
  const validator = new Validator();
  const analysis = { restricciones_tecnicas: [{ estado: 'confirmado', necesidad: 'Socket.IO para sincronización' }] };
  expect(validator.validar({ codigo: code('Reservas y pedidos'), analisisRequisitos: analysis }).advertencias.join(' ')).toContain('Socket.IO');
  expect(validator.validar({ codigo: code('Reservas y pedidos con Socket.IO'), analisisRequisitos: analysis }).advertencias).toEqual([]);
  expect(validator.validar({ codigo: code('Reservas y pedidos'), analisisRequisitos: { decisiones: [{ estado: 'pendiente', necesidad: '¿Socket.IO?' }] } }).advertencias).toEqual([]);
});

test('el flujo solicita reparación para claridad y tecnología confirmada', () => {
  const useCase = new Procesar({ plantumlValidatorService: new PlantValidator() });
  const data = description => ({ diagramas: [{ tipo: 'arquitectura_software', codigo_plantuml: code(description) }] });
  expect(useCase._detectarProblemasDiagrama(data('Procesa RF-01 a RF-23'), 'arquitectura_software', [], [])).toContain('Claridad funcional');
  expect(useCase._detectarProblemasDiagrama(data('Reservas'), 'arquitectura_software', [], [], { decisiones: [{ estado: 'confirmado', necesidad: 'Socket.IO' }] })).toContain('Socket.IO');
});
