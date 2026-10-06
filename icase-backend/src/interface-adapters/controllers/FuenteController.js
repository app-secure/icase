const path = require('path');
const fs = require('fs');
const mongoose = require('mongoose');

class FuenteController {
  constructor({ fuenteRepository, proyectoRepository, fileIngestionService, modelosIaService }) {
    this.fuenteRepo = fuenteRepository;
    this.proyectoRepo = proyectoRepository;
    this.ingestionService = fileIngestionService;
    this.modelosIaService = modelosIaService;
  }

  _categoriaDeArchivo({ tipo, nombreArchivo = '', mimetype = '' }) {
    const ext = path.extname(nombreArchivo).toLowerCase();
    if (tipo === 'audio') return ['.mp4', '.webm'].includes(ext) || mimetype.startsWith('video/') ? 'videos' : 'audios';
    if (tipo === 'pdf' || ['.doc', '.docx', '.odt', '.rtf'].includes(ext)) return 'documentos';
    if (tipo === 'texto' || ['.txt', '.md', '.csv', '.json'].includes(ext)) return 'textos';
    return 'otros';
  }

  _tipoContenidoSugerido(fuente) {
    const muestra = `${fuente.nombre_archivo || ''} ${fuente.texto_transcrito || ''}`.toLowerCase();
    if (/entrevista|pregunta|respuesta|hablante|speaker/.test(muestra)) return 'Entrevista';
    if (/reuni[oó]n|acta|minuta|acuerdos|asistentes/.test(muestra)) return 'Notas de reunión';
    if (/requisito|especificaci[oó]n|debe|shall/.test(muestra)) return 'Especificación de requisitos';
    if (fuente.tipo === 'audio') return 'Grabación de audio';
    if (fuente.tipo === 'pdf') return 'Documento de referencia';
    return 'Texto de referencia';
  }

  _normalizarEtiquetas(value) {
    const items = Array.isArray(value) ? value : String(value || '').split(',');
    return [...new Set(items.map((item) => String(item).trim()).filter(Boolean))].slice(0, 12);
  }

  _contextoFuente(fuente) {
    const etiquetas = this._normalizarEtiquetas(fuente.etiquetas);
    const metadatos = [
      `Archivo: ${fuente.nombre_archivo}`,
      `Categoría: ${fuente.categoria || this._categoriaDeArchivo({ tipo: fuente.tipo, nombreArchivo: fuente.nombre_archivo })}`,
      `Tipo de contenido: ${fuente.tipo_contenido || 'Sin especificar'}`,
      fuente.descripcion ? `Descripción aportada por el usuario: ${fuente.descripcion}` : '',
      fuente.autor_origen ? `Autor u origen: ${fuente.autor_origen}` : '',
      fuente.fecha_documento ? `Fecha del contenido: ${fuente.fecha_documento}` : '',
      etiquetas.length ? `Etiquetas: ${etiquetas.join(', ')}` : '',
      fuente.tipo === 'audio' ? `Transcripción revisada por el usuario: ${fuente.transcripcion_verificada ? 'sí' : 'no'}` : ''
    ].filter(Boolean).join('\n');
    return `[Fuente enriquecida]\n${metadatos}\n\n[Contenido extraído]\n${fuente.texto_transcrito || ''}`;
  }

  async _recalcularInsumoProyecto(proyectoId) {
    if (!proyectoId) return;
    const fuentes = await this.fuenteRepo.listarPorProyecto(proyectoId);
    const insumoTotal = fuentes.map((fuente) => this._contextoFuente(fuente)).join('\n\n---\n\n');
    await this.proyectoRepo.actualizar(proyectoId, { insumo_bruto: insumoTotal });
  }

