const ArtefactoGeneradoModel = require('../../infrastructure/database/schemas/ArtefactoGeneradoSchema');

class MongoArtefactoGeneradoRepository {
  async crear(artefacto) {
    const doc = await ArtefactoGeneradoModel.create(artefacto);
    return doc.toJSON();
  }

  async listarPorProyecto(proyectoId, tipo = null) {
    const filtro = { proyecto_id: proyectoId };
    if (tipo) filtro.tipo = tipo;
    const docs = await ArtefactoGeneradoModel.find(filtro).sort({ tipo: 1, version: -1 });
    return docs.map((doc) => doc.toJSON());
  }

  async obtenerUltimo(proyectoId, tipo) {
    const doc = await ArtefactoGeneradoModel.findOne({ proyecto_id: proyectoId, tipo }).sort({ version: -1 });
    return doc ? doc.toJSON() : null;
  }

  async obtenerUltimoAprobado(proyectoId, tipo) {
    const doc = await ArtefactoGeneradoModel.findOne({ proyecto_id: proyectoId, tipo, aprobado: true, estado: 'aprobado' }).sort({ version: -1 });
    return doc ? doc.toJSON() : null;
  }

  async obtenerPorId(id) {
    const doc = await ArtefactoGeneradoModel.findById(id);
    return doc ? doc.toJSON() : null;
  }

  async actualizar(id, cambios) {
    const doc = await ArtefactoGeneradoModel.findByIdAndUpdate(id, cambios, { new: true, runValidators: true });
    return doc ? doc.toJSON() : null;
  }
}

module.exports = MongoArtefactoGeneradoRepository;
