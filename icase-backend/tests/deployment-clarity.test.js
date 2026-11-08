const Validator = require('../src/infrastructure/services/ArquitecturaSistemaValidatorService');
const base = content => `@startuml\n!include <C4/C4_Deployment>\nDeployment_Node(app, "Servidor", "Por definir") {\nContainer(api, "Backend", "NestJS, Prisma", "Operaciones")\n}\n${content}\n@enduml`;
const validator = new Validator();

test('el ORM puede estar en backend pero no se confunde con el motor o protocolo', () => {
  const result = validator.validar({ codigo: base('ContainerDb(db, "Datos", "PostgreSQL, Prisma", "Persistencia")\nRel(api, db, "Prisma / SQL", "Red interna")') });
  expect(result.advertencias.filter(w => w.startsWith('Despliegue por verificar:'))).toHaveLength(2);
  expect(validator.validar({ codigo: base('ContainerDb(db, "Datos", "PostgreSQL", "Persistencia")\nRel(api, db, "Lee y escribe", "Canal por definir")') }).advertencias).toEqual([]);
});

test('respaldo aprobado sin representación pide revisión, no inventa HA', () => {
  const requisitos = [{ tipo: 'RF', nombre: 'Gestionar copias de seguridad', aprobado: true }];
  const result = validator.validar({ codigo: base(''), requisitos });
  expect(result.advertencias.join(' ')).toContain('respaldos');
  expect(result.valido).toBe(true);
  expect(result.alta_disponibilidad_solicitada).toBe(false);
  expect(validator.validar({ codigo: base('note right of api : Respaldo y recuperación: destino por definir'), requisitos }).advertencias).toEqual([]);
  expect(validator.validar({ codigo: base(''), requisitos: [{ ...requisitos[0], aprobado: false }] }).advertencias).toEqual([]);
});
