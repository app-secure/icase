const crypto = require('crypto');
const CodeGenerationWorkflowService = require('../services/CodeGenerationWorkflowService');
const { CODE_PHASE_STATES } = require('../constants/CodeGenerationPhases');
const ArtifactVerificationService = require('../services/ArtifactVerificationService');
const SandboxRuntimeVerifier = require('../../infrastructure/services/SandboxRuntimeVerifier');
const GenerationCoverageService = require('../services/GenerationCoverageService');
const DependencyAudit = require('../constants/DependencyAudit');
const VerificationDiagnosisService = require('../services/VerificationDiagnosisService');

class GestionarArtefactosCodigo {
  constructor({ proyectoRepository, requerimientoRepository, diagramaRepository, disenoRepository, planCodificacionRepository, artefactoRepository, backendGenerator, frontendGenerator, testGenerator, infrastructureGenerator, pipelineGenerator, deliveryGenerator, localRunService = null }) {
    this.proyectoRepository = proyectoRepository;
    this.requerimientoRepository = requerimientoRepository;
    this.diagramaRepository = diagramaRepository;
    this.disenoRepository = disenoRepository;
    this.planRepository = planCodificacionRepository;
    this.artefactoRepository = artefactoRepository;
    this.backendGenerator = backendGenerator;
    this.frontendGenerator = frontendGenerator;
    this.testGenerator = testGenerator;
    this.infrastructureGenerator = infrastructureGenerator;
    this.pipelineGenerator = pipelineGenerator;
    this.deliveryGenerator = deliveryGenerator;
    this.localRunService = localRunService;
    this.workflow = new CodeGenerationWorkflowService();
    this.verifier = new ArtifactVerificationService();
    this.runtimeVerifier = new SandboxRuntimeVerifier();
  }

  /**
   * La especificación que se genera es la guardada, normalizada con el árbol de pantallas: las listas por rol, las operaciones derivadas y
   * lo que completa el sistema se aplican siempre, no solo cuando alguien vuelve a guardar la etapa. Si no se puede normalizar, se usa la guardada.
   */
  _especificacionVigente(decisiones, { requerimientos = [], diagramas = [], pantallas = [], verbosPorRf = null } = {}) {
    const guardada = decisiones.especificacion_aplicacion;
    if (!Array.isArray(guardada?.operaciones) || !guardada.operaciones.length) return decisiones;
    const modelo = new (require('../../infrastructure/services/DomainModelExtractor'))().fromDiagrams(diagramas || []);
    if (!modelo) return decisiones;
    const rf = (requerimientos || []).filter((item) => item.aprobado === true && String(item.tipo).toUpperCase() === 'RF');
    const resultado = new (require('../../infrastructure/services/ApplicationSpecService'))({}).validar(
      { operaciones: guardada.operaciones, pantallas: guardada.pantallas }, { modelo, rf, pantallas: Array.isArray(pantallas) ? pantallas : [], verbosPorRf });
    if (resultado.errores.length) return decisiones;
    return { ...decisiones, especificacion_aplicacion: { ...guardada, operaciones: resultado.operaciones, pantallas: resultado.pantallas } };
  }

  _decisionesGeneracion(plan, proyecto, requerimientos, diagramas = []) {
    const decisiones = Object.fromEntries(plan.etapas.filter(item => item.estado === 'aprobada' && item.propuesta).map(item => [item.etapa, item.propuesta]));
    if (!decisiones.modulos) {
      const Propuestas = require('../services/CodePlanningProposalService');
      decisiones.modulos = new Propuestas().generar({ etapa: 'modulos', proyecto, plan, requerimientos, diagramas }).propuesta;
    }
    return decisiones;
  }

  _modulosDelPlan(plan, seleccion) {
    const ModuleService = require('../services/ModuleService');
    const decisiones = Object.fromEntries(plan.etapas.filter(item => item.estado === 'aprobada').map(item => [item.etapa, item.propuesta]));
    const service = new ModuleService();
    const activos = service.activos(seleccion || decisiones.modulos);
    const catalogo = [...service.incluidos(decisiones), ...ModuleService.opcionales().map(m => ({ ...m, activo: activos.includes(m.id) }))];
    return { incluidos: catalogo.filter(m => m.activo).map(m => m.etiqueta), excluidos: catalogo.filter(m => !m.activo).map(m => m.etiqueta) };
  }

