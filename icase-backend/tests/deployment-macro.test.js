const Modelos = require('../src/infrastructure/services/ModelosIaService');
const Validator = require('../src/infrastructure/services/ArquitecturaSistemaValidatorService');
const code = '@startuml\n!include <C4/C4_Deployment>\nkiosk_or_tablet(tablet, "Tableta", "Dispositivo") {\nContainer(web, "Aplicación Web Interna", "React", "Sala")\n}\n@enduml';
test('repara el alias inexistente conservando contenido y referencias', () => {
  const result = new Modelos({ env: {} }).normalizarResultado({ diagramas: [{ tipo: 'arquitectura_sistema', codigo_plantuml: code }] }, 'diagramas', 'arquitectura_sistema');
  expect(result.diagramas[0].codigo_plantuml).toBe(code.replace('kiosk_or_tablet(', 'Deployment_Node('));
});
test('el validador explica el error en código que no pasó por normalización', () => {
  expect(new Validator().validar({ codigo: code }).errores.join(' ')).toContain('Macro PlantUML no definida');
});
test('no cambia una macro personalizada definida explícitamente', () => {
  const custom = code.replace('kiosk_or_tablet(tablet', '!procedure kiosk_or_tablet($alias, $label, $type)\n!endprocedure\nkiosk_or_tablet(tablet');
  expect(new Validator().validar({ codigo: custom }).errores.join(' ')).not.toContain('Macro PlantUML no definida');
});
