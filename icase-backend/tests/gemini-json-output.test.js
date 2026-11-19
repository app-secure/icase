const axios = require('axios');
const ModelosIaService = require('../src/infrastructure/services/ModelosIaService');

afterEach(() => jest.restoreAllMocks());
function service() {
  const result = new ModelosIaService();
  result.geminiApiKey = 'test-only';
  result.models.gemini = ['test-model'];
  return result;
}
test('un MAX_TOKENS nunca se anuncia como generación exitosa', async () => {
  jest.spyOn(axios, 'post').mockResolvedValue({ data: { candidates: [{ finishReason: 'MAX_TOKENS', content: { parts: [{ text: '{"requerimientos":[' }] } }] } });
  const log = jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  await expect(service().generarConGemini('prueba', null, { allowFallback: true })).resolves.toBeNull();
  expect(log.mock.calls.flat().join(' ')).not.toContain('Generación exitosa');
});
test('JSON inválido no se anuncia como éxito', async () => {
  jest.spyOn(axios, 'post').mockResolvedValue({ data: { candidates: [{ finishReason: 'STOP', content: { parts: [{ text: '{incorrecto}' }] } }] } });
  const log = jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  await expect(service().generarConGemini('prueba', null, { allowFallback: true })).resolves.toBeNull();
  expect(log.mock.calls.flat().join(' ')).not.toContain('Generación exitosa');
});
test('concatena partes de texto y descarta partes de razonamiento', async () => {
  jest.spyOn(axios, 'post').mockResolvedValue({ data: { candidates: [{ finishReason: 'STOP', content: { parts: [{ thought: true, text: 'razonamiento' }, { text: '{"ok":' }, { text: 'true}' }] } }] } });
  await expect(service().generarConGemini('prueba')).resolves.toEqual({ ok: true });
});
