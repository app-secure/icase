const slug = (value) => String(value || '')
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'operacion';

class ApplicationContractBuilder {
  build({ proyecto, requerimientos = [], screens = [] }) {
    const approved = requerimientos.filter((item) => item.aprobado === true && item.tipo === 'RF');
    const operations = approved.map((item, index) => ({
      id: item.identificador || `RF-${String(index + 1).padStart(2, '0')}`,
      key: this._uniqueKey(slug(item.identificador || item.nombre), approved, index),
      name: item.nombre || `Operación ${index + 1}`,
      description: item.descripcion || '',
      actors: Array.isArray(item.actores) ? item.actores : [],
      collectionPath: `/api/operations/${this._uniqueKey(slug(item.identificador || item.nombre), approved, index)}`,
      itemPath: `/api/operations/${this._uniqueKey(slug(item.identificador || item.nombre), approved, index)}/:id`,
      methods: ['GET', 'POST', 'PATCH', 'DELETE'],
      schema: { type: 'object', additionalProperties: true }
    }));
    const byRequirement = new Map(operations.map((item) => [item.id, item]));
    const views = screens.map((screen) => {
      const rf = screen.rf_trazabilidad || screen.mockup?.rf_trazabilidad || [];
      const linked = rf.map((id) => byRequirement.get(id)).filter(Boolean);
      return {
        id: screen.pantalla_id || slug(screen.slug || screen.nombre),
        name: screen.nombre || screen.nombre_visible || screen.slug || 'Pantalla',
        route: this._route(screen),
        roles: screen.roles || [],
        requirements: rf,
        operations: linked.map((item) => item.key)
      };
    });
    return {
      version: 1,
      project: proyecto?.nombre || 'Proyecto',
      operations,
      views,
      health: '/health'
    };
  }

  _uniqueKey(base, requirements, index) {
    const previous = requirements.slice(0, index).filter((item) => slug(item.identificador || item.nombre) === base).length;
    return previous ? `${base}-${previous + 1}` : base;
  }

  _route(screen) {
    const route = String(screen.ruta || '').trim();
    return route.startsWith('/') ? route : `/${route || slug(screen.slug || screen.nombre)}`;
  }
}

module.exports = ApplicationContractBuilder;