  async verificarArtefacto(proyectoId, artefactoId) {
    const artefacto = await this.artefactoRepository.obtenerPorId(artefactoId);
    if (!artefacto || String(artefacto.proyecto_id) !== String(proyectoId)) {
      throw new Error('Artefacto no encontrado para este proyecto.');
    }
    const structural = this.verifier.verificar(artefacto);
    let verificacion = structural;
    let ejecutados = artefacto.archivos || [];
    if (structural.estado === 'apta_estructuralmente' && ['codigo_backend', 'codigo_frontend', 'pruebas', 'paquete_entrega'].includes(artefacto.tipo)) {
      let runtimeArtifact = artefacto;
      if (artefacto.tipo === 'pruebas') {
        const [backend, frontend] = await Promise.all([
          this.artefactoRepository.obtenerUltimoAprobado(proyectoId, 'codigo_backend'),
          this.artefactoRepository.obtenerUltimoAprobado(proyectoId, 'codigo_frontend')
        ]);
        if (!backend || !frontend) throw new Error('Se requieren backend y frontend aprobados para probar la suite.');
        runtimeArtifact = { ...artefacto, archivos: [...backend.archivos, ...frontend.archivos, ...artefacto.archivos] };
      }
      ejecutados = runtimeArtifact.archivos || ejecutados;
      const runtime = await this.runtimeVerifier.verificar(runtimeArtifact);
      verificacion = { ...structural, estado: runtime.estado, nivel: runtime.nivel,
        protocolo: runtime.protocolo,
        protocolo_despliegue: runtime.protocolo_despliegue,
        protocolo_dependencias: runtime.protocolo_dependencias,
        ...(artefacto.tipo === 'codigo_backend' || artefacto.tipo === 'paquete_entrega'
          ? { cobertura_funcional: this._evaluarCobertura(artefacto) } : {}),
        pruebas: runtime.pruebas, errores: runtime.errores || [],
        nota: runtime.estado === 'apta'
          ? 'Verificación técnica completada para esta huella de archivos. El alcance funcional se revisa por separado; no certifica todos los RF ni RNF.'
          : 'La ejecución aislada falló o Docker no está disponible. No se puede aprobar ni exportar este artefacto.' };
    }
    // Si falló, se indica dónde: archivo, línea y mensaje, para corregir solo eso sin regenerar el artefacto.
    if ((verificacion.errores || []).length) {
      verificacion = { ...verificacion, diagnostico: new VerificationDiagnosisService().diagnosticar({ errores: verificacion.errores, archivos: ejecutados, editables: (artefacto.archivos || []).map((file) => file.ruta) }) };
    }
    const reverificada = artefacto.pendiente_reverificacion === true;
    const supera = ['codigo_backend', 'codigo_frontend', 'pruebas', 'paquete_entrega'].includes(artefacto.tipo)
      ? verificacion.estado === 'apta' && verificacion.nivel === 'ejecucion_aislada'
      : verificacion.estado === 'apta_estructuralmente';
    if (reverificada && !supera) {
      // La corrección no pasó: la aprobación se retira y el paso del plan vuelve a revisión (con sus dependientes).
      await this.artefactoRepository.actualizar(artefactoId, { verificacion, estado: 'en_revision', aprobado: false, pendiente_reverificacion: false });
      const etapa = require('../constants/CodeGenerationPhases').CODE_PHASE_DEFINITIONS;
      const id = Object.values(etapa).find((item) => item.artefacto === artefacto.tipo)?.id;
      const plan = await this.planRepository.obtenerPorProyecto(proyectoId);
      if (id && plan) await this._actualizarEtapa(plan, id, CODE_PHASE_STATES.IN_REVIEW, 'La corrección puntual no pasó la verificación: se retiró la aprobación. Corrige y vuelve a verificar.');
      return { ...verificacion, aprobacion_retirada: true };
    }
    await this.artefactoRepository.actualizar(artefactoId, { verificacion, ...(reverificada ? { pendiente_reverificacion: false } : {}) });
    return reverificada ? { ...verificacion, aprobacion_mantenida: true } : verificacion;
  }

  async actualizarArchivo({ proyectoId, artefactoId, ruta, contenido }) {
    if (typeof ruta !== 'string' || typeof contenido !== 'string' || contenido.length > 500000) {
      throw new Error('Ruta o contenido de archivo no válido (máximo 500 KB).');
    }
    const artefacto = await this.artefactoRepository.obtenerPorId(artefactoId);
    if (!artefacto || String(artefacto.proyecto_id) !== String(proyectoId)) {
      throw new Error('Artefacto no encontrado para este proyecto.');
    }
    if (!['en_revision', 'aprobado'].includes(artefacto.estado)) throw new Error('Solo se pueden editar archivos de un artefacto en revisión o aprobado.');
    const ultimo = await this.artefactoRepository.obtenerUltimo(proyectoId, artefacto.tipo);
    if (String(ultimo?.id) !== String(artefactoId)) throw new Error('Solo se puede editar la versión más reciente.');
    if (!(artefacto.archivos || []).some((file) => file.ruta === ruta)) throw new Error('El archivo no pertenece a este artefacto.');
    const archivos = artefacto.archivos.map((file) => file.ruta === ruta
      ? { ...file, contenido, huella: crypto.createHash('sha256').update(contenido).digest('hex') }
      : file);
    const anterior = artefacto.archivos.find((file) => file.ruta === ruta);
    const nueva = archivos.find((file) => file.ruta === ruta);
    if (anterior?.huella === nueva.huella) return artefacto; // sin cambios reales: no se pierde la verificación
    // Sobre un artefacto aprobado la corrección es puntual: se registra y la aprobación se mantiene solo si la
    // nueva verificación pasa (ver verificarArtefacto). Mientras tanto no puede empaquetarse sin verificación vigente.
    const aprobado = artefacto.estado === 'aprobado';
    return this.artefactoRepository.actualizar(artefactoId, {
      archivos, verificacion: null,
      ...(aprobado ? {
        pendiente_reverificacion: true,
        correcciones: [...(artefacto.correcciones || []), { ruta, huella_anterior: anterior?.huella || '', huella_nueva: nueva.huella, corregido_en: new Date().toISOString() }]
      } : {})
    });
  }

  _falloSoloInterfazDisenada(stored) {
    const errores = (stored?.errores || []).join('\n');
    const correcto = (pattern) => (stored?.pruebas || []).some((item) => pattern.test(item.paso) && item.resultado === 'correcto');
    const base = correcto(/Compilación/) && correcto(/health checks/) && correcto(/CRUD/);
    const specs = errores.match(/[\w.-]+\.spec\.[jt]s/gi) || [];
    const interfaz = specs.length > 0 && specs.every(spec => spec === 'designed-ui.spec.js');
    const otro = /Cannot connect to the Docker daemon|docker: not found|failed to solve|error TS/i.test(errores);
    return Boolean(stored && stored.estado === 'fallida' && stored.nivel === 'ejecucion_aislada' && base && interfaz && !otro);
  }

