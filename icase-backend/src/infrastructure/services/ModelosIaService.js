const axios = require('axios');
const fs = require('fs');
const path = require('path');
const PlantUMLSynthesizer = require('./PlantUMLSynthesizer');

class ModelosIaService {
  constructor() {
    this.geminiApiKey = process.env.GEMINI_API_KEY || '';
    this.groqApiKey = process.env.GROQ_API_KEY || '';
    this.deepseekApiKey = process.env.DEEPSEEK_API_KEY || '';
    this.openrouterApiKey = process.env.OPENROUTER_API_KEY || '';
    this.provider = (process.env.AI_PROVIDER || 'groq').toLowerCase();
    this.promptsDir = path.join(__dirname, '../prompts');
  }

  leerPrompt(archivo) {
    try {
      return fs.readFileSync(path.join(this.promptsDir, archivo), 'utf-8');
    } catch (err) {
      console.warn(`[ModelosIaService] Error leyendo prompt ${archivo}:`, err.message);
      return '';
    }
  }

  construirPrompt({ insumo, contextoActualTexto, insumoAdicional }) {
    const plantilla = this.leerPrompt('plantilla_orquestador.md');

    const directivas = [
      this.leerPrompt('analista_ieee830.md'),
      this.leerPrompt('disenador_arquitectura.md'),
      this.leerPrompt('auditor_qa.md')
    ].filter(Boolean).join('\n\n');

    const estructuraSalida = this.leerPrompt('estructura_salida.md');

    return plantilla
      .replace('{{DIRECTIVAS_AGENTES}}', directivas)
      .replace('{{ESTRUCTURA_SALIDA}}', estructuraSalida)
      .replace('{{INSUMO_PROYECTO}}', insumo || 'No se proporcionó insumo bruto.')
      .replace('{{CONTEXTO_PROYECTO}}', contextoActualTexto || 'Sin requerimientos previos.')
      .replace('{{INSTRUCCIONES_USUARIO}}', insumoAdicional ? insumoAdicional : 'Sin correcciones adicionales.');
  }

  async verificarSaldoDeepSeek() {
    if (!this.deepseekApiKey) return { tieneSaldo: false, disponible: false, razon: 'No hay API Key configurada para DeepSeek' };
    try {
      const res = await axios.get('https://api.deepseek.com/user/balance', {
        headers: { Authorization: `Bearer ${this.deepseekApiKey}` },
        timeout: 5000
      });
      const data = res.data;
      if (data && data.is_available === false) {
        return {
          tieneSaldo: false,
          disponible: false,
          razon: 'Sin saldo de tokens disponible en la cuenta de DeepSeek (Insufficient Balance)'
        };
      }
      return { tieneSaldo: true, disponible: true, razon: 'Saldo activo en DeepSeek' };
    } catch (err) {
      console.warn('[ModelosIaService] Advertencia al consultar saldo de DeepSeek:', err.message);
      return { tieneSaldo: true, disponible: true, razon: 'No se pudo verificar saldo' };
    }
  }

  async obtenerModelosDisponibles() {
    let deepseekDisponible = Boolean(this.deepseekApiKey);
    let deepseekDesc = 'Modelo especializado en razonamiento y arquitectura de software';

    if (this.deepseekApiKey) {
      const saldoCheck = await this.verificarSaldoDeepSeek();
      if (!saldoCheck.tieneSaldo) {
        deepseekDisponible = false;
        deepseekDesc = '⚠️ Sin saldo de tokens en la cuenta de DeepSeek API (Requiere recarga)';
      }
    }

    let providerDefecto = this.provider || 'auto';
    if (providerDefecto === 'deepseek' && !deepseekDisponible) {
      providerDefecto = 'auto';
    }

    return {
      provider_defecto: providerDefecto,
      proveedores: [
        {
          id: 'auto',
          nombre: 'Automático',
          proveedor: 'Auto',
          descripcion: 'Enrutamiento dinámico optimizado con fallback automático entre proveedores',
          disponible: true
        },
        {
          id: 'groq',
          nombre: 'Groq Cloud',
          proveedor: 'Groq',
          descripcion: 'Modelos de código abierto de ultra-baja latencia (<2s)',
          disponible: Boolean(this.groqApiKey)
        },
        {
          id: 'gemini',
          nombre: 'Google Gemini',
          proveedor: 'Gemini',
          descripcion: 'Gran capacidad de procesamiento y ventana multimodal',
          disponible: Boolean(this.geminiApiKey)
        },
        {
          id: 'deepseek',
          nombre: 'DeepSeek API',
          proveedor: 'DeepSeek',
          descripcion: deepseekDesc,
          disponible: deepseekDisponible
        },
        {
          id: 'openrouter',
          nombre: 'OpenRouter Fast',
          proveedor: 'OpenRouter',
          descripcion: 'Acceso unificado a modelos de alta velocidad sin esperas',
          disponible: Boolean(this.openrouterApiKey)
        }
      ]
    };
  }

