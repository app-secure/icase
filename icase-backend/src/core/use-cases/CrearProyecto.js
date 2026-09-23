const Proyecto = require('../entities/Proyecto');

class CrearProyecto {
  constructor({ proyectoRepository }) {
    this.proyectoRepository = proyectoRepository;
  }

  async ejecutar({ usuario_id, nombre, descripcion, insumo_bruto, parametros }) {
    const proyecto = new Proyecto({
      usuario_id: usuario_id || null,
      nombre,
      descripcion,
      insumo_bruto: insumo_bruto || '',
      estado_fase: 'insumos_pendientes'
    });

    proyecto.validar();
    return await this.proyectoRepository.crear({
      ...proyecto,
      parametros
    });
  }
}

module.exports = CrearProyecto;
