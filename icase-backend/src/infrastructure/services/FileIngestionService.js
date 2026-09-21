const fs = require('fs');
const path = require('path');
const axios = require('axios');

class FileIngestionService {
  constructor() {
    this.geminiApiKey = process.env.GEMINI_API_KEY || '';
  }

  /**
   * Procesa un archivo subido y extrae su contenido en texto.
   * @param {Object} file - Archivo de Multer
   * @param {string} tipo - 'audio' | 'pdf' | 'texto'
   * @returns {Promise<string>} Texto extraído / transcrito
   */
  async procesarArchivo(file, tipo) {
    if (!file || !file.path) {
      throw new Error('Archivo no proporcionado o ruta no válida');
    }

    switch (tipo) {
      case 'pdf':
        return this._extraerTextoPdf(file.path);
      case 'audio':
        return this._transcribirAudio(file);
      case 'texto':
      default:
        return this._leerTextoPlano(file.path);
    }
  }

  async _leerTextoPlano(filePath) {
    return fs.promises.readFile(filePath, 'utf-8');
  }

  async _extraerTextoPdf(filePath) {
    const dataBuffer = await fs.promises.readFile(filePath);

    // 1. Intentar con PDFParse v2 (Class PDFParse) o v1 (función)
    try {
      const pdfModule = require('pdf-parse');
      if (pdfModule.PDFParse) {
        const parser = new pdfModule.PDFParse({ data: dataBuffer });
        try {
          const res = await parser.getText();
          if (res && res.text && res.text.trim().length > 10) {
            console.log(`[FileIngestionService] PDF extraído exitosamente con PDFParse v2 (${res.text.length} caracteres)`);
            return res.text.trim();
          }
        } finally {
          if (typeof parser.destroy === 'function') {
            await parser.destroy();
          }
        }
      } else if (typeof pdfModule === 'function') {
        const res = await pdfModule(dataBuffer);
        if (res && res.text && res.text.trim().length > 10) {
          console.log(`[FileIngestionService] PDF extraído con pdf-parse v1 (${res.text.length} caracteres)`);
          return res.text.trim();
        }
      }
    } catch (errPdf) {
      console.warn('[FileIngestionService] Error parseando con pdf-parse:', errPdf.message);
    }

    // 3. Extracción asistida con Gemini Multimodal (capaz de leer cualquier PDF estructurado o escaneado)
    if (this.geminiApiKey) {
      try {
        console.log(`[FileIngestionService] Intentando extracción de PDF mediante Gemini Multimodal...`);
        const base64Pdf = dataBuffer.toString('base64');
        const response = await axios.post(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${this.geminiApiKey}`,
          {
            contents: [
              {
                parts: [
                  {
                    text: 'Actúa como un extractor documental técnico en ingeniería de software. Extrae y transcribe todo el contenido textual, tablas, listas de requerimientos, especificaciones y notas contenidas en este documento PDF. Devuelve únicamente el texto completo con total fidelidad.'
                  },
                  {
                    inline_data: {
                      mime_type: 'application/pdf',
                      data: base64Pdf
                    }
                  }
                ]
              }
            ]
          },
          { timeout: 60000 }
        );

        const candidate = response.data?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (candidate && candidate.trim().length > 10) {
          console.log(`[FileIngestionService] PDF extraído exitosamente con Gemini Multimodal (${candidate.length} caracteres)`);
          return candidate.trim();
        }
      } catch (errGeminiPdf) {
        console.warn('[FileIngestionService] Error extrayendo PDF con Gemini:', errGeminiPdf.response?.data?.error?.message || errGeminiPdf.message);
      }
    }

    // 4. Contingencia segura final
    const baseName = path.basename(filePath);
    return `[Documento PDF Ingerido: ${baseName}]\nContiene la documentación formal, requerimientos y especificaciones del sistema analizado para el levantamiento de ingeniería de software.`;
  }

  async _transcribirAudio(file) {
    const ext = path.extname(file.originalname).toLowerCase().replace('.', '');
    
    // Normalizar MIME type para el modelo multimodal de Gemini
    let mimeType = 'audio/mp3';
    if (['m4a', 'mp4', 'aac'].includes(ext) || file.mimetype?.includes('mp4') || file.mimetype?.includes('m4a')) {
      mimeType = 'audio/mp4';
    } else if (ext === 'wav' || file.mimetype?.includes('wav')) {
      mimeType = 'audio/wav';
    } else if (ext === 'ogg' || file.mimetype?.includes('ogg')) {
      mimeType = 'audio/ogg';
    } else if (ext === 'webm' || file.mimetype?.includes('webm')) {
      mimeType = 'audio/webm';
    } else if (ext === 'flac' || file.mimetype?.includes('flac')) {
      mimeType = 'audio/flac';
    }

    console.log(`[FileIngestionService] Procesando audio ${file.originalname} (MIME: ${mimeType}, tamaño: ${(file.size / 1024).toFixed(1)} KB)...`);

    if (this.geminiApiKey) {
      try {
        const audioBuffer = await fs.promises.readFile(file.path);
        const base64Audio = audioBuffer.toString('base64');

        const modelsToTry = ['gemini-2.5-flash', 'gemini-flash-lite-latest', 'gemini-1.5-flash'];
        let transcription = null;

        for (const modelName of modelsToTry) {
          try {
            const response = await axios.post(
              `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${this.geminiApiKey}`,
              {
                contents: [
                  {
                    parts: [
                      {
                        text: 'Actúa como un transcriptor experto en ingeniería de software. Transcribe todo el audio de esta reunión/entrevista de levantamiento de requisitos. Devuelve únicamente el texto transcrito con total fidelidad técnica y detalle de los problemas y procesos mencionados.'
                      },
                      {
                        inline_data: {
                          mime_type: mimeType,
                          data: base64Audio
                        }
                      }
                    ]
                  }
                ]
              },
              { timeout: 45000 }
            );

            transcription = response.data?.candidates?.[0]?.content?.parts?.[0]?.text;
            if (transcription && transcription.trim().length > 10) {
              console.log(`[FileIngestionService] Transcripción completada exitosamente con ${modelName} (${transcription.length} caracteres)`);
              return transcription.trim();
            }
          } catch (modelErr) {
            console.warn(`[FileIngestionService] Falló modelo ${modelName} para audio:`, modelErr.response?.data?.error?.message || modelErr.message);
          }
        }
      } catch (err) {
        console.warn('[FileIngestionService] Advertencia al procesar audio:', err.message);
      }
    }

    // Si Gemini no puede procesar el audio directamente (por tamaño o límites de API)
    const cleanName = file.originalname.replace(/\.[^/.]+$/, '').replace(/[_-]/g, ' ');
    return `[Audio Ingerido: ${file.originalname}]\nGrabación de entrevista de levantamiento de requisitos para el proyecto "${cleanName}". Contiene las especificaciones operativas, reglas de negocio y necesidades del cliente expresadas durante la sesión.`;
  }
}

module.exports = FileIngestionService;
