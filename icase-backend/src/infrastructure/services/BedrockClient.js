const axios = require('axios');

/**
 * Cliente mínimo de Amazon Bedrock para inferencia directa con la API Converse.
 *
 * No usa agentes de Bedrock (InvokeAgent): iCase pide una respuesta única a un modelo a partir de un prompt completo,
 * sin sesiones, bases de conocimiento ni grupos de acciones. Converse recibe el prompt, devuelve el texto y el motivo
 * de parada (para detectar salidas truncadas) y no añade capas de orquestación que alteren el JSON pedido.
 *
 * Autenticación: clave de API de Bedrock (`BEDROCK_API_KEY`, o `AWS_BEARER_TOKEN_BEDROCK`) como token Bearer.
 */
class BedrockClient {
  constructor({ env = process.env, transport = axios } = {}) {
    this.env = env;
    this.transport = transport;
  }

  get apiKey() { return this.env.BEDROCK_API_KEY || this.env.AWS_BEARER_TOKEN_BEDROCK || ''; }

  get region() {
    const region = this.env.BEDROCK_REGION || this.env.AWS_REGION || 'us-east-1';
    if (!/^[a-z]{2}(?:-[a-z]+)+-\d$/.test(region)) throw new Error('BEDROCK_REGION no es una región de AWS válida.');
    return region;
  }

  get configured() { return Boolean(this.apiKey); }

  url(modelId) {
    return `https://bedrock-runtime.${this.region}.amazonaws.com/model/${encodeURIComponent(modelId)}/converse`;
  }

  /** Respuesta completa de un modelo: `{ text, stopReason, truncated, usage }`. */
  /** `temperature: null` la omite (hay modelos que no la admiten); `extra` viaja como additionalModelRequestFields (por ejemplo el nivel de razonamiento). */
  async converse({ modelId, prompt, system = '', maxTokens = 8000, temperature = 0.3, timeout = 90000, extra = null }) {
    if (!this.apiKey) throw Object.assign(new Error('BEDROCK_API_KEY no configurada'), { response: { status: 401 } });
    if (!modelId) throw new Error('Falta el identificador del modelo de Bedrock (BEDROCK_*_MODELS).');
    // Kimi K3.x no admite `temperature` y razona por defecto al máximo (lento y caro): se omite y se fija un nivel bajo (BEDROCK_KIMI_REASONING).
    if (/moonshotai\.kimi-k3/i.test(modelId)) {
      temperature = null;
      extra = extra || { reasoning_config: process.env.BEDROCK_KIMI_REASONING || 'low' };
    }
    const body = {
      messages: [{ role: 'user', content: [{ text: prompt }] }],
      inferenceConfig: { maxTokens, ...(temperature === null ? {} : { temperature }) },
      ...(extra ? { additionalModelRequestFields: extra } : {}),
      ...(system ? { system: [{ text: system }] } : {})
    };
    const response = await this.transport.post(this.url(modelId), body, {
      headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' },
      timeout
    });
    const parts = response.data?.output?.message?.content || [];
    // Los modelos con razonamiento devuelven bloques «reasoningContent»: solo cuenta el texto de la respuesta.
    const text = parts.map((part) => part.text || '').join('');
    const stopReason = response.data?.stopReason || null;
    return { text, stopReason, truncated: stopReason === 'max_tokens', usage: response.data?.usage || null };
  }

  /** Mensaje de error de Bedrock: viene en `message` (no en `error.message` como otros proveedores). */
  static messageOf(error) {
    return error?.response?.data?.message || error?.response?.data?.error?.message || error?.message || '';
  }
}

module.exports = BedrockClient;
