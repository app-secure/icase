jest.mock('axios', () => ({ post: jest.fn(async (url, data, config) => ({ data: {}, config })), get: jest.fn() }));
const axios = require('axios');
const AiRequestBudget = require('../src/infrastructure/services/AiRequestBudget');

const env = { AI_REQUIREMENTS_REQUEST_TIMEOUT_MS: '45000', AI_REQUIREMENTS_TIMEOUT_MS: '420000' };

test('Bedrock conserva su límite largo dentro del presupuesto de requisitos', async () => {
  const budget = new AiRequestBudget();
  await budget.run(async () => { await budget.post('https://bedrock-runtime.us-east-2.amazonaws.com/model/x/converse', {}, { timeout: 180000 }); return {}; }, env);
  expect(axios.post.mock.calls.at(-1)[2].timeout).toBeGreaterThan(170000);
});

test('los proveedores gratuitos siguen limitados a la solicitud configurada', async () => {
  const budget = new AiRequestBudget();
  await budget.run(async () => { await budget.post('https://openrouter.ai/api/v1/chat/completions', {}, { timeout: 180000 }); return {}; }, env);
  expect(axios.post.mock.calls.at(-1)[2].timeout).toBe(45000);
});