  _exigirVerificacion(artefacto, { permisivo = false } = {}) {
    const resultado = this.verifier.verificar(artefacto);
    if (resultado.estado !== 'apta_estructuralmente') {
      throw new Error(`No se puede aprobar un artefacto incompleto. Verificación: ${resultado.errores.join(' ')}`);
    }
    let stored = artefacto.verificacion;
    // La infraestructura y el pipeline solo tienen verificación estructural: no hay nada que ejecutar, así que no exigen un paso manual.
    if (['infraestructura', 'pipeline_ci_cd'].includes(artefacto.tipo) && (!stored || stored.huella !== resultado.huella)) stored = resultado;
    if (!stored || stored.huella !== resultado.huella) throw new Error('Verifica esta versión del artefacto antes de aprobarla.');
    const admitePermisivo = permisivo && ['pruebas', 'paquete_entrega'].includes(artefacto.tipo);
    if (admitePermisivo && stored.estado !== 'apta' && !this._falloSoloInterfazDisenada(stored)) {
      throw new Error('El modo permisivo solo cubre el fallo de los formularios del mockup, cuando la compilación, el arranque y el CRUD ya pasaron.');
    }
    if (admitePermisivo && this._falloSoloInterfazDisenada(stored)) {
      stored = {
        ...stored,
        estado: 'apta',
        modo_permisivo: true,
        errores: [],
        advertencias: [...(stored.advertencias || []), 'Modo permisivo: se aprobó aunque fallaron los formularios del mockup. La compilación, el arranque y el CRUD HTTP sí pasaron.']
      };
    }
    const needsRuntime = ['codigo_backend', 'codigo_frontend', 'pruebas', 'paquete_entrega'].includes(artefacto.tipo);
    if (needsRuntime ? stored.estado !== 'apta' || stored.nivel !== 'ejecucion_aislada' : stored.estado !== 'apta_estructuralmente') {
      throw new Error(`La verificación del artefacto no fue satisfactoria: ${(stored.errores || []).join(' ')}`);
    }

    if (['codigo_backend', 'paquete_entrega'].includes(artefacto.tipo)) {
      let manifest = {};
      try { manifest = JSON.parse(artefacto.archivos?.find((file) => file.ruta === 'backend/icase.manifest.json')?.contenido || '{}'); } catch { /* La revisión estructural rechaza JSON inválido. */ }
      const hasAssociations = (manifest.associations || []).length || (manifest.storage?.associations || []).length || (manifest.relations || []).some((relation) => relation.cardinalidad === 'muchos_a_muchos');
      const nodeBackend = manifest.stack?.lenguaje === 'node' || artefacto.archivos?.some((file) => file.ruta === 'backend/package.json');
      if (nodeBackend && stored.protocolo_dependencias !== DependencyAudit.protocol) throw new Error('Repite la verificación: falta la auditoría obligatoria de dependencias Node para esta huella.');
      if (hasAssociations && stored.protocolo !== 'runtime-v2-associations') throw new Error('Repite la verificación aislada: la evidencia anterior no incluye el protocolo N:M actual.');
    }
    if (artefacto.tipo === 'paquete_entrega') {
      if (stored.protocolo_despliegue !== 'compose-exportado-v1') throw new Error('Repite la verificación del paquete: falta comprobar el despliegue del Compose exportado.');
      new GenerationCoverageService().exigirEntrega(artefacto);
    }
    return stored;
  }

  _evaluarCobertura(artefacto) {
    const file = artefacto.archivos?.find((item) => item.ruta === 'backend/GENERATION-REPORT.json');
    try {
      const report = JSON.parse(file?.contenido || '{}');
      return report.fuente_cobertura ? new GenerationCoverageService().evaluar(report.fuente_cobertura)
        : { estado: 'sin_evaluar', exportable: false };
    } catch { return { estado: 'sin_evaluar', exportable: false }; }
  }

  asegurarPaqueteEjecutable(artefacto) {
    if (artefacto?.tipo !== 'paquete_entrega') throw new Error('El artefacto no es un paquete de entrega.');
    return this._exigirVerificacion(artefacto);
  }

  _ejecucion() {
    if (!this.localRunService) throw new Error('La ejecución local no está configurada.');
    return this.localRunService;
  }

  /** Estado de la ejecución local del paquete: accesos, contenedores y si hay que volver a levantarlos. */
  async estadoEjecucion(proyectoId) {
    return this._ejecucion().estado(String(proyectoId));
  }

  /** Levanta (o vuelve a levantar) los contenedores del último paquete aprobado y verificado. */
  async iniciarEjecucion(proyectoId) {
    const servicio = this._ejecucion();
    const paquete = await this.artefactoRepository.obtenerUltimoAprobado(proyectoId, 'paquete_entrega');
    if (!paquete) throw new Error('Aprueba el paquete de entrega antes de ejecutar el proyecto.');
    this.asegurarPaqueteEjecutable(paquete);
    return servicio.iniciar({ proyectoId: String(proyectoId), archivos: paquete.archivos || [], version: paquete.version });
  }

  async detenerEjecucion(proyectoId) {
    return this._ejecucion().detener(String(proyectoId));
  }