  async subirYTranscribir(req, res) {
    try {
      const { proyectoId } = req.params;
      const file = req.file;

      if (!file) {
        return res.status(400).json({ error: 'No se envió ningún archivo' });
      }

      // Decodificar y normalizar caracteres especiales UTF-8 del nombre original
      let nombreArchivo = file.originalname || 'archivo';
      try {
        const decoded = Buffer.from(file.originalname, 'latin1').toString('utf8');
        if (decoded && !decoded.includes('\uFFFD')) {
          nombreArchivo = decoded;
        }
      } catch (e) {
        nombreArchivo = file.originalname;
      }
      nombreArchivo = nombreArchivo.normalize('NFC').replace(/[\u0000-\u001F\u007F-\u009F]/g, '').trim();

      let tipo = 'texto';
      const ext = path.extname(nombreArchivo).toLowerCase().replace('.', '');
      const mime = (file.mimetype || '').toLowerCase();

      const audioExts = ['mp3', 'wav', 'm4a', 'mp4', 'aac', 'ogg', 'opus', 'webm', 'flac', 'wma'];
      const isAudio = mime.startsWith('audio/') || mime === 'video/mp4' || audioExts.includes(ext);
      const isPdf = mime.includes('pdf') || ext === 'pdf';

      if (isAudio) {
        tipo = 'audio';
      } else if (isPdf) {
        tipo = 'pdf';
      }
      const categoria = this._categoriaDeArchivo({ tipo, nombreArchivo, mimetype: mime });

      // Procesar e ingerir texto (transcripción para audios o extracción para PDFs)
      const textoExtraido = await this.ingestionService.procesarArchivo(file, tipo);

      // Verificar si ya existe una fuente con el mismo nombre en este proyecto para evitar duplicados
      const fuentesExistentes = await this.fuenteRepo.listarPorProyecto(proyectoId);
      const coincidentes = fuentesExistentes.filter((f) => f.nombre_archivo === nombreArchivo);

      let fuente;
      if (coincidentes.length > 0) {
        // Actualizar la primera coincidencia
        const primera = coincidentes[0];
        fuente = await this.fuenteRepo.actualizar(primera.id || primera._id, {
          tipo,
          tamanio: (file.size / 1024).toFixed(1) + ' KB',
          ruta_archivo: file.path,
          texto_transcrito: textoExtraido,
          categoria,
          estado: 'transcrito'
        });

        // Si existen duplicados previos heredados, eliminarlos
        for (let i = 1; i < coincidentes.length; i++) {
          try {
            await this.fuenteRepo.eliminar(coincidentes[i].id || coincidentes[i]._id);
          } catch (e) {
            console.warn('[FuenteController] Error eliminando duplicado antiguo:', e);
          }
        }
      } else {
        fuente = await this.fuenteRepo.crear({
          proyecto_id: proyectoId,
          nombre_archivo: nombreArchivo,
          tipo,
          tamanio: (file.size / 1024).toFixed(1) + ' KB',
          ruta_archivo: file.path,
          texto_transcrito: textoExtraido,
          categoria,
          tipo_contenido: this._tipoContenidoSugerido({ tipo, nombre_archivo: nombreArchivo, texto_transcrito: textoExtraido }),
          estado: 'transcrito'
        });
      }

      // Actualizar el insumo bruto del proyecto concatenando las fuentes únicas
      await this._recalcularInsumoProyecto(proyectoId);

      return res.status(200).json(fuente);
    } catch (err) {
      console.error('[FuenteController] Error al subir archivo:', err);
      return res.status(500).json({ error: err.message });
    }
  }

  async listar(req, res) {
    try {
      const { proyectoId } = req.params;
      const fuentes = await this.fuenteRepo.listarPorProyecto(proyectoId);
      return res.json(fuentes);
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  async actualizar(req, res) {
    try {
      const { id } = req.params;
      if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ error: 'Identificador de fuente inválido' });
      const existente = await this.fuenteRepo.obtenerPorId(id);
      if (!existente) return res.status(404).json({ error: 'Fuente no encontrada' });

      const permitidos = ['categoria', 'tipo_contenido', 'descripcion', 'autor_origen', 'fecha_documento', 'texto_transcrito', 'transcripcion_verificada'];
      const cambios = {};
      for (const campo of permitidos) {
        if (Object.prototype.hasOwnProperty.call(req.body || {}, campo)) cambios[campo] = req.body[campo];
      }
      if (cambios.categoria && !['textos', 'documentos', 'audios', 'videos', 'otros'].includes(cambios.categoria)) {
        return res.status(400).json({ error: 'Categoría de fuente inválida' });
      }
      if (Object.prototype.hasOwnProperty.call(req.body || {}, 'etiquetas')) cambios.etiquetas = this._normalizarEtiquetas(req.body.etiquetas);
      if (Object.prototype.hasOwnProperty.call(cambios, 'transcripcion_verificada')) cambios.transcripcion_verificada = Boolean(cambios.transcripcion_verificada);
      cambios.metadatos_generados_ia = Boolean(req.body?.metadatos_generados_ia);

      const actualizada = await this.fuenteRepo.actualizar(id, cambios);
      await this._recalcularInsumoProyecto(existente.proyecto_id);
      return res.json(actualizada);
    } catch (err) {
      console.error('[FuenteController] Error actualizando fuente:', err);
      return res.status(500).json({ error: err.message });
    }
  }

