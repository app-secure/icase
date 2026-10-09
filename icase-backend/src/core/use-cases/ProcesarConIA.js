const Requerimiento = require('../entities/Requerimiento');
const Diagrama = require('../entities/Diagrama');
const { DiagramTypes, TIPOS_VALIDOS } = require('../constants/DiagramTypes');

class ProcesarConIA {
  constructor({
    proyectoRepository,
    requerimientoRepository,
    diagramaRepository,
    estandarRepository,
    fuenteRepository,
    disenoRepository,
    plantumlValidatorService,
    aiOrchestratorService
  }) {
    this.proyectoRepository = proyectoRepository;
    this.requerimientoRepository = requerimientoRepository;
    this.diagramaRepository = diagramaRepository;
    this.estandarRepository = estandarRepository;
    this.fuenteRepository = fuenteRepository;
    this.disenoRepository = disenoRepository;
    this.plantumlValidatorService = plantumlValidatorService;
    this.aiOrchestratorService = aiOrchestratorService;
  }

  async obtenerModelosDisponibles() {
    if (this.aiOrchestratorService && typeof this.aiOrchestratorService.obtenerModelosDisponibles === 'function') {
      return await this.aiOrchestratorService.obtenerModelosDisponibles();
    }
    return { provider_defecto: 'auto', proveedores: [] };
  }

