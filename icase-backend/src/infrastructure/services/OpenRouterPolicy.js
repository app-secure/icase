const axios = require('axios');
let cache;
async function parameters(model, transport = axios) {
  if (!cache || cache.until < Date.now()) {
    const response = await transport.get('https://openrouter.ai/api/v1/models', { timeout: 8000 });
    cache = { until: Date.now() + 300000, models: response.data.data || [] };
  }
  const entry = cache.models.find(item => item.id === model);
  if (!entry || !model.endsWith(':free') || Number(entry.pricing?.prompt) !== 0 || Number(entry.pricing?.completion) !== 0) {
    throw new Error('OpenRouter: modelo ausente o coste gratuito no confirmado.');
  }
  return {
    provider: { require_parameters: true, max_price: { prompt: 0, completion: 0 } },
    ...((entry.supported_parameters || []).includes('response_format') ? { response_format: { type: 'json_object' } } : {})
  };
}
module.exports = { parameters };
