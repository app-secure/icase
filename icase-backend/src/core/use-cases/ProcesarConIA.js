const Requerimiento = require('../entities/Requerimiento');
const Diagrama = require('../entities/Diagrama');
const {
  DIAGRAM_TYPE_VALUES,
  DIAGRAM_DEFINITIONS,
  normalizeDiagramType,
  isValidDiagramType
} = require('../constants/DiagramTypes');
const { DiagramWorkflowService, DIAGRAM_STATES } = require('../services/DiagramWorkflowService');
const crypto = require('crypto');
const { contextOf } = require('../services/RequirementAnalysisContext');

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]));
  }
  return value;
}

function fingerprint(value) {
  return crypto.createHash('sha256').update(JSON.stringify(stableValue(value))).digest('hex');
}

function normalizarActor(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function asegurarActoresCasosUso(diagramas, requerimientos) {
  const casosUso = (diagramas || []).find((diagrama) => normalizeDiagramType(diagrama.tipo) === 'casos_de_uso');
  if (!casosUso?.codigo_plantuml) return diagramas;

  const actoresOriginales = (requerimientos || [])
    .filter((requisito) => String(requisito.tipo || '').toUpperCase() === 'RF')
    .flatMap((requisito) => Array.isArray(requisito.actores) ? requisito.actores : [requisito.actores])
    .flatMap((actor) => String(actor || '').split(/[,;|]/))
    .map((actor) => actor.trim())
    .filter(Boolean);
  const actoresRequeridos = [...new Map(actoresOriginales.map((actor) => [normalizarActor(actor), actor])).entries()]
    .filter(([normalizado]) => Boolean(normalizado));

  let codigo = String(casosUso.codigo_plantuml);
  const actoresDiagramados = [...codigo.matchAll(/^\s*actor\s+(?:"([^"]+)"|([^\s]+))(?:\s+as\s+([\w.]+))?/gim)]
    .map((match) => normalizarActor(match[1] || match[2]));
  const faltantes = actoresRequeridos.filter(([actor]) =>
    !actoresDiagramados.some((existente) => existente === actor || existente.includes(actor) || actor.includes(existente))
  );
  if (!faltantes.length) return diagramas;

  const aliasesCasosUso = [...codigo.matchAll(/usecase\s+(?:"[^"]+"\s+as\s+([\w.]+)|([\w.]+)\s+as\s+"[^"]+"|([\w.]+))/gim)]
    .map((match) => match[1] || match[2] || match[3])
    .filter(Boolean);
  let casoObjetivo = aliasesCasosUso[0];
  let inyeccion = "\n' Actores completados desde requisitos aprobados\n";
  if (!casoObjetivo) {
    casoObjetivo = 'UC_Trazabilidad';
    inyeccion += 'usecase "Interacción con el sistema" as UC_Trazabilidad\n';
  }
  faltantes.forEach(([actorNormalizado, actorOriginal], index) => {
    const alias = `ActorReq_${index + 1}_${actorNormalizado.replace(/\s+/g, '_').slice(0, 24)}`;
    inyeccion += `actor "${actorOriginal.replace(/"/g, "'")}" as ${alias}\n`;
    inyeccion += `${alias} --> ${casoObjetivo} : participa\n`;
  });
  codigo = codigo.includes('@enduml')
    ? codigo.replace(/@enduml\s*$/i, `${inyeccion}@enduml`)
    : `${codigo}${inyeccion}@enduml`;
  casosUso.codigo_plantuml = codigo;
  console.warn(`[ProcesarConIA] Se completaron actores omitidos por la IA: ${faltantes.map(([, nombre]) => nombre).join(', ')}`);
  return diagramas;
}

class ProcesarConIA {
  constructor({
    proyectoRepository,
    requerimientoRepository,
    diagramaRepository,
    estandarRepository,
    fuenteRepository,
    disenoRepository,
    plantumlValidatorService,
    aiOrchestratorService,
    requirementChangeService = null
  }) {
    this.proyectoRepository = proyectoRepository;
    this.requerimientoRepository = requerimientoRepository;
    this.diagramaRepository = diagramaRepository;
    this.estandarRepository = estandarRepository;
    this.fuenteRepository = fuenteRepository;
    this.disenoRepository = disenoRepository;
    this.plantumlValidatorService = plantumlValidatorService;
    this.aiOrchestratorService = aiOrchestratorService;
    this.requirementChangeService = requirementChangeService;
    this.diagramWorkflowService = new DiagramWorkflowService();
    this.generacionesEnCurso = new Set();
  }

  async obtenerModelosDisponibles(options = {}) {
    if (this.aiOrchestratorService && typeof this.aiOrchestratorService.obtenerModelosDisponibles === 'function') {
      return await this.aiOrchestratorService.obtenerModelosDisponibles(options);
    }
    return { provider_defecto: 'auto', proveedores: [] };
  }

  _detectarProblemasDiagrama(resultadoIA, tipo, requerimientos, diagramasAprobados, analisisRequisitos = {}) {
    const diagramas = Array.isArray(resultadoIA?.diagramas) ? resultadoIA.diagramas : [];
    const objetivo = diagramas.find((diagram) => normalizeDiagramType(diagram?.tipo) === tipo);
    if (!objetivo?.codigo_plantuml || !String(objetivo.codigo_plantuml).includes('@start')) {
      return `No se recibió código PlantUML utilizable para ${tipo}.`;
    }
    if (!this.plantumlValidatorService) return '';
    const result = this.plantumlValidatorService.validar(objetivo.codigo_plantuml, {
      tipo,
      analisisRequisitos,
      rnfList: requerimientos.filter((requirement) => String(requirement.tipo || '').toUpperCase() === 'RNF'),
      trazabilidad_rnf: objetivo.trazabilidad_rnf,
      requisitos: requerimientos,
      requisitos_relacionados: objetivo.requisitos_relacionados,
      diagramasDependencia: diagramasAprobados
    });
    if (!result.valido) return (result.errores || [result.error]).filter(Boolean).join(' | ');
    if (tipo === 'arquitectura_software') return (result.advertencias || [])
      .filter(message => message.startsWith('Tecnología aprobada por verificar:')).join(' | ');
    if (tipo === 'arquitectura_sistema') return (result.advertencias || [])
      .filter(message => message.startsWith('Despliegue por verificar:')).join(' | ');
    // Una revisión acotada, no una regeneración ilimitada ni un bloqueo por léxico.
    if (tipo === 'clases_dominio') return (result.advertencias || [])
      .filter(message => /^(?:Cobertura de dominio|Modelo de dominio) por verificar:/.test(message)).join(' | ');
    if (tipo === 'clases_diseno') return (result.advertencias || [])
      .filter(message => message.startsWith('Diseño por verificar:')).join(' | ');
    return '';
  }

  _payloadReparacion(payload, resultadoIA, tipo, problemas, intento) {
    const diagram = (resultadoIA?.diagramas || []).find((item) => normalizeDiagramType(item?.tipo) === tipo);
    const codigoAnterior = String(diagram?.codigo_plantuml || '');
    const requisitos = payload.contexto_proyecto?.requerimientos_aprobados || [];
    const covered = tipo === 'casos_de_uso' ? new (require('../../infrastructure/services/DiagramSemanticValidatorService'))().validarCasosUso(codigoAnterior, requisitos.filter(item => item.tipo === 'RF'), []).metricas.rf_cubiertos_ids : [];
    const instruccion = [
      `REPARACIÓN CONTROLADA ${intento}: corrige únicamente el diagrama ${tipo}.`,
      `Problemas exactos detectados: ${problemas}`,
      'Conserva todos los elementos correctos, nombres, relaciones y decisiones existentes.',
      ...(tipo === 'casos_de_uso' ? [`No pierdas la cobertura ya conseguida: ${covered.join(', ')}. No elimines casos para caber en un máximo fijo de 14; organiza por módulos. Incluye los RF faltantes en etiquetas o notas asociadas a sus casos conectados.`] : []),
      'Añade o ajusta solamente los elementos omitidos o inválidos indicados. No regeneres otro artefacto.',
      'Devuelve exactamente un diagrama del mismo tipo dentro del JSON esperado.',
      `CÓDIGO ANTERIOR A REPARAR:\n${codigoAnterior}`
    ].join('\n');
    return {
      ...payload,
      insumo_adicional: [payload.insumo_adicional, instruccion].filter(Boolean).join('\n\n'),
      contexto_proyecto: {
        ...payload.contexto_proyecto,
        retroalimentacion_diagrama: instruccion
      }
    };
  }

  async ejecutar({ proyectoId, insumoBrutoInput = '', insumoAdicional = '', provider = 'auto', specificModel = null, objetivo = 'completo', tipoDiagrama = null, regenerar = false, operacion = 'legacy', usuarioId = null, analisisId = null, instruccion = '', actualizarIds = [], elementosIds = [], respuesta = '', preguntaId = null, desdeCero = false }) {
    const proyecto = await this.proyectoRepository.obtenerPorId(proyectoId);
    if (!proyecto) {
      throw new Error(`Proyecto con ID ${proyectoId} no encontrado.`);
    }
    if (proyecto.version_flujo_analisis === 2 && ['analisis_inicial', 'correccion_analisis_inicial', 'analisis_respuesta', 'revision_calidad'].includes(operacion)) {
      return this.initialAnalysis.generate({ proyectoId, usuarioId, insumoBrutoInput, insumoAdicional, provider, specificModel, operacion, instruccion, elementosIds, regenerar, analisisId, respuesta, preguntaId, desdeCero });
    }
    let initial = null;
    let previousRequirements = [];
    if (proyecto.version_flujo_analisis === 2 && objetivo !== 'diagramas') {
      if (operacion !== 'redaccion_requisitos' || !require('../../infrastructure/services/RequirementExecutionContext').current()) throw Object.assign(new Error('Usa el flujo de análisis inicial y apruébalo antes de redactar.'), { status: 409 });
      initial = await this.initialAnalysis.requireApproved(proyectoId, usuarioId, analisisId);
      insumoAdicional = initial.insumo_adicional || '';
      insumoBrutoInput = initial.insumo_directo || '';
      previousRequirements = await this.requerimientoRepository.listarPorProyecto(proyectoId);
      const newNeeds = initial.contenido.inventario.filter(n => ['RF', 'RNF'].includes(n.tipo)).some(n => !previousRequirements.some(r => (r.necesidades_origen || []).includes(n.id)));
      if (previousRequirements.length && !actualizarIds.length && !newNeeds) throw Object.assign(new Error('Ya existen requisitos. Confirma la actualización puntual; no se reemplazarán automáticamente.'), { status: 409, code: 'REQUIREMENTS_CONFLICT' });
      if (actualizarIds.some(id => !previousRequirements.some(r => r.identificador === id))) throw Object.assign(new Error('La selección de requisitos cambió; recarga.'), { status: 409 });
    }
    const objetivoNormalizado = ['requisitos', 'diagramas', 'completo'].includes(objetivo) ? objetivo : 'completo';
    const tipoDiagramaNormalizado = tipoDiagrama ? normalizeDiagramType(tipoDiagrama) : null;
    if (tipoDiagramaNormalizado && !isValidDiagramType(tipoDiagramaNormalizado)) {
      throw new Error(`Tipo de diagrama inválido: ${tipoDiagrama}.`);
    }
    if (objetivoNormalizado === 'diagramas') {
      if (proyecto.version_flujo_analisis === 2) {
        const approved = await this.initialAnalysis.requireApproved(proyectoId, proyecto.usuario_id);
        if (proyecto.auditoria_requisitos?.referencia_analisis_inicial?.id !== approved.id) throw new Error('Los requisitos deben revisarse contra el análisis inicial vigente antes de generar diagramas.');
      }
      const estadosPermitidos = new Set(['analisis_aprobado', 'diseno_pendiente', 'diagramas_aprobados', 'mockups_pendientes']);
      if (!estadosPermitidos.has(proyecto.estado_fase)) {
        throw new Error('Los requisitos deben estar aprobados antes de generar los diagramas.');
      }
    }

    // 1. Insumo bruto: usar el enviado directamente o el registrado en base de datos
    let textoBase = insumoBrutoInput && insumoBrutoInput.trim() !== ''
      ? insumoBrutoInput
      : (proyecto.insumo_bruto || '');
    let pistasFuentesRequisitos = [];

    // Concatenar fuentes transcritas e ingeridas de la base de datos (PDFs y Audios procesados en backend)
    if (this.fuenteRepository) {
      try {
        const fuentesBd = await this.fuenteRepository.listarPorProyecto(proyectoId);
        if (Array.isArray(fuentesBd) && fuentesBd.length > 0) {
          if (objetivoNormalizado === 'requisitos') {
            const context = require('../../infrastructure/services/RequirementSourceContext').build(fuentesBd);
            if (context.content) {
              textoBase = context.content;
              pistasFuentesRequisitos = context.hints;
            }
          } else {
          const textoFuentes = fuentesBd
            .filter(f => f.texto_transcrito && f.texto_transcrito.trim().length > 0)
            .map(f => {
              const metadatos = [
                `Archivo: ${f.nombre_archivo}`,
                `Categoría: ${f.categoria || f.tipo}`,
                `Tipo de contenido: ${f.tipo_contenido || 'Sin especificar'}`,
                f.descripcion ? `Descripción aportada por el usuario: ${f.descripcion}` : '',
                f.autor_origen ? `Autor u origen: ${f.autor_origen}` : '',
                f.fecha_documento ? `Fecha del contenido: ${f.fecha_documento}` : '',
                Array.isArray(f.etiquetas) && f.etiquetas.length ? `Etiquetas: ${f.etiquetas.join(', ')}` : '',
                f.tipo === 'audio' ? `Transcripción revisada por el usuario: ${f.transcripcion_verificada ? 'sí' : 'no'}` : ''
              ].filter(Boolean).join('\n');
              return `[Fuente enriquecida]\n${metadatos}\n\n[Contenido extraído]\n${f.texto_transcrito}`;
            })
            .join('\n\n---\n\n');
          if (textoFuentes) {
            // La versión persistida contiene la transcripción corregida y los metadatos más recientes.
            textoBase = textoFuentes;
          }
          }
        }
      } catch (errFuentes) {
        console.warn('[ProcesarConIA] Error consultando fuentes del proyecto:', errFuentes.message);
      }
    }

    // Si se envió insumoBrutoInput y el proyecto no lo tenía, persistirlo en base de datos
    if (insumoBrutoInput && (!proyecto.insumo_bruto || proyecto.insumo_bruto.trim() === '') && !require('../../infrastructure/services/RequirementExecutionContext').current()) {
      await this.proyectoRepository.actualizar(proyectoId, { insumo_bruto: insumoBrutoInput });
    }

    const insumoBruto = insumoAdicional && insumoAdicional.trim() !== ''
      ? `${textoBase}\n\n[Insumo Adicional]:\n${insumoAdicional}`.trim()
      : textoBase;

    if (!insumoBruto || insumoBruto.trim() === '') {
      throw new Error('No hay insumo bruto (acta, transcripción o texto) para procesar.');
    }

    // 2. Diccionario de estándares (fijo en Mongo, la IA no lo altera)
    const estandares = await this.estandarRepository.obtenerEstandares();

    // 3. Contexto del proyecto: RF/RNF/diagramas ya aprobados (vacío si es la primera vez)
    const requerimientosPrevios = await this.requerimientoRepository.listarPorProyecto(proyectoId);
    const diagramasPrevios = await this.diagramaRepository.listarPorProyecto(proyectoId);

    const requerimientosAprobados = requerimientosPrevios.filter(r => r.aprobado);
    const diagramasAprobados = diagramasPrevios.filter(d => d.aprobado);

    if (objetivoNormalizado === 'diagramas' && tipoDiagramaNormalizado) {
      const flujo = this.diagramWorkflowService.build({ requirementsApproved: true, diagrams: diagramasPrevios });
      const item = flujo.items.find((candidate) => candidate.tipo === tipoDiagramaNormalizado);
      if (!item?.habilitado) {
        const faltantes = item?.unmet_dependencies || [];
        throw new Error(`No se puede generar ${item?.label || tipoDiagramaNormalizado}. Primero aprueba: ${faltantes.join(', ')}.`);
      }
    }

    const diagramaObjetivoActual = tipoDiagramaNormalizado
      ? this.diagramWorkflowService.latestByType(diagramasPrevios).get(tipoDiagramaNormalizado)
      : null;
    const ultimaRevisionRechazada = [...(diagramaObjetivoActual?.revisiones || [])]
      .reverse()
      .find((revision) => revision.decision === 'rechazado');
    const retroalimentacionAplicable = ultimaRevisionRechazada?.observaciones ||
      diagramaObjetivoActual?.retroalimentacion_aplicada || '';
    const contextoProyecto = {
      requerimientos_aprobados: requerimientosAprobados,
      diagramas_aprobados: diagramasAprobados,
      requerimientos_actuales: requerimientosPrevios,
      analisis_requisitos: contextOf(proyecto.auditoria_requisitos, { includeContext: true }),
      auditoria_requisitos: proyecto.auditoria_requisitos || null,
      diagramas_actuales: diagramasPrevios,
      retroalimentacion_diagrama: retroalimentacionAplicable
    };

    const latestByType = this.diagramWorkflowService.latestByType(diagramasPrevios);
    const dependencyVersions = Object.fromEntries(
      (DIAGRAM_DEFINITIONS[tipoDiagramaNormalizado]?.dependencies || []).map((dependency) => [
        dependency,
        Number(latestByType.get(dependency)?.version || 1)
      ])
    );
    const inputFingerprint = tipoDiagramaNormalizado ? fingerprint({
      tipo: tipoDiagramaNormalizado,
      insumo: insumoBruto,
      instrucciones: insumoAdicional,
      provider,
      specificModel,
      requisitos: requerimientosAprobados.map((requirement) => ({
        identificador: requirement.identificador,
        tipo: requirement.tipo,
        nombre: requirement.nombre,
        descripcion: requirement.descripcion,
        actores: requirement.actores,
        prioridad: requirement.prioridad,
        precondiciones: requirement.precondiciones,
        poscondiciones: requirement.poscondiciones,
        metrica_medible: requirement.metrica_medible,
        criterios_aceptacion: requirement.criterios_aceptacion || []
      })).sort((a, b) => String(a.identificador).localeCompare(String(b.identificador))),
      dependencias: dependencyVersions,
      retroalimentacion: contextoProyecto.retroalimentacion_diagrama,
      decisiones_analisis: contextOf(proyecto.auditoria_requisitos, { includeContext: true })
    }) : null;

    const reusableDiagram = inputFingerprint && diagramaObjetivoActual?.huella_entrada === inputFingerprint &&
      ['pendiente_revision', 'aprobado'].includes(diagramaObjetivoActual.estado) &&
      ['valido', 'advertencia'].includes(diagramaObjetivoActual.estado_calidad);
    if (reusableDiagram && regenerar !== true) {
      return {
        proyecto_id: proyectoId,
        nombre_proyecto: proyecto.nombre,
        descripcion_proyecto: proyecto.descripcion,
        objetivo: objetivoNormalizado,
        requerimientos: requerimientosPrevios,
        diagramas: diagramasPrevios,
        flujoDiagramas: this.diagramWorkflowService.build({ requirementsApproved: true, diagrams: diagramasPrevios }),
        cache_hit: true,
        cache_reason: 'La entrada y las versiones aprobadas no cambiaron.'
      };
    }

    // Construcción del payload de tres bloques explícitos
    const payload = {
      proyecto_id: proyectoId,
      ...(initial ? { approvedInitialAnalysis: { ...initial.contenido, aprobado: true, requisitos_previos: previousRequirements, actualizar_ids: actualizarIds, instruccion_redaccion: instruccion, referencia: { id: initial.id, version: initial.version, huella: initial.contenido_hash || require('../../infrastructure/services/RequirementExecutionContext').hash(initial.contenido) } } } : {}),
      nombre_proyecto: proyecto.nombre,
      // Las instrucciones adicionales tienen su bloque propio en el prompt; no deben duplicarse en el insumo principal.
      insumo_bruto: textoBase,
      ...(objetivoNormalizado === 'requisitos' ? { pistas_fuentes: pistasFuentesRequisitos } : {}),
      insumo_adicional: insumoAdicional,
      provider,
      specificModel,
      objetivo: objetivoNormalizado,
      tipo_diagrama: tipoDiagramaNormalizado,
      diccionario_estandares: estandares,
      contexto_proyecto: contextoProyecto
    };

    // Llamada única a n8n / IA, protegida contra solicitudes simultáneas del mismo artefacto.
    const generationKey = `${proyectoId}:${tipoDiagramaNormalizado || objetivoNormalizado}`;
    if (this.generacionesEnCurso.has(generationKey)) {
      throw new Error('Ya existe una generación en curso para este artefacto. Espera a que termine antes de reintentar.');
    }
    this.generacionesEnCurso.add(generationKey);
    let resultadoIA;
    let reparacionesControladas = 0;
    try {
      resultadoIA = await this.aiOrchestratorService.procesar(payload);
      if (objetivoNormalizado === 'diagramas' && Array.isArray(resultadoIA?.diagramas)) {
        resultadoIA.diagramas = asegurarActoresCasosUso(resultadoIA.diagramas, requerimientosAprobados);
      }
      if (objetivoNormalizado === 'diagramas' && tipoDiagramaNormalizado) {
        const maxReparaciones = Math.max(0, Math.min(2, Number(process.env.AI_DIAGRAM_REPAIR_RETRIES ?? 1)));
        let problemas = this._detectarProblemasDiagrama(
          resultadoIA, tipoDiagramaNormalizado, requerimientosAprobados, diagramasAprobados, contextoProyecto.analisis_requisitos
        );
        while (problemas && reparacionesControladas < maxReparaciones) {
          reparacionesControladas += 1;
          console.warn(`[ProcesarConIA] Reparación controlada ${reparacionesControladas}/${maxReparaciones} para ${tipoDiagramaNormalizado}: ${problemas}`);
          const repairPayload = this._payloadReparacion(
            payload, resultadoIA, tipoDiagramaNormalizado, problemas, reparacionesControladas
          );
          const anterior = resultadoIA;
          resultadoIA = await this.aiOrchestratorService.procesar(repairPayload);
          if (tipoDiagramaNormalizado === 'clases_diseno') {
            const before = anterior.diagramas?.find(item => normalizeDiagramType(item.tipo) === tipoDiagramaNormalizado);
            const after = resultadoIA.diagramas?.find(item => normalizeDiagramType(item.tipo) === tipoDiagramaNormalizado);
            // Solo protege reparaciones automáticas. Una edición explícita puede cambiar el diseño.
            const previousValidation = before && this.plantumlValidatorService?.validar(before.codigo_plantuml, {
              tipo: tipoDiagramaNormalizado, requisitos: requerimientosAprobados, diagramasDependencia: diagramasAprobados
            });
            if (previousValidation?.valido) {
              const lost = new (require('../../infrastructure/services/DesignGenerationPolicy'))().lostMembers(before.codigo_plantuml, after?.codigo_plantuml);
              if (lost.length) {
                console.warn(`[ProcesarConIA] Reparación de diseño descartada: eliminó clases u operaciones existentes: ${lost.join(', ')}`);
                resultadoIA = anterior;
              }
            }
          }
          if (Array.isArray(resultadoIA?.diagramas)) {
            resultadoIA.diagramas = asegurarActoresCasosUso(resultadoIA.diagramas, requerimientosAprobados);
          }
          if (tipoDiagramaNormalizado === 'casos_de_uso') {
            const before = anterior.diagramas?.find(item => normalizeDiagramType(item.tipo) === tipoDiagramaNormalizado);
            const after = resultadoIA.diagramas?.find(item => normalizeDiagramType(item.tipo) === tipoDiagramaNormalizado);
            if (before && after) {
              const merged = new (require('../../infrastructure/services/UseCaseRepairMerger'))().merge(before.codigo_plantuml, after.codigo_plantuml, requerimientosAprobados.filter(item => item.tipo === 'RF'));
              if (merged) {
                const traced = new (require('../../infrastructure/services/DiagramSemanticValidatorService'))().validarCasosUso(merged, requerimientosAprobados.filter(item => item.tipo === 'RF'), []).metricas.rf_cubiertos_ids;
                const joined = { ...anterior, diagramas: anterior.diagramas.map(item => item === before ? { ...item, codigo_plantuml: merged, codigo_mermaid: merged, requisitos_relacionados: [...new Set([...(Array.isArray(item.requisitos_relacionados) ? item.requisitos_relacionados : []), ...traced])] } : item) };
                if (!this._detectarProblemasDiagrama(joined, tipoDiagramaNormalizado, requerimientosAprobados, diagramasAprobados)) resultadoIA = joined;
              }
            }
          }
          problemas = this._detectarProblemasDiagrama(
            resultadoIA, tipoDiagramaNormalizado, requerimientosAprobados, diagramasAprobados, contextoProyecto.analisis_requisitos
          );
        }
      }
    } finally {
      this.generacionesEnCurso.delete(generationKey);
    }

    if (objetivoNormalizado === 'requisitos' && (!resultadoIA.requerimientos || resultadoIA.requerimientos.length === 0)) {
      throw new Error('La IA no devolvió requerimientos válidos. Se conservaron los datos existentes.');
    }
    if (objetivoNormalizado === 'diagramas') {
      const diagramasValidos = (resultadoIA.diagramas || []).filter((diagrama) => {
        const codigo = String(diagrama.codigo_plantuml || '');
        return codigo.includes('@start') && !codigo.includes('No hay diagrama disponible') && !codigo.includes('No hay diagrama de navegación disponible');
      });
      // La interfaz usa generación secuencial (un tipo por trabajo). Se mantiene
      // compatibilidad con la operación masiva legada de cuatro artefactos; el
      // flujo y la exportación final sí exigen los seis tipos canónicos.
      const cantidadEsperada = tipoDiagramaNormalizado ? 1 : 4;
      if (diagramasValidos.length < cantidadEsperada) {
        throw new Error(tipoDiagramaNormalizado
          ? `La IA no devolvió un diagrama válido de tipo ${tipoDiagramaNormalizado}. Puedes reintentar sin perder los artefactos aprobados.`
          : 'La IA no devolvió suficientes diagramas válidos. Puedes reintentar sin perder los requisitos aprobados.');
      }
      if (!tipoDiagramaNormalizado && diagramasValidos.length >= DIAGRAM_TYPE_VALUES.length) {
        const tiposGenerados = new Set(diagramasValidos.map((diagrama) => normalizeDiagramType(diagrama.tipo)));
        const tiposFaltantes = DIAGRAM_TYPE_VALUES.filter((tipo) => !tiposGenerados.has(tipo));
        if (tiposFaltantes.length > 0 || tiposGenerados.size !== DIAGRAM_TYPE_VALUES.length) {
          throw new Error(`La IA no cubrió exactamente los seis tipos canónicos. Faltan: ${tiposFaltantes.join(', ') || 'ninguno'}; revisa tipos duplicados o legados.`);
        }
      }
      if (this.plantumlValidatorService) {
        const rnfsAprobados = requerimientosAprobados.filter((requisito) =>
          String(requisito.tipo || '').toUpperCase() === 'RNF'
        );
        const errores = diagramasValidos
          .map((diagrama) => ({
            tipo: diagrama.tipo,
            resultado: this.plantumlValidatorService.validar(diagrama.codigo_plantuml, {
              tipo: diagrama.tipo,
              analisisRequisitos: contextoProyecto.analisis_requisitos,
              rnfList: rnfsAprobados,
              trazabilidad_rnf: diagrama.trazabilidad_rnf,
              requisitos: requerimientosAprobados,
              requisitos_relacionados: diagrama.requisitos_relacionados,
              diagramasDependencia: diagramasAprobados
            })
          }))
          .filter(({ resultado }) => !resultado.valido);
        if (errores.length) {
          const detalle = errores.map(({ tipo, resultado }) => `${tipo}: ${resultado.error}`).join(' | ');
          throw new Error(`La IA devolvió diagramas con problemas de estructura o legibilidad. ${detalle}`);
        }
      }
      const casosUso = diagramasValidos.find((diagrama) => String(diagrama.tipo).toLowerCase().includes('caso'));
      if (casosUso) {
        const actoresRequeridos = [...new Set(requerimientosAprobados
          .filter((requisito) => String(requisito.tipo || '').toUpperCase() === 'RF')
          .flatMap((requisito) => Array.isArray(requisito.actores) ? requisito.actores : [requisito.actores])
          .flatMap((actor) => String(actor || '').split(/[,;|]/))
          .map(normalizarActor)
          .filter(Boolean))];
        const codigoCasosUso = String(casosUso.codigo_plantuml || '');
        const actoresDiagramados = [...codigoCasosUso.matchAll(/^\s*actor\s+(?:"([^"]+)"|([^\s]+))(?:\s+as\s+([\w.]+))?/gim)]
          .map((match) => ({
            nombre: normalizarActor(match[1] || match[2]),
            alias: match[3] || match[2] || `"${match[1]}"`
          }))
          .filter((actor) => actor.nombre);
        const faltantes = actoresRequeridos.filter((actor) => !actoresDiagramados.some(({ nombre }) => nombre === actor || nombre.includes(actor) || actor.includes(nombre)));
        if (faltantes.length) {
          throw new Error(`El diagrama de casos de uso omitió actores definidos en los requisitos aprobados: ${faltantes.join(', ')}. Reintenta la generación para obtener trazabilidad completa.`);
        }
        const actoresSinRelacion = actoresDiagramados
          .filter(({ alias }) => {
            const aliasEscapado = String(alias || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            if (!aliasEscapado) return true;
            return !new RegExp(`^\\s*${aliasEscapado}\\s*(?:--+|\\.\\.+|<[-.]+|[-.]+>)`, 'im').test(codigoCasosUso) &&
              !new RegExp(`(?:--+|\\.\\.+|<[-.]+|[-.]+>)\\s*${aliasEscapado}\\s*$`, 'im').test(codigoCasosUso);
          })
          .map(({ nombre }) => nombre);
        if (actoresSinRelacion.length) {
          throw new Error(`El diagrama de casos de uso contiene actores sin interacción: ${actoresSinRelacion.join(', ')}.`);
        }
      }
    }

    return require('../../infrastructure/services/RequirementExecutionContext').commit(async () => {
    // Persistir requerimientos únicamente durante la fase de análisis.
    const requerimientosGenerados = [];
    if (objetivoNormalizado !== 'diagramas' && resultadoIA.requerimientos && Array.isArray(resultadoIA.requerimientos)) {
      // Reemplazamos requerimientos no aprobados previos o anexamos
      if (!initial) await this.requerimientoRepository.eliminarPorProyecto(proyectoId);

      const seenIdentifiers = new Set();
      let rfCounter = 1;
      let rnfCounter = 1;

      for (const reqData of resultadoIA.requerimientos) {
        let tipo = String(reqData.tipo || 'RF').toUpperCase();
        if (tipo !== 'RF' && tipo !== 'RNF') {
          tipo = tipo.includes('NO') || tipo.includes('RNF') ? 'RNF' : 'RF';
        }

        let prioridad = String(reqData.prioridad || 'Media').toLowerCase();
        if (prioridad.includes('alt') || prioridad.includes('high')) prioridad = 'Alta';
        else if (prioridad.includes('baj') || prioridad.includes('low')) prioridad = 'Baja';
        else prioridad = 'Media';

        let id = String(reqData.identificador || '').trim();
        if (!id || seenIdentifiers.has(id)) {
          const counter = tipo === 'RF' ? rfCounter++ : rnfCounter++;
          id = `${tipo}-${String(counter).padStart(2, '0')}`;
          while (seenIdentifiers.has(id)) {
            const next = tipo === 'RF' ? rfCounter++ : rnfCounter++;
            id = `${tipo}-${String(next).padStart(2, '0')}`;
          }
        }
        seenIdentifiers.add(id);

        const reqEntity = new Requerimiento({
          proyecto_id: proyectoId,
          tipo,
          identificador: id,
          nombre: reqData.nombre || `Requerimiento ${id}`,
          descripcion: reqData.descripcion || '',
          prioridad,
          actores: Array.isArray(reqData.actores) ? reqData.actores : (reqData.actores ? [String(reqData.actores)] : []),
          precondiciones: reqData.precondiciones || '',
          poscondiciones: reqData.poscondiciones || '',
          metrica_medible: reqData.metrica_medible || '',
          origen: reqData.origen || 'inferido',
          evidencia: reqData.evidencia || '',
          evidencias: reqData.evidencias || [],
          fuentes_origen: Array.isArray(reqData.fuentes_origen) ? reqData.fuentes_origen : [],
          necesidades_origen: Array.isArray(reqData.necesidades_origen) ? reqData.necesidades_origen : [],
          criterios_aceptacion: Array.isArray(reqData.criterios_aceptacion) ? reqData.criterios_aceptacion : [],
          reglas_relacionadas: Array.isArray(reqData.reglas_relacionadas) ? reqData.reglas_relacionadas : [],
          requiere_confirmacion: Boolean(reqData.requiere_confirmacion),
          estado_decision: reqData.estado_decision || (reqData.requiere_confirmacion ? 'pendiente' : 'confirmado'),
          restricciones_excluidas: Array.isArray(reqData.restricciones_excluidas) ? reqData.restricciones_excluidas : [],
          aprobado: false
        });
        requerimientosGenerados.push(reqEntity);
      }
      if (initial && previousRequirements.length) {
        for (const row of requerimientosGenerados) {
          const previous = previousRequirements.find(r => r.identificador === row.identificador);
          if (previous && !actualizarIds.includes(row.identificador)) continue;
          if (previous) {
            const { historial_versiones, ...snapshot } = previous;
            await this.requerimientoRepository.actualizar(previous.id || previous._id, { ...row, desactualizado: false, historial_versiones: [...(historial_versiones || []), { fecha: new Date(), contenido: snapshot, analisis_inicial: proyecto.auditoria_requisitos?.referencia_analisis_inicial }] });
          } else await this.requerimientoRepository.crear(row);
        }
        const produced = new Set(requerimientosGenerados.map(r => r.identificador));
        for (const previous of previousRequirements) if (actualizarIds.includes(previous.identificador) && !produced.has(previous.identificador)) await this.requerimientoRepository.actualizar(previous.id || previous._id, { desactualizado: true, aprobado: false });
      } else await this.requerimientoRepository.crearMuchos(requerimientosGenerados);
      if (resultadoIA.auditoria_requisitos) {
        const RequirementApprovalService = require('../services/RequirementApprovalService');
        resultadoIA.auditoria_requisitos = {
          ...resultadoIA.auditoria_requisitos,
          control_aprobacion: new RequirementApprovalService().evaluate(requerimientosGenerados, resultadoIA.auditoria_requisitos)
        };
      }
      // Cualquier modelado anterior queda obsoleto al regenerar los requisitos.
      if (initial) await this.requirementChangeService?.invalidate(proyectoId, 'Se redactaron requisitos desde el análisis inicial aprobado.');
      else await this.diagramaRepository.eliminarPorProyecto(proyectoId);
      if (this.disenoRepository && typeof this.disenoRepository.invalidarDerivados === 'function') {
        await this.disenoRepository.invalidarDerivados(proyectoId);
      }
    }

    // Persistir diagramas únicamente después de aprobar el análisis.
    const diagramasGenerados = [];
    if (objetivoNormalizado !== 'requisitos' && resultadoIA.diagramas && Array.isArray(resultadoIA.diagramas)) {
      if (!tipoDiagramaNormalizado) {
        await this.diagramaRepository.eliminarPorProyecto(proyectoId);
      } else {
        const tiposDependientes = this.diagramWorkflowService.dependentTypes(tipoDiagramaNormalizado);
        for (const diagram of diagramasPrevios) {
          const tipoExistente = normalizeDiagramType(diagram.tipo);
          if (tipoExistente === tipoDiagramaNormalizado || tiposDependientes.includes(tipoExistente)) {
            const motivo = tipoExistente === tipoDiagramaNormalizado
              ? `Se generó una nueva versión de ${tipoDiagramaNormalizado}.`
              : `Cambió la dependencia ${tipoDiagramaNormalizado}; este diagrama debe regenerarse.`;
            await this.diagramaRepository.actualizar(diagram.id, {
              aprobado: false,
              estado: DIAGRAM_STATES.STALE,
              desactualizado: true,
              motivos_desactualizacion: [motivo],
              aprobado_en: null,
              aprobado_por: null
            });
          }
        }
      }

      for (const diagData of resultadoIA.diagramas) {
        // Extraer el código Mermaid bajo cualquier nombre común que devuelva el LLM
        let rawCode = diagData.codigo_mermaid || diagData.codigo || diagData.mermaid || diagData.code || diagData.mermaid_code || diagData.diagrama || '';
        
        // Limpiar bloques de código markdown ```mermaid ... ```
        let cleanMermaid = String(rawCode)
          .replace(/^```(?:mermaid)?\s*/i, '')
          .replace(/\s*```$/i, '')
          .trim();

        // Normalizar el tipo de diagrama
        let tipo = tipoDiagramaNormalizado || String(diagData.tipo || 'casos_de_uso').toLowerCase().replace(/-/g, '_');
        const tiposValidos = [...DIAGRAM_TYPE_VALUES, 'clases', 'er', 'arquitectura', 'secuencia', 'actividad'];
        if (!tiposValidos.includes(tipo)) {
          if (tipo.includes('caso') || tipo.includes('use')) tipo = 'casos_de_uso';
          else if (tipo.includes('clase') || tipo.includes('class')) tipo = 'clases';
          else if (tipo.includes('arqui') || tipo.includes('arch')) tipo = 'arquitectura';
          else if (tipo.includes('arbol') || tipo.includes('nav')) tipo = 'arbol_navegacion';
          else tipo = 'casos_de_uso';
        }

        if (tipoDiagramaNormalizado && normalizeDiagramType(tipo) !== tipoDiagramaNormalizado) continue;

        // Si el LLM devolvió el código vacío, proveer un diagrama base válido por defecto
        if (!cleanMermaid) {
          cleanMermaid = `graph TD\n    A[Inicio: ${diagData.titulo || 'Proceso'}] --> B[Ejecución de Módulo]\n    B --> C[Fin]`;
        }

        const versionesMismoTipo = diagramasPrevios
          .filter((diagram) => normalizeDiagramType(diagram.tipo) === normalizeDiagramType(tipo))
          .map((diagram) => Number(diagram.version || 1));
        const version = versionesMismoTipo.length ? Math.max(...versionesMismoTipo) + 1 : 1;
        const latest = this.diagramWorkflowService.latestByType(diagramasPrevios);
        const versionesOrigen = tipoDiagramaNormalizado
          ? Object.fromEntries((DIAGRAM_DEFINITIONS[tipoDiagramaNormalizado]?.dependencies || []).map((dependency) => [
            dependency,
            Number(latest.get(dependency)?.version || 1)
          ]))
          : {};
        const validacionCalidad = this.plantumlValidatorService
          ? this.plantumlValidatorService.validar(diagData.codigo_plantuml || diagData.codigo_puml || '', {
            tipo,
            analisisRequisitos: contextoProyecto.analisis_requisitos,
            rnfList: requerimientosAprobados.filter((req) => String(req.tipo || '').toUpperCase() === 'RNF'),
            trazabilidad_rnf: diagData.trazabilidad_rnf,
            requisitos: requerimientosAprobados,
            requisitos_relacionados: diagData.requisitos_relacionados,
            diagramasDependencia: diagramasAprobados
          })
          : { valido: true, errores: [], advertencias: [], metricas: {} };

        const diagEntity = new Diagrama({
          proyecto_id: proyectoId,
          tipo,
          titulo: diagData.titulo || `Diagrama de ${tipo}`,
          descripcion: diagData.descripcion || '',
          codigo_mermaid: cleanMermaid,
          codigo_plantuml: diagData.codigo_plantuml || diagData.codigo_puml || '',
          trazabilidad_rnf: Array.isArray(diagData.trazabilidad_rnf) ? diagData.trazabilidad_rnf : [],
          requisitos_relacionados: Array.isArray(diagData.requisitos_relacionados) ? diagData.requisitos_relacionados : [],
          versiones_origen: versionesOrigen,
          descripcion_jerarquica: Array.isArray(diagData.descripcion_jerarquica) ? diagData.descripcion_jerarquica : (diagData.descripcion_jerarquica ? [diagData.descripcion_jerarquica] : []),
          aprobado: false,
          estado: DIAGRAM_STATES.PENDING_REVIEW,
          version,
          desactualizado: false,
          estado_calidad: validacionCalidad.valido
            ? (validacionCalidad.advertencias?.length ? 'advertencia' : 'valido')
            : 'invalido',
          errores_validacion: validacionCalidad.errores || [],
          advertencias_validacion: validacionCalidad.advertencias || [],
          metricas_validacion: validacionCalidad.metricas || {},
          validado_en: new Date(),
          huella_entrada: inputFingerprint,
          retroalimentacion_aplicada: contextoProyecto.retroalimentacion_diagrama
        });
        diagramasGenerados.push(diagEntity);
      }
      await this.diagramaRepository.crearMuchos(diagramasGenerados);
    }

    // Actualizar metadatos del proyecto generados o refinados por la IA sin prefijos genéricos redundantes
    const cleanProjectName = (raw) => {
      if (!raw || typeof raw !== 'string') return '';
      let cleaned = raw.trim().replace(/^["'“”]+|["'“”]+$/g, '').trim();
      cleaned = cleaned.replace(/^(Sistema de|Sistema para|Sistema|Software de|Software para|Aplicación de|Plataforma de|App de)\s+/i, '').trim();
      if (cleaned.length > 0) {
        cleaned = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
      }
      return cleaned;
    };

    let nombreFinal = cleanProjectName(resultadoIA.nombre_proyecto) || cleanProjectName(proyecto.nombre) || 'Gestión y Control Operativo';
    let descripcionFinal = (resultadoIA.descripcion_proyecto && resultadoIA.descripcion_proyecto.trim()) || proyecto.descripcion;

    const updates = {
      nombre: nombreFinal,
      descripcion: descripcionFinal,
      estado_fase: objetivoNormalizado === 'diagramas' ? 'diseno_pendiente' : 'analisis_pendiente'
    };
    if (insumoBrutoInput && !proyecto.insumo_bruto) updates.insumo_bruto = insumoBrutoInput;
    if (objetivoNormalizado === 'requisitos' && resultadoIA.auditoria_requisitos) {
      await this.requirementChangeService?.invalidateCode(proyectoId, 'Se generó una nueva versión del análisis de requisitos.');
      const previous = proyecto.auditoria_requisitos;
      if (initial && previousRequirements.length) {
        const state = await this.initialAnalysis.get(proyectoId, usuarioId);
        resultadoIA.auditoria_requisitos.pendientes_analisis_inicial = state.impacto.requisitos_afectados.filter(id => !actualizarIds.includes(id));
      }
      updates.auditoria_requisitos = { ...resultadoIA.auditoria_requisitos,
        version_analisis: Number(previous?.version_analisis || 0) + 1,
        historial_analisis: [...(previous?.historial_analisis || []), ...(previous ? [{ fecha: new Date().toISOString(), version: previous.version_analisis || 0,
          inventario: previous.inventario, necesidades_pendientes: previous.necesidades_pendientes, revision_semantica: previous.revision_semantica }] : [])] };
      resultadoIA.auditoria_requisitos = updates.auditoria_requisitos;
    }

    if (resultadoIA.resumen && resultadoIA.resumen.trim()) updates.resumen = resultadoIA.resumen.trim();
    if (resultadoIA.introduccion && resultadoIA.introduccion.trim()) updates.introduccion = resultadoIA.introduccion.trim();
    if (resultadoIA.objetivo_general && resultadoIA.objetivo_general.trim()) updates.objetivo_general = resultadoIA.objetivo_general.trim();
    if (Array.isArray(resultadoIA.objetivos_especificos) && resultadoIA.objetivos_especificos.length > 0) {
      updates.objetivos_especificos = resultadoIA.objetivos_especificos;
    }
    if (Array.isArray(resultadoIA.palabras_clave) && resultadoIA.palabras_clave.length > 0) {
      updates.palabras_clave = resultadoIA.palabras_clave;
    }

    await this.proyectoRepository.actualizar(proyectoId, updates);
    console.log(`[ProcesarConIA] Proyecto actualizado en MongoDB: "${nombreFinal}"`);

    const diagramasActuales = await this.diagramaRepository.listarPorProyecto(proyectoId);
    return {
      proyecto_id: proyectoId,
      nombre_proyecto: nombreFinal,
      descripcion_proyecto: descripcionFinal,
      objetivo: objetivoNormalizado,
      auditoria_requisitos: resultadoIA.auditoria_requisitos || undefined,
      requerimientos: await this.requerimientoRepository.listarPorProyecto(proyectoId),
      diagramas: diagramasActuales,
      flujoDiagramas: objetivoNormalizado === 'diagramas'
        ? this.diagramWorkflowService.build({ requirementsApproved: true, diagrams: diagramasActuales })
        : undefined,
      reparaciones_controladas: reparacionesControladas
    };
    });
  }
}

module.exports = ProcesarConIA;