  async procesar(payload) {
    const insumo = payload.insumo_bruto || payload.nombre_proyecto || '';
    const insumoAdicional = payload.insumo_adicional || '';
    const reqsActuales = payload.contexto_proyecto?.requerimientos_actuales || [];
    const requestedProvider = (payload.provider || payload.modelo || payload.proveedor || this.provider).toLowerCase();
    const specificModel = payload.specificModel || payload.modelName || null;

    let contextoActualTexto = '';
    if (reqsActuales.length > 0) {
      contextoActualTexto = `REQUERIMIENTOS PREVIOS EN EL SISTEMA:\n` +
        reqsActuales.map(r => `- [${r.identificador}] (${r.tipo}) ${r.nombre}: ${r.descripcion}`).join('\n');
    }

    console.log(`[ModelosIaService] Procesando ${insumo.length} caracteres de insumo (Proveedor solicitado: ${requestedProvider})...`);

    const promptCompleto = this.construirPrompt({ insumo, contextoActualTexto, insumoAdicional });

    let respuestaData = null;
    const esPromptMasivo = promptCompleto.length > 22000;

    if (requestedProvider === 'groq') {
      respuestaData = await this.generarConGroq(promptCompleto, specificModel, { allowFallback: false });
    } else if (requestedProvider === 'gemini') {
      respuestaData = await this.generarConGemini(promptCompleto, specificModel, { allowFallback: false });
    } else if (requestedProvider.includes('deep')) {
      if (this.deepseekApiKey) {
        const saldoCheck = await this.verificarSaldoDeepSeek();
        if (!saldoCheck.tieneSaldo) {
          throw new Error('El proveedor seleccionado (DeepSeek API) no cuenta con saldo o tokens suficientes en este momento (Insufficient Balance). Por favor recarga tu saldo en DeepSeek o selecciona un modelo activo como Groq Cloud o Google Gemini.');
        }
      }
      respuestaData = await this.generarConDeepSeek(promptCompleto, specificModel, { allowFallback: false });
    } else if (requestedProvider === 'openrouter') {
      respuestaData = await this.generarConOpenRouter(promptCompleto, specificModel, { allowFallback: false });
    } else {
      // Modo 'auto' (Enrutamiento Inteligente con Fallback Automático)
      if (esPromptMasivo && this.geminiApiKey) {
        console.log(`[ModelosIaService] Insumo extenso detectado (${promptCompleto.length} caracteres). Enrutando prioritariamente a Gemini...`);
        respuestaData = await this.generarConGemini(promptCompleto, specificModel, { allowFallback: true });
        if (!respuestaData && this.groqApiKey) respuestaData = await this.generarConGroq(promptCompleto, null, { allowFallback: true });
        if (!respuestaData && this.openrouterApiKey) respuestaData = await this.generarConOpenRouter(promptCompleto, null, { allowFallback: true });
        if (!respuestaData && this.deepseekApiKey) respuestaData = await this.generarConDeepSeek(promptCompleto, null, { allowFallback: true });
      } else {
        if (this.groqApiKey) respuestaData = await this.generarConGroq(promptCompleto, specificModel, { allowFallback: true });
        if (!respuestaData && this.geminiApiKey) respuestaData = await this.generarConGemini(promptCompleto, specificModel, { allowFallback: true });
        if (!respuestaData && this.deepseekApiKey) respuestaData = await this.generarConDeepSeek(promptCompleto, specificModel, { allowFallback: true });
        if (!respuestaData && this.openrouterApiKey) respuestaData = await this.generarConOpenRouter(promptCompleto, specificModel, { allowFallback: true });
      }
    }

    if (!respuestaData) {
      console.warn('[ModelosIaService] Ningún modelo de IA devolvió respuesta parseable. Usando estructuración de contingencia.');
      respuestaData = {
        nombre_proyecto: this.limpiarNombreProyecto(payload.nombre_proyecto) || 'Gestión y Control Operativo',
        requerimientos: reqsActuales
      };
    }

    return this.normalizarResultado(respuestaData);
  }

