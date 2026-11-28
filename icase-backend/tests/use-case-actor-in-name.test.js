const Validator = require('../src/infrastructure/services/DiagramSemanticValidatorService');

// Caso Restaurante: «Gestión de usuarios por administrador con asignación de roles» exigía dos palabras en el óvalo y contaba
// «administrador», que es el actor: «Gestionar usuarios» se rechazaba y el diagrama fallaba.
const rf = [{ tipo: 'RF', identificador: 'RF-02', prioridad: 'Alta', actores: ['Administrador'], aprobado: true,
  nombre: 'Gestión de usuarios por administrador con asignación de roles' }];
const diagrama = (caso) => `@startuml\nactor Administrador\nusecase "${caso}" as UC1\nAdministrador --> UC1\n@enduml`;

test('el nombre del actor no se exige dentro del caso de uso', () => {
  const resultado = new Validator().validar({ tipo: 'casos_de_uso', codigo: diagrama('Gestionar usuarios'), requisitos: rf });
  expect(resultado.errores.filter((error) => /RF-02/.test(error))).toEqual([]);
});

test('un caso ajeno sigue sin cubrir el requisito', () => {
  const resultado = new Validator().validar({ tipo: 'casos_de_uso', codigo: diagrama('Registrar cobro'), requisitos: rf });
  expect(resultado.errores.join(' ')).toMatch(/RF-02/);
});
