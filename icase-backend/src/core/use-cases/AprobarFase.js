const { normalizeDiagramType, isValidDiagramType } = require('../constants/DiagramTypes');
const { DiagramWorkflowService, DIAGRAM_STATES } = require('../services/DiagramWorkflowService');

class AprobarFase {
  constructor({ proyectoRepository, requerimientoRepository, diagramaRepository, disenoRepository, plantumlValidatorService = null }) {
    this.proyectoRepository = proyectoRepository;
    this.requerimientoRepository = requerimientoRepository;
    this.diagramaRepository = diagramaRepository;
    this.disenoRepository = disenoRepository;
    this.plantumlValidatorService = plantumlValidatorService;
    this.diagramWorkflowService = new DiagramWorkflowService();
  }

  async ejecutar({ proyectoId, fase, aprobarTodosLosElementos = false, tipoDiagrama = null, aprobadoPor = null, decision = 'aprobar', observaciones = '' }) {
    const proyecto = await this.proyectoRepository.obtenerPorId(proyectoId);
    if (!proyecto) {
      throw new Error(`Proyecto con ID ${proyectoId} no encontrado.`);
    }

    let nuevoEstado = proyecto.estado_fase;

    if (fase === 'analisis') {
      nuevoEstado = 'analisis_aprobado';
      if (aprobarTodosLosElementos) {
        const reqs = await this.requerimientoRepository.listarPorProyecto(proyectoId);
        for (const r of reqs) {
          await this.requerimientoRepository.actualizar(r.id, { aprobado: true });
        }
      }
    } else if (fase === 'diagrama') {
      if (!['aprobar', 'rechazar'].includes(decision)) {
        throw new Error(`Decisión de revisión inválida: ${decision}.`);
      }
      const tipo = normalizeDiagramType(tipoDiagrama);
      if (!isValidDiagramType(tipo)) {
        throw new Error(`Tipo de diagrama inválido: ${tipoDiagrama || 'no especificado'}.`);
      }
      const estadosValidos = new Set(['analisis_aprobado', 'diseno_pendiente', 'diagramas_aprobados', 'mockups_pendientes']);
      if (!estadosValidos.has(proyecto.estado_fase)) {
        throw new Error('Los requisitos deben estar aprobados antes de aprobar un diagrama.');
      }

      const diagramas = await this.diagramaRepository.listarPorProyecto(proyectoId);
      const flujoAntes = this.diagramWorkflowService.build({ requirementsApproved: true, diagrams: diagramas });
      const item = flujoAntes.items.find((candidate) => candidate.tipo === tipo);
      if (!item?.diagrama) {
        throw new Error(`Todavía no existe una versión generada de ${item?.label || tipo}.`);
      }
      if (item.unmet_dependencies.length > 0) {
        throw new Error(`No se puede aprobar ${item.label}. Primero aprueba: ${item.unmet_dependencies.join(', ')}.`);
      }
      if (item.estado === DIAGRAM_STATES.STALE) {
        throw new Error(`${item.label} está desactualizado y debe regenerarse antes de aprobarlo.`);
      }
      if (item.estado === DIAGRAM_STATES.ERROR || item.estado === DIAGRAM_STATES.GENERATING) {
        throw new Error(`${item.label} no se encuentra listo para aprobación.`);
      }

      if (decision === 'rechazar') {
        const comentario = String(observaciones || '').trim();
        if (comentario.length < 5) {
          throw new Error('Indica una observación de al menos 5 caracteres para rechazar el diagrama.');
        }
        const revisiones = [
          ...(Array.isArray(item.diagrama.revisiones) ? item.diagrama.revisiones : []),
          {
            decision: 'rechazado',
            observaciones: comentario,
            usuario: aprobadoPor || null,
            version: Number(item.diagrama.version || 1),
            fecha: new Date()
          }
        ];
        const diagramaRechazado = await this.diagramaRepository.actualizar(item.diagrama.id, {
          aprobado: false,
          estado: DIAGRAM_STATES.REJECTED,
          aprobado_en: null,
          aprobado_por: null,
          revisiones
        });
        const diagramasActualizados = diagramas.map((diagram) => diagram.id === diagramaRechazado.id ? diagramaRechazado : diagram);
        const flujo = this.diagramWorkflowService.build({ requirementsApproved: true, diagrams: diagramasActualizados });
        const proyectoActualizado = await this.proyectoRepository.actualizarEstadoFase(proyectoId, 'diseno_pendiente');
        return {
          proyecto: proyectoActualizado,
          faseAprobada: fase,
          tipoDiagrama: tipo,
          decision: 'rechazado',
          diagrama: diagramaRechazado,
          flujoDiagramas: flujo,
          nuevoEstado: 'diseno_pendiente'
        };
      }

      const validacion = this.plantumlValidatorService
        ? this.plantumlValidatorService.validar(item.diagrama.codigo_plantuml, tipo)
        : { valido: true, errores: [], advertencias: [], metricas: {} };
      if (!validacion.valido) {
        await this.diagramaRepository.actualizar(item.diagrama.id, {
          estado_calidad: 'invalido',
          errores_validacion: validacion.errores || [validacion.error].filter(Boolean),
          advertencias_validacion: validacion.advertencias || [],
          metricas_validacion: validacion.metricas || {},
          validado_en: new Date()
        });
        throw new Error(`${item.label} no supera el control de calidad: ${validacion.error}`);
      }

      const diagramaAprobado = await this.diagramaRepository.actualizar(item.diagrama.id, {
        aprobado: true,
        estado: DIAGRAM_STATES.APPROVED,
        desactualizado: false,
        motivos_desactualizacion: [],
        aprobado_en: new Date(),
        aprobado_por: aprobadoPor || null,
        estado_calidad: validacion.advertencias?.length ? 'advertencia' : 'valido',
        errores_validacion: [],
        advertencias_validacion: validacion.advertencias || [],
        metricas_validacion: validacion.metricas || {},
        validado_en: new Date(),
        revisiones: [
          ...(Array.isArray(item.diagrama.revisiones) ? item.diagrama.revisiones : []),
          {
            decision: 'aprobado',
            observaciones: String(observaciones || '').trim(),
            usuario: aprobadoPor || null,
            version: Number(item.diagrama.version || 1),
            fecha: new Date()
          }
        ]
      });
      const diagramasActualizados = diagramas.map((diagram) => diagram.id === diagramaAprobado.id ? diagramaAprobado : diagram);
      const flujo = this.diagramWorkflowService.build({ requirementsApproved: true, diagrams: diagramasActualizados });
      nuevoEstado = flujo.todos_aprobados ? 'mockups_pendientes' : 'diseno_pendiente';
      const proyectoActualizado = await this.proyectoRepository.actualizarEstadoFase(proyectoId, nuevoEstado);
      return {
        proyecto: proyectoActualizado,
        faseAprobada: fase,
        tipoDiagrama: tipo,
        diagrama: diagramaAprobado,
        flujoDiagramas: flujo,
        nuevoEstado
      };
    } else if (fase === 'diagramas' || fase === 'diseno') {
      const estadosValidos = new Set(['analisis_aprobado', 'diseno_pendiente', 'diagramas_aprobados', 'mockups_pendientes']);
      if (proyecto.estado_fase && !estadosValidos.has(proyecto.estado_fase)) {
        throw new Error('La fase de análisis debe estar aprobada antes de aprobar los diagramas.');
      }
      const diagramas = await this.diagramaRepository.listarPorProyecto(proyectoId);
      const flujo = this.diagramWorkflowService.build({ requirementsApproved: true, diagrams: diagramas });
      const pendientes = flujo.items.filter((item) => item.estado !== DIAGRAM_STATES.APPROVED);
      if (pendientes.length) {
        throw new Error(`La aprobación masiva ya no está disponible. Revisa y aprueba individualmente: ${pendientes.map((item) => item.tipo).join(', ')}.`);
      }
      nuevoEstado = 'mockups_pendientes';
    } else if (fase === 'mockups') {
      const estadosValidos = new Set(['diagramas_aprobados', 'mockups_pendientes', 'mockups_aprobados', 'diseno_aprobado']);
      if (proyecto.estado_fase && !estadosValidos.has(proyecto.estado_fase)) {
        throw new Error('Los diagramas deben estar aprobados antes de aprobar los mockups.');
      }
      if (!this.disenoRepository) {
        throw new Error('No se configuró el repositorio de diseño para aprobar mockups.');
      }
      const diseno = await this.disenoRepository.obtenerPorProyecto(proyectoId);
      if (!diseno?.mockups?.length) {
        throw new Error('No se pueden aprobar los mockups porque todavía no existe ninguno generado.');
      }
      const invalidos = diseno.mockups.filter(m => m.estado_calidad === 'invalido');
      if (invalidos.length > 0) {
        throw new Error(`No se pueden aprobar los mockups. Hay ${invalidos.length} pantalla(s) inválida(s): ${invalidos.map(m => m.nombre_visible || m.nombre_pantalla).join(', ')}.`);
      }
      nuevoEstado = 'mockups_aprobados';
    } else if (fase === 'finalizar') {
      const estadosValidos = new Set(['mockups_aprobados', 'diseno_aprobado', 'finalizado']);
      if (proyecto.estado_fase && !estadosValidos.has(proyecto.estado_fase)) {
        throw new Error('Los mockups deben estar aprobados antes de finalizar el proyecto.');
      }
      nuevoEstado = 'finalizado';
    } else {
      throw new Error(`Fase inválida: ${fase}. Use 'analisis', 'diagrama', 'diagramas', 'mockups' o 'finalizar'.`);
    }

    const proyectoActualizado = await this.proyectoRepository.actualizarEstadoFase(proyectoId, nuevoEstado);
    return {
      proyecto: proyectoActualizado,
      faseAprobada: fase,
      nuevoEstado
    };
  }
}

module.exports = AprobarFase;
