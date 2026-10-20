const axios = require('axios');
const fs = require('fs');
const path = require('path');
const PlantUMLSynthesizer = require('./PlantUMLSynthesizer');
const ClasesDisenoSynthesizer = require('./ClasesDisenoSynthesizer');
const ClasesDisenoValidatorService = require('./ClasesDisenoValidatorService');
const AiModelConfig = require('./AiModelConfig');
const RequirementSemanticsService = require('./RequirementSemanticsService');
const { normalizeDiagramType, DIAGRAM_DEFINITIONS } = require('../../core/constants/DiagramTypes');

function normalizarCodigoPlantUML(value) {
  if (!value || typeof value !== 'string') return '';
  let codigo = value
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, decimal) => String.fromCodePoint(Number.parseInt(decimal, 10)))
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&amp;/gi, '&')
    .replace(/\\([<>])/g, '$1')
    .replace(/\\\r?\n/g, '\n');

  if (/^\s*@start(?:uml|wbs|mindmap)\\n/i.test(codigo)) {
    codigo = codigo.replace(/\\n/g, '\n').replace(/\\t/g, '  ');
  }

  return codigo.split(/\r?\n/).reduce((lineas, linea) => {
    if (/^\s*(?:Origen|Trazabilidad)\s*:/i.test(linea) && /^\s*note\s+.+\s*:/i.test(lineas.at(-1) || '')) {
      lineas[lineas.length - 1] += `\\n${linea.trim()}`;
    } else {
      lineas.push(linea);
    }
    return lineas;
  }, []).join('\n').trim();
}

