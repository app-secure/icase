const axios = require('axios');
const fs = require('fs');
const path = require('path');
const PlantUMLSynthesizer = require('./PlantUMLSynthesizer');
const AiModelConfig = require('./AiModelConfig');
const { normalizeDiagramType, DIAGRAM_DEFINITIONS } = require('../../core/constants/DiagramTypes');

class ModelosIaService {
  constructor() {
    this.geminiApiKey = process.env.GEMINI_API_KEY || '';
    this.groqApiKey = process.env.GROQ_API_KEY || '';
    this.deepseekApiKey = process.env.DEEPSEEK_API_KEY || '';
    this.openrouterApiKey = process.env.OPENROUTER_API_KEY || '';
    this.provider = (process.env.AI_PROVIDER || 'groq').toLowerCase();
    this.promptsDir = path.join(__dirname, '../prompts');
    this.models = {
      gemini: AiModelConfig.analysis.gemini(),
      groq: AiModelConfig.analysis.groq(),
      openrouter: AiModelConfig.analysis.openrouter()
    };
    this.providerOrder = AiModelConfig.analysis.providerOrder();
    this.modelosDeshabilitados = new Set();
    this.circuitos = new Map();
    this.circuitCooldownMs = Number(process.env.AI_CIRCUIT_COOLDOWN_MS || 300000);
  }

  leerPrompt(archivo) {
    try {
      return fs.readFileSync(path.join(this.promptsDir, archivo), 'utf-8');
    } catch (err) {
      console.warn(`[ModelosIaService] Error leyendo prompt ${archivo}:`, err.message);
      return '';
    }
  }