  async generarFrontend(proyectoId, plataforma) {
    const [proyecto, plan, diseno, requerimientos] = await Promise.all([
      this.proyectoRepository.obtenerPorId(proyectoId),
      this.planRepository.obtenerPorProyecto(proyectoId),
      this.disenoRepository.obtenerPorProyecto(proyectoId),
      this.requerimientoRepository ? this.requerimientoRepository.listarPorProyecto(proyectoId) : []
    ]);
    if (!proyecto || !plan || !diseno) throw new Error('Proyecto, plan o diseño aprobado no encontrado.');
    this.workflow.validarDependencias(plan, 'generacion_frontend');
    if (!['mockups_aprobados', 'diseno_aprobado', 'finalizado'].includes(proyecto.estado_fase)) {
      throw new Error('Los mockups deben estar aprobados antes de generar el frontend.');
    }
    let decisiones = this._decisionesGeneracion(plan, proyecto, requerimientos);
    const versionesOrigen = Object.fromEntries([
      ...plan.etapas.filter((item) => item.estado === CODE_PHASE_STATES.APPROVED).map((item) => [item.etapa, item.version || 1]),
      ...(diseno.mockups || []).map((item) => [`mockup:${item.nombre_pantalla}`, item.version || 1])
    ]);
    const requisitosAprobados = (requerimientos || []).filter((item) => item.aprobado);
    // Identidad (RF de acceso y de cuentas de usuario): sale del contrato de operaciones, que necesita el modelo de dominio.
    const diagramas = this.diagramaRepository ? await this.diagramaRepository.listarPorProyecto(proyectoId) : [];
    decisiones = this._especificacionVigente(decisiones, { requerimientos, diagramas, pantallas: diseno.manifiesto_navegacion, verbosPorRf: await this._verbosPorRf(proyecto, proyectoId) });
    const especificacion = require('../../infrastructure/services/ApplicationSpecService').confirmada(decisiones.especificacion_aplicacion);
    const contratoOperaciones = new (require('../../infrastructure/services/MockupBindingService'))().contrato({ proyecto, requerimientos: requisitosAprobados, diagramas, spec: especificacion });
    // Operaciones de negocio ya enlazadas a su almacén, con el tipo de cada campo: el frontend las llama por nombre.
    const acciones = (contratoOperaciones?.operations || []).flatMap((operation) => operation.actions || []);
    const identidad = contratoOperaciones?.identity || null;
    const referencias = contratoOperaciones?.references || null;
    const input = { contrato_generacion: 'frontend-v32-lf', identidad, referencias, analisis: require('../services/RequirementAnalysisContext').contextOf(proyecto.auditoria_requisitos), requerimientos: requisitosAprobados.map(({ identificador, tipo, titulo, nombre, descripcion }) => ({ identificador, tipo, titulo, nombre, descripcion })), decisiones, manifiesto: diseno.manifiesto_navegacion || [], mockups: diseno.mockups || [], sistema_diseno: diseno.sistema_diseno || {} };
    const huellaEntrada = crypto.createHash('sha256').update(JSON.stringify(input)).digest('hex');
    const ultimo = await this.artefactoRepository.obtenerUltimo(proyectoId, 'codigo_frontend');
    const seleccion = decisiones.stack_tecnologico?.plataformas ?? decisiones.alcance_plataforma?.plataformas ?? ['web'];
    if (plataforma && !seleccion.includes(plataforma)) throw new Error('La plataforma no está seleccionada.');
    const vigente = ultimo?.huella_entrada === huellaEntrada && !['fallido', 'rechazado', 'desactualizado'].includes(ultimo.estado) && ultimo.verificacion?.estado !== 'fallida';
    const carpeta = p => p === 'móvil' ? 'mobile/' : 'frontend/';
    const solicitadas = plataforma ? [plataforma] : seleccion;
    if (!solicitadas.length) throw new Error('El plan solo incluye backend.');
    if (vigente && solicitadas.every(p => ultimo.archivos.some(f => f.ruta.startsWith(carpeta(p))))) {
      return { artefacto: ultimo, reutilizado: true };
    }
    const decisionesParte = { ...decisiones, stack_tecnologico: { ...decisiones.stack_tecnologico, plataformas: solicitadas } };
    const generado = await this.frontendGenerator.generar({ proyecto, insumos: { decisiones: decisionesParte, diseno, requerimientos: requisitosAprobados, identidad, referencias, especificacion, acciones }, versionesOrigen });
    generado.archivos = generado.archivos.filter(f => solicitadas.some(p => f.ruta.startsWith(carpeta(p))));
    if (vigente) generado.archivos.push(...ultimo.archivos.filter(f => !solicitadas.some(p => f.ruta.startsWith(carpeta(p)))));
    const artefacto = await this.artefactoRepository.crear({ proyecto_id: proyectoId, tipo: 'codigo_frontend', version: (ultimo?.version || 0) + 1, estado: 'en_revision', aprobado: false, huella_entrada: huellaEntrada, modulos: this._modulosDelPlan(plan, decisiones.modulos), ...generado });
    if (ultimo?.aprobado) await this.artefactoRepository.actualizar(ultimo.id, { estado: 'desactualizado', aprobado: false });
    await this._actualizarEtapa(plan, 'generacion_frontend', CODE_PHASE_STATES.IN_REVIEW, `Artefacto frontend v${artefacto.version} generado.`);
    return { artefacto, reutilizado: false };
  }

  /** Lo que el backend necesita del proyecto: decisiones aprobadas, requisitos y modelo de dominio vigente. */
  async _insumosBackend(proyectoId) {
    const [proyecto, plan, requerimientos, diagramas] = await Promise.all([
      this.proyectoRepository.obtenerPorId(proyectoId),
      this.planRepository.obtenerPorProyecto(proyectoId),
      this.requerimientoRepository.listarPorProyecto(proyectoId),
      this.diagramaRepository ? this.diagramaRepository.listarPorProyecto(proyectoId) : []
    ]);
    if (!proyecto || !plan) throw new Error('Proyecto o plan de codificación no encontrado.');
    this.workflow.validarDependencias(plan, 'generacion_backend');
    const diagramaDominio = (diagramas || []).find((item) => ['clases_dominio', 'clases'].includes(item.tipo) && item.aprobado && item.estado === 'aprobado' && !item.desactualizado) || null;
    let decisiones = this._decisionesGeneracion(plan, proyecto, requerimientos, diagramas);
    const versionesOrigen = Object.fromEntries(plan.etapas
      .filter((item) => item.estado === CODE_PHASE_STATES.APPROVED)
      .map((item) => [item.etapa, item.version || 1]));
    if (diagramaDominio) versionesOrigen.clases_dominio = diagramaDominio.version || 1;
    const dominio = diagramaDominio ? { version: diagramaDominio.version || 1, codigo: diagramaDominio.codigo_plantuml } : undefined;
    const verbosPorRf = await this._verbosPorRf(proyecto, proyectoId);
    const diseno = this.disenoRepository ? await this.disenoRepository.obtenerPorProyecto(proyectoId) : null;
    decisiones = this._especificacionVigente(decisiones, { requerimientos, diagramas, pantallas: diseno?.manifiesto_navegacion, verbosPorRf });
    return { proyecto, plan, requerimientos, diagramaDominio, decisiones, versionesOrigen, dominio, verbosPorRf };
  }

