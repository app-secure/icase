const { normalizeDiagramType } = require('../constants/DiagramTypes');
const { DiagramWorkflowService, DIAGRAM_STATES } = require('../services/DiagramWorkflowService');

class ActualizarDiagramaManual {
  constructor({ diagramaRepository, plantumlValidatorService, proyectoRepository = null }) {
    this.diagramaRepository = diagramaRepository;
    this.plantumlValidatorService = plantumlValidatorService;
    this.proyectoRepository = proyectoRepository;
    this.diagramWorkflowService = new DiagramWorkflowService();
  }

  async ejecutar({ id, datos }) {
    const existente = await this.diagramaRepository.obtenerPorId(id);
    if (!existente) {
      throw new Error(`Diagrama con ID ${id} no encontrado.`);
    }

    if (datos.codigo_plantuml && this.plantumlValidatorService) {
      const validacion = this.plantumlValidatorService.validar(datos.codigo_plantuml, {
        tipo: datos.tipo || existente.tipo,
        rnfList: datos.rnfList,
        trazabilidad_rnf: datos.trazabilidad_rnf || existente.trazabilidad_rnf
      });
      if (!validacion.valido) {
        throw new Error(`Sintaxis PlantUML inválida: ${validacion.error}`);
      }
    }

    const cambiaContenido = ['codigo_plantuml', 'codigo_mermaid', 'descripcion', 'titulo']
      .some((field) => Object.prototype.hasOwnProperty.call(datos, field) && datos[field] !== existente[field]);
    const validacion = cambiaContenido && this.plantumlValidatorService
      ? this.plantumlValidatorService.validar(datos.codigo_plantuml || existente.codigo_plantuml, existente.tipo)
      : null;
    const cambios = cambiaContenido
      ? {
          ...datos,
          aprobado: false,
          estado: DIAGRAM_STATES.PENDING_REVIEW,
          desactualizado: false,
          motivos_desactualizacion: [],
          aprobado_en: null,
          aprobado_por: null,
          estado_calidad: validacion?.advertencias?.length ? 'advertencia' : 'valido',
          errores_validacion: validacion?.errores || [],
          advertencias_validacion: validacion?.advertencias || [],
          metricas_validacion: validacion?.metricas || {},
          validado_en: validacion ? new Date() : null,
          historial_versiones: [
            ...(Array.isArray(existente.historial_versiones) ? existente.historial_versiones : []),
            {
              version: Number(existente.version || 1),
              titulo: existente.titulo || '',
              descripcion: existente.descripcion || '',
              codigo_mermaid: existente.codigo_mermaid || '',
              codigo_plantuml: existente.codigo_plantuml || '',
              estado_calidad: existente.estado_calidad || 'advertencia',
              guardado_en: new Date()
            }
          ].slice(-20),
          restaurada_desde_version: datos.restaurada_desde_version || null,
          huella_entrada: null,
          retroalimentacion_aplicada: '',
          version: Number(existente.version || 1) + 1
        }
      : datos;
    const actualizado = await this.diagramaRepository.actualizar(id, cambios);

    if (cambiaContenido && existente.proyecto_id) {
      const dependientes = this.diagramWorkflowService.dependentTypes(normalizeDiagramType(existente.tipo));
      const diagramas = await this.diagramaRepository.listarPorProyecto(existente.proyecto_id);
      for (const diagram of diagramas) {
        if (diagram.id === actualizado.id) continue;
        if (dependientes.includes(normalizeDiagramType(diagram.tipo))) {
          await this.diagramaRepository.actualizar(diagram.id, {
            aprobado: false,
            estado: DIAGRAM_STATES.STALE,
            desactualizado: true,
            motivos_desactualizacion: [
              `Cambió la dependencia ${normalizeDiagramType(existente.tipo)}; este diagrama debe regenerarse.`
            ],
            aprobado_en: null,
            aprobado_por: null
          });
        }
      }
      if (this.proyectoRepository) {
        await this.proyectoRepository.actualizarEstadoFase(existente.proyecto_id, 'diseno_pendiente');
      }
    }
    return actualizado;
  }
}

module.exports = ActualizarDiagramaManual;
