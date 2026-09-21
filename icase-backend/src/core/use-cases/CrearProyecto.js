const Proyecto = require('../entities/Proyecto');

class CrearProyecto {
  constructor({ proyectoRepository }) {
    this.proyectoRepository = proyectoRepository;
  }

  async ejecutar({ nombre, descripcion, insumo_bruto }) {
    const proyecto = new Proyecto({
      nombre,
      descripcion,
      insumo_bruto: insumo_bruto || '',
      estado_fase: 'analisis_pendiente'
    });

    proyecto.validar();
    return await this.proyectoRepository.crear(proyecto);
  }
}

module.exports = CrearProyecto;