  construirPrompt({ insumo, contextoActualTexto, insumoAdicional, objetivo = 'completo', tipoDiagrama = null }) {
    const plantilla = this.leerPrompt('plantilla_orquestador.md');

    const directivas = [
      this.leerPrompt('analista_ieee830.md'),
      this.leerPrompt('disenador_arquitectura.md'),
      this.leerPrompt('auditor_qa.md')
    ].filter(Boolean).join('\n\n');

    const estructuraSalida = this.leerPrompt('estructura_salida.md');

    const directivaFase = objetivo === 'requisitos'
      ? `\n\n# OBJETIVO EXCLUSIVO DE ESTA EJECUCIÓN\nGenera y devuelve únicamente el análisis y los requerimientos RF/RNF. El arreglo "diagramas" DEBE ser []. No diseñes, sintetices ni anticipes diagramas todavía.`
      : objetivo === 'diagramas'
        ? tipoDiagrama
          ? `\n\n# OBJETIVO EXCLUSIVO DE ESTA EJECUCIÓN\nLos artefactos incluidos en el contexto ya fueron revisados por el usuario. No los reescribas. El arreglo "requerimientos" DEBE ser []. Genera únicamente UN diagrama de tipo "${tipoDiagrama}" trazado desde sus dependencias aprobadas. El arreglo "diagramas" DEBE contener exactamente ese diagrama y ningún otro.`
          : `\n\n# OBJETIVO EXCLUSIVO DE ESTA EJECUCIÓN\nLos requerimientos incluidos en el contexto ya fueron revisados y aprobados por el usuario. No los reescribas. El arreglo "requerimientos" DEBE ser []. Genera los cuatro diagramas obligatorios (casos_de_uso, arquitectura, clases y arbol_navegacion) trazados estrictamente desde esos requerimientos aprobados.`
        : '';

    return plantilla
      .replace('{{DIRECTIVAS_AGENTES}}', directivas)
      .replace('{{ESTRUCTURA_SALIDA}}', estructuraSalida)
      .replace('{{INSUMO_PROYECTO}}', insumo || 'No se proporcionó insumo bruto.')
      .replace('{{CONTEXTO_PROYECTO}}', contextoActualTexto || 'Sin requerimientos previos.')
      .replace('{{INSTRUCCIONES_USUARIO}}', insumoAdicional ? insumoAdicional : 'Sin correcciones adicionales.') + directivaFase;
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
    const objetivo = ['requisitos', 'diagramas'].includes(payload.objetivo) ? payload.objetivo : 'completo';
    const tipoDiagrama = payload.tipo_diagrama ? normalizeDiagramType(payload.tipo_diagrama) : null;

    let contextoActualTexto = '';
    if (reqsActuales.length > 0) {
      contextoActualTexto = `REQUERIMIENTOS PREVIOS EN EL SISTEMA (fuente obligatoria para la trazabilidad):\n` +
        reqsActuales.map(r => {
          const actores = Array.isArray(r.actores) ? r.actores.join(', ') : (r.actores || 'Sin actores definidos');
          return [
            `- [${r.identificador}] (${r.tipo}) ${r.nombre}`,
            `  Declaración: ${r.descripcion || 'Sin descripción'}`,
            `  Actores: ${actores}`,
            `  Prioridad: ${r.prioridad || 'Media'}`,
            `  Precondición: ${r.precondiciones || r.precondicion || 'No especificada'}`,
            `  Poscondición: ${r.poscondiciones || r.poscondicion || 'No especificada'}`
          ].join('\n');
        }).join('\n');
    }

    if (tipoDiagrama) {
      const dependencies = DIAGRAM_DEFINITIONS[tipoDiagrama]?.dependencies || [];
      const approvedDiagrams = payload.contexto_proyecto?.diagramas_aprobados || [];
      const dependencyBlocks = dependencies.map((dependencyType) => {
        const candidates = approvedDiagrams
          .filter((diagram) => normalizeDiagramType(diagram.tipo) === dependencyType)
          .sort((a, b) => Number(b.version || 1) - Number(a.version || 1));
        const diagram = candidates[0];
        if (!diagram) return '';
        const code = String(diagram.codigo_plantuml || diagram.codigo_mermaid || '').slice(0, 6000);
        return `[ARTEFACTO APROBADO: ${dependencyType} v${diagram.version || 1}]\n${diagram.descripcion || ''}\n${code}`;
      }).filter(Boolean);
      if (dependencyBlocks.length) {
        contextoActualTexto += `\n\nDIAGRAMAS APROBADOS QUE DEBEN RESPETARSE:\n${dependencyBlocks.join('\n\n')}`;
      }
      const feedback = String(payload.contexto_proyecto?.retroalimentacion_diagrama || '').trim();
      if (feedback) {
        contextoActualTexto += `\n\nOBSERVACIONES DE LA REVISIÓN MANUAL QUE DEBES CORREGIR:\n${feedback}`;
      }
    }

    console.log(`[ModelosIaService] Procesando ${insumo.length} caracteres de insumo (Proveedor solicitado: ${requestedProvider})...`);

    const promptCompleto = this.construirPrompt({ insumo, contextoActualTexto, insumoAdicional, objetivo, tipoDiagrama });

    let respuestaData = null;
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
      const orden = promptCompleto.length > 22000
        ? ['gemini', ...this.providerOrder.filter(p => p !== 'gemini')]
        : this.providerOrder;
      for (const proveedor of orden) {
        respuestaData = await this._ejecutarProveedor(proveedor, promptCompleto, specificModel);
        if (respuestaData) break;
      }
    }

    if (!respuestaData) {
      console.warn('[ModelosIaService] Ningún modelo de IA devolvió respuesta parseable. Usando estructuración de contingencia.');
      respuestaData = {
        nombre_proyecto: this.limpiarNombreProyecto(payload.nombre_proyecto) || 'Gestión y Control Operativo',
        requerimientos: reqsActuales
      };
    }