  /**
   * Verbos válidos que declaran los mockups aprobados para cada RF ({ 'RF-01': ['consultar'] }); determinan los métodos de
   * su operación. Sin mockups aprobados, sin repositorio de diseño o sin enlaces válidos el resultado es vacío: CRUD completo.
   */
  async _verbosPorRf(proyecto, proyectoId) {
    if (!this.disenoRepository || !['mockups_aprobados', 'diseno_aprobado', 'finalizado'].includes(proyecto.estado_fase)) return {};
    const diseno = await this.disenoRepository.obtenerPorProyecto(proyectoId);
    const verbs = {};
    for (const link of (diseno?.mockups || []).flatMap((item) => item.enlaces || [])) {
      if (link.estado !== 'valido' || !link.rf || !link.verbo) continue;
      const key = String(link.rf).toUpperCase();
      verbs[key] = [...new Set([...(verbs[key] || []), link.verbo])];
    }
    return Object.fromEntries(Object.keys(verbs).sort().map((key) => [key, verbs[key].sort()]));
  }

  /** Qué se generaría de cada requisito, sin guardar nada. Falla igual que la generación si algo no es coherente. */
  async informeGeneracion(proyectoId) {
    const { proyecto, requerimientos, diagramaDominio, decisiones, versionesOrigen, verbosPorRf } = await this._insumosBackend(proyectoId);
    const generado = await this.backendGenerator.generar({ proyecto, insumos: { decisiones, requerimientos, diagramaDominio, verbosPorRf }, versionesOrigen });
    const informe = generado.archivos.find((item) => item.ruta === 'backend/GENERATION-REPORT.json');
    if (!informe) throw new Error('El generador de backend no produjo un informe de generación.');
    return JSON.parse(informe.contenido);
  }

  async generarBackend(proyectoId) {
    const { proyecto, plan, requerimientos, diagramaDominio, decisiones, versionesOrigen, dominio, verbosPorRf } = await this._insumosBackend(proyectoId);
    const semanticRequirements = new (require('../services/RequirementChangeService'))({}).normalize(requerimientos.filter(item => item.aprobado));
    const huellaEntrada = crypto.createHash('sha256').update(JSON.stringify({ contrato_generacion: 'capacidades-v28-lf', analisis: require('../services/RequirementAnalysisContext').contextOf(proyecto.auditoria_requisitos), decisiones, requerimientos: semanticRequirements, dominio, ...(Object.keys(verbosPorRf).length ? { verbos: verbosPorRf } : {}) })).digest('hex');
    const ultimo = await this.artefactoRepository.obtenerUltimo(proyectoId, 'codigo_backend');
    if (ultimo?.huella_entrada === huellaEntrada && !['fallido', 'rechazado', 'desactualizado'].includes(ultimo.estado) && ultimo.verificacion?.estado !== 'fallida') return { artefacto: ultimo, reutilizado: true };

    const generado = await this.backendGenerator.generar({ proyecto, insumos: { decisiones, requerimientos, diagramaDominio, verbosPorRf, backendAnterior: ultimo?.aprobado ? ultimo : null }, versionesOrigen });
    const artefacto = await this.artefactoRepository.crear({
      proyecto_id: proyectoId, tipo: 'codigo_backend', version: (ultimo?.version || 0) + 1,
      estado: 'en_revision', aprobado: false, huella_entrada: huellaEntrada, modulos: this._modulosDelPlan(plan, decisiones.modulos), ...generado
    });
    if (ultimo?.aprobado) {
      await this.artefactoRepository.actualizar(ultimo.id, { estado: 'desactualizado', aprobado: false });
    }
    await this._actualizarEtapa(plan, 'generacion_backend', CODE_PHASE_STATES.IN_REVIEW, `Artefacto backend v${artefacto.version} generado.`);
    return { artefacto, reutilizado: false };
  }

  async revisarBackend({ proyectoId, artefactoId, decision, observaciones = '', modo_permisivo = false }) {
    return this._revisarArtefacto({
      proyectoId, artefactoId, decision, observaciones, modo_permisivo,
      tipo: 'codigo_backend', etapa: 'generacion_backend', nombre: 'backend'
    });
  }

  async revisarFrontend({ proyectoId, artefactoId, decision, observaciones = '' }) {
    return this._revisarArtefacto({ proyectoId, artefactoId, decision, observaciones, tipo: 'codigo_frontend', etapa: 'generacion_frontend', nombre: 'frontend' });
  }

  async generarPruebas(proyectoId) {
    let [proyecto, plan, requerimientos, backend, frontend] = await Promise.all([
      this.proyectoRepository.obtenerPorId(proyectoId), this.planRepository.obtenerPorProyecto(proyectoId),
      this.requerimientoRepository.listarPorProyecto(proyectoId),
      this.artefactoRepository.obtenerUltimoAprobado(proyectoId, 'codigo_backend'),
      this.artefactoRepository.obtenerUltimoAprobado(proyectoId, 'codigo_frontend')
    ]);
    if (!proyecto || !plan) throw new Error('Proyecto o plan de codificación no encontrado.');
    plan = await this.workflow.reconciliarPlan({ plan, proyectoId, planRepository: this.planRepository, artefactoRepository: this.artefactoRepository });
    this.workflow.validarDependencias(plan, 'generacion_pruebas');
    if (!backend || !frontend) throw new Error('Debes aprobar backend y frontend antes de generar las pruebas.');
    const versionesOrigen = { codigo_backend: backend.version, codigo_frontend: frontend.version };
    const huellaEntrada = crypto.createHash('sha256').update(JSON.stringify({ contrato_generacion: 'pruebas-v25-lf', versionesOrigen, rf: requerimientos.filter((item) => item.aprobado) })).digest('hex');
    const ultimo = await this.artefactoRepository.obtenerUltimo(proyectoId, 'pruebas');
    if (ultimo?.huella_entrada === huellaEntrada && !['fallido', 'rechazado', 'desactualizado'].includes(ultimo.estado) && ultimo.verificacion?.estado !== 'fallida') return { artefacto: ultimo, reutilizado: true };
    const generado = await this.testGenerator.generar({ proyecto, insumos: { requerimientos, backend, frontend }, versionesOrigen });
    const artefacto = await this.artefactoRepository.crear({ proyecto_id: proyectoId, tipo: 'pruebas', version: (ultimo?.version || 0) + 1, estado: 'en_revision', aprobado: false, huella_entrada: huellaEntrada, modulos: backend.modulos || this._modulosDelPlan(plan), ...generado });
    if (ultimo?.aprobado) await this.artefactoRepository.actualizar(ultimo.id, { estado: 'desactualizado', aprobado: false });
    await this._actualizarEtapa(plan, 'generacion_pruebas', CODE_PHASE_STATES.IN_REVIEW, `Suite de pruebas v${artefacto.version} generada.`);
    return { artefacto, reutilizado: false };
  }

