const crypto = require('crypto');
const CodeGenerationWorkflowService = require('../services/CodeGenerationWorkflowService');
const { CODE_PHASE_STATES } = require('../constants/CodeGenerationPhases');
const ArtifactVerificationService = require('../services/ArtifactVerificationService');
const SandboxRuntimeVerifier = require('../../infrastructure/services/SandboxRuntimeVerifier');

class GestionarArtefactosCodigo {
  constructor({ proyectoRepository, requerimientoRepository, diagramaRepository, disenoRepository, planCodificacionRepository, artefactoRepository, backendGenerator, frontendGenerator, testGenerator, infrastructureGenerator, pipelineGenerator, deliveryGenerator }) {
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
    this.workflow = new CodeGenerationWorkflowService();
    this.verifier = new ArtifactVerificationService();
    this.runtimeVerifier = new SandboxRuntimeVerifier();
  }

  async verificarArtefacto(proyectoId, artefactoId) {
    const artefacto = await this.artefactoRepository.obtenerPorId(artefactoId);
    if (!artefacto || String(artefacto.proyecto_id) !== String(proyectoId)) {
      throw new Error('Artefacto no encontrado para este proyecto.');
    }
    const structural = this.verifier.verificar(artefacto);
    let verificacion = structural;
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
      const runtime = await this.runtimeVerifier.verificar(runtimeArtifact);
      verificacion = { ...structural, estado: runtime.estado, nivel: runtime.nivel,
        pruebas: runtime.pruebas, errores: runtime.errores || [],
        nota: runtime.estado === 'apta'
          ? 'Compilación y pruebas de integración completadas en contenedores aislados para esta huella de archivos.'
          : 'La ejecución aislada falló o Docker no está disponible. No se puede aprobar ni exportar este artefacto.' };
    }
    await this.artefactoRepository.actualizar(artefactoId, { verificacion });
    return verificacion;
  }

  async actualizarArchivo({ proyectoId, artefactoId, ruta, contenido }) {
    if (typeof ruta !== 'string' || typeof contenido !== 'string' || contenido.length > 500000) {
      throw new Error('Ruta o contenido de archivo no válido (máximo 500 KB).');
    }
    const artefacto = await this.artefactoRepository.obtenerPorId(artefactoId);
    if (!artefacto || String(artefacto.proyecto_id) !== String(proyectoId)) {
      throw new Error('Artefacto no encontrado para este proyecto.');
    }
    if (artefacto.estado !== 'en_revision') throw new Error('Solo se pueden editar archivos de un artefacto en revisión.');
    const ultimo = await this.artefactoRepository.obtenerUltimo(proyectoId, artefacto.tipo);
    if (String(ultimo?.id) !== String(artefactoId)) throw new Error('Solo se puede editar la versión más reciente.');
    if (!(artefacto.archivos || []).some((file) => file.ruta === ruta)) throw new Error('El archivo no pertenece a este artefacto.');
    const archivos = artefacto.archivos.map((file) => file.ruta === ruta
      ? { ...file, contenido, huella: crypto.createHash('sha256').update(contenido).digest('hex') }
      : file);
    return this.artefactoRepository.actualizar(artefactoId, { archivos, verificacion: null });
  }

  _exigirVerificacion(artefacto) {
    const resultado = this.verifier.verificar(artefacto);
    if (resultado.estado !== 'apta_estructuralmente') {
      throw new Error(`No se puede aprobar un artefacto incompleto. Verificación: ${resultado.errores.join(' ')}`);
    }
    const stored = artefacto.verificacion;
    if (!stored || stored.huella !== resultado.huella) throw new Error('Verifica esta versión del artefacto antes de aprobarla.');
    const needsRuntime = ['codigo_backend', 'codigo_frontend', 'pruebas', 'paquete_entrega'].includes(artefacto.tipo);
    if (needsRuntime ? stored.estado !== 'apta' || stored.nivel !== 'ejecucion_aislada' : stored.estado !== 'apta_estructuralmente') {
      throw new Error(`La verificación del artefacto no fue satisfactoria: ${(stored.errores || []).join(' ')}`);
    }
    return stored;
  }

  asegurarPaqueteEjecutable(artefacto) {
    if (artefacto?.tipo !== 'paquete_entrega') throw new Error('El artefacto no es un paquete de entrega.');
    return this._exigirVerificacion(artefacto);
  }

  async generarFrontend(proyectoId) {
    const [proyecto, plan, diseno] = await Promise.all([
      this.proyectoRepository.obtenerPorId(proyectoId),
      this.planRepository.obtenerPorProyecto(proyectoId),
      this.disenoRepository.obtenerPorProyecto(proyectoId)
    ]);
    if (!proyecto || !plan || !diseno) throw new Error('Proyecto, plan o diseño aprobado no encontrado.');
    this.workflow.validarDependencias(plan, 'generacion_frontend');
    if (!['mockups_aprobados', 'diseno_aprobado', 'finalizado'].includes(proyecto.estado_fase)) {
      throw new Error('Los mockups deben estar aprobados antes de generar el frontend.');
    }
    const decisiones = Object.fromEntries(plan.etapas.filter((item) => item.estado === CODE_PHASE_STATES.APPROVED && item.propuesta).map((item) => [item.etapa, item.propuesta]));
    const versionesOrigen = Object.fromEntries([
      ...plan.etapas.filter((item) => item.estado === CODE_PHASE_STATES.APPROVED).map((item) => [item.etapa, item.version || 1]),
      ...(diseno.mockups || []).map((item) => [`mockup:${item.nombre_pantalla}`, item.version || 1])
    ]);
    const input = { decisiones, manifiesto: diseno.manifiesto_navegacion || [], mockups: diseno.mockups || [], sistema_diseno: diseno.sistema_diseno || {} };
    const huellaEntrada = crypto.createHash('sha256').update(JSON.stringify(input)).digest('hex');
    const ultimo = await this.artefactoRepository.obtenerUltimo(proyectoId, 'codigo_frontend');
    if (ultimo?.huella_entrada === huellaEntrada && !['fallido', 'rechazado'].includes(ultimo.estado)) return { artefacto: ultimo, reutilizado: true };
    const generado = await this.frontendGenerator.generar({ proyecto, insumos: { decisiones, diseno }, versionesOrigen });
    const artefacto = await this.artefactoRepository.crear({ proyecto_id: proyectoId, tipo: 'codigo_frontend', version: (ultimo?.version || 0) + 1, estado: 'en_revision', aprobado: false, huella_entrada: huellaEntrada, ...generado });
    if (ultimo?.aprobado) await this.artefactoRepository.actualizar(ultimo.id, { estado: 'desactualizado', aprobado: false });
    await this._actualizarEtapa(plan, 'generacion_frontend', CODE_PHASE_STATES.IN_REVIEW, `Artefacto frontend v${artefacto.version} generado.`);
    return { artefacto, reutilizado: false };
  }

  async generarBackend(proyectoId) {
    const [proyecto, plan, requerimientos, diagramas] = await Promise.all([
      this.proyectoRepository.obtenerPorId(proyectoId),
      this.planRepository.obtenerPorProyecto(proyectoId),
      this.requerimientoRepository.listarPorProyecto(proyectoId),
      this.diagramaRepository ? this.diagramaRepository.listarPorProyecto(proyectoId) : []
    ]);
    if (!proyecto || !plan) throw new Error('Proyecto o plan de codificación no encontrado.');
    this.workflow.validarDependencias(plan, 'generacion_backend');
    const diagramaDominio = (diagramas || []).find((item) => ['clases_dominio', 'clases'].includes(item.tipo) && item.aprobado && item.estado === 'aprobado' && !item.desactualizado) || null;
    const decisiones = Object.fromEntries(plan.etapas
      .filter((item) => item.estado === CODE_PHASE_STATES.APPROVED && item.propuesta)
      .map((item) => [item.etapa, item.propuesta]));
    const versionesOrigen = Object.fromEntries(plan.etapas
      .filter((item) => item.estado === CODE_PHASE_STATES.APPROVED)
      .map((item) => [item.etapa, item.version || 1]));
    if (diagramaDominio) versionesOrigen.clases_dominio = diagramaDominio.version || 1;
    const dominio = diagramaDominio ? { version: diagramaDominio.version || 1, codigo: diagramaDominio.codigo_plantuml } : undefined;
    const huellaEntrada = crypto.createHash('sha256').update(JSON.stringify({ decisiones, requerimientos: requerimientos.filter((item) => item.aprobado), dominio })).digest('hex');
    const ultimo = await this.artefactoRepository.obtenerUltimo(proyectoId, 'codigo_backend');
    if (ultimo?.huella_entrada === huellaEntrada && !['fallido', 'rechazado'].includes(ultimo.estado)) return { artefacto: ultimo, reutilizado: true };

    const generado = await this.backendGenerator.generar({ proyecto, insumos: { decisiones, requerimientos, diagramaDominio }, versionesOrigen });
    const artefacto = await this.artefactoRepository.crear({
      proyecto_id: proyectoId, tipo: 'codigo_backend', version: (ultimo?.version || 0) + 1,
      estado: 'en_revision', aprobado: false, huella_entrada: huellaEntrada, ...generado
    });
    if (ultimo?.aprobado) {
      await this.artefactoRepository.actualizar(ultimo.id, { estado: 'desactualizado', aprobado: false });
    }
    await this._actualizarEtapa(plan, 'generacion_backend', CODE_PHASE_STATES.IN_REVIEW, `Artefacto backend v${artefacto.version} generado.`);
    return { artefacto, reutilizado: false };
  }

  async revisarBackend({ proyectoId, artefactoId, decision, observaciones = '' }) {
    if (!['aprobar', 'rechazar'].includes(decision)) throw new Error('Decisión de artefacto no válida.');
    if (decision === 'rechazar' && !String(observaciones).trim()) throw new Error('Debes indicar observaciones para rechazar el backend.');
    const plan = await this.planRepository.obtenerPorProyecto(proyectoId);
    const artefacto = await this.artefactoRepository.obtenerPorId(artefactoId);
    if (!plan || !artefacto || String(artefacto.proyecto_id) !== String(proyectoId) || artefacto.tipo !== 'codigo_backend') {
      throw new Error('Artefacto backend no encontrado para este proyecto.');
    }
    const ultimo = await this.artefactoRepository.obtenerUltimo(proyectoId, 'codigo_backend');
    if (String(ultimo?.id) !== String(artefactoId)) throw new Error('Solo se puede revisar la versión más reciente del backend.');
    if (artefacto.estado !== 'en_revision') throw new Error('El artefacto backend ya fue revisado.');
    const verificacion = decision === 'aprobar' ? this._exigirVerificacion(artefacto) : undefined;
    const estado = decision === 'aprobar' ? 'aprobado' : 'rechazado';
    const actualizado = await this.artefactoRepository.actualizar(artefactoId, {
      estado, aprobado: decision === 'aprobar',
      ...(verificacion ? { verificacion } : {}),
      ...(decision === 'rechazar' ? { errores: [...(artefacto.errores || []), String(observaciones).trim()] } : {})
    });
    await this._actualizarEtapa(plan, 'generacion_backend', decision === 'aprobar' ? CODE_PHASE_STATES.APPROVED : CODE_PHASE_STATES.REJECTED, observaciones);
    return actualizado;
  }

  async revisarFrontend({ proyectoId, artefactoId, decision, observaciones = '' }) {
    return this._revisarArtefacto({ proyectoId, artefactoId, decision, observaciones, tipo: 'codigo_frontend', etapa: 'generacion_frontend', nombre: 'frontend' });
  }

  async generarPruebas(proyectoId) {
    const [proyecto, plan, requerimientos, backend, frontend] = await Promise.all([
      this.proyectoRepository.obtenerPorId(proyectoId), this.planRepository.obtenerPorProyecto(proyectoId),
      this.requerimientoRepository.listarPorProyecto(proyectoId),
      this.artefactoRepository.obtenerUltimoAprobado(proyectoId, 'codigo_backend'),
      this.artefactoRepository.obtenerUltimoAprobado(proyectoId, 'codigo_frontend')
    ]);
    if (!proyecto || !plan) throw new Error('Proyecto o plan de codificación no encontrado.');
    this.workflow.validarDependencias(plan, 'generacion_pruebas');
    if (!backend || !frontend) throw new Error('Debes aprobar backend y frontend antes de generar las pruebas.');
    const versionesOrigen = { codigo_backend: backend.version, codigo_frontend: frontend.version };
    const huellaEntrada = crypto.createHash('sha256').update(JSON.stringify({ versionesOrigen, rf: requerimientos.filter((item) => item.aprobado) })).digest('hex');
    const ultimo = await this.artefactoRepository.obtenerUltimo(proyectoId, 'pruebas');
    if (ultimo?.huella_entrada === huellaEntrada && !['fallido', 'rechazado'].includes(ultimo.estado)) return { artefacto: ultimo, reutilizado: true };
    const generado = await this.testGenerator.generar({ proyecto, insumos: { requerimientos, backend, frontend }, versionesOrigen });
    const artefacto = await this.artefactoRepository.crear({ proyecto_id: proyectoId, tipo: 'pruebas', version: (ultimo?.version || 0) + 1, estado: 'en_revision', aprobado: false, huella_entrada: huellaEntrada, ...generado });
    if (ultimo?.aprobado) await this.artefactoRepository.actualizar(ultimo.id, { estado: 'desactualizado', aprobado: false });
    await this._actualizarEtapa(plan, 'generacion_pruebas', CODE_PHASE_STATES.IN_REVIEW, `Suite de pruebas v${artefacto.version} generada.`);
    return { artefacto, reutilizado: false };
  }

  async revisarPruebas({ proyectoId, artefactoId, decision, observaciones = '' }) {
    return this._revisarArtefacto({ proyectoId, artefactoId, decision, observaciones, tipo: 'pruebas', etapa: 'generacion_pruebas', nombre: 'suite de pruebas' });
  }

  async generarInfraestructura(proyectoId) {
    const [proyecto, plan, requerimientos, diagramas, backend, frontend] = await Promise.all([
      this.proyectoRepository.obtenerPorId(proyectoId), this.planRepository.obtenerPorProyecto(proyectoId),
      this.requerimientoRepository.listarPorProyecto(proyectoId), this.diagramaRepository.listarPorProyecto(proyectoId),
      this.artefactoRepository.obtenerUltimoAprobado(proyectoId, 'codigo_backend'),
      this.artefactoRepository.obtenerUltimoAprobado(proyectoId, 'codigo_frontend')
    ]);
    if (!proyecto || !plan) throw new Error('Proyecto o plan de codificación no encontrado.');
    this.workflow.validarDependencias(plan, 'generacion_infraestructura');
    if (!backend || !frontend) throw new Error('Debes aprobar backend y frontend antes de generar infraestructura.');
    const aprobados = diagramas.filter((item) => item.aprobado && item.estado === 'aprobado' && !item.desactualizado);
    const decisiones = Object.fromEntries(plan.etapas.filter((item) => item.estado === CODE_PHASE_STATES.APPROVED && item.propuesta).map((item) => [item.etapa, item.propuesta]));
    const versionesOrigen = { codigo_backend: backend.version, codigo_frontend: frontend.version, ...Object.fromEntries(aprobados.map((item) => [item.tipo, item.version || 1])) };
    const input = { versionesOrigen, decisiones, rnf: requerimientos.filter((item) => item.aprobado && item.tipo === 'RNF') };
    const huellaEntrada = crypto.createHash('sha256').update(JSON.stringify(input)).digest('hex');
    const ultimo = await this.artefactoRepository.obtenerUltimo(proyectoId, 'infraestructura');
    if (ultimo?.huella_entrada === huellaEntrada && !['fallido', 'rechazado'].includes(ultimo.estado)) return { artefacto: ultimo, reutilizado: true };
    const generado = await this.infrastructureGenerator.generar({ proyecto, insumos: { decisiones, requerimientos: requerimientos.filter((item) => item.aprobado), diagramas: aprobados, backend, frontend }, versionesOrigen });
    const artefacto = await this.artefactoRepository.crear({ proyecto_id: proyectoId, tipo: 'infraestructura', version: (ultimo?.version || 0) + 1, estado: 'en_revision', aprobado: false, huella_entrada: huellaEntrada, ...generado });
    if (ultimo?.aprobado) await this.artefactoRepository.actualizar(ultimo.id, { estado: 'desactualizado', aprobado: false });
    await this._actualizarEtapa(plan, 'generacion_infraestructura', CODE_PHASE_STATES.IN_REVIEW, `Infraestructura v${artefacto.version} generada.`);
    return { artefacto, reutilizado: false };
  }

  async revisarInfraestructura({ proyectoId, artefactoId, decision, observaciones = '' }) {
    return this._revisarArtefacto({ proyectoId, artefactoId, decision, observaciones, tipo: 'infraestructura', etapa: 'generacion_infraestructura', nombre: 'infraestructura' });
  }

  async generarPipeline(proyectoId) {
    const [proyecto, plan, tests, infrastructure] = await Promise.all([
      this.proyectoRepository.obtenerPorId(proyectoId), this.planRepository.obtenerPorProyecto(proyectoId),
      this.artefactoRepository.obtenerUltimoAprobado(proyectoId, 'pruebas'),
      this.artefactoRepository.obtenerUltimoAprobado(proyectoId, 'infraestructura')
    ]);
    if (!proyecto || !plan) throw new Error('Proyecto o plan de codificación no encontrado.');
    this.workflow.validarDependencias(plan, 'generacion_ci_cd');
    if (!tests || !infrastructure) throw new Error('Debes aprobar pruebas e infraestructura antes de generar CI/CD.');
    const decisiones = Object.fromEntries(plan.etapas.filter((item) => item.estado === CODE_PHASE_STATES.APPROVED && item.propuesta).map((item) => [item.etapa, item.propuesta]));
    const versionesOrigen = { pruebas: tests.version, infraestructura: infrastructure.version };
    const huellaEntrada = crypto.createHash('sha256').update(JSON.stringify({ versionesOrigen, decisiones })).digest('hex');
    const ultimo = await this.artefactoRepository.obtenerUltimo(proyectoId, 'pipeline_ci_cd');
    if (ultimo?.huella_entrada === huellaEntrada && !['fallido', 'rechazado'].includes(ultimo.estado)) return { artefacto: ultimo, reutilizado: true };
    const generado = await this.pipelineGenerator.generar({ proyecto, insumos: { tests, infrastructure, decisiones }, versionesOrigen });
    const artefacto = await this.artefactoRepository.crear({ proyecto_id: proyectoId, tipo: 'pipeline_ci_cd', version: (ultimo?.version || 0) + 1, estado: 'en_revision', aprobado: false, huella_entrada: huellaEntrada, ...generado });
    if (ultimo?.aprobado) await this.artefactoRepository.actualizar(ultimo.id, { estado: 'desactualizado', aprobado: false });
    await this._actualizarEtapa(plan, 'generacion_ci_cd', CODE_PHASE_STATES.IN_REVIEW, `Pipeline CI/CD v${artefacto.version} generado.`);
    return { artefacto, reutilizado: false };
  }

  async revisarPipeline({ proyectoId, artefactoId, decision, observaciones = '' }) {
    return this._revisarArtefacto({ proyectoId, artefactoId, decision, observaciones, tipo: 'pipeline_ci_cd', etapa: 'generacion_ci_cd', nombre: 'pipeline CI/CD' });
  }

  async generarPaquete(proyectoId) {
    const tipos = ['codigo_backend', 'codigo_frontend', 'pruebas', 'infraestructura', 'pipeline_ci_cd'];
    const [proyecto, plan, ...artefactos] = await Promise.all([
      this.proyectoRepository.obtenerPorId(proyectoId), this.planRepository.obtenerPorProyecto(proyectoId),
      ...tipos.map((tipo) => this.artefactoRepository.obtenerUltimoAprobado(proyectoId, tipo))
    ]);
    if (!proyecto || !plan) throw new Error('Proyecto o plan de codificación no encontrado.');
    this.workflow.validarDependencias(plan, 'paquete_entrega');
    const faltantes = tipos.filter((_tipo, index) => !artefactos[index]);
    if (faltantes.length) throw new Error(`Faltan artefactos aprobados para la entrega: ${faltantes.join(', ')}.`);
    for (const artefacto of artefactos) this._exigirVerificacion(artefacto);
    const versionesOrigen = Object.fromEntries(artefactos.map((item) => [item.tipo, item.version]));
    const huellaEntrada = crypto.createHash('sha256').update(JSON.stringify(versionesOrigen)).digest('hex');
    const ultimo = await this.artefactoRepository.obtenerUltimo(proyectoId, 'paquete_entrega');
    if (ultimo?.huella_entrada === huellaEntrada && !['fallido', 'rechazado'].includes(ultimo.estado)) return { artefacto: ultimo, reutilizado: true };
    const generado = await this.deliveryGenerator.generar({ proyecto, insumos: { artefactos }, versionesOrigen });
    const artefacto = await this.artefactoRepository.crear({ proyecto_id: proyectoId, tipo: 'paquete_entrega', version: (ultimo?.version || 0) + 1, estado: 'en_revision', aprobado: false, huella_entrada: huellaEntrada, ...generado });
    if (ultimo?.aprobado) await this.artefactoRepository.actualizar(ultimo.id, { estado: 'desactualizado', aprobado: false });
    await this._actualizarEtapa(plan, 'paquete_entrega', CODE_PHASE_STATES.IN_REVIEW, `Paquete de entrega v${artefacto.version} generado.`);
    return { artefacto, reutilizado: false };
  }

  async revisarPaquete({ proyectoId, artefactoId, decision, observaciones = '' }) {
    const actualizado = await this._revisarArtefacto({ proyectoId, artefactoId, decision, observaciones, tipo: 'paquete_entrega', etapa: 'paquete_entrega', nombre: 'paquete de entrega' });
    if (decision === 'aprobar' && typeof this.proyectoRepository.actualizarEstadoFase === 'function') {
      await this.proyectoRepository.actualizarEstadoFase(proyectoId, 'finalizado');
    }
    return actualizado;
  }

  async _revisarArtefacto({ proyectoId, artefactoId, decision, observaciones, tipo, etapa, nombre }) {
    if (!['aprobar', 'rechazar'].includes(decision)) throw new Error('Decisión de artefacto no válida.');
    if (decision === 'rechazar' && !String(observaciones).trim()) throw new Error(`Debes indicar observaciones para rechazar el ${nombre}.`);
    const [plan, artefacto, ultimo] = await Promise.all([
      this.planRepository.obtenerPorProyecto(proyectoId), this.artefactoRepository.obtenerPorId(artefactoId), this.artefactoRepository.obtenerUltimo(proyectoId, tipo)
    ]);
    if (!plan || !artefacto || String(artefacto.proyecto_id) !== String(proyectoId) || artefacto.tipo !== tipo) throw new Error(`Artefacto ${nombre} no encontrado para este proyecto.`);
    if (String(ultimo?.id) !== String(artefactoId)) throw new Error(`Solo se puede revisar la versión más reciente del ${nombre}.`);
    if (artefacto.estado !== 'en_revision') throw new Error(`El artefacto ${nombre} ya fue revisado.`);
    const verificacion = decision === 'aprobar' ? this._exigirVerificacion(artefacto) : undefined;
    const actualizado = await this.artefactoRepository.actualizar(artefactoId, { estado: decision === 'aprobar' ? 'aprobado' : 'rechazado', aprobado: decision === 'aprobar', ...(verificacion ? { verificacion } : {}), ...(decision === 'rechazar' ? { errores: [...(artefacto.errores || []), String(observaciones).trim()] } : {}) });
    await this._actualizarEtapa(plan, etapa, decision === 'aprobar' ? CODE_PHASE_STATES.APPROVED : CODE_PHASE_STATES.REJECTED, observaciones);
    return actualizado;
  }

  async _actualizarEtapa(plan, etapa, estado, observaciones) {
    let etapas = plan.etapas.map((item) => item.etapa === etapa ? { ...item, estado, observaciones } : item);
    if (estado === CODE_PHASE_STATES.IN_REVIEW) etapas = this.workflow.invalidarDependientes(etapas, etapa);
    etapas = this.workflow.sincronizarBloqueos(etapas);
    return this.planRepository.guardar(plan.proyecto_id, { etapas, version: (plan.version || 0) + 1 });
  }
}

module.exports = GestionarArtefactosCodigo;
