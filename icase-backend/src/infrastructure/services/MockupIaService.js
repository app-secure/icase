const axios = require('axios');
const fs = require('fs');
const path = require('path');

class MockupIaService {
  constructor() {
    this.provider = process.env.MOCKUP_IA_PROVIDER || 'gemini';
    this.geminiApiKey = process.env.GEMINI_API_KEY || '';
    this.groqApiKey = process.env.GROQ_API_KEY || '';
    this.openrouterApiKey = process.env.OPENROUTER_API_KEY || '';
    this.promptsDir = path.join(__dirname, '../prompts');
  }

  leerPrompt(archivo) {
    try {
      return fs.readFileSync(path.join(this.promptsDir, archivo), 'utf-8');
    } catch (err) {
      console.warn(`[MockupIaService] Error leyendo prompt ${archivo}:`, err.message);
      return '';
    }
  }

  async generarMockups({ contextoProyecto, pantallas = [], insumoAdicional = '' }) {
    const promptBase = this.leerPrompt('disenador_mockups.md');
    const promptCompleto = this._construirPromptCompleto(promptBase, contextoProyecto, pantallas, insumoAdicional);

    let resultado = null;
    let proveedorUsado = null;
    const advertencias = [];

    resultado = await this._intentarGemini(promptCompleto);
    if (resultado) {
      proveedorUsado = 'gemini';
    } else {
      advertencias.push('Gemini no devolvió respuesta válida, probando Groq...');
      resultado = await this._intentarGroq(promptCompleto);
      if (resultado) {
        proveedorUsado = 'groq';
      } else {
        advertencias.push('Groq no devolvió respuesta válida, probando OpenRouter (modelo gratuito)...');
        resultado = await this._intentarOpenRouter(promptCompleto);
        if (resultado) {
          proveedorUsado = 'openrouter';
        } else {
          advertencias.push('Todos los proveedores fallaron. Devolviendo array vacío.');
        }
      }
    }

    const mockupsParseados = this._parsearTolerante(resultado);
    const mockupsValidos = mockupsParseados.filter(m => this._mockupValido(m));

    if (mockupsValidos.length !== mockupsParseados.length) {
      advertencias.push(`${mockupsParseados.length - mockupsValidos.length} mockups descartados por preview_code inválido`);
    }

    return {
      mockups: mockupsValidos.slice(0, 6),
      proveedorUsado,
      advertencias
    };
  }

  _construirPromptCompleto(promptBase, contextoProyecto, pantallas, insumoAdicional) {
    let prompt = promptBase;

    prompt = prompt.replace('{{CONTEXTO_PROYECTO}}', contextoProyecto || 'Sin contexto previo.');

    if (pantallas.length > 0) {
      prompt += `\n\nPANTALLAS SOLICITADAS EXPLÍCITAMENTE (genera SOLO estas, en este orden):\n${pantallas.map(p => `- ${p}`).join('\n')}`;
    }

    if (insumoAdicional) {
      prompt += `\n\nINSTRUCCIONES ADICIONALES DEL USUARIO:\n${insumoAdicional}`;
    }

    prompt += '\n\nRECUERDA: Devuelve SOLO el JSON estricto con la clave "mockups". Sin texto extra, sin markdown, sin explicaciones.';

    return prompt;
  }