  async revisarPruebas({ proyectoId, artefactoId, decision, observaciones = '', modo_permisivo = false }) {
    return this._revisarArtefacto({ proyectoId, artefactoId, decision, observaciones, modo_permisivo, tipo: 'pruebas', etapa: 'generacion_pruebas', nombre: 'suite de pruebas' });
  }

  async generarInfraestructura(proyectoId) {
    let [proyecto, plan, requerimientos, diagramas, backend, frontend] = await Promise.all([
      this.proyectoRepository.obtenerPorId(proyectoId), this.planRepository.obtenerPorProyecto(proyectoId),
      this.requerimientoRepository.listarPorProyecto(proyectoId), this.diagramaRepository.listarPorProyecto(proyectoId),
      this.artefactoRepository.obtenerUltimoAprobado(proyectoId, 'codigo_backend'),
      this.artefactoRepository.obtenerUltimoAprobado(proyectoId, 'codigo_frontend')
    ]);
    if (!proyecto || !plan) throw new Error('Proyecto o plan de codificación no encontrado.');
    plan = await this.workflow.reconciliarPlan({ plan, proyectoId, planRepository: this.planRepository, artefactoRepository: this.artefactoRepository });
    this.workflow.validarDependencias(plan, 'generacion_infraestructura');
    if (!backend || !frontend) throw new Error('Debes aprobar backend y frontend antes de generar infraestructura.');
    const aprobados = diagramas.filter((item) => item.aprobado && item.estado === 'aprobado' && !item.desactualizado);
    const decisiones = this._decisionesGeneracion(plan, proyecto, requerimientos, aprobados);
    const versionesOrigen = { codigo_backend: backend.version, codigo_frontend: frontend.version, ...Object.fromEntries(aprobados.map((item) => [item.tipo, item.version || 1])) };
    const input = { contrato_generacion: 'infraestructura-v8-plataformas', versionesOrigen, decisiones, analisis: require('../services/RequirementAnalysisContext').contextOf(proyecto.auditoria_requisitos), rnf: new (require('../services/RequirementChangeService'))({}).normalize(requerimientos.filter((item) => item.aprobado && item.tipo === 'RNF')) };
    const huellaEntrada = crypto.createHash('sha256').update(JSON.stringify(input)).digest('hex');
    const ultimo = await this.artefactoRepository.obtenerUltimo(proyectoId, 'infraestructura');
    if (ultimo?.huella_entrada === huellaEntrada && !['fallido', 'rechazado', 'desactualizado'].includes(ultimo.estado)) return { artefacto: ultimo, reutilizado: true };
    const generado = await this.infrastructureGenerator.generar({ proyecto, insumos: { decisiones, requerimientos: requerimientos.filter((item) => item.aprobado), diagramas: aprobados, backend, frontend }, versionesOrigen });
    const artefacto = await this.artefactoRepository.crear({ proyecto_id: proyectoId, tipo: 'infraestructura', version: (ultimo?.version || 0) + 1, estado: 'en_revision', aprobado: false, huella_entrada: huellaEntrada, modulos: this._modulosDelPlan(plan, decisiones.modulos), ...generado });
    if (ultimo?.aprobado) await this.artefactoRepository.actualizar(ultimo.id, { estado: 'desactualizado', aprobado: false });
    await this._actualizarEtapa(plan, 'generacion_infraestructura', CODE_PHASE_STATES.IN_REVIEW, `Infraestructura v${artefacto.version} generada.`);
    return { artefacto, reutilizado: false };
  }

  async revisarInfraestructura({ proyectoId, artefactoId, decision, observaciones = '' }) {
    return this._revisarArtefacto({ proyectoId, artefactoId, decision, observaciones, tipo: 'infraestructura', etapa: 'generacion_infraestructura', nombre: 'infraestructura' });
  }