function textoComparable(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function numerosDe(value) {
  return String(value || '').match(/\d+(?:[.,]\d+)?/g)?.map((numero) => numero.replace(',', '.')) || [];
}

function normalizarTrazabilidadRequerimientos(requerimientos, insumo) {
  const insumoComparable = textoComparable(insumo);
  const semantics = new RequirementSemanticsService();

  return (requerimientos || []).map((requisito) => {
    const evidencia = String(requisito.evidencia || requisito.evidencia_fuente || '').trim();
    const evidenciaComparable = textoComparable(evidencia);
    const evidenciaValida = evidenciaComparable.length >= 8 && insumoComparable.includes(evidenciaComparable);
    const numerosEvidencia = new Set(evidenciaValida ? numerosDe(evidencia) : []);
    const tipo = String(requisito.tipo || 'RF').toUpperCase();
    let metricaMedible = String(requisito.metrica_medible || '').trim();
    const numerosNoSustentados = numerosDe(metricaMedible).filter((numero) => !numerosEvidencia.has(numero));
    const metricaNoSustentada = tipo === 'RNF' && numerosNoSustentados.length > 0;
    const origenSolicitado = String(requisito.origen || '').toLowerCase();
    const origen = evidenciaValida && !metricaNoSustentada && origenSolicitado !== 'inferido'
      ? 'explicito'
      : 'inferido';
    const requiereConfirmacion = Boolean(requisito.requiere_confirmacion) || origen === 'inferido' ||
      (tipo === 'RNF' && !metricaMedible);

    if (tipo === 'RNF' && (!metricaMedible || metricaNoSustentada)) {
      metricaMedible = 'Por confirmar con el usuario';
    }

    return semantics.enrich({
      ...requisito,
      tipo,
      metrica_medible: metricaMedible,
      origen,
      evidencia: evidenciaValida ? evidencia : '',
      fuentes_origen: Array.isArray(requisito.fuentes_origen)
        ? requisito.fuentes_origen.map(String).filter(Boolean)
        : [],
      requiere_confirmacion: requiereConfirmacion
    }, insumo);
  });
}

class ModelosIaService {
  constructor() {
    this.geminiApiKey = process.env.GEMINI_API_KEY || '';
    this.groqApiKey = process.env.GROQ_API_KEY || '';
    this.deepseekApiKey = process.env.DEEPSEEK_API_KEY || '';
    this.openrouterApiKey = process.env.OPENROUTER_API_KEY || '';
    this.openaiApiKey = process.env.OPENAI_API_KEY || '';
    this.provider = (process.env.AI_PROVIDER || 'groq').toLowerCase();
    this.promptsDir = path.join(__dirname, '../prompts');
    this.models = {
      gemini: AiModelConfig.analysis.gemini(),
      groq: AiModelConfig.analysis.groq(),
      openrouter: AiModelConfig.analysis.openrouter(),
      openai: AiModelConfig.analysis.openai()
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

    const promptsEspecializados = {
      arquitectura_software: 'disenador_arquitectura_software.md',
      arquitectura_sistema: 'disenador_arquitectura_sistema.md',
      clases_diseno: 'disenador_clases_diseno.md'
    };
    const directivas = (objetivo === 'requisitos'
      ? [
        this.leerPrompt('analista_ieee830.md'),
        this.leerPrompt('auditor_requisitos.md')
      ]
      : [
        this.leerPrompt('analista_ieee830.md'),
        this.leerPrompt('disenador_arquitectura.md'),
        tipoDiagrama && promptsEspecializados[tipoDiagrama]
          ? this.leerPrompt(promptsEspecializados[tipoDiagrama])
          : '',
        this.leerPrompt('auditor_qa.md')
      ]).filter(Boolean).join('\n\n');

    const estructuraSalida = this.leerPrompt(
      objetivo === 'requisitos' ? 'estructura_salida_requisitos.md' : 'estructura_salida.md'
    );

    const directivaFase = objetivo === 'requisitos'
      ? `\n\n# OBJETIVO EXCLUSIVO DE ESTA EJECUCIÓN\nGenera y devuelve únicamente el análisis y los requerimientos RF/RNF. El arreglo "diagramas" DEBE ser []. No diseñes, sintetices ni anticipes diagramas todavía.`
      : objetivo === 'diagramas'
        ? tipoDiagrama
          ? `\n\n# OBJETIVO EXCLUSIVO DE ESTA EJECUCIÓN\nLos artefactos incluidos en el contexto ya fueron revisados por el usuario. No los reescribas. El arreglo "requerimientos" DEBE ser []. Genera únicamente UN diagrama de tipo "${tipoDiagrama}" trazado desde sus dependencias aprobadas. El arreglo "diagramas" DEBE contener exactamente ese diagrama y ningún otro. Si es casos_de_uso, declara y conecta TODOS los actores citados en los RF. Si es una arquitectura, refleja los RNF aplicables y devuelve trazabilidad_rnf.`
          : `\n\n# OBJETIVO EXCLUSIVO DE ESTA EJECUCIÓN\nLos requerimientos incluidos en el contexto ya fueron revisados y aprobados por el usuario. No los reescribas. El arreglo "requerimientos" DEBE ser []. Genera los seis diagramas obligatorios (casos_de_uso, clases_dominio, arquitectura_software, arquitectura_sistema, clases_diseno y arbol_navegacion) trazados estrictamente desde esos requerimientos aprobados.`
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
          id: 'openai',
          nombre: 'OpenAI',
          proveedor: 'OpenAI',
          descripcion: 'Modelos de OpenAI con salida JSON para análisis y diagramas',
          disponible: Boolean(this.openaiApiKey)
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
    const reqsAprobados = payload.contexto_proyecto?.requerimientos_aprobados || [];
    const requestedProvider = (payload.provider || payload.modelo || payload.proveedor || this.provider).toLowerCase();
    const specificModel = payload.specificModel || payload.modelName || null;
    const objetivo = ['requisitos', 'diagramas'].includes(payload.objetivo) ? payload.objetivo : 'completo';
    const tipoDiagrama = payload.tipo_diagrama ? normalizeDiagramType(payload.tipo_diagrama) : null;

    // Durante el modelado, solo los requisitos aprobados constituyen restricciones.
    // Esto evita que sugerencias o borradores de la IA contaminen los diagramas.
    const esRefinamientoExplicito = Boolean(insumoAdicional && insumoAdicional.trim());
    const reqsContexto = objetivo === 'diagramas'
      ? reqsAprobados
      : (esRefinamientoExplicito ? reqsActuales : []);

    let contextoActualTexto = '';
    if (reqsContexto.length > 0) {
      contextoActualTexto = `REQUERIMIENTOS PREVIOS EN EL SISTEMA (fuente obligatoria para la trazabilidad):\n` +
        reqsContexto.map(r => {
          const actores = Array.isArray(r.actores) ? r.actores.join(', ') : (r.actores || 'Sin actores definidos');
          return [
            `- [${r.identificador}] (${r.tipo}) ${r.nombre}`,
            `  Declaración: ${r.descripcion || 'Sin descripción'}`,
            `  Actores: ${actores}`,
            `  Prioridad: ${r.prioridad || 'Media'}`,
            `  Precondición: ${r.precondiciones || r.precondicion || 'No especificada'}`,
            `  Poscondición: ${r.poscondiciones || r.poscondicion || 'No especificada'}`,
            `  Métrica: ${r.metrica_medible || 'No especificada'}`,
            `  Origen: ${r.origen || 'No especificado'}`
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
    } else if (requestedProvider === 'openai') {
      respuestaData = await this.generarConOpenAI(promptCompleto, specificModel, { allowFallback: false });
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
      if (objetivo === 'requisitos') {
        throw new Error('Ningún modelo de IA devolvió requisitos válidos. Los requisitos existentes se conservaron sin cambios.');
      }
      console.warn('[ModelosIaService] Ningún modelo de IA devolvió respuesta parseable. Usando contexto aprobado únicamente para validación.');
      respuestaData = {
        nombre_proyecto: this.limpiarNombreProyecto(payload.nombre_proyecto) || 'Gestión y Control Operativo',
        requerimientos: []
      };
    }

    return this.normalizarResultado(respuestaData, objetivo, tipoDiagrama, {
      nombreProyecto: payload.nombre_proyecto,
      requerimientos: reqsContexto,
      diagramasAprobados: payload.contexto_proyecto?.diagramas_aprobados || [],
      insumo: [insumo, insumoAdicional].filter(Boolean).join('\n\n')
    });
  }

  /**
   * Ejecuta un prompt libre y devuelve el JSON parseado, o null si ningún proveedor respondió.
   * No altera el flujo de requisitos/diagramas; sirve a servicios que piden una salida estructurada propia.
   */
  async generarJson(prompt, { provider = null, specificModel = null } = {}) {
    const solicitado = String(provider || '').toLowerCase();
    const orden = solicitado
      ? [solicitado === 'deepseek' || solicitado.includes('deep') ? 'deepseek' : solicitado]
      : (prompt.length > 22000 ? ['gemini', ...this.providerOrder.filter((item) => item !== 'gemini')] : this.providerOrder);
    for (const proveedor of orden) {
      try {
        const respuesta = await this._ejecutarProveedor(proveedor, prompt, specificModel);
        if (respuesta) return respuesta;
      } catch (error) {
        console.warn(`[ModelosIaService] ${proveedor} no pudo completar la solicitud estructurada: ${error.message}`);
      }
    }
    return null;
  }

  async _ejecutarProveedor(proveedor, prompt, specificModel) {
    if (proveedor === 'gemini') return this.generarConGemini(prompt, specificModel, { allowFallback: true });
    if (proveedor === 'groq') return this.generarConGroq(prompt, specificModel, { allowFallback: true });
    if (proveedor === 'deepseek') return this.generarConDeepSeek(prompt, specificModel, { allowFallback: true });
    if (proveedor === 'openrouter') return this.generarConOpenRouter(prompt, specificModel, { allowFallback: true });
    if (proveedor === 'openai') return this.generarConOpenAI(prompt, specificModel, { allowFallback: true });
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

  async generarConOpenAI(prompt, specificModel = null, options = { allowFallback: true }) {
    if (!this.openaiApiKey) {
      if (!options.allowFallback) throw new Error('OPENAI_API_KEY no está configurada en el servidor backend.');
      return null;
    }
    const modelos = AiModelConfig.modelosConPreferencia(specificModel, this.models.openai);
    for (const modelName of modelos) {
      if (!this._modeloDisponible(`openai:${modelName}`)) continue;
      try {
        console.log(`[ModelosIaService] Procesando con OpenAI (${modelName})...`);
        const response = await axios.post('https://api.openai.com/v1/chat/completions', {
          model: modelName,
          messages: [
            { role: 'system', content: 'Responde exclusivamente con un objeto JSON válido según la plantilla solicitada.' },
            { role: 'user', content: prompt }
          ],
          response_format: { type: 'json_object' }
        }, {
          headers: { Authorization: `Bearer ${this.openaiApiKey}`, 'Content-Type': 'application/json' },
          timeout: Number(process.env.OPENAI_TIMEOUT_MS || 90000)
        });
        const rawText = response.data?.choices?.[0]?.message?.content;
        if (rawText) return this.limpiarYParsearJson(rawText);
      } catch (error) {
        const errorMessage = error.response?.data?.error?.message || error.message;
        console.warn(`[ModelosIaService] OpenAI (${modelName}) falló:`, errorMessage);
        this._registrarErrorModelo(`openai:${modelName}`, error);
        if (!options.allowFallback && modelName === modelos.at(-1)) {
          throw new Error(`El proveedor OpenAI no pudo completar la solicitud: ${errorMessage}`);
        }
      }
    }
    if (!options.allowFallback) throw new Error('El proveedor OpenAI no devolvió una respuesta válida.');
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

  normalizarResultado(data, objetivo = 'completo', tipoDiagrama = null, contexto = {}) {
    const rawProjectName = (data?.nombre_proyecto || '').replace(/["“”]/g, "'");
    const safeProjectName = this.limpiarNombreProyecto(rawProjectName) || 'Gestión y Control Operativo';
    const requerimientos = objetivo === 'diagramas'
      ? []
      : normalizarTrazabilidadRequerimientos(
        Array.isArray(data?.requerimientos) ? data.requerimientos : [],
        contexto.insumo || ''
      );

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
        diagramas = selected ? [{
          ...selected,
          tipo: tipoDiagrama,
          codigo_plantuml: normalizarCodigoPlantUML(selected.codigo_plantuml || selected.codigo_puml || '')
        }] : [];

        // La generación secuencial antes omitía el normalizador global. En
        // arquitectura_sistema esto permitía que una sugerencia de la IA
        // introdujera HA aunque ningún RNF aprobado la solicitara. Reutilizar el
        // sintetizador garantiza una topología conservadora antes de validar.
        if (diagramas.length && tipoDiagrama === 'arquitectura_sistema') {
          const [arquitecturaNormalizada] = PlantUMLSynthesizer.normalizar(diagramas, {
            nombreProyecto: contexto.nombreProyecto || safeProjectName,
            requerimientos: Array.isArray(contexto.requerimientos) ? contexto.requerimientos : []
          }).filter((diagram) => normalizeDiagramType(diagram.tipo) === tipoDiagrama);
          diagramas = arquitecturaNormalizada ? [arquitecturaNormalizada] : diagramas;
        }

        if (tipoDiagrama === 'clases_diseno') {
          const validator = new ClasesDisenoValidatorService();
          const codigo = diagramas[0]?.codigo_plantuml || diagramas[0]?.codigo_puml || '';
          const validacion = validator.validar(codigo, tipoDiagrama);

          if (!validacion.valido) {
            console.warn(`[ModelosIaService] Corrigiendo clases_diseno incompleto: ${validacion.error}`);
            const aprobados = Array.isArray(contexto.diagramasAprobados) ? contexto.diagramasAprobados : [];
            const obtenerAprobado = (tipo) => aprobados
              .filter((diagrama) => normalizeDiagramType(diagrama.tipo) === tipo)
              .sort((a, b) => Number(b.version || 1) - Number(a.version || 1))[0];
            const dominio = obtenerAprobado('clases_dominio');
            const arquitectura = obtenerAprobado('arquitectura_software');
            const codigoDominio = String(dominio?.codigo_plantuml || '');
            const entidades = [...codigoDominio.matchAll(/^\s*(?:abstract\s+)?class\s+(?:"[^"]+"\s+as\s+)?([A-Za-z_][\w]*)/gim)]
              .map((match) => match[1])
              .filter((nombre) => !/(?:Controller|Service|UseCase|Repository|DTO)$/i.test(nombre))
              .slice(0, 10)
              .map((nombre) => ({ nombre }));
            const codigoArquitectura = String(arquitectura?.codigo_plantuml || '');
            const database = /postgres/i.test(codigoArquitectura)
              ? 'PostgreSQL'
              : (/sql/i.test(codigoArquitectura) ? 'SQL' : 'MongoDB');
            const versionesOrigen = Object.fromEntries(['casos_de_uso', 'clases_dominio', 'arquitectura_software'].map((tipo) => [
              tipo,
              Number(obtenerAprobado(tipo)?.version || 1)
            ]));

            diagramas = [ClasesDisenoSynthesizer.sintetizar({
              casosDeUsoAprobados: (contexto.requerimientos || []).filter((req) => String(req.tipo || '').toUpperCase() === 'RF'),
              clasesDominio: entidades,
              arquitecturaSoftware: codigoArquitectura,
              tecnologiasSeleccionadas: { database },
              versionesOrigen
            })];
          }
        }
      } else {
        diagramas = PlantUMLSynthesizer.normalizar(data?.diagramas, {
          nombreProyecto: safeProjectName,
          requerimientos: Array.isArray(data?.requerimientos) ? data.requerimientos : []
        });
      }
    }

    diagramas = diagramas.map((diagrama) => ({
      ...diagrama,
      codigo_plantuml: normalizarCodigoPlantUML(diagrama.codigo_plantuml || diagrama.codigo_puml || '')
    }));

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

