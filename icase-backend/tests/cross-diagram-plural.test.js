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
