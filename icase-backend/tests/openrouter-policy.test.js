jest.mock('axios', () => ({ get: jest.fn() }));
const axios = require('axios');
beforeEach(() => { jest.resetModules(); });
test('modelo gratuito sin JSON nativo conserva protección de precio', async () => {
  const transport = { get: jest.fn(async () => ({ data: { data: [{ id: 'example:free', pricing: { prompt: '0', completion: '0' }, supported_parameters: [] }] } })) };
  const result = await require('../src/infrastructure/services/OpenRouterPolicy').parameters('example:free', transport);
  expect(result.response_format).toBeUndefined();
  expect(result.provider.max_price).toEqual({ prompt: 0, completion: 0 });
});
test('rechaza coste no confirmado sin llamar al endpoint de generación', async () => {
  const transport = { get: jest.fn(async () => ({ data: { data: [{ id: 'example:free', pricing: { prompt: '1', completion: '0' } }] } })) };
  await expect(require('../src/infrastructure/services/OpenRouterPolicy').parameters('example:free', transport)).rejects.toThrow('coste');
});
test('activa JSON únicamente si el catálogo lo admite', async () => {
  const transport = { get: jest.fn(async () => ({ data: { data: [{ id: 'example:free', pricing: { prompt: '0', completion: '0' }, supported_parameters: ['response_format'] }] } })) };
  expect((await require('../src/infrastructure/services/OpenRouterPolicy').parameters('example:free', transport)).response_format).toEqual({ type: 'json_object' });
});
