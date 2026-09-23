const axios = require('axios');
const fs = require('fs');
const path = require('path');
const PlantUMLSynthesizer = require('./PlantUMLSynthesizer');

class ModelosIaService {
  constructor() {
    this.geminiApiKey = process.env.GEMINI_API_KEY || '';
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

  async procesar(payload) {
    const insumo = payload.insumo_bruto || payload.nombre_proyecto || '';
    const insumoAdicional = payload.insumo_adicional || '';
    const reqsActuales = payload.contexto_proyecto?.requerimientos_actuales || [];

    let contextoActualTexto = '';
    if (reqsActuales.length > 0) {
      contextoActualTexto = `REQUERIMIENTOS PREVIOS EN EL SISTEMA:\n` +
        reqsActuales.map(r => `- [${r.identificador}] (${r.tipo}) ${r.nombre}: ${r.descripcion}`).join('\n');
    }

    console.log(`[ModelosIaService] Procesando ${insumo.length} caracteres de insumo con Google Gemini...`);

    const promptCompleto = this.construirPrompt({ insumo, contextoActualTexto, insumoAdicional });

    let respuestaData = await this.generarConGemini(promptCompleto);

    if (!respuestaData) {
      console.warn('[ModelosIaService] Gemini no devolvió respuesta parseable. Usando estructuración de contingencia.');
      respuestaData = {
        nombre_proyecto: this.limpiarNombreProyecto(payload.nombre_proyecto) || 'Gestión y Control Operativo',
        requerimientos: reqsActuales
      };
    }

    return this.normalizarResultado(respuestaData);
  }

  async generarConGemini(prompt) {
    const modelos = ['gemini-flash-lite-latest', 'gemini-flash-latest'];

    for (const modelName of modelos) {
      try {
        console.log(`[ModelosIaService] Procesando con Google Gemini (${modelName})...`);
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
          { timeout: 45000 }
        );

        const rawText = res.data?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (rawText) {
          console.log(`[ModelosIaService] Generación exitosa con Google Gemini (${modelName})`);
          return this.limpiarYParsearJson(rawText);
        }
      } catch (err) {
        console.warn(`[ModelosIaService] Gemini (${modelName}) falló:`, err.response?.data?.error?.message || err.message);
      }
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
    // Elimina prefijos genéricos redundantes como "Sistema de ", "Sistema para ", etc.
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