    return this.normalizarResultado(respuestaData, objetivo, tipoDiagrama);
  }

  async _ejecutarProveedor(proveedor, prompt, specificModel) {
    if (proveedor === 'gemini') return this.generarConGemini(prompt, specificModel, { allowFallback: true });
    if (proveedor === 'groq') return this.generarConGroq(prompt, specificModel, { allowFallback: true });
    if (proveedor === 'deepseek') return this.generarConDeepSeek(prompt, specificModel, { allowFallback: true });
    if (proveedor === 'openrouter') return this.generarConOpenRouter(prompt, specificModel, { allowFallback: true });
    console.warn(`[ModelosIaService] Proveedor desconocido omitido: ${proveedor}`);
    return null;
  }

  async generarConGroq(prompt, specificModel = null, options = { allowFallback: true }) {
    if (!this.groqApiKey) {
      if (!options.allowFallback) {
        throw new Error('GROQ_API_KEY no está configurada en el servidor backend.');
      }
      return null;
    }

    const modelosGroq = AiModelConfig.modelosConPreferencia(specificModel, this.models.groq);

    const tokensEntrada = Math.ceil(prompt.length / 4);
    const presupuestoEntrada = Number(process.env.GROQ_ANALYSIS_INPUT_BUDGET || 3000);
    if (tokensEntrada > presupuestoEntrada) {
      const mensaje = `Prompt estimado en ${tokensEntrada} tokens; supera el presupuesto Groq de ${presupuestoEntrada}.`;
      if (!options.allowFallback) throw new Error(mensaje);
      console.warn(`[ModelosIaService] ${mensaje} Proveedor omitido.`);
      return null;
    }

    for (const modelName of modelosGroq) {
      if (!this._modeloDisponible(`groq:${modelName}`)) continue;
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
                content: prompt
              }
            ],
            temperature: 0.2,
            max_tokens: Number(process.env.GROQ_ANALYSIS_MAX_OUTPUT_TOKENS || 4800),
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
        this._registrarErrorModelo(`groq:${modelName}`, err);
        if (!options.allowFallback && modelName === modelosGroq[modelosGroq.length - 1]) {
          throw new Error(`El proveedor Groq Cloud no pudo completar la solicitud: ${errorMsg}`);
        }
      }
    }

    if (!options.allowFallback) {
      throw new Error('El proveedor Groq Cloud no devolvió una respuesta válida.');
    }

    return null;
  }

  async generarConGemini(prompt, specificModel = null, options = { allowFallback: true }) {
    if (!this.geminiApiKey) {
      if (!options.allowFallback) {
        throw new Error('GEMINI_API_KEY no está configurada en el servidor backend.');
      }
      return null;
    }

    const modelos = AiModelConfig.modelosConPreferencia(specificModel, this.models.gemini);

    for (const modelName of modelos) {
      if (!this._modeloDisponible(`gemini:${modelName}`)) continue;
      const maxIntentos = Number(process.env.AI_TRANSIENT_RETRIES || 1);
      for (let intento = 1; intento <= maxIntentos; intento++) {
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
          if (this._registrarErrorModelo(`gemini:${modelName}`, err) === 'modelo_no_disponible') {
            break;
          }

          if (intento < maxIntentos && /demand|high demand|429|503|timeout/i.test(msg)) {
            await new Promise(r => setTimeout(r, 1200));
          } else if (/quota|exceeded|not found|no longer available/i.test(msg)) {
            break;
          }
        }
      }
    }

    if (!options.allowFallback) {
      throw new Error('El proveedor Google Gemini no pudo completar la solicitud debido a límites de demanda o cuota.');
    }

    return null;
  }

  async generarConDeepSeek(prompt, specificModel = null, options = { allowFallback: true }) {
    const modelName = specificModel || process.env.DEEPSEEK_MODEL || 'deepseek-chat';
    if (!this._modeloDisponible(`deepseek:${modelName}`)) return null;

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
        this._registrarErrorModelo(`deepseek:${modelName}`, err);
        
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

    return null;
  }

  async generarConOpenRouter(prompt, specificModel = null, options = { allowFallback: true }) {
    if (!this.openrouterApiKey) {
      if (!options.allowFallback) {
        throw new Error('OPENROUTER_API_KEY no está configurada en el servidor backend.');
      }
      return null;
    }

    const modelosOpenRouter = AiModelConfig.modelosConPreferencia(specificModel, this.models.openrouter);

    for (const modelName of modelosOpenRouter) {
      if (!this._modeloDisponible(`openrouter:${modelName}`)) continue;
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
        this._registrarErrorModelo(`openrouter:${modelName}`, err);
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

  _esModeloNoDisponible(error) {
    const status = error.response?.status;
    const mensaje = String(error.response?.data?.error?.message || error.message || '').toLowerCase();
    return status === 404 || /no longer available|does not exist|not found|unavailable for free/.test(mensaje);
  }

  _clasificarError(error) {
    if (this._esModeloNoDisponible(error)) return 'modelo_no_disponible';
    const status = error.response?.status;
    const mensaje = String(error.response?.data?.error?.message || error.message || '').toLowerCase();
    if (status === 401 || status === 403) return 'autenticacion';
    if (status === 429 || /quota|rate limit|high demand|resource exhausted|insufficient balance/.test(mensaje)) return 'cuota';
    if (/request too large|context|tokens per minute|tpm/.test(mensaje)) return 'limite_contexto';
    return 'transitorio';
  }

  _registrarErrorModelo(clave, error) {
    const tipo = this._clasificarError(error);
    if (tipo === 'modelo_no_disponible' || tipo === 'autenticacion') {
      this.modelosDeshabilitados.add(clave);
    } else if (tipo === 'cuota') {
      this.circuitos.set(clave, Date.now() + this.circuitCooldownMs);
    }
    return tipo;
  }

  _modeloDisponible(clave) {
    if (this.modelosDeshabilitados.has(clave)) return false;
    const hasta = this.circuitos.get(clave);
    if (!hasta) return true;
    if (hasta > Date.now()) return false;
    this.circuitos.delete(clave);
    return true;
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

  normalizarResultado(data, objetivo = 'completo', tipoDiagrama = null) {
    const rawProjectName = (data?.nombre_proyecto || '').replace(/["“”]/g, "'");
    const safeProjectName = this.limpiarNombreProyecto(rawProjectName) || 'Gestión y Control Operativo';
    const requerimientos = objetivo === 'diagramas' ? [] : (Array.isArray(data?.requerimientos) ? data.requerimientos : []);

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

    let diagramas = [];
    if (objetivo !== 'requisitos') {
      if (tipoDiagrama) {
        const recibidos = Array.isArray(data?.diagramas) ? data.diagramas : [];
        const matchesTarget = (diagram) => {
          const raw = String(diagram?.tipo || '').toLowerCase();
          const normalized = normalizeDiagramType(raw);
          if (normalized === tipoDiagrama) return true;
          if (tipoDiagrama === 'casos_de_uso') return raw.includes('caso') || raw.includes('use');
          if (tipoDiagrama === 'clases_dominio') return raw === 'clases' || raw.includes('dominio');
          if (tipoDiagrama === 'arquitectura_software') return raw === 'arquitectura' || raw.includes('software');
          if (tipoDiagrama === 'arquitectura_sistema') return raw.includes('sistema') || raw.includes('despliegue');
          if (tipoDiagrama === 'clases_diseno') return raw.includes('diseno') || raw.includes('diseño');
          if (tipoDiagrama === 'arbol_navegacion') return raw.includes('arbol') || raw.includes('naveg');
          return false;
        };
        const selected = recibidos.find(matchesTarget) || (recibidos.length === 1 ? recibidos[0] : null);
        diagramas = selected ? [{ ...selected, tipo: tipoDiagrama }] : [];
      } else {
        diagramas = PlantUMLSynthesizer.normalizar(data?.diagramas);
      }
    }

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

