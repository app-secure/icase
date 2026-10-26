const CodeGenerationWorkflowService = require('../services/CodeGenerationWorkflowService');
const { CODE_PHASE_STATES } = require('../constants/CodeGenerationPhases');
const BusinessRuleService = require('../services/BusinessRuleService');
const AccessControlService = require('../services/AccessControlService');
const ModuleService = require('../services/ModuleService');
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
    this.moduleService = new ModuleService();
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
    return { proyecto: { id: proyecto.id, nombre: proyecto.nombre }, ...this._conModulos(this.workflow.enriquecer(plan)) };
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
    if (etapa === 'modulos') propuesta = this._normalizarModulos(propuesta);
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
    return this._conModulos(this.workflow.enriquecer(guardado));
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
    return this._conModulos(this.workflow.enriquecer(guardado));
  }

  /**
   * Modo de un clic: recorre todas las etapas de decisión de planificación con valores seguros
   * (login con roles, sin registro abierto, solo reglas explícitas con evidencia literal)
   * y deja un informe final con lo dudoso.
   */
  async ejecutarModoUnClic({ proyectoId, aprobadoPor = null }) {
    const proyecto = await this._obtenerProyectoListo(proyectoId);
    if (!this.proposalService || !this.requerimientoRepository || !this.diagramaRepository) {
      throw new Error('El generador de propuestas de codificación no está configurado.');
    }

    const [requerimientos, diagramas] = await Promise.all([
      this.requerimientoRepository.listarPorProyecto(proyectoId),
      this.diagramaRepository.listarPorProyecto(proyectoId)
    ]);

    const dudas = [];
    const etapasAprobadas = [];

    // 1. Alcance y plataforma
    const sugAlcance = await this.sugerir({ proyectoId, etapa: 'alcance_plataforma' });
    if (sugAlcance.advertencias?.length) {
      dudas.push(...sugAlcance.advertencias.map((adv) => ({ etapa: 'alcance_plataforma', tipo: 'advertencia', detalle: adv })));
    }
    const propAlcance = {
      ...sugAlcance.propuesta,
      plataformas: sugAlcance.propuesta?.plataformas?.length ? sugAlcance.propuesta.plataformas : ['web']
    };
    await this.proponer({ proyectoId, etapa: 'alcance_plataforma', propuesta: propAlcance, observaciones: 'Propuesta segura generada en modo un clic.' });
    await this.revisar({ proyectoId, etapa: 'alcance_plataforma', decision: 'aprobar', observaciones: 'Aprobada automáticamente en modo un clic.', aprobadoPor });
    etapasAprobadas.push('alcance_plataforma');

    // 2. Stack tecnológico
    const sugStack = await this.sugerir({ proyectoId, etapa: 'stack_tecnologico' });
    if (sugStack.advertencias?.length) {
      dudas.push(...sugStack.advertencias.map((adv) => ({ etapa: 'stack_tecnologico', tipo: 'advertencia', detalle: adv })));
    }
    await this.proponer({ proyectoId, etapa: 'stack_tecnologico', propuesta: sugStack.propuesta, observaciones: 'Stack seguro derivado de los requisitos.' });
    await this.revisar({ proyectoId, etapa: 'stack_tecnologico', decision: 'aprobar', observaciones: 'Aprobada automáticamente en modo un clic.', aprobadoPor });
    etapasAprobadas.push('stack_tecnologico');

    // 3. Arquitectura de código
    const sugArqui = await this.sugerir({ proyectoId, etapa: 'arquitectura_codigo' });
    if (sugArqui.advertencias?.length) {
      dudas.push(...sugArqui.advertencias.map((adv) => ({ etapa: 'arquitectura_codigo', tipo: 'advertencia', detalle: adv })));
    }
    await this.proponer({ proyectoId, etapa: 'arquitectura_codigo', propuesta: sugArqui.propuesta, observaciones: 'Arquitectura modular por capas.' });
    await this.revisar({ proyectoId, etapa: 'arquitectura_codigo', decision: 'aprobar', observaciones: 'Aprobada automáticamente en modo un clic.', aprobadoPor });
    etapasAprobadas.push('arquitectura_codigo');

    // 4. Estructura de carpetas
    const sugCarpetas = await this.sugerir({ proyectoId, etapa: 'estructura_carpetas' });
    if (sugCarpetas.advertencias?.length) {
      dudas.push(...sugCarpetas.advertencias.map((adv) => ({ etapa: 'estructura_carpetas', tipo: 'advertencia', detalle: adv })));
    }
    await this.proponer({ proyectoId, etapa: 'estructura_carpetas', propuesta: sugCarpetas.propuesta, observaciones: 'Árbol de carpetas estándar.' });
    await this.revisar({ proyectoId, etapa: 'estructura_carpetas', decision: 'aprobar', observaciones: 'Aprobada automáticamente en modo un clic.', aprobadoPor });
    etapasAprobadas.push('estructura_carpetas');

    // 5. Reglas de negocio: solo reglas explícitas con evidencia literal
    const sugReglas = await this.sugerir({ proyectoId, etapa: 'reglas_negocio' });
    if (sugReglas.advertencias?.length) {
      dudas.push(...sugReglas.advertencias.map((adv) => ({ etapa: 'reglas_negocio', tipo: 'advertencia', detalle: adv })));
    }
    const candidatasReglas = sugReglas.propuesta?.reglas || [];
    let reglasConfirmadas = 0;
    let reglasDescartadas = 0;
    const modelo = this.domainExtractor.fromDiagrams(diagramas);
    const reglasValidadas = [];

    if (modelo && modelo.entities.length) {
      for (const regla of candidatasReglas) {
        const val = this.ruleService.validar([regla], {
          entidades: modelo.entities,
          requerimientos: requerimientos.filter((r) => r.aprobado)
        });
        if (val.errores.length) {
          reglasDescartadas += 1;
          dudas.push({
            etapa: 'reglas_negocio',
            tipo: 'regla_invalida_descartada',
            id: regla.id,
            entidad: regla.entidad,
            detalle: `Regla ${regla.id} descartada por fallo de validación: ${val.errores.join(' ')}`
          });
          continue;
        }
        const tieneEvidenciaLiteral = Boolean(regla.evidencia_literal && String(regla.evidencia_literal).trim().length > 0);
        const esExplicito = regla.origen === 'explicito';
        if (esExplicito && tieneEvidenciaLiteral) {
          reglasConfirmadas += 1;
          reglasValidadas.push({ ...regla, estado_decision: 'confirmado' });
        } else {
          reglasDescartadas += 1;
          dudas.push({
            etapa: 'reglas_negocio',
            tipo: 'regla_no_explicita_descartada',
            id: regla.id,
            entidad: regla.entidad,
            regla_tipo: regla.tipo,
            descripcion: regla.mensaje || regla.descripcion || '',
            detalle: `Regla ${regla.id} (${regla.tipo} en ${regla.entidad}) descartada automáticamente en modo un clic por carecer de evidencia literal explícita.`
          });
          reglasValidadas.push({
            ...regla,
            estado_decision: 'rechazado',
            observaciones: 'Descartada automáticamente en modo un clic por falta de evidencia literal.'
          });
        }
      }
    } else {
      if (candidatasReglas.length) {
        dudas.push({
          etapa: 'reglas_negocio',
          tipo: 'sin_modelo_dominio',
          detalle: 'No se encontró un diagrama de clases de dominio aprobado y vigente; la etapa se aprobó sin reglas sobre los datos.'
        });
      }
    }

    const propReglas = {
      reglas: reglasValidadas,
      notas: `Modo un clic: ${reglasConfirmadas} reglas explícitas confirmadas y ${reglasDescartadas} reglas sin evidencia literal descartadas.`
    };
    await this.proponer({ proyectoId, etapa: 'reglas_negocio', propuesta: propReglas, observaciones: 'Reglas filtradas por evidencia literal.' });
    await this.revisar({ proyectoId, etapa: 'reglas_negocio', decision: 'aprobar', observaciones: 'Aprobada automáticamente en modo un clic.', aprobadoPor });
    etapasAprobadas.push('reglas_negocio');

    // 6. Autenticación y roles: login con roles, sin registro abierto
    const sugAcceso = await this.sugerir({ proyectoId, etapa: 'control_acceso' });
    if (sugAcceso.advertencias?.length) {
      dudas.push(...sugAcceso.advertencias.map((adv) => ({ etapa: 'control_acceso', tipo: 'advertencia', detalle: adv })));
    }
    const propAccesoOriginal = sugAcceso.propuesta || {};
    const rolesSeguros = (propAccesoOriginal.roles || []).map((rol) => ({
      ...rol,
      autoregistro: false,
      incluir: rol.incluir !== false
    }));
    const propAcceso = {
      ...propAccesoOriginal,
      autenticacion: {
        metodo: 'jwt',
        expiracion: propAccesoOriginal.autenticacion?.expiracion || '8h'
      },
      roles: rolesSeguros,
      notas: 'Modo un clic: autenticación JWT obligatoria, roles por actor y autoregistro cerrado.'
    };
    if (!rolesSeguros.length) {
      dudas.push({
        etapa: 'control_acceso',
        tipo: 'sin_roles_especificos',
        detalle: 'No se identificaron actores en los requisitos; el acceso queda reservado para el rol administrador.'
      });
    }
    await this.proponer({ proyectoId, etapa: 'control_acceso', propuesta: propAcceso, observaciones: 'Control de acceso seguro sin autoregistro.' });
    await this.revisar({ proyectoId, etapa: 'control_acceso', decision: 'aprobar', observaciones: 'Aprobada automáticamente en modo un clic.', aprobadoPor });
    etapasAprobadas.push('control_acceso');

    // 7. Módulos: modo automático con valores recomendados por defecto
    const propModulos = {
      modo: 'automatico',
      modulos: this.moduleService.automatico(),
      notas: 'Modo un clic: valores automáticos recomendados.'
    };
    await this.proponer({ proyectoId, etapa: 'modulos', propuesta: propModulos, observaciones: 'Módulos en modo automático.' });
    await this.revisar({ proyectoId, etapa: 'modulos', decision: 'aprobar', observaciones: 'Aprobada automáticamente en modo un clic.', aprobadoPor });
    etapasAprobadas.push('modulos');

    // Informe final
    const informe = {
      ejecutado_en: new Date().toISOString(),
      aprobado_por: aprobadoPor,
      resumen: `Modo de un clic ejecutado con éxito. Se aprobaron las ${etapasAprobadas.length} decisiones con valores seguros.`,
      etapas_aprobadas: etapasAprobadas,
      valores_seguros: {
        plataformas: propAlcance.plataformas,
        stack: {
          backend: sugStack.propuesta?.backend,
          frontend: sugStack.propuesta?.frontend,
          base_datos: sugStack.propuesta?.base_datos,
          gestor_paquetes: sugStack.propuesta?.gestor_paquetes
        },
        autenticacion: propAcceso.autenticacion.metodo,
        expiracion: propAcceso.autenticacion.expiracion,
        autoregistro: 'desactivado',
        reglas_confirmadas: reglasConfirmadas,
        reglas_descartadas: reglasDescartadas,
        modulos: 'automatico'
      },
      dudas,
      total_dudas: dudas.length
    };

    const guardado = await this.planCodificacionRepository.guardar(proyectoId, {
      modo_un_clic: informe
    });

    const resultadoEnriquecido = this._conModulos(this.workflow.enriquecer(guardado));
    return {
      proyecto: { id: proyecto.id, nombre: proyecto.nombre },
      plan: resultadoEnriquecido,
      informe
    };
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

  _normalizarModulos(propuesta) {
    const resultado = this.moduleService.validar(propuesta);
    if (resultado.errores.length) throw new Error(`Módulos no válidos: ${resultado.errores.join(' ')}`);
    return resultado.propuesta;
  }

  /** Añade al plan qué módulos incluye la aplicación según las decisiones aprobadas (se recalcula, no se guarda). */
  _conModulos(plan) {
    const decisiones = Object.fromEntries((plan.etapas || []).filter((item) => item.estado === CODE_PHASE_STATES.APPROVED && item.propuesta).map((item) => [item.etapa, item.propuesta]));
    return { ...plan, modulos: { incluidos: this.moduleService.incluidos(decisiones), opcionales: ModuleService.opcionales(), activos: this.moduleService.activos(decisiones.modulos) } };
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
