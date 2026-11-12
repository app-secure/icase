function listaEnv(nombre, fallback = '') {
  return String(process.env[nombre] ?? fallback)
    .split(',')
    .map(valor => valor.trim())
    .filter(Boolean);
}

function modelosConPreferencia(modeloSolicitado, modelosConfigurados) {
  return [...new Set([modeloSolicitado, ...modelosConfigurados].filter(Boolean))];
}

module.exports = {
  requirements: {
    version: 'requirements-router-v1',
    order: ['gemini', 'groq', 'openrouter', 'ollama'],
    models: {
      gemini: [{ id: 'gemini-3.5-flash-lite', context: 1048576, output: 8192, json: true }, { id: 'gemini-3.8-flash', context: 1048576, output: 8192, json: true }],
      groq: [{ id: 'openai/gpt-oss-120b', context: 131072, output: 8192, json: true }, { id: 'openai/gpt-oss-20b', context: 131072, output: 8192, json: true }],
      openrouter: [{ id: 'qwen/qwen3.6-plus:free', context: 131072, output: 8192, json: true }, { id: 'openai/gpt-oss-120b:free', context: 131072, output: 8192, json: true }],
      ollama: [{ id: 'qwen3:8b', context: 8192, output: 2048, json: true }]
    },
    excluded: { openai: ['gpt-5.4-mini', 'gpt-5-mini'], deepseek: ['deepseek-flash', 'deepseek-v4-pro'], siliconflow: ['Qwen/Qwen3-8B'] }
  },
  listaEnv,
  modelosConPreferencia,
  analysis: {
    gemini: () => listaEnv('GEMINI_ANALYSIS_MODELS', 'gemini-3.5-flash-lite,gemini-3.8-flash'),
    groq: () => listaEnv('GROQ_ANALYSIS_MODELS', 'openai/gpt-oss-120b'),
    openrouter: () => listaEnv('OPENROUTER_ANALYSIS_MODELS', ''),
    openai: () => listaEnv('OPENAI_ANALYSIS_MODELS', 'gpt-5-mini'),
    providerOrder: () => listaEnv('AI_PROVIDER_ORDER', 'gemini,openai,deepseek,groq,openrouter')
  },
  ingestion: {
    gemini: () => listaEnv('GEMINI_INGESTION_MODELS', 'gemini-3.5-flash-lite,gemini-3.8-flash'),
    whisper: () => process.env.GROQ_WHISPER_MODEL || 'whisper-large-v3-turbo'
  },
  mockups: {
    gemini: () => listaEnv('GEMINI_MOCKUP_MODELS', 'gemini-3.5-flash-lite,gemini-3.8-flash'),
    groq: () => listaEnv('GROQ_MOCKUP_MODELS', 'openai/gpt-oss-120b'),
    openrouter: () => listaEnv('OPENROUTER_MOCKUP_MODELS', ''),
    providerOrder: () => listaEnv('MOCKUP_PROVIDER_ORDER', 'gemini,groq,openrouter')
  }
};
