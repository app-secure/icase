const CodeGenerationWorkflowService = require('../services/CodeGenerationWorkflowService');
const { CODE_PHASE_STATES } = require('../constants/CodeGenerationPhases');
const BusinessRuleService = require('../services/BusinessRuleService');
const AccessControlService = require('../services/AccessControlService');
const StackCatalog = require('../services/StackCatalog');
const DomainModelExtractor = require('../../infrastructure/services/DomainModelExtractor');

const PROJECT_STATES_WITH_APPROVED_DESIGN = new Set([
  'mockups_aprobados', 'diseno_aprobado', 'finalizado'
]);

class GestionarPlanCodificacion {
  constructor({
    proyectoRepository,
    planCodificacionRepository,
    requerimientoRepository = null,
    diagramaRepository = null,
    proposalService = null
  }) {
    this.proyectoRepository = proyectoRepository;
    this.planCodificacionRepository = planCodificacionRepository;
    this.requerimientoRepository = requerimientoRepository;
    this.diagramaRepository = diagramaRepository;
    this.proposalService = proposalService;
    this.workflow = new CodeGenerationWorkflowService();
    this.ruleService = new BusinessRuleService();
    this.accessService = new AccessControlService();
    this.domainExtractor = new DomainModelExtractor();
  }

  async sugerir({ proyectoId, etapa }) {
    const proyecto = await this._obtenerProyectoListo(proyectoId);
    const definition = this.workflow.obtenerDefinicion(etapa);
    if (definition.tipo !== 'decision') {
      throw new Error(`${definition.titulo} no admite una propuesta de planificación.`);
    }
    if (!this.proposalService || !this.requerimientoRepository || !this.diagramaRepository) {
      throw new Error('El generador de propuestas de codificación no está configurado.');
    }

    const plan = await this._obtenerOCrear(proyectoId);
    this.workflow.validarDependencias(plan, etapa);
    const [requerimientos, diagramas] = await Promise.all([
      this.requerimientoRepository.listarPorProyecto(proyectoId),
      this.diagramaRepository.listarPorProyecto(proyectoId)
    ]);
    return this.proposalService.generar({ etapa, proyecto, requerimientos, diagramas, plan });
  }

  async obtener(proyectoId) {
    const proyecto = await this._obtenerProyectoListo(proyectoId);
    let plan = await this.planCodificacionRepository.obtenerPorProyecto(proyectoId);
    if (!plan) {
      plan = await this.planCodificacionRepository.crear({
        proyecto_id: proyectoId,
        etapas: this.workflow.crearEtapasIniciales()
      });
    }
    return { proyecto: { id: proyecto.id, nombre: proyecto.nombre }, ...this.workflow.enriquecer(plan) };
  }

  async proponer({ proyectoId, etapa, propuesta, observaciones = '' }) {
    await this._obtenerProyectoListo(proyectoId);
    const definition = this.workflow.obtenerDefinicion(etapa);
    if (definition.tipo !== 'decision') {
      throw new Error(`${definition.titulo} se actualiza mediante su generador de artefactos.`);
    }
    if (!propuesta || typeof propuesta !== 'object' || Array.isArray(propuesta) || !Object.keys(propuesta).length) {
      throw new Error('La propuesta debe contener al menos una decisión estructurada.');
    }

    const plan = await this._obtenerOCrear(proyectoId);
    this.workflow.validarDependencias(plan, etapa);
    if (etapa === 'stack_tecnologico') StackCatalog.resolve(propuesta); // lanza un error claro si algo no está soportado
    if (etapa === 'reglas_negocio') propuesta = await this._normalizarReglas(proyectoId, propuesta);
    if (etapa === 'control_acceso') propuesta = await this._normalizarAcceso(proyectoId, propuesta);
    const actual = plan.etapas.find((item) => item.etapa === etapa);
    const cambioReal = JSON.stringify(actual?.propuesta || null) !== JSON.stringify(propuesta);
    let etapas = plan.etapas.map((item) => item.etapa === etapa ? {
      ...item,
      propuesta,
      observaciones: String(observaciones || ''),
      estado: CODE_PHASE_STATES.IN_REVIEW,
      version: (item.version || 0) + 1,
      aprobada_por: null,
      aprobada_en: null
    } : item);
    if (cambioReal) etapas = this.workflow.invalidarDependientes(etapas, etapa);
    etapas = this.workflow.sincronizarBloqueos(etapas);

    const guardado = await this.planCodificacionRepository.guardar(proyectoId, {
      etapas,
      version: (plan.version || 0) + 1
    });
    return this.workflow.enriquecer(guardado);
  }

