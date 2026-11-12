const axios = require('axios');
const fs = require('fs');
const path = require('path');
const AiModelConfig = require('./AiModelConfig');

class MockupIaService {
  constructor() {
    this.provider = process.env.MOCKUP_IA_PROVIDER || 'auto';
    this.geminiApiKey = process.env.GEMINI_API_KEY || '';
    this.groqApiKey = process.env.GROQ_API_KEY || '';
    this.openrouterApiKey = process.env.OPENROUTER_API_KEY || '';
    this.promptsDir = path.join(__dirname, '../prompts');
    this.providerOrder = AiModelConfig.mockups.providerOrder();
    this.models = {
      gemini: AiModelConfig.mockups.gemini(),
      groq: AiModelConfig.mockups.groq(),
      openrouter: AiModelConfig.mockups.openrouter()
    };
    this.circuitos = new Map();
    this.failureThreshold = Number(process.env.MOCKUP_CIRCUIT_FAILURES || 2);
    this.cooldownMs = Number(process.env.MOCKUP_CIRCUIT_COOLDOWN_MS || 300000);
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
    const promptBase = this.leerPrompt(process.env.MOCKUP_PROMPT_FILE || 'disenador_mockups_compacto.md');
    const promptCompleto = this._construirPromptCompleto(promptBase, contextoProyecto, pantallas, insumoAdicional);

    let resultado = null;
    let proveedorUsado = null;
    const advertencias = [];

    const tokensEstimados = this._estimarTokens(promptCompleto);
    advertencias.push(`Prompt estimado: ${tokensEstimados} tokens de entrada`);

    for (const proveedor of this._ordenProveedores()) {
      let promptProveedor = promptCompleto;
      let tokensProveedor = tokensEstimados;
      if (proveedor === 'groq') {
        const presupuestoGroq = Number(process.env.GROQ_MOCKUP_INPUT_BUDGET || 3000);
        if (tokensProveedor > presupuestoGroq) {
          promptProveedor = this._construirPromptCompactoGroq(contextoProyecto, pantallas, insumoAdicional, presupuestoGroq);
          tokensProveedor = this._estimarTokens(promptProveedor);
        }
      }
      const intento = await this._intentarProveedor(proveedor, promptProveedor, tokensProveedor);
      advertencias.push(...intento.advertencias);
      if (intento.texto) {
        resultado = intento.texto;
        proveedorUsado = `${proveedor}:${intento.modelo}`;
        break;
      }
    }

    if (!resultado) {
      let reabiertos = false;
      for (const [clave, estado] of this.circuitos.entries()) {
        if (!estado.permanente && estado.tipo !== 'cuota') {
          this.circuitos.delete(clave);
          reabiertos = true;
        }
      }
      if (reabiertos) {
        for (const proveedor of this._ordenProveedores()) {
          const intento = await this._intentarProveedor(proveedor, promptCompleto, tokensEstimados);
          advertencias.push(...intento.advertencias);
          if (intento.texto) {
            resultado = intento.texto;
            proveedorUsado = `${proveedor}:${intento.modelo}`;
            break;
          }
        }
      }
    }

    if (!resultado) advertencias.push('Todos los proveedores configurados fallaron o estaban temporalmente bloqueados.');

    const mockupsParseados = this._parsearTolerante(resultado);
    const mockupsValidos = mockupsParseados.filter(m => this._mockupValido(m));

    if (mockupsValidos.length !== mockupsParseados.length) {
      advertencias.push(`${mockupsParseados.length - mockupsValidos.length} mockups descartados por preview_code inválido`);
    }

    return {
      mockups: mockupsValidos,
      proveedorUsado,
      advertencias
    };
  }