  async sugerirMetadatos(req, res) {
    try {
      const { id } = req.params;
      const fuente = mongoose.Types.ObjectId.isValid(id) ? await this.fuenteRepo.obtenerPorId(id) : null;
      if (!fuente) return res.status(404).json({ error: 'Fuente no encontrada' });

      const fallback = {
        categoria: fuente.categoria || this._categoriaDeArchivo({ tipo: fuente.tipo, nombreArchivo: fuente.nombre_archivo }),
        tipo_contenido: fuente.tipo_contenido || this._tipoContenidoSugerido(fuente),
        descripcion: fuente.descripcion || `Fuente ${fuente.nombre_archivo} utilizada como contexto para el levantamiento y validación de requisitos.`,
        autor_origen: fuente.autor_origen || '',
        fecha_documento: fuente.fecha_documento || '',
        etiquetas: fuente.etiquetas?.length ? fuente.etiquetas : []
      };

      if (!this.modelosIaService) return res.json({ ...fallback, generado_por_ia: false });
      const contenido = String(fuente.texto_transcrito || '').slice(0, 12000);
      const prompt = `Analiza esta fuente de un proyecto de software y devuelve EXCLUSIVAMENTE JSON válido con estas claves: categoria (una de textos, documentos, audios, videos, otros), tipo_contenido (ej. Entrevista, Acta de reunión, Especificación), descripcion (máximo 450 caracteres, concreta y útil para otra IA), autor_origen (vacío si se desconoce), fecha_documento (vacío si se desconoce), etiquetas (arreglo de 3 a 8 términos). No inventes autor ni fecha.\n\nArchivo: ${fuente.nombre_archivo}\nFormato: ${fuente.tipo}\nContenido:\n${contenido}`;

      let sugerencia = null;
      const proveedorSolicitado = String(req.body?.provider || '').toLowerCase();
      const orden = proveedorSolicitado && proveedorSolicitado !== 'auto'
        ? [proveedorSolicitado]
        : this.modelosIaService.providerOrder;
      for (const proveedor of orden) {
        sugerencia = await this.modelosIaService._ejecutarProveedor(proveedor, prompt, null);
        if (sugerencia) break;
      }
      const resultado = sugerencia && typeof sugerencia === 'object' ? sugerencia : fallback;
      return res.json({
        categoria: ['textos', 'documentos', 'audios', 'videos', 'otros'].includes(resultado.categoria) ? resultado.categoria : fallback.categoria,
        tipo_contenido: String(resultado.tipo_contenido || fallback.tipo_contenido).slice(0, 100),
        descripcion: String(resultado.descripcion || fallback.descripcion).slice(0, 1200),
        autor_origen: String(resultado.autor_origen || '').slice(0, 160),
        fecha_documento: String(resultado.fecha_documento || '').slice(0, 40),
        etiquetas: this._normalizarEtiquetas(resultado.etiquetas || fallback.etiquetas),
        generado_por_ia: Boolean(sugerencia)
      });
    } catch (err) {
      console.error('[FuenteController] Error sugiriendo metadatos:', err);
      return res.status(500).json({ error: err.message });
    }
  }

  async eliminar(req, res) {
    try {
      const { id } = req.params;
      return await this._removerFuente(id, null, res);
    } catch (err) {
      console.error('[FuenteController] Error al eliminar fuente:', err);
      return res.status(500).json({ error: err.message });
    }
  }

  async eliminarFuenteDeProyecto(req, res) {
    try {
      const { proyectoId, fuenteIdOrName } = req.params;
      return await this._removerFuente(fuenteIdOrName, proyectoId, res);
    } catch (err) {
      console.error('[FuenteController] Error al eliminar fuente de proyecto:', err);
      return res.status(500).json({ error: err.message });
    }
  }

  async _removerFuente(identifier, proyectoId, res) {
    let fuente = null;

    if (mongoose.Types.ObjectId.isValid(identifier)) {
      fuente = await this.fuenteRepo.obtenerPorId(identifier);
    }

    if (!fuente && proyectoId) {
      let decodedName = identifier;
      try {
        decodedName = decodeURIComponent(identifier).normalize('NFC').trim();
      } catch (e) {
        decodedName = identifier;
      }
      const todas = await this.fuenteRepo.listarPorProyecto(proyectoId);
      fuente = todas.find(
        (f) =>
          f.nombre_archivo === decodedName ||
          f.nombre_archivo === identifier ||
          f.id === identifier ||
          f._id === identifier
      );
    }

    if (fuente) {
      // 1. Eliminar archivo físico de disco si existe
      if (fuente.ruta_archivo && fs.existsSync(fuente.ruta_archivo)) {
        try {
          await fs.promises.unlink(fuente.ruta_archivo);
          console.log(`[FuenteController] Archivo en disco eliminado: ${fuente.ruta_archivo}`);
        } catch (e) {
          console.warn('[FuenteController] Error eliminando archivo físico:', e.message);
        }
      }

      // 2. Eliminar registro en MongoDB
      const fuenteIdEliminar = fuente.id || fuente._id;
      await this.fuenteRepo.eliminar(fuenteIdEliminar);
      console.log(`[FuenteController] Registro de fuente eliminado de MongoDB: ${fuente.nombre_archivo} (${fuenteIdEliminar})`);

      // 3. Recalcular y limpiar insumo_bruto del proyecto para que no queden datos sucios
      const pId = fuente.proyecto_id || proyectoId;
      if (pId) {
        await this._recalcularInsumoProyecto(pId);
        console.log(`[FuenteController] Insumo bruto del proyecto ${pId} recalculado tras eliminar una fuente`);
      }

      return res.json({ success: true, eliminado: true, id: fuenteIdEliminar });
    }

    // Si no se encontró el documento, intentar eliminar por si el identifier era directo
    const ok = await this.fuenteRepo.eliminar(identifier);
    return res.json({ success: true, eliminado: ok, id: identifier });
  }
}

module.exports = FuenteController;