  async _intentarGemini(prompt) {
    if (!this.geminiApiKey) {
      console.warn('[MockupIaService] GEMINI_API_KEY no configurada');
      return null;
    }

    const modelos = ['gemini-2.0-flash', 'gemini-1.5-flash', 'gemini-flash-latest', 'gemini-3.5-flash-lite', 'gemini-3.8-flash'];

    for (const modelName of modelos) {
      try {
        console.log(`[MockupIaService] Generando mockups con Google Gemini (${modelName})...`);
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${this.geminiApiKey}`;

        const res = await axios.post(
          url,
          {
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
              temperature: 0.35,
              maxOutputTokens: 32768,
              responseMimeType: 'application/json'
            }
          },
          { timeout: 90000 }
        );

        const rawText = res.data?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (rawText) {
          console.log(`[MockupIaService] Generación exitosa con Google Gemini (${modelName})`);
          return rawText;
        }
      } catch (err) {
        console.warn(`[MockupIaService] Gemini (${modelName}) falló:`, err.response?.data?.error?.message || err.message);
      }
    }
    return null;
  }

  async _intentarGroq(prompt) {
    if (!this.groqApiKey) {
      console.warn('[MockupIaService] GROQ_API_KEY no configurada');
      return null;
    }

    const modelosGroq = ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant', 'openai/gpt-oss-120b'];
    for (const model of modelosGroq) {
      try {
        console.log(`[MockupIaService] Generando mockups con Groq (${model})...`);
        const url = 'https://api.groq.com/openai/v1/chat/completions';

        const res = await axios.post(
          url,
          {
            model: model,
            messages: [{ role: 'user', content: prompt }],
            max_tokens: 16000,
            response_format: { type: 'json_object' },
            temperature: 0.35
          },
          {
            headers: {
              'Authorization': `Bearer ${this.groqApiKey}`,
              'Content-Type': 'application/json'
            },
            timeout: 90000
          }
        );

        const content = res.data?.choices?.[0]?.message?.content;
        if (content) {
          console.log(`[MockupIaService] Generación exitosa con Groq (${model})`);
          return content;
        }
      } catch (err) {
        console.warn(`[MockupIaService] Groq (${model}) falló:`, err.response?.data?.error?.message || err.message);
      }
    }
    return null;
  }

  async _intentarOpenRouter(prompt) {
    if (!this.openrouterApiKey) {
      console.warn('[MockupIaService] OPENROUTER_API_KEY no configurada');
      return null;
    }

    try {
      console.log('[MockupIaService] Generando mockups con OpenRouter (qwen/qwen3.8-27b:free)...');
      const url = 'https://openrouter.ai/api/v1/chat/completions';

      const res = await axios.post(
        url,
        {
          model: 'qwen/qwen3.8-27b:free',
          messages: [{ role: 'user', content: prompt }],
          max_tokens: 16000,
          response_format: { type: 'json_object' },
          temperature: 0.35
        },
        {
          headers: {
            'Authorization': `Bearer ${this.openrouterApiKey}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': 'https://icase.app',
            'X-Title': 'I-CASE Mockups'
          },
          timeout: 90000
        }
      );

      const content = res.data?.choices?.[0]?.message?.content;
      if (content) {
        console.log('[MockupIaService] Generación exitosa con OpenRouter');
        return content;
      }
    } catch (err) {
      console.warn('[MockupIaService] OpenRouter falló:', err.response?.data?.error?.message || err.message);
    }
    return null;
  }

  _parsearTolerante(rawText) {
    if (!rawText || typeof rawText !== 'string') {
      return [];
    }

    let cleaned = rawText.trim();

    cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();

    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start !== -1 && end !== -1 && end > start) {
      cleaned = cleaned.substring(start, end + 1);
    }

    let parsed = null;
    try {
      parsed = JSON.parse(cleaned);
    } catch (e) {
      console.warn('[MockupIaService] JSON.parse directo falló, intentando extracción salvaje...');
      parsed = this._extraccionSalvaje(cleaned);
    }

    if (!parsed || !Array.isArray(parsed.mockups)) {
      console.warn('[MockupIaService] Estructura inválida, no hay array mockups');
      return [];
    }

    return parsed.mockups;
  }

  _extraccionSalvaje(str) {
    const mockups = [];
    let depth = 0;
    let startIdx = -1;

    for (let i = 0; i < str.length; i++) {
      const char = str[i];
      if (char === '{') {
        if (depth === 0) startIdx = i;
        depth++;
      } else if (char === '}') {
        depth--;
        if (depth === 0 && startIdx !== -1) {
          const candidate = str.substring(startIdx, i + 1);
          try {
            const obj = JSON.parse(candidate);
            if (obj.preview_code && obj.nombre_pantalla) {
              mockups.push(obj);
            }
          } catch (e) {
          }
          startIdx = -1;
        }
      }
    }

    return { mockups };
  }

  _mockupValido(mockup) {
    if (!mockup || typeof mockup !== 'object') return false;
    if (!mockup.preview_code || typeof mockup.preview_code !== 'string') return false;
    const code = mockup.preview_code.trim();
    if (!code) return false;

    // Si no contiene la etiqueta html completa pero contiene HTML válido, envolverlo automáticamente
    if (!code.toLowerCase().includes('<html')) {
      mockup.preview_code = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${mockup.nombre_pantalla || 'Mockup'}</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">
</head>
<body class="bg-slate-50 min-h-screen p-6 font-['Inter']">
${code}
</body>
</html>`;
    }
    return true;
  }
}

module.exports = MockupIaService;