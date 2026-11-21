const InitialAnalysisService = require('../src/core/services/InitialAnalysisService');

const input = 'La interfaz debe ser clara y con pocos pasos para vender. Se validan los datos de todas las operaciones de entrada.';
const content = { inventario: [
  { id: 'N022', tipo: 'RNF', estado: 'confirmado', necesidad: 'Interfaz clara con pocos pasos.', evidencia: 'La interfaz debe ser clara y con pocos pasos para vender.' },
  { id: 'N023', tipo: 'RNF', estado: 'confirmado', necesidad: 'Validar los datos de entrada.', evidencia: 'Se validan los datos de todas las operaciones de entrada.' }
] };

test('los RNF sin objetivo no generan el aviso «undefined: objetivo compartido»', () => {
  const Service = InitialAnalysisService.InitialAnalysisService || InitialAnalysisService;
  const result = Service.prototype.control.call({}, content, input);
  expect(JSON.stringify(result.advertencias || [])).not.toMatch(/undefined/);
});
