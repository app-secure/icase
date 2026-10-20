const mongoose = require('mongoose');

/**
 * Comprueba que el recurso al que apunta la ruta pertenece a un proyecto del usuario autenticado.
 *
 * Se engancha con `router.param(nombre, access.<recurso>)`, de modo que cada ruta con ese parámetro queda
 * protegida sin que el controlador tenga que acordarse. Un recurso ajeno, inexistente o con un identificador
 * inválido responde igual (404), para no revelar qué identificadores existen. Un proyecto sin dueño
 * (creado antes de exigir sesión) tampoco es accesible hasta que se le asigne uno.
 */
function buildProjectAccess({ proyectoRepository, requerimientoRepository, diagramaRepository, fuenteRepository, trabajoGeneracionRepository, artefactoRepository }) {
  const notFound = (res, label) => res.status(404).json({ error: `${label} no encontrado` });

  const ownedBy = async (proyectoId, usuarioId) => {
    if (!proyectoId || !mongoose.isValidObjectId(String(proyectoId))) return false;
    const proyecto = await proyectoRepository.obtenerPorId(String(proyectoId));
    return Boolean(proyecto && proyecto.usuario_id && usuarioId && String(proyecto.usuario_id) === String(usuarioId));
  };

  const projectOf = (repository) => async (id) => (repository ? (await repository.obtenerPorId(id))?.proyecto_id : null);

  const guard = (label, resolveProject) => async (req, res, next, value) => {
    try {
      if (!req.usuario) return res.status(401).json({ error: 'Acceso no autorizado: Token no proporcionado' });
      if (!mongoose.isValidObjectId(String(value))) return notFound(res, label);
      const proyectoId = await resolveProject(String(value));
      if (!(await ownedBy(proyectoId, req.usuario.id))) return notFound(res, label);
      return next();
    } catch (error) {
      return next(error);
    }
  };

  return {
    proyecto: guard('Proyecto', async (id) => id),
    requerimiento: guard('Requerimiento', projectOf(requerimientoRepository)),
    diagrama: guard('Diagrama', projectOf(diagramaRepository)),
    fuente: guard('Fuente', projectOf(fuenteRepository)),
    trabajo: guard('Trabajo', projectOf(trabajoGeneracionRepository)),
    artefacto: guard('Artefacto', projectOf(artefactoRepository)),
    /** Para rutas que reciben el proyecto en el cuerpo (p. ej. crear un requisito). */
    proyectoEnCuerpo: (campo = 'proyecto_id') => async (req, res, next) => {
      try {
        if (!(await ownedBy(req.body && req.body[campo], req.usuario && req.usuario.id))) return notFound(res, 'Proyecto');
        return next();
      } catch (error) {
        return next(error);
      }
    }
  };
}

module.exports = buildProjectAccess;