  async generarPipeline(proyectoId) {
    let [proyecto, plan, tests, infrastructure] = await Promise.all([
      this.proyectoRepository.obtenerPorId(proyectoId), this.planRepository.obtenerPorProyecto(proyectoId),
      this.artefactoRepository.obtenerUltimoAprobado(proyectoId, 'pruebas'),
      this.artefactoRepository.obtenerUltimoAprobado(proyectoId, 'infraestructura')
    ]);
    if (!proyecto || !plan) throw new Error('Proyecto o plan de codificación no encontrado.');
    plan = await this.workflow.reconciliarPlan({ plan, proyectoId, planRepository: this.planRepository, artefactoRepository: this.artefactoRepository });
    this.workflow.validarDependencias(plan, 'generacion_ci_cd');
    if (!tests || !infrastructure) throw new Error('Debes aprobar pruebas e infraestructura antes de generar CI/CD.');
    const decisiones = Object.fromEntries(plan.etapas.filter((item) => item.estado === CODE_PHASE_STATES.APPROVED && item.propuesta).map((item) => [item.etapa, item.propuesta]));
    if (!decisiones.stack_tecnologico?.ci_cd) {
      decisiones.stack_tecnologico = { ...(decisiones.stack_tecnologico || {}), ci_cd: 'GitHub Actions' };
    }
    const versionesOrigen = { pruebas: tests.version, infraestructura: infrastructure.version };
    const huellaEntrada = crypto.createHash('sha256').update(JSON.stringify({ contrato_generacion: 'pipeline-v7-plataformas', versionesOrigen, decisiones })).digest('hex');
    const ultimo = await this.artefactoRepository.obtenerUltimo(proyectoId, 'pipeline_ci_cd');
    if (ultimo?.huella_entrada === huellaEntrada && !['fallido', 'rechazado', 'desactualizado'].includes(ultimo.estado)) return { artefacto: ultimo, reutilizado: true };
    const generado = await this.pipelineGenerator.generar({ proyecto, insumos: { tests, infrastructure, decisiones }, versionesOrigen });
    const artefacto = await this.artefactoRepository.crear({ proyecto_id: proyectoId, tipo: 'pipeline_ci_cd', version: (ultimo?.version || 0) + 1, estado: 'en_revision', aprobado: false, huella_entrada: huellaEntrada, modulos: infrastructure.modulos || this._modulosDelPlan(plan), ...generado });
    if (ultimo?.aprobado) await this.artefactoRepository.actualizar(ultimo.id, { estado: 'desactualizado', aprobado: false });
    await this._actualizarEtapa(plan, 'generacion_ci_cd', CODE_PHASE_STATES.IN_REVIEW, `Pipeline CI/CD v${artefacto.version} generado.`);
    return { artefacto, reutilizado: false };
  }

  async revisarPipeline({ proyectoId, artefactoId, decision, observaciones = '' }) {
    return this._revisarArtefacto({ proyectoId, artefactoId, decision, observaciones, tipo: 'pipeline_ci_cd', etapa: 'generacion_ci_cd', nombre: 'pipeline CI/CD' });
  }

  async generarPaquete(proyectoId) {
    const tipos = ['codigo_backend', 'codigo_frontend', 'pruebas', 'infraestructura', 'pipeline_ci_cd'];
    let [proyecto, plan, ...artefactos] = await Promise.all([
      this.proyectoRepository.obtenerPorId(proyectoId), this.planRepository.obtenerPorProyecto(proyectoId),
      ...tipos.map((tipo) => this.artefactoRepository.obtenerUltimoAprobado(proyectoId, tipo))
    ]);
    if (!proyecto || !plan) throw new Error('Proyecto o plan de codificación no encontrado.');
    plan = await this.workflow.reconciliarPlan({ plan, proyectoId, planRepository: this.planRepository, artefactoRepository: this.artefactoRepository });
    this.workflow.validarDependencias(plan, 'paquete_entrega');
    const faltantes = tipos.filter((_tipo, index) => !artefactos[index]);
    if (faltantes.length) throw new Error(`Faltan artefactos aprobados para la entrega: ${faltantes.join(', ')}.`);
    new GenerationCoverageService().exigirEntrega(artefactos[0]);
    this._exigirPuertaFuncional(artefactos, plan);
    for (const artefacto of artefactos) this._exigirVerificacion(artefacto);
    const versionesOrigen = Object.fromEntries(artefactos.map((item) => [item.tipo, item.version]));
    const huellaEntrada = crypto.createHash('sha256').update(JSON.stringify({contrato_generacion:'entrega-v4-designed-ui-resilient',versionesOrigen})).digest('hex');
    const ultimo = await this.artefactoRepository.obtenerUltimo(proyectoId, 'paquete_entrega');
    if (ultimo?.huella_entrada === huellaEntrada && !['fallido', 'rechazado', 'desactualizado'].includes(ultimo.estado) && ultimo.verificacion?.estado !== 'fallida') return { artefacto: ultimo, reutilizado: true };
    const generado = await this.deliveryGenerator.generar({ proyecto, insumos: { artefactos }, versionesOrigen });
    const artefacto = await this.artefactoRepository.crear({ proyecto_id: proyectoId, tipo: 'paquete_entrega', version: (ultimo?.version || 0) + 1, estado: 'en_revision', aprobado: false, huella_entrada: huellaEntrada, modulos: artefactos[0].modulos || this._modulosDelPlan(plan), ...generado });
    if (ultimo?.aprobado) await this.artefactoRepository.actualizar(ultimo.id, { estado: 'desactualizado', aprobado: false });
    await this._actualizarEtapa(plan, 'paquete_entrega', CODE_PHASE_STATES.IN_REVIEW, `Paquete de entrega v${artefacto.version} generado.`);
    return { artefacto, reutilizado: false };
  }

  /** Hallazgos que la persona aceptó de forma explícita; una aceptación vieja no cubre un problema nuevo. */
  _excepcionesPuerta(plan) {
    return Array.isArray(plan?.puerta_funcional?.excepciones) ? plan.puerta_funcional.excepciones : [];
  }

  /** Acepta (o deja de aceptar) bloqueos concretos. Solo se aceptan los que existen ahora; el resto se rechaza. */
  async aceptarPuertaFuncional({ proyectoId, excepciones, aceptadoPor = null }) {
    if (!Array.isArray(excepciones) || excepciones.some((item) => typeof item !== 'string')) throw new Error('Las excepciones deben ser una lista de identificadores de hallazgo.');
    const actual = await this.evaluarPuertaFuncional(proyectoId, { sinExcepciones: true });
    const bloqueos = new Set(actual.hallazgos.filter((item) => item.severidad === 'bloqueo').map((item) => item.id));
    const desconocidas = excepciones.filter((item) => !bloqueos.has(item));
    if (desconocidas.length) throw new Error(`No existe un bloqueo con estos identificadores: ${desconocidas.join(', ')}.`);
    await this.planRepository.guardar(proyectoId, { puerta_funcional: { excepciones: [...new Set(excepciones)].sort(), aceptado_por: aceptadoPor, aceptado_en: new Date() } });
    return this.evaluarPuertaFuncional(proyectoId);
  }

  _exigirPuertaFuncional(artefactos, plan) {
    const FunctionalGateService = require('../services/FunctionalGateService');
    return new FunctionalGateService().exigir({ archivos: artefactos.flatMap((item) => item.archivos || []), excepciones: this._excepcionesPuerta(plan) });
  }

