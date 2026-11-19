const task = require('../src/core/services/InitialAnalysisTasks');
const previous = { inventario: [{ id: 'N-01', tipo: 'pregunta', estado: 'pendiente', necesidad: '¿Seguridad y usabilidad?' }] };
const answer = 'Usaremos JWT. Aprender a consultar en una hora guiada.';
test('analiza la respuesta sin cambiar el inventario y rechaza evidencia ausente', async () => {
  const before = JSON.stringify(previous);
  const request = jest.fn().mockResolvedValue({ elementos: [{ tipo: 'restriccion_tecnica', necesidad: 'JWT', estado: 'confirmado', evidencia: 'Usaremos JWT.' }, { tipo: 'RNF', necesidad: 'Aprendizaje', estado: 'confirmado', evidencia: 'Aprender a consultar en una hora guiada.' }] });
  const result = await task({ task: 'analisis_respuesta', previous, questionId: 'N-01', answer, input: '', request });
  expect(result.elementos).toHaveLength(2); expect(JSON.stringify(previous)).toBe(before);
  await expect(task({ task: 'analisis_respuesta', previous, questionId: 'N-01', answer, input: '', request: jest.fn().mockResolvedValue({ elementos: [{ tipo: 'RNF', necesidad: 'Inventada', estado: 'confirmado', evidencia: 'No existe' }] }) })).rejects.toThrow('no es válida');
});
test('rechaza preguntas resueltas antes de consumir llamadas', async () => {
  const request = jest.fn();
  await expect(task({ task: 'analisis_respuesta', previous: { inventario: [] }, questionId: 'N-01', answer, request })).rejects.toThrow('pendiente');
  expect(request).not.toHaveBeenCalled();
});