  async ejecutar({ proyectoId, insumoBrutoInput = '', insumoAdicional = '', provider = 'auto', specificModel = null, objetivo = 'completo' }) {
    const proyecto = await this.proyectoRepository.obtenerPorId(proyectoId);
    if (!proyecto) {
      throw new Error(`Proyecto con ID ${proyectoId} no encontrado.`);
    }
    const objetivoNormalizado = ['requisitos', 'diagramas', 'completo'].includes(objetivo) ? objetivo : 'completo';
    if (objetivoNormalizado === 'diagramas') {
      const estadosPermitidos = new Set(['analisis_aprobado', 'diseno_pendiente', 'diagramas_aprobados', 'mockups_pendientes']);
      if (!estadosPermitidos.has(proyecto.estado_fase)) {
        throw new Error('Los requisitos deben estar aprobados antes de generar los diagramas.');
      }
    }

    // 1. Insumo bruto: usar el enviado directamente o el registrado en base de datos
    let textoBase = insumoBrutoInput && insumoBrutoInput.trim() !== ''
      ? insumoBrutoInput
      : (proyecto.insumo_bruto || '');

    // Concatenar fuentes transcritas e ingeridas de la base de datos (PDFs y Audios procesados en backend)
    if (this.fuenteRepository) {
      try {
        const fuentesBd = await this.fuenteRepository.listarPorProyecto(proyectoId);
        if (Array.isArray(fuentesBd) && fuentesBd.length > 0) {
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
      } catch (errFuentes) {
        console.warn('[ProcesarConIA] Error consultando fuentes del proyecto:', errFuentes.message);
      }
    }

    // Si se envió insumoBrutoInput y el proyecto no lo tenía, persistirlo en base de datos
    if (insumoBrutoInput && (!proyecto.insumo_bruto || proyecto.insumo_bruto.trim() === '')) {
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

    const contextoProyecto = {
      requerimientos_aprobados: requerimientosAprobados,
      diagramas_aprobados: diagramasAprobados,
      requerimientos_actuales: requerimientosPrevios,
      diagramas_actuales: diagramasPrevios
    };

    // Construcción del payload de tres bloques explícitos
    const payload = {
      proyecto_id: proyectoId,
      nombre_proyecto: proyecto.nombre,
      insumo_bruto: insumoBruto,
      insumo_adicional: insumoAdicional,
      provider,
      specificModel,
      objetivo: objetivoNormalizado,
      diccionario_estandares: estandares,
      contexto_proyecto: contextoProyecto
    };

    // Llamada única a n8n / IA
    const resultadoIA = await this.aiOrchestratorService.procesar(payload);

    if (objetivoNormalizado === 'requisitos' && (!resultadoIA.requerimientos || resultadoIA.requerimientos.length === 0)) {
      throw new Error('La IA no devolvió requerimientos válidos. Se conservaron los datos existentes.');
    }
    if (objetivoNormalizado === 'diagramas') {
      const diagramasValidos = (resultadoIA.diagramas || []).filter((diagrama) => {
        const codigo = String(diagrama.codigo_plantuml || '');
        return codigo.includes('@start') && !codigo.includes('No hay diagrama disponible') && !codigo.includes('No hay diagrama de navegación disponible');
      });
      if (diagramasValidos.length < 4) {
        throw new Error('La IA no devolvió los cuatro diagramas válidos. Puedes reintentar sin perder los requisitos aprobados.');
      }
      if (this.plantumlValidatorService) {
        const errores = diagramasValidos
          .map((diagrama) => ({ tipo: diagrama.tipo, resultado: this.plantumlValidatorService.validar(diagrama.codigo_plantuml, diagrama.tipo) }))
          .filter(({ resultado }) => !resultado.valido);
        if (errores.length) {
          const detalle = errores.map(({ tipo, resultado }) => `${tipo}: ${resultado.error}`).join(' | ');
          throw new Error(`La IA devolvió diagramas con problemas de estructura o legibilidad. ${detalle}`);
        }
      }
      const casosUso = diagramasValidos.find((diagrama) => String(diagrama.tipo).toLowerCase().includes('caso'));
      if (casosUso) {
        const normalizarActor = (value) => String(value || '')
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, ' ')
          .trim();
        const actoresRequeridos = [...new Set(requerimientosPrevios
          .filter((requisito) => String(requisito.tipo || '').toUpperCase() === 'RF')
          .flatMap((requisito) => Array.isArray(requisito.actores) ? requisito.actores : [requisito.actores])
          .flatMap((actor) => String(actor || '').split(/[,;|]/))
          .map(normalizarActor)
          .filter(Boolean))];
        const codigoCasosUso = String(casosUso.codigo_plantuml || '');
        const actoresDiagramados = [
          ...codigoCasosUso.matchAll(/^\s*actor\s+(?:"([^"]+)"|:([^:]+):|([^\s\n]+))(?:\s+as\s+([\w.]+))?/gim),
          ...codigoCasosUso.matchAll(/^\s*:([^:\n]+):\s*(?:as\s+([\w.]+))?/gim)
        ]
          .map((match) => {
            const rawNombre = match[1] || match[2] || match[3] || '';
            const rawAlias = match[4] || match[2] || match[1] || match[3] || '';
            return {
              nombre: normalizarActor(rawNombre),
              alias: (rawAlias.trim().replace(/^:|:$/g, ''))
            };
          })
          .filter((actor) => actor.nombre);

        const coincideActor = (actorReq, actorDiag) => {
          if (!actorReq || !actorDiag) return false;
          if (actorReq === actorDiag) return true;
          if (actorReq.includes(actorDiag) || actorDiag.includes(actorReq)) return true;
          const stopWords = new Set(['de', 'del', 'el', 'la', 'los', 'las', 'en', 'para', 'y', 'e', 'o']);
          const tReq = actorReq.split(' ').filter(w => !stopWords.has(w));
          const tDiag = actorDiag.split(' ').filter(w => !stopWords.has(w));
          if (tReq.length > 0 && tDiag.length > 0) {
            const matches = tReq.filter(w => tDiag.includes(w));
            if (matches.length >= Math.min(tReq.length, tDiag.length)) return true;
          }
          return false;
        };

        const faltantes = actoresRequeridos.filter((actor) => !actoresDiagramados.some(({ nombre }) => coincideActor(actor, nombre)));
        if (faltantes.length) {
          throw new Error(`El diagrama de casos de uso omitió actores definidos en los requisitos aprobados: ${faltantes.join(', ')}. Reintenta la generación para obtener trazabilidad completa.`);
        }
        const actoresSinRelacion = actoresDiagramados
          .filter(({ alias }) => {
            const aliasEscapado = String(alias || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            if (!aliasEscapado) return true;
            return !new RegExp(`(?:^|\\s)${aliasEscapado}\\s*(?:--+|\\.\\.+|<[-.]+|[-.]+>)`, 'im').test(codigoCasosUso) &&
              !new RegExp(`(?:--+|\\.\\.+|<[-.]+|[-.]+>)\\s*${aliasEscapado}(?:\\s|$)`, 'im').test(codigoCasosUso);
          })
          .map(({ nombre }) => nombre);
        if (actoresSinRelacion.length) {
          throw new Error(`El diagrama de casos de uso contiene actores sin interacción: ${actoresSinRelacion.join(', ')}.`);
        }
      }
    }

    // Persistir requerimientos únicamente durante la fase de análisis.
    const requerimientosGenerados = [];
    if (objetivoNormalizado !== 'diagramas' && resultadoIA.requerimientos && Array.isArray(resultadoIA.requerimientos)) {
      // Reemplazamos requerimientos no aprobados previos o anexamos
      await this.requerimientoRepository.eliminarPorProyecto(proyectoId);

      let idx = 1;
      for (const reqData of resultadoIA.requerimientos) {
        let tipo = String(reqData.tipo || 'RF').toUpperCase();
        if (tipo !== 'RF' && tipo !== 'RNF') {
          tipo = tipo.includes('NO') || tipo.includes('RNF') ? 'RNF' : 'RF';
        }

        let prioridad = String(reqData.prioridad || 'Media').toLowerCase();
        if (prioridad.includes('alt') || prioridad.includes('high')) prioridad = 'Alta';
        else if (prioridad.includes('baj') || prioridad.includes('low')) prioridad = 'Baja';
        else prioridad = 'Media';

        const defaultId = `${tipo}-${String(idx++).padStart(2, '0')}`;

        const reqEntity = new Requerimiento({
          proyecto_id: proyectoId,
          tipo,
          identificador: reqData.identificador || defaultId,
          nombre: reqData.nombre || `Requerimiento ${defaultId}`,
          descripcion: reqData.descripcion || '',
          prioridad,
          actores: Array.isArray(reqData.actores) ? reqData.actores : (reqData.actores ? [String(reqData.actores)] : []),
          precondiciones: reqData.precondiciones || '',
          poscondiciones: reqData.poscondiciones || '',
          metrica_medible: reqData.metrica_medible || '',
          aprobado: false
        });
        requerimientosGenerados.push(reqEntity);
      }
      await this.requerimientoRepository.crearMuchos(requerimientosGenerados);
      // Cualquier modelado anterior queda obsoleto al regenerar los requisitos.
      await this.diagramaRepository.eliminarPorProyecto(proyectoId);
      if (this.disenoRepository && typeof this.disenoRepository.invalidarDerivados === 'function') {
        await this.disenoRepository.invalidarDerivados(proyectoId);
      }
    }

    // Persistir diagramas únicamente después de aprobar el análisis.
    const diagramasGenerados = [];
    if (objetivoNormalizado !== 'requisitos' && resultadoIA.diagramas && Array.isArray(resultadoIA.diagramas)) {
      await this.diagramaRepository.eliminarPorProyecto(proyectoId);

      for (const diagData of resultadoIA.diagramas) {
        // Extraer el código Mermaid bajo cualquier nombre común que devuelva el LLM
        let rawCode = diagData.codigo_mermaid || diagData.codigo || diagData.mermaid || diagData.code || diagData.mermaid_code || diagData.diagrama || '';
        
        // Limpiar bloques de código markdown ```mermaid ... ```
        let cleanMermaid = String(rawCode)
          .replace(/^```(?:mermaid)?\s*/i, '')
          .replace(/\s*```$/i, '')
          .trim();

        // Normalizar el tipo de diagrama
        let tipo = String(diagData.tipo || DiagramTypes.CASOS_DE_USO).toLowerCase().replace(/-/g, '_');
        if (!TIPOS_VALIDOS.includes(tipo)) {
          if (tipo.includes('diseno')) tipo = DiagramTypes.CLASES_DISENO;
          else if (tipo.includes('caso') || tipo.includes('use')) tipo = DiagramTypes.CASOS_DE_USO;
          else if (tipo.includes('dominio')) tipo = DiagramTypes.CLASES_DOMINIO;
          else if (tipo.includes('clase') || tipo.includes('class')) tipo = DiagramTypes.CLASES;
          else if (tipo.includes('sistema') || tipo.includes('system') || tipo.includes('infra') || tipo.includes('deploy')) tipo = DiagramTypes.ARQUITECTURA_SISTEMA;
          else if (tipo.includes('software') || (tipo.includes('arqui') && !tipo.includes('sistema'))) tipo = DiagramTypes.ARQUITECTURA_SOFTWARE;
          else if (tipo.includes('arbol') || tipo.includes('nav') || tipo.includes('wbs')) tipo = DiagramTypes.ARBOL_NAVEGACION;
          else tipo = DiagramTypes.CASOS_DE_USO;
        }

        // Si el LLM devolvió el código vacío, proveer un diagrama base válido por defecto
        if (!cleanMermaid) {
          cleanMermaid = `graph TD\n    A[Inicio: ${diagData.titulo || 'Proceso'}] --> B[Ejecución de Módulo]\n    B --> C[Fin]`;
        }

        const diagEntity = new Diagrama({
          proyecto_id: proyectoId,
          tipo,
          titulo: diagData.titulo || `Diagrama de ${tipo}`,
          descripcion: diagData.descripcion || '',
          codigo_mermaid: cleanMermaid,
          codigo_plantuml: diagData.codigo_plantuml || diagData.codigo_puml || '',
          trazabilidad_rnf: Array.isArray(diagData.trazabilidad_rnf) ? diagData.trazabilidad_rnf : [],
          descripcion_jerarquica: Array.isArray(diagData.descripcion_jerarquica) ? diagData.descripcion_jerarquica : (diagData.descripcion_jerarquica ? [diagData.descripcion_jerarquica] : []),
          aprobado: false
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

    return {
      proyecto_id: proyectoId,
      nombre_proyecto: nombreFinal,
      descripcion_proyecto: descripcionFinal,
      objetivo: objetivoNormalizado,
      requerimientos: await this.requerimientoRepository.listarPorProyecto(proyectoId),
      diagramas: await this.diagramaRepository.listarPorProyecto(proyectoId)
    };
  }
}

module.exports = ProcesarConIA;
