function listaEnv(nombre, fallback = '') {
  return String(process.env[nombre] ?? fallback)
    .split(',')
    .map(valor => valor.trim())
    .filter(Boolean);
}

function modelosConPreferencia(modeloSolicitado, modelosConfigurados) {
  return [...new Set([modeloSolicitado, ...modelosConfigurados].filter(Boolean))];
}
function providerOrder(variable = 'AI_PROVIDER_ORDER') {
  const values = listaEnv(variable, process.env.AI_PROVIDER_ORDER || 'openrouter,gemini,groq');
  const known = new Set(['openrouter', 'gemini', 'groq', 'ollama', 'openai', 'deepseek', 'bedrock']);
  if (!values.length || values.some(value => !known.has(value))) throw new Error('AI_PROVIDER_ORDER contiene proveedores inválidos o está vacío.');
  return [...new Set(values)];
}
function openrouterModels(legacy) { return listaEnv('OPENROUTER_MODELS', process.env[legacy] || 'nvidia/nemotron-3.5-super-vl:free'); }

module.exports = {
  requirements: {
    version: 'requirements-router-v1',
    get order() { return providerOrder(); },
    models: {
      gemini: [{ id: 'gemini-3.5-flash-lite', context: 1048576, output: 8192, json: true }, { id: 'gemini-3.8-flash', context: 1048576, output: 8192, json: true }],
      groq: [{ id: 'openai/gpt-oss-120b', context: 131072, output: 8192, json: true }, { id: 'openai/gpt-oss-20b', context: 131072, output: 8192, json: true }],
      get openrouter() { return openrouterModels('OPENROUTER_ANALYSIS_MODELS').map(id => ({ id, context: 131072, output: 8192, json: true })); },
      get ollama() { return listaEnv('OLLAMA_REQUIREMENTS_MODELS', 'qwen3:8b').map(id => ({ id, context: 8192, output: 2048, json: true })); }
    },
    excluded: { openai: ['gpt-5.4-mini', 'gpt-5-mini'], deepseek: ['deepseek-flash', 'deepseek-v4-pro'], siliconflow: ['Qwen/Qwen3-8B'] }
  },
  listaEnv,
  modelosConPreferencia,
  providerOrder,
  analysis: {
    gemini: () => listaEnv('GEMINI_ANALYSIS_MODELS', 'gemini-3.5-flash-lite,gemini-3.8-flash'),
    groq: () => listaEnv('GROQ_ANALYSIS_MODELS', 'openai/gpt-oss-120b'),
    openrouter: () => openrouterModels('OPENROUTER_ANALYSIS_MODELS'),
    openai: () => listaEnv('OPENAI_ANALYSIS_MODELS', 'gpt-5-mini'),
    // Sin valor por defecto: el identificador del modelo (o perfil de inferencia) lo da la consola de Bedrock de cada cuenta.
    bedrock: () => listaEnv('BEDROCK_ANALYSIS_MODELS', process.env.BEDROCK_MODELS || ''),
    providerOrder
  },
  ingestion: {
    gemini: () => listaEnv('GEMINI_INGESTION_MODELS', 'gemini-3.5-flash-lite,gemini-3.8-flash'),
    whisper: () => process.env.GROQ_WHISPER_MODEL || 'whisper-large-v3-turbo'
  },
  mockups: {
    gemini: () => listaEnv('GEMINI_MOCKUP_MODELS', 'gemini-3.5-flash-lite,gemini-3.8-flash'),
    groq: () => listaEnv('GROQ_MOCKUP_MODELS', 'openai/gpt-oss-120b'),
    openrouter: () => openrouterModels('OPENROUTER_MOCKUP_MODELS'),
    bedrock: () => listaEnv('BEDROCK_MOCKUP_MODELS', process.env.BEDROCK_MODELS || ''),
    // Reparto por dificultad: BEDROCK_MOCKUP_MODELS_SIMPLE / BEDROCK_MOCKUP_MODELS_DENSE. Sin ellos se usa la lista general (null = no hay reparto).
    bedrockPorComplejidad: (complejidad) => {
      if (!['simple', 'densa'].includes(complejidad)) return null;
      const lista = listaEnv(complejidad === 'densa' ? 'BEDROCK_MOCKUP_MODELS_DENSE' : 'BEDROCK_MOCKUP_MODELS_SIMPLE', '');
      return lista.length ? lista : null;
    },
    // Los mockups pueden tener su propio orden (MOCKUP_PROVIDER_ORDER); sin él se usa el general.
    providerOrder: () => providerOrder('MOCKUP_PROVIDER_ORDER')
  }
};
