const DisenoModel = require('../../infrastructure/database/schemas/DisenoSchema');

class MongoDisenoRepository {
  async guardarOActualizar(proyectoId, datos) {
    const diseno = await DisenoModel.findOneAndUpdate(
      { proyecto_id: proyectoId },
      { ...datos, proyecto_id: proyectoId },
      { upsert: true, new: true }
    );
    return diseno.toJSON();
  }

  async obtenerPorProyecto(proyectoId) {
    const diseno = await DisenoModel.findOne({ proyecto_id: proyectoId });
    return diseno ? diseno.toJSON() : null;
  }

  async obtenerMockups(proyectoId) {
    const diseno = await DisenoModel.findOne({ proyecto_id: proyectoId });
    return diseno ? diseno.mockups || [] : [];
  }

  async actualizarMockup(proyectoId, nombrePantalla, mockupData) {
    const diseno = await DisenoModel.findOne({ proyecto_id: proyectoId });
    if (!diseno) return null;

    const index = diseno.mockups.findIndex(m => m.nombre_pantalla === nombrePantalla);
    if (index === -1) return null;

    diseno.mockups[index] = { ...diseno.mockups[index].toObject(), ...mockupData };
    await diseno.save();
    return diseno.toJSON();
  }

  async eliminarMockup(proyectoId, nombrePantalla) {
    const diseno = await DisenoModel.findOne({ proyecto_id: proyectoId });
    if (!diseno) return null;

    diseno.mockups = diseno.mockups.filter(m => m.nombre_pantalla !== nombrePantalla);
    await diseno.save();
    return diseno.toJSON();
  }

  async invalidarDerivados(proyectoId) {
    await DisenoModel.findOneAndUpdate(
      { proyecto_id: proyectoId },
      { $set: { mockups: [], manifiesto_navegacion: [], aprobado: false } },
      { new: true }
    );
    return true;
  }
}

module.exports = MongoDisenoRepository;
