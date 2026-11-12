// Opt-in transport smoke test: synthetic data only, no project or database writes.
require('dotenv').config({ quiet: true });
if (!process.argv.includes('--run-real')) {
  console.log('Usa --run-real para autorizar una solicitud real con datos sintéticos.');
  process.exit(0);
}
(async () => {
  try {
    const model = (process.env.OPENROUTER_MODELS || 'nvidia/nemotron-3.5-super-vl:free').split(',')[0].trim();
    const policy = await require('../src/infrastructure/services/OpenRouterPolicy').parameters(model);
    const response = await require('axios').post('https://openrouter.ai/api/v1/chat/completions', {
      model, messages: [{ role: 'user', content: 'Return only this JSON object: {"ok":true}' }], max_tokens: 128, ...policy
    }, { headers: { Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}` }, timeout: 35000 });
    const content = JSON.parse((response.data.choices?.[0]?.message?.content || '').replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim());
    if (content.ok !== true) throw new Error('Contrato de prueba inválido');
    console.log(JSON.stringify({ estado: 'transporte_validado', modelo: response.data.model, uso: response.data.usage, calidad_semantica: 'no_evaluada' }));
  } catch (error) {
    console.log(JSON.stringify({ estado: 'no_validado', http: error.response?.status || null, codigo: error.code || null }));
    process.exitCode = 1;
  }
})();