  async revisar({ proyectoId, etapa, decision, observaciones = '', aprobadoPor = null }) {
    await this._obtenerProyectoListo(proyectoId);
    if (!['aprobar', 'rechazar'].includes(decision)) throw new Error(`Decisión no válida: ${decision}.`);
    const definition = this.workflow.obtenerDefinicion(etapa);
    if (definition.tipo !== 'decision') {
      throw new Error(`${definition.titulo} debe aprobarse desde el artefacto generado.`);
    }
    const plan = await this._obtenerOCrear(proyectoId);
    this.workflow.validarDependencias(plan, etapa);
    const actual = plan.etapas.find((item) => item.etapa === etapa);
    if (!actual?.propuesta) throw new Error('No existe una propuesta para revisar en esta etapa.');
    if (decision === 'rechazar' && !String(observaciones || '').trim()) {
      throw new Error('Debes indicar observaciones para rechazar una decisión.');
    }
    if (etapa === 'reglas_negocio' && decision === 'aprobar') {
      // El modelo de dominio pudo cambiar desde que se guardó la propuesta: se vuelve a validar al aprobar.
      const { reglas } = await this._normalizarReglas(proyectoId, actual.propuesta);
      const pendientes = this.ruleService.pendientes(reglas);
      if (pendientes.length) throw new Error(`Resuelve las reglas pendientes (confirmar o rechazar) antes de aprobar la etapa: ${pendientes.join(', ')}.`);
    }

    if (etapa === 'control_acceso' && decision === 'aprobar') {
      // Los RF pudieron cambiar desde que se guardó la propuesta.
      await this._normalizarAcceso(proyectoId, actual.propuesta);
    }

    let etapas = plan.etapas.map((item) => item.etapa === etapa ? {
      ...item,
      estado: decision === 'aprobar' ? CODE_PHASE_STATES.APPROVED : CODE_PHASE_STATES.REJECTED,
      observaciones: String(observaciones || ''),
      aprobada_por: decision === 'aprobar' ? aprobadoPor : null,
      aprobada_en: decision === 'aprobar' ? new Date() : null
    } : item);
    etapas = this.workflow.sincronizarBloqueos(etapas);
    const guardado = await this.planCodificacionRepository.guardar(proyectoId, {
      etapas,
      version: (plan.version || 0) + 1
    });
    return this.workflow.enriquecer(guardado);
  }

  /** Valida las reglas contra el modelo de dominio y los RF aprobados; devuelve la propuesta con reglas normalizadas. */
  async _normalizarReglas(proyectoId, propuesta) {
    const reglas = propuesta?.reglas === undefined ? [] : propuesta.reglas;
    if (!Array.isArray(reglas)) throw new Error('Las reglas de negocio deben enviarse como una lista en "reglas".');
    if (!reglas.length) return { ...propuesta, reglas: [] };
    if (!this.requerimientoRepository || !this.diagramaRepository) throw new Error('No se pueden validar reglas: faltan los repositorios de requisitos o diagramas.');
    const [requerimientos, diagramas] = await Promise.all([
      this.requerimientoRepository.listarPorProyecto(proyectoId),
      this.diagramaRepository.listarPorProyecto(proyectoId)
    ]);
    const modelo = this.domainExtractor.fromDiagrams(diagramas);
    if (!modelo) throw new Error('Las reglas de negocio requieren un diagrama de clases de dominio aprobado y vigente.');
    const resultado = this.ruleService.validar(reglas, { entidades: modelo.entities, requerimientos: requerimientos.filter((item) => item.aprobado) });
    if (resultado.errores.length) throw new Error(`Reglas de negocio no válidas: ${resultado.errores.join(' ')}`);
    return { ...propuesta, reglas: resultado.reglas };
  }

  /** Valida la política de acceso contra los RF aprobados; devuelve la propuesta normalizada. */
  async _normalizarAcceso(proyectoId, propuesta) {
    if (!this.requerimientoRepository) throw new Error('No se puede validar el control de acceso: falta el repositorio de requisitos.');
    const requerimientos = await this.requerimientoRepository.listarPorProyecto(proyectoId);
    const resultado = this.accessService.validar(propuesta, { requerimientos });
    if (resultado.errores.length) throw new Error(`Control de acceso no válido: ${resultado.errores.join(' ')}`);
    return resultado.propuesta;
  }

  async _obtenerOCrear(proyectoId) {
    return (await this.planCodificacionRepository.obtenerPorProyecto(proyectoId)) ||
      this.planCodificacionRepository.crear({ proyecto_id: proyectoId, etapas: this.workflow.crearEtapasIniciales() });
  }

  async _obtenerProyectoListo(proyectoId) {
    const proyecto = await this.proyectoRepository.obtenerPorId(proyectoId);
    if (!proyecto) throw new Error(`Proyecto con ID ${proyectoId} no encontrado.`);
    if (!PROJECT_STATES_WITH_APPROVED_DESIGN.has(proyecto.estado_fase)) {
      throw new Error('Debes aprobar los mockups antes de iniciar la planificación del código.');
    }
    return proyecto;
  }
}

module.exports = GestionarPlanCodificacion;