  async generarConGroq(prompt, specificModel = null, options = { allowFallback: true }) {
    if (!this.groqApiKey) {
      if (!options.allowFallback) {
        throw new Error('GROQ_API_KEY no está configurada en el servidor backend.');
      }
      if (this.geminiApiKey) return this.generarConGemini(prompt);
      if (this.openrouterApiKey) return this.generarConOpenRouter(prompt);
      return null;
    }

    const modelosGroq = specificModel
      ? [specificModel, 'llama-3.3-70b-versatile', 'llama-3.1-8b-instant', 'mixtral-8x7b-32768', 'openai/gpt-oss-120b']
      : ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant', 'mixtral-8x7b-32768', 'openai/gpt-oss-120b'];

    let promptAjustado = prompt;
    if (prompt.length > 24000) {
      console.log(`[ModelosIaService] Recortando insumo masivo (${prompt.length} chars) para compatibilidad con límites TPM de Groq...`);
      promptAjustado = prompt.slice(0, 14000) + '\n\n...[TEXTO INTERMEDIO CONDENSADO POR VOLUMEN]...\n\n' + prompt.slice(-8000);
    }

    for (const modelName of modelosGroq) {
      try {
        console.log(`[ModelosIaService] Procesando con Groq Cloud (${modelName})...`);
        const res = await axios.post(
          'https://api.groq.com/openai/v1/chat/completions',
          {
            model: modelName,
            messages: [
              {
                role: 'system',
                content: 'Eres un orquestador experto en ingeniería de software y arquitectura. SIEMPRE debes responder exclusivamente con un JSON válido estructurado según la plantilla acordada, sin introducciones ni textos explicativos fuera del JSON.'
              },
              {
                role: 'user',
                content: promptAjustado
              }
            ],
            temperature: 0.2,
            max_tokens: 8000,
            response_format: { type: 'json_object' }
          },
          {
            headers: {
              'Authorization': `Bearer ${this.groqApiKey}`,
              'Content-Type': 'application/json'
            },
            timeout: 30000
          }
        );

        const rawText = res.data?.choices?.[0]?.message?.content;
        if (rawText) {
          console.log(`[ModelosIaService] Generación exitosa con Groq Cloud (${modelName})`);
          return this.limpiarYParsearJson(rawText);
        }
      } catch (err) {
        const errorMsg = err.response?.data?.error?.message || err.message;
        console.warn(`[ModelosIaService] Groq Cloud (${modelName}) falló:`, errorMsg);
        if (!options.allowFallback && modelName === modelosGroq[modelosGroq.length - 1]) {
          throw new Error(`El proveedor Groq Cloud no pudo completar la solicitud: ${errorMsg}`);
        }
      }
    }

    if (!options.allowFallback) {
      throw new Error('El proveedor Groq Cloud no devolvió una respuesta válida.');
    }

    if (this.geminiApiKey) {
      console.log('[ModelosIaService] Groq no devolvió respuesta. Reenrutando a Gemini...');
      return this.generarConGemini(prompt);
    }

    if (this.openrouterApiKey) {
      console.log('[ModelosIaService] Groq no devolvió respuesta. Reenrutando a OpenRouter...');
      return this.generarConOpenRouter(prompt);
    }

    return null;
  }