  /** Estado actual de la puerta de calidad funcional con los últimos artefactos (para mostrarlo antes de empaquetar). */
  async evaluarPuertaFuncional(proyectoId, { sinExcepciones = false } = {}) {
    const FunctionalGateService = require('../services/FunctionalGateService');
    const plan = await this.planRepository.obtenerPorProyecto(proyectoId);
    const artefactos = (await Promise.all(['codigo_backend', 'codigo_frontend', 'pruebas'].map((tipo) => this.artefactoRepository.obtenerUltimo(proyectoId, tipo)))).filter(Boolean);
    if (!artefactos.length) return { version: 1, estado: 'sin_artefactos', hallazgos: [], pendientes: [], excepciones: [] };
    return new FunctionalGateService().evaluar({ archivos: artefactos.flatMap((item) => item.archivos || []), excepciones: sinExcepciones ? [] : this._excepcionesPuerta(plan) });
  }

  async revisarPaquete({ proyectoId, artefactoId, decision, observaciones = '', modo_permisivo = false }) {
    const actualizado = await this._revisarArtefacto({ proyectoId, artefactoId, decision, observaciones, modo_permisivo, tipo: 'paquete_entrega', etapa: 'paquete_entrega', nombre: 'paquete de entrega' });
    if (decision === 'aprobar' && typeof this.proyectoRepository.actualizarEstadoFase === 'function') {
      await this.proyectoRepository.actualizarEstadoFase(proyectoId, 'finalizado');
    }
    return actualizado;
  }

  async _revisarArtefacto({ proyectoId, artefactoId, decision, observaciones, tipo, etapa, nombre, modo_permisivo = false }) {
    if (!['aprobar', 'rechazar'].includes(decision)) throw new Error('Decisión de artefacto no válida.');
    if (decision === 'rechazar' && !String(observaciones).trim()) throw new Error(`Debes indicar observaciones para rechazar el ${nombre}.`);
    const [plan, artefacto, ultimo] = await Promise.all([
      this.planRepository.obtenerPorProyecto(proyectoId), this.artefactoRepository.obtenerPorId(artefactoId), this.artefactoRepository.obtenerUltimo(proyectoId, tipo)
    ]);
    if (!plan || !artefacto || String(artefacto.proyecto_id) !== String(proyectoId) || artefacto.tipo !== tipo) throw new Error(`Artefacto ${nombre} no encontrado para este proyecto.`);
    if (String(ultimo?.id) !== String(artefactoId)) throw new Error(`Solo se puede revisar la versión más reciente del ${nombre}.`);
    if (artefacto.estado !== 'en_revision') throw new Error(`El artefacto ${nombre} ya fue revisado.`);
    if (decision === 'aprobar' && tipo === 'paquete_entrega') this._exigirPuertaFuncional([artefacto], plan);
    if (decision === 'aprobar' && tipo === 'codigo_frontend') {
      const stack = plan.etapas.find(item => item.etapa === 'stack_tecnologico')?.propuesta;
      const faltan = (stack?.plataformas || []).filter(p => !artefacto.archivos.some(f => f.ruta === (p === 'móvil' ? 'mobile/package.json' : 'frontend/package.json')));
      if (faltan.length) throw new Error('Falta generar: ' + faltan.join(', '));
    }
    const verificacion = decision === 'aprobar' ? this._exigirVerificacion(artefacto, { permisivo: modo_permisivo === true }) : undefined;
    const estadoAnterior = artefacto.estado;
    const aprobadoAnterior = artefacto.aprobado;
    const actualizado = await this.artefactoRepository.actualizar(artefactoId, { estado: decision === 'aprobar' ? 'aprobado' : 'rechazado', aprobado: decision === 'aprobar', ...(verificacion ? { verificacion } : {}), ...(decision === 'rechazar' ? { errores: [...(artefacto.errores || []), String(observaciones).trim()] } : {}) });
    try {
      await this._actualizarEtapa(plan, etapa, decision === 'aprobar' ? CODE_PHASE_STATES.APPROVED : CODE_PHASE_STATES.REJECTED, observaciones);
    } catch (error) {
      try {
        await this.artefactoRepository.actualizar(artefactoId, { estado: estadoAnterior, aprobado: aprobadoAnterior });
      } catch { /* Si tampoco se puede revertir, la reconciliación del plan reparará la etapa. */ }
      throw error;
    }
    return actualizado;
  }

  async _actualizarEtapa(plan, etapa, estado, observaciones) {
    const proyectoId = plan?.proyecto_id;
    const actualPlan = (proyectoId && typeof this.planRepository?.obtenerPorProyecto === 'function'
      ? await this.planRepository.obtenerPorProyecto(proyectoId)
      : null) || plan;
    const etapasBase = (actualPlan.etapas || []).map((item) => item.etapa === etapa
      ? {
          ...item,
          estado,
          observaciones,
          ...(estado === CODE_PHASE_STATES.APPROVED
            ? { aprobada_en: new Date() }
            : [CODE_PHASE_STATES.IN_REVIEW, CODE_PHASE_STATES.REJECTED].includes(estado)
              ? { aprobada_por: null, aprobada_en: null }
              : {})
        }
      : item);
    let etapas = estado === CODE_PHASE_STATES.IN_REVIEW
      ? this.workflow.invalidarDependientes(etapasBase, etapa)
      : etapasBase;
    etapas = this.workflow.sincronizarBloqueos(etapas);
    if (proyectoId && typeof this.artefactoRepository?.listarPorProyecto === 'function') {
      const artefactos = await this.artefactoRepository.listarPorProyecto(proyectoId);
      ({ etapas } = this.workflow.reconciliarEtapasConArtefactos(etapas, artefactos));
    }
    return this.planRepository.guardar(proyectoId, { etapas, version: (actualPlan.version || 0) + 1 });
  }
}

module.exports = GestionarArtefactosCodigo;
