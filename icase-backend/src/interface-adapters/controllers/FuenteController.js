const path = require('path');

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

      let tipo = 'texto';
      const ext = path.extname(file.originalname).toLowerCase().replace('.', '');
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
      const coincidentes = fuentesExistentes.filter((f) => f.nombre_archivo === file.originalname);

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
          nombre_archivo: file.originalname,
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
      const ok = await this.fuenteRepo.eliminar(id);
      return res.json({ eliminado: ok });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }
}

module.exports = FuenteController;
