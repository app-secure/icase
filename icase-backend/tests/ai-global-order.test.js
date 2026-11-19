const config = require('../src/infrastructure/services/AiModelConfig');
const original = process.env.AI_PROVIDER_ORDER;
afterEach(() => { if (original === undefined) delete process.env.AI_PROVIDER_ORDER; else process.env.AI_PROVIDER_ORDER = original; });
test('todos los perfiles usan el mismo orden configurable sin duplicados', () => {
  process.env.AI_PROVIDER_ORDER = 'groq,openrouter,groq,gemini';
  expect(config.analysis.providerOrder()).toEqual(['groq', 'openrouter', 'gemini']);
  expect(config.mockups.providerOrder()).toEqual(config.requirements.order);
});
test('rechaza errores de configuración sin sustituir silenciosamente la política', () => {
  process.env.AI_PROVIDER_ORDER = 'openroute,gemini';
  expect(() => config.providerOrder()).toThrow('AI_PROVIDER_ORDER');
});
