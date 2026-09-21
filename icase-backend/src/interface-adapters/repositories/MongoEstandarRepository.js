const IEstandarRepository = require('./IEstandarRepository');
const EstandarModel = require('../../infrastructure/database/schemas/EstandarSchema');
const { seedEstandares } = require('../../infrastructure/database/seeds/seedEstandares');

class MongoEstandarRepository extends IEstandarRepository {
  async obtenerEstandares() {
    const docs = await EstandarModel.find();
    return docs.map(d => ({
      categoria: d.categoria,
      clave: d.clave,
      definicion: d.definicion,
      regla_medibilidad: d.regla_medibilidad,
      ejemplos: d.ejemplos
    }));
  }

  async sembrarSiVacio() {
    return await seedEstandares();
  }
}

module.exports = MongoEstandarRepository;