  async generarConGemini(prompt, specificModel = null, options = { allowFallback: true }) {
    if (!this.geminiApiKey) {
      if (!options.allowFallback) {
        throw new Error('GEMINI_API_KEY no está configurada en el servidor backend.');
      }
      if (this.groqApiKey) return this.generarConGroq(prompt);
      if (this.openrouterApiKey) return this.generarConOpenRouter(prompt);
      return null;
    }

    const modelos = specificModel
      ? [specificModel, 'gemini-3.5-flash-lite', 'gemini-3.8-flash', 'gemini-3.7-flash', 'gemini-flash-latest']
      : ['gemini-3.5-flash-lite', 'gemini-3.8-flash', 'gemini-3.7-flash', 'gemini-flash-latest'];

    for (const modelName of modelos) {
      for (let intento = 1; intento <= 2; intento++) {
        try {
          console.log(`[ModelosIaService] Procesando con Google Gemini (${modelName}) [Intento ${intento}]...`);
          const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${this.geminiApiKey}`;

          const res = await axios.post(
            url,
            {
              contents: [{ parts: [{ text: prompt }] }],
              generationConfig: {
                temperature: 0.2,
                maxOutputTokens: 8192,
                responseMimeType: 'application/json'
              }
            },
            { timeout: 60000 }
          );

          const rawText = res.data?.candidates?.[0]?.content?.parts?.[0]?.text;
          if (rawText) {
            console.log(`[ModelosIaService] Generación exitosa con Google Gemini (${modelName})`);
            return this.limpiarYParsearJson(rawText);
          }
        } catch (err) {
          const msg = err.response?.data?.error?.message || err.message;
          console.warn(`[ModelosIaService] Gemini (${modelName}) intento ${intento} falló:`, msg);

          if (intento === 1 && /demand|high demand|429|503|timeout/i.test(msg)) {
            await new Promise(r => setTimeout(r, 1200));
          } else if (intento === 1 && /quota|exceeded|not found|no longer available/i.test(msg)) {
            break;
          }
        }
      }
    }

    if (!options.allowFallback) {
      throw new Error('El proveedor Google Gemini no pudo completar la solicitud debido a límites de demanda o cuota.');
    }

    if (this.groqApiKey) {
      console.log('[ModelosIaService] Gemini no disponible. Reenrutando a Groq Cloud...');
      const resGroq = await this.generarConGroq(prompt);
      if (resGroq) return resGroq;
    }

    if (this.openrouterApiKey) {
      console.log('[ModelosIaService] Reenrutando transparentemente vía OpenRouter API...');
      const resOR = await this.generarConOpenRouter(prompt);
      if (resOR) return resOR;
    }

    return null;
  }

  async generarConDeepSeek(prompt, specificModel = null, options = { allowFallback: true }) {
    const modelName = specificModel || process.env.DEEPSEEK_MODEL || 'deepseek-chat';

    if (this.deepseekApiKey) {
      try {
        console.log(`[ModelosIaService] Procesando con DeepSeek API directa (${modelName})...`);
        const res = await axios.post(
          'https://api.deepseek.com/v1/chat/completions',
          {
            model: modelName,
            messages: [
              {
                role: 'system',
                content: 'Eres un arquitecto de software de élite. Responde EXCLUSIVAMENTE en formato JSON estructurado.'
              },
              { role: 'user', content: prompt }
            ],
            temperature: 0.2,
            response_format: { type: 'json_object' }
          },
          {
            headers: {
              'Authorization': `Bearer ${this.deepseekApiKey}`,
              'Content-Type': 'application/json'
            },
            timeout: 25000
          }
        );

        const rawText = res.data?.choices?.[0]?.message?.content;
        if (rawText) {
          console.log(`[ModelosIaService] Generación exitosa con DeepSeek API (${modelName})`);
          return this.limpiarYParsearJson(rawText);
        }
      } catch (err) {
        const errorMsg = err.response?.data?.error?.message || err.message;
        console.warn(`[ModelosIaService] DeepSeek API directa (${modelName}) falló:`, errorMsg);
        
        if (!options.allowFallback) {
          if (/Insufficient Balance|402|balance|quota/i.test(errorMsg)) {
            throw new Error('El proveedor seleccionado (DeepSeek API) no cuenta con saldo o tokens suficientes en este momento (Insufficient Balance). Por favor recarga tu saldo en DeepSeek o selecciona un modelo activo como Groq Cloud o Google Gemini.');
          }
          throw new Error(`Error al procesar con DeepSeek API: ${errorMsg}`);
        }
      }
    } else if (!options.allowFallback) {
      throw new Error('DEEPSEEK_API_KEY no está configurada en el servidor backend.');
    }

    if (this.groqApiKey) {
      console.log('[ModelosIaService] Reenrutando solicitud a Groq Cloud (respuesta ultra-rápida)...');
      const resGroq = await this.generarConGroq(prompt);
      if (resGroq) return resGroq;
    }

    if (this.geminiApiKey) {
      console.log('[ModelosIaService] Reenrutando solicitud a Google Gemini...');
      const resGemini = await this.generarConGemini(prompt);
      if (resGemini) return resGemini;
    }

    if (this.openrouterApiKey) {
      console.log('[ModelosIaService] Reenrutando solicitud vía OpenRouter API...');
      const resOpenRouter = await this.generarConOpenRouter(prompt, 'openrouter/free');
      if (resOpenRouter) return resOpenRouter;
    }

    return null;
  }

  async generarConOpenRouter(prompt, specificModel = null, options = { allowFallback: true }) {
    if (!this.openrouterApiKey) {
      if (!options.allowFallback) {
        throw new Error('OPENROUTER_API_KEY no está configurada en el servidor backend.');
      }
      return null;
    }

    const modelosOpenRouter = specificModel
      ? [specificModel, 'openrouter/free', 'openrouter/auto']
      : ['openrouter/free', 'openrouter/auto'];

    for (const modelName of modelosOpenRouter) {
      try {
        console.log(`[ModelosIaService] Procesando con OpenRouter Cloud (${modelName})...`);
        const res = await axios.post(
          'https://openrouter.ai/api/v1/chat/completions',
          {
            model: modelName,
            messages: [
              {
                role: 'system',
                content: 'Eres un orquestador experto en ingeniería de software y arquitectura. SIEMPRE debes responder exclusivamente con un JSON válido estructurado según la plantilla acordada, sin introducciones ni textos explicativos fuera del JSON.'
              },
              { role: 'user', content: prompt }
            ],
            temperature: 0.2,
            max_tokens: 8000,
            response_format: { type: 'json_object' }
          },
          {
            headers: {
              'Authorization': `Bearer ${this.openrouterApiKey}`,
              'HTTP-Referer': 'http://localhost:5000',
              'X-Title': 'I-CASE',
              'Content-Type': 'application/json'
            },
            timeout: 65000
          }
        );

        const rawText = res.data?.choices?.[0]?.message?.content;
        if (rawText) {
          console.log(`[ModelosIaService] Generación exitosa con OpenRouter (${modelName})`);
          return this.limpiarYParsearJson(rawText);
        }
      } catch (err) {
        const errorMsg = err.response?.data?.error?.message || err.message;
        console.warn(`[ModelosIaService] OpenRouter (${modelName}) falló:`, errorMsg);
        if (!options.allowFallback && modelName === modelosOpenRouter[modelosOpenRouter.length - 1]) {
          throw new Error(`El proveedor OpenRouter no pudo completar la solicitud: ${errorMsg}`);
        }
      }
    }

    if (!options.allowFallback) {
      throw new Error('El proveedor OpenRouter no devolvió una respuesta válida.');
    }
    return null;
  }

  limpiarYParsearJson(str) {
    if (typeof str !== 'string') return str;
    let cleaned = str.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start !== -1 && end !== -1) {
      cleaned = cleaned.substring(start, end + 1);
    }
    return JSON.parse(cleaned);
  }

  limpiarNombreProyecto(rawName) {
    if (!rawName || typeof rawName !== 'string') return '';
    let cleaned = rawName.trim().replace(/^["'“”]+|["'“”]+$/g, '').trim();
    cleaned = cleaned.replace(/^(Sistema de|Sistema para|Sistema|Software de|Software para|Aplicación de|Plataforma de|App de)\s+/i, '').trim();
    if (cleaned.length > 0) {
      cleaned = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
    }
    return cleaned;
  }

  normalizarResultado(data) {
    const rawProjectName = (data?.nombre_proyecto || '').replace(/["“”]/g, "'");
    const safeProjectName = this.limpiarNombreProyecto(rawProjectName) || 'Gestión y Control Operativo';
    const requerimientos = Array.isArray(data?.requerimientos) ? data.requerimientos : [];

    let palabrasClave = Array.isArray(data?.palabras_clave)
      ? data.palabras_clave.filter(k => typeof k === 'string' && k.trim())
      : [];

    if (palabrasClave.length === 0) {
      palabrasClave = requerimientos
        .filter(r => (r.tipo || '').toUpperCase() === 'RF')
        .slice(0, 6)
        .map(r => r.nombre.replace(/^(Gestión de|Control de|Registro de|Módulo de)\s*/i, ''));
    }

    palabrasClave = palabrasClave.filter(k => !/case|plantuml|mermaid|uml|clean architecture|upper/i.test(k));

    const diagramas = PlantUMLSynthesizer.normalizar(data?.diagramas);

    return {
      nombre_proyecto: safeProjectName,
      descripcion_proyecto: data?.descripcion_proyecto || '',
      resumen_ejecutivo: data?.resumen_ejecutivo || '',
      introduccion: data?.introduccion || '',
      objetivos: data?.objetivos || { general: '', especificos: [] },
      alcance_sistema: data?.alcance_sistema || '',
      palabras_clave: palabrasClave,
      requerimientos,
      diagramas
    };
  }
}

module.exports = ModelosIaService;

