const path = require('path');
const fs = require('fs');
const mongoose = require('mongoose');

class FuenteController {
  constructor({ fuenteRepository, proyectoRepository, fileIngestionService }) {
    this.fuenteRepo = fuenteRepository;
    this.proyectoRepo = proyectoRepository;
    this.ingestionService = fileIngestionService;
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
          estado: 'transcrito'
        });
      }

      // Actualizar el insumo bruto del proyecto concatenando las fuentes únicas
      const fuentesActualizadas = await this.fuenteRepo.listarPorProyecto(proyectoId);
      const insumoTotal = fuentesActualizadas.map((f) => `[Fuente: ${f.nombre_archivo} (${f.tipo})]\n${f.texto_transcrito}`).join('\n\n');

      await this.proyectoRepo.actualizar(proyectoId, {
        insumo_bruto: insumoTotal
      });

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
        const fuentesRestantes = await this.fuenteRepo.listarPorProyecto(pId);
        const insumoLimpio = fuentesRestantes
          .map((f) => `[Fuente: ${f.nombre_archivo} (${f.tipo})]\n${f.texto_transcrito}`)
          .join('\n\n');
        await this.proyectoRepo.actualizar(pId, {
          insumo_bruto: insumoLimpio
        });
        console.log(`[FuenteController] Insumo bruto del proyecto ${pId} recalculado (${fuentesRestantes.length} fuentes restantes)`);
      }

      return res.json({ success: true, eliminado: true, id: fuenteIdEliminar });
    }

    // Si no se encontró el documento, intentar eliminar por si el identifier era directo
    const ok = await this.fuenteRepo.eliminar(identifier);
    return res.json({ success: true, eliminado: ok, id: identifier });
  }
}

module.exports = FuenteController;
