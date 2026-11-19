const Validator = require('../src/infrastructure/services/ArquitecturaSoftwareValidatorService');
const Cross = require('../src/infrastructure/services/CrossDiagramConsistencyValidatorService');
const Modelos = require('../src/infrastructure/services/ModelosIaService');
const Procesar = require('../src/core/use-cases/ProcesarConIA');
const Plant = require('../src/infrastructure/services/PlantUMLValidatorService');
const requirements = [{ tipo: 'RF', aprobado: true, identificador: 'RF-01', nombre: 'Gestionar préstamos' }];
const code = '@startuml\n!include <C4/C4_Container>\nContainer(apiMain, "API Backend", "NestJS / Socket.IO", "Logica de negocio, autenticacion JWT y tiempo real")\nContainerDb(db, "Datos", "PostgreSQL 16 / Prisma", "Persistencia")\nRel(apiMain, db, "Lee y escribe", "TCP")\n@enduml';
const note = '\nnote right of apiMain\n  Consultar prestamos y renovar ejemplares.\nend note\n';
const useCases = [{ tipo: 'casos_de_uso', aprobado: true, codigo_plantuml: '@startuml\nusecase "Consultar préstamos\\n[RF-01]" as UC1\nusecase "Renovar ejemplares\\n[RF-02]" as UC2\n@enduml' }];

test('detecta backend genérico y ORM en motor, sin imponer otro contenedor', () => {
  const result = new Validator().validar({ codigo: code, requisitos: requirements });
  expect(result.valido).toBe(true);
  expect(result.advertencias.join(' ')).toContain('solo describe responsabilidades genéricas');
  expect(result.advertencias.join(' ')).toContain('sitúa un ORM');
  const fixed = code.replace('NestJS / Socket.IO', 'NestJS / Socket.IO / Prisma').replace('PostgreSQL 16 / Prisma', 'PostgreSQL 16').replace('@enduml', `${note}@enduml`);
  expect(new Validator().validar({ codigo: fixed, requisitos: requirements }).advertencias).toEqual([]);
});

test('notas vinculadas acreditan correspondencia léxica, sin exigir contenedores por función', () => {
  const result = new Cross().validar({ tipo: 'arquitectura_software', codigo: code.replace('@enduml', `${note}@enduml`), diagramasDependencia: useCases });
  expect(result.valido).toBe(true);
  expect(result.metricas.casos_uso_representados_arquitectura_porcentaje).toBe(100);
  const orphan = new Cross().validar({ tipo: 'arquitectura_software', codigo: code.replace('@enduml', `${note.replace('apiMain', 'inexistente')}@enduml`), diagramasDependencia: useCases });
  expect(orphan.metricas.casos_uso_representados_arquitectura).toBe(0);
});

test('mencionar solo RF en una nota no acredita capacidades', () => {
  const result = new Cross().validar({ tipo: 'arquitectura_software', codigo: code.replace('@enduml', '\nnote right of apiMain : RF-01, RF-02\n@enduml'), diagramasDependencia: useCases });
  expect(result.metricas.casos_uso_representados_arquitectura).toBe(0);
});

test('un backend solo de autenticación no exige capacidades de negocio inventadas', () => {
  const result = new Validator().validar({ codigo: code.replace('PostgreSQL 16 / Prisma', 'PostgreSQL 16'), requisitos: [{ tipo: 'RF', nombre: 'Autenticar usuarios' }] });
  expect(result.advertencias.join(' ')).not.toContain('solo describe responsabilidades genéricas');
});

test('los avisos funcionales y RNF sin mapeo se envían a reparación acotada', () => {
  const service = new Procesar({ plantumlValidatorService: new Plant() });
  const result = service._detectarProblemasDiagrama({ diagramas: [{ tipo: 'arquitectura_software', codigo_plantuml: code }] }, 'arquitectura_software', [...requirements, { tipo: 'RNF', identificador: 'RNF-06', nombre: 'Seguridad' }], []);
  expect(result).toContain('solo describe responsabilidades genéricas');
  expect(result).toContain('RNF-06 no tiene trazabilidad');
});

test('el prompt efectivo permite notas sin cuotas contradictorias y conserva decisiones confirmadas', () => {
  const prompt = new Modelos({ env: {} }).construirPrompt({ objetivo: 'diagramas', tipoDiagrama: 'arquitectura_software', contextoActualTexto: 'Redis confirmado para caché; Prisma en el backend.' });
  expect(prompt).toContain('note right of alias');
  expect(prompt).toContain('el ORM/cliente de persistencia se ejecuta en el backend');
  expect(prompt).toContain('Redis confirmado');
  expect(prompt).not.toContain('descripciones máximo 80');
});
