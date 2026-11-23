const Validator = require('../src/infrastructure/services/CrossDiagramConsistencyValidatorService');

test('«Gestionar clientes» se reconoce en ClienteController/RegistrarClienteUseCase', () => {
  const v = new Validator();
  const result = v.resultadoCobertura({
    elementos: ['Gestionar clientes'],
    candidatos: ['ClienteController', 'RegistrarClienteUseCase', 'registrarCliente'],
    metrica: 'cobertura', etiqueta: 'casos de uso', umbralError: 0.5, soloAdvertencias: true
  });
  expect(result.advertencias).toEqual([]);
});

describe('arquitectura de sistema frente a contenedores lógicos', () => {
  const CrossDiagramConsistencyValidatorService = require('../src/infrastructure/services/CrossDiagramConsistencyValidatorService');
  test('«Servicio de X» (parte lógica del backend) no se exige como unidad de despliegue', () => {
    const nl = String.fromCharCode(10);
    const software = ['@startuml', 'Container(web, "Aplicación Web", "React", "Interfaz")', 'Container(api, "API REST", "Node.js", "Backend")', 'ContainerDb(db, "Base de datos", "PostgreSQL", "Datos")',
      'Container(s1, "Servicio de Catálogo", "Express", "x")', 'Container(s2, "Servicio de Alertas", "Express", "x")', 'Container(s3, "Servicio de Autenticación", "Express", "x")', '@enduml'].join(nl);
    const sistema = ['@startuml', 'Deployment_Node(srv, "Servidor único", "Linux") {', 'Container(web, "Aplicación Web", "React")', 'Container(api, "API REST", "Node.js")', 'ContainerDb(db, "Base de datos", "PostgreSQL")', '}', '@enduml'].join(nl);
    const result = new CrossDiagramConsistencyValidatorService().validarDespliegue(sistema, [{ tipo: 'arquitectura_software', aprobado: true, estado: 'aprobado', desactualizado: false, codigo_plantuml: software }]);
    expect(result.errores).toEqual([]);
  });
});