  async sugerirPaleta({ nombreProyecto, descripcion = '' }) {
    const prompt = `Actúa como diseñador UI. Sugiere una paleta accesible y profesional para el sistema "${nombreProyecto}" (${String(descripcion).slice(0, 500)}). Responde SOLO JSON estricto con esta forma: {"nombre":"...","colores":{"primario":"#RRGGBB","primario_oscuro":"#RRGGBB","secundario":"#RRGGBB","fondo":"#RRGGBB","superficie":"#RRGGBB","texto":"#RRGGBB","exito":"#RRGGBB","alerta":"#RRGGBB","error":"#RRGGBB"}}. Asegura contraste WCAG AA entre texto/fondo y texto/superficie.`;
    const tokens = this._estimarTokens(prompt);
    for (const proveedor of this._ordenProveedores()) {
      const intento = await this._intentarProveedor(proveedor, prompt, tokens);
      if (!intento.texto) continue;
      try {
        const limpio = intento.texto.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
        const parsed = JSON.parse(limpio.slice(limpio.indexOf('{'), limpio.lastIndexOf('}') + 1));
        const colores = parsed?.colores || {};
        const claves = ['primario', 'primario_oscuro', 'secundario', 'fondo', 'superficie', 'texto', 'exito', 'alerta', 'error'];
        if (claves.every(k => /^#[0-9a-f]{6}$/i.test(colores[k] || ''))) {
          return { nombre: parsed.nombre || 'Sugerencia IA', origen: 'ia', version: 1, colores };
        }
      } catch (error) {
        console.warn('[MockupIaService] Paleta IA inválida:', error.message);
      }
    }
    throw new Error('Ningún proveedor pudo sugerir una paleta válida en este momento.');
  }

  _ordenProveedores() {
    if (!this.provider || this.provider === 'auto') return this.providerOrder;
    return [this.provider];
  }

  _estimarTokens(texto) {
    return Math.ceil(String(texto || '').length / 4);
  }

  _circuitoDisponible(clave) {
    const estado = this.circuitos.get(clave);
    if (!estado) return true;
    if (estado.permanente) return false;
    if (estado.abiertoHasta > Date.now()) return false;
    if (estado.abiertoHasta) this.circuitos.delete(clave);
    return true;
  }

  _registrarFallo(clave, clasificacion) {
    const previo = this.circuitos.get(clave) || { fallos: 0 };
    const permanente = ['modelo_no_disponible', 'autenticacion'].includes(clasificacion.tipo);
    const fallos = previo.fallos + 1;
    const debeAbrir = permanente || clasificacion.tipo === 'cuota' || fallos >= this.failureThreshold;
    this.circuitos.set(clave, {
      fallos,
      permanente,
      tipo: clasificacion.tipo,
      abiertoHasta: debeAbrir
        ? Date.now() + (clasificacion.reintentarEnMs || this.cooldownMs)
        : 0
    });
  }

  _clasificarError(error) {
    if (error.code === 'MOCKUP_OUTPUT_TRUNCATED') return { tipo: 'salida_truncada', reintentable: true };
    const status = error.response?.status;
    const mensaje = String(error.response?.data?.error?.message || error.message || '').toLowerCase();
    if (status === 401 || status === 403) return { tipo: 'autenticacion', reintentable: false };
    if (status === 404 || /no longer available|does not exist|not found|unavailable for free/.test(mensaje)) {
      return { tipo: 'modelo_no_disponible', reintentable: false };
    }
    if (status === 503 || /high demand|spikes in demand|temporarily unavailable|overloaded/.test(mensaje)) {
      return { tipo: 'alta_demanda', reintentable: true, reintentarEnMs: 3000 };
    }
    if (status === 429 || /quota|rate limit|resource exhausted/.test(mensaje)) {
      const minutos = mensaje.match(/retry in (\d+)m/);
      return { tipo: 'cuota', reintentable: true, reintentarEnMs: minutos ? Number(minutos[1]) * 60000 : this.cooldownMs };
    }
    if (/request too large|context|tokens per minute|tpm/.test(mensaje)) {
      return { tipo: 'limite_contexto', reintentable: false };
    }
    return { tipo: 'transitorio', reintentable: true };
  }

  async _intentarProveedor(proveedor, prompt, tokensEstimados) {
    const advertencias = [];
    const modelos = this.models[proveedor] || [];
    if (modelos.length === 0) return { texto: null, modelo: null, advertencias: [`${proveedor}: sin modelos configurados`] };
    const tieneCredencial = proveedor === 'gemini'
      ? Boolean(this.geminiApiKey)
      : proveedor === 'groq'
        ? Boolean(this.groqApiKey)
        : Boolean(this.openrouterApiKey);
    if (!tieneCredencial) {
      return { texto: null, modelo: null, advertencias: [`${proveedor}: proveedor omitido porque no tiene credencial configurada`] };
    }

    if (proveedor === 'groq') {
      const presupuesto = Number(process.env.GROQ_MOCKUP_INPUT_BUDGET || 3000);
      if (tokensEstimados > presupuesto) {
        return { texto: null, modelo: null, advertencias: [`Groq omitido: entrada estimada ${tokensEstimados} > presupuesto ${presupuesto}`] };
      }
    }

    for (const modelo of modelos) {
      const clave = `${proveedor}:${modelo}`;
      if (!this._circuitoDisponible(clave)) {
        advertencias.push(`${clave} omitido por circuit breaker`);
        continue;
      }
      try {
        console.log(`[MockupIaService] Generando con ${clave} (~${tokensEstimados} tokens de entrada)...`);
        const texto = await this._solicitar(proveedor, modelo, prompt);
        if (texto) {
          this.circuitos.delete(clave);
          return { texto, modelo, advertencias };
        }
      } catch (error) {
        const clasificacion = this._clasificarError(error);
        this._registrarFallo(clave, clasificacion);
        const mensaje = error.response?.data?.error?.message || error.message;
        console.warn(`[MockupIaService] ${clave} falló (${clasificacion.tipo}):`, mensaje);
        advertencias.push(`${clave}: ${clasificacion.tipo}`);
        if (clasificacion.tipo === 'autenticacion') break;
      }
    }
    return { texto: null, modelo: null, advertencias };
  }

  async _solicitar(proveedor, modelo, prompt) {
    if (proveedor === 'gemini') {
      if (!this.geminiApiKey) throw Object.assign(new Error('GEMINI_API_KEY no configurada'), { response: { status: 401 } });
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent?key=${this.geminiApiKey}`;
      const res = await axios.post(url, {
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.3, maxOutputTokens: 12000, responseMimeType: 'application/json' }
      }, { timeout: 90000 });
      const candidate = res.data?.candidates?.[0];
      if (candidate?.finishReason === 'MAX_TOKENS') throw Object.assign(new Error('Respuesta de mockup truncada por límite de salida; no se acepta como HTML completo.'), { code: 'MOCKUP_OUTPUT_TRUNCATED' });
      return candidate?.content?.parts?.filter(part => !part.thought).map(part => part.text || '').join('') || null;
    }

    const apiKey = proveedor === 'groq' ? this.groqApiKey : this.openrouterApiKey;
    if (!apiKey) throw Object.assign(new Error(`${proveedor.toUpperCase()} API key no configurada`), { response: { status: 401 } });
    const url = proveedor === 'groq'
      ? 'https://api.groq.com/openai/v1/chat/completions'
      : 'https://openrouter.ai/api/v1/chat/completions';
    const maxTokens = proveedor === 'groq'
      ? Number(process.env.GROQ_MOCKUP_MAX_OUTPUT_TOKENS || 4800)
      : Number(process.env.OPENROUTER_MOCKUP_MAX_OUTPUT_TOKENS || 8000);
    const headers = { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' };
    if (proveedor === 'openrouter') Object.assign(headers, { 'HTTP-Referer': 'https://icase.app', 'X-Title': 'I-CASE Mockups' });
    const res = await axios.post(url, {
      model: modelo,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: maxTokens,
      ...(proveedor === 'openrouter' ? await require('./OpenRouterPolicy').parameters(modelo) : { response_format: { type: 'json_object' } }),
      temperature: 0.3
    }, { headers, timeout: 90000 });
    const choice = res.data?.choices?.[0];
    if (choice?.finish_reason === 'length') throw Object.assign(new Error('Respuesta de mockup truncada por límite de salida; no se acepta como HTML completo.'), { code: 'MOCKUP_OUTPUT_TRUNCATED' });
    return choice?.message?.content || null;
  }

  _construirPromptCompleto(promptBase, contextoProyecto, pantallas, insumoAdicional) {
    let prompt = promptBase;

    prompt = prompt.split('{{CONTEXTO_PROYECTO}}').join(contextoProyecto || 'Sin contexto previo.');

    if (pantallas.length > 0) {
      prompt += `\n\nPANTALLAS SOLICITADAS EXPLÍCITAMENTE (genera SOLO estas, en este orden):\n${pantallas.map(p => `- ${p}`).join('\n')}`;
    } else {
      prompt += `\n\nSIN PANTALLAS SOLICITADAS: sigue el listado "PANTALLAS A DISEÑAR" derivado del Árbol de Navegación, respetando su orden. No substitutes ese listado por los Requerimientos Funcionales.`;
    }

    if (insumoAdicional) {
      prompt += `\n\nINSTRUCCIONES ADICIONALES DEL USUARIO:\n${insumoAdicional}`;
    }

    prompt += '\n\nRECUERDA: Devuelve SOLO el JSON estricto con la clave "mockups". Sin texto extra, sin markdown, sin explicaciones.';

    return prompt;
  }

  _construirPromptCompactoGroq(contextoProyecto, pantallas, insumoAdicional, presupuestoTokens = 3000) {
    const maxChars = Math.max(2400, (presupuestoTokens - 150) * 4);
    const cabecera = [
      'Diseña mockups HTML5 + Tailwind CSS completos y autocontenidos.',
      'Devuelve SOLO JSON estricto: {"mockups":[{"nombre_pantalla":"slug","tipo":"...","descripcion":"...","rf_trazabilidad":["RF-01"],"preview_code":"<!DOCTYPE html><html lang=\\"es\\">...</html>"}]}',
      'Botones/formularios que ejecutan un RF llevan data-accion="RF-xx.verbo" (consultar|crear|editar|eliminar) con las OPERACIONES DISPONIBLES y name de campo del backend; los solo visuales, data-accion="ui".',
      pantallas.length ? `PANTALLAS A GENERAR (exactamente este nombre_pantalla): ${pantallas.join(', ')}` : ''
    ].filter(Boolean).join('\n');
    const instruccion = insumoAdicional ? `\nINSTRUCCIÓN DEL USUARIO:\n${String(insumoAdicional).slice(0, Math.floor(maxChars * 0.55))}` : '';
    const espacioContexto = Math.max(600, maxChars - cabecera.length - instruccion.length - 120);
    const contextoRecortado = String(contextoProyecto || '').slice(0, espacioContexto);
    return `${cabecera}\nCONTEXTO:\n${contextoRecortado}${instruccion}\nResponde SOLO JSON válido.`;
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
