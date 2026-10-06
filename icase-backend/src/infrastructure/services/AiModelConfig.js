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
  listaEnv,
  modelosConPreferencia,
  analysis: {
    gemini: () => listaEnv('GEMINI_ANALYSIS_MODELS', 'gemini-3.5-flash-lite,gemini-3.8-flash'),
    groq: () => listaEnv('GROQ_ANALYSIS_MODELS', 'openai/gpt-oss-120b'),
    openrouter: () => listaEnv('OPENROUTER_ANALYSIS_MODELS', ''),
    providerOrder: () => listaEnv('AI_PROVIDER_ORDER', 'gemini,deepseek,groq,openrouter')
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
