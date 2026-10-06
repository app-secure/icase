const TrabajoGeneracionModel = require('../../infrastructure/database/schemas/TrabajoGeneracionSchema');
const { randomUUID } = require('crypto');

class MongoTrabajoGeneracionRepository {
  constructor() {
    this.ejecutorId = randomUUID();
  }

  async crearORecuperarActivo({ proyectoId, pantallas, insumoAdicional, requerimientosLocales }) {
    const claveActiva = `mockups:${proyectoId}`;
    let existente = await TrabajoGeneracionModel.findOne({ clave_activa: claveActiva });
    if (existente && existente.ejecutor_id === this.ejecutorId) {
      return { trabajo: existente.toJSON(), creado: false };
    }
    if (existente) {
      await TrabajoGeneracionModel.findByIdAndUpdate(existente._id, {
        $set: {
          estado: 'fallido',
          progreso: 100,
          mensaje: 'Trabajo interrumpido por reinicio del servidor',
          error: 'La generación fue interrumpida. Inicia un nuevo intento.'
        },
        $unset: { clave_activa: 1 }
      });
      existente = null;
    }

    try {
      const creado = await TrabajoGeneracionModel.create({
        proyecto_id: proyectoId,
        pantallas,
        insumo_adicional: insumoAdicional,
        requerimientos_locales: requerimientosLocales,
        ejecutor_id: this.ejecutorId,
        clave_activa: claveActiva
      });
      return { trabajo: creado.toJSON(), creado: true };
    } catch (error) {
      if (error?.code === 11000) {
        const concurrente = await TrabajoGeneracionModel.findOne({ clave_activa: claveActiva });
        if (concurrente) return { trabajo: concurrente.toJSON(), creado: false };
      }
      throw error;
    }
  }

  async obtenerPorId(id) {
    const trabajo = await TrabajoGeneracionModel.findById(id);
    return trabajo ? trabajo.toJSON() : null;
  }

  async obtenerUltimoPorProyecto(proyectoId) {
    const trabajo = await TrabajoGeneracionModel
      .findOne({ proyecto_id: proyectoId })
      .sort({ createdAt: -1 });
    return trabajo ? trabajo.toJSON() : null;
  }

  async actualizar(id, cambios, finalizar = false) {
    const update = { $set: cambios };
    if (finalizar) update.$unset = { clave_activa: 1 };
    const trabajo = await TrabajoGeneracionModel.findByIdAndUpdate(id, update, { new: true });
    return trabajo ? trabajo.toJSON() : null;
  }
}

module.exports = MongoTrabajoGeneracionRepository;
