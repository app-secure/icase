const Requerimiento = require('../entities/Requerimiento');
const Diagrama = require('../entities/Diagrama');

class ProcesarConIA {
  constructor({
    proyectoRepository,
    requerimientoRepository,
    diagramaRepository,
    estandarRepository,
    fuenteRepository,
    aiOrchestratorService
  }) {
    this.proyectoRepository = proyectoRepository;
    this.requerimientoRepository = requerimientoRepository;
    this.diagramaRepository = diagramaRepository;
    this.estandarRepository = estandarRepository;
    this.fuenteRepository = fuenteRepository;
    this.aiOrchestratorService = aiOrchestratorService;
  }

  async ejecutar({ proyectoId, insumoBrutoInput = '', insumoAdicional = '' }) {
    const proyecto = await this.proyectoRepository.obtenerPorId(proyectoId);
    if (!proyecto) {
      throw new Error(`Proyecto con ID ${proyectoId} no encontrado.`);
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
            .map(f => `[Fuente Ingerida: ${f.nombre_archivo} (${f.tipo})]\n${f.texto_transcrito}`)
            .join('\n\n');
          if (textoFuentes) {
            // Priorizar siempre las transcripciones fidedignas de la base de datos
            textoBase = textoBase && textoBase.trim().length > 100 && !textoBase.includes('%PDF')
              ? `${textoBase}\n\n${textoFuentes}`
              : textoFuentes;
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
      diccionario_estandares: estandares,
      contexto_proyecto: contextoProyecto
    };

    // Llamada única a n8n / IA
    const resultadoIA = await this.aiOrchestratorService.procesar(payload);

    // Persistir requerimientos retornados
    const requerimientosGenerados = [];
    if (resultadoIA.requerimientos && Array.isArray(resultadoIA.requerimientos)) {
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
    }

    // Persistir diagramas retornados
    const diagramasGenerados = [];
    if (resultadoIA.diagramas && Array.isArray(resultadoIA.diagramas)) {
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
        let tipo = String(diagData.tipo || 'casos_de_uso').toLowerCase().replace(/-/g, '_');
        const tiposValidos = ['casos_de_uso', 'clases', 'er', 'arquitectura', 'arbol_navegacion', 'secuencia', 'actividad'];
        if (!tiposValidos.includes(tipo)) {
          if (tipo.includes('caso') || tipo.includes('use')) tipo = 'casos_de_uso';
          else if (tipo.includes('clase') || tipo.includes('class')) tipo = 'clases';
          else if (tipo.includes('arqui') || tipo.includes('arch')) tipo = 'arquitectura';
          else if (tipo.includes('arbol') || tipo.includes('nav')) tipo = 'arbol_navegacion';
          else tipo = 'casos_de_uso';
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
          aprobado: false
        });
        diagramasGenerados.push(diagEntity);
      }
      await this.diagramaRepository.crearMuchos(diagramasGenerados);
    }

    // Si la IA identificó un nombre formal representativo para el sistema, actualizarlo en el proyecto
    let nombreFinal = proyecto.nombre;
    let descripcionFinal = proyecto.descripcion;
    if (resultadoIA.nombre_proyecto && resultadoIA.nombre_proyecto.trim()) {
      nombreFinal = resultadoIA.nombre_proyecto.trim();
      const updates = { nombre: nombreFinal };
      if (resultadoIA.descripcion_proyecto && resultadoIA.descripcion_proyecto.trim()) {
        descripcionFinal = resultadoIA.descripcion_proyecto.trim();
        updates.descripcion = descripcionFinal;
      }
      await this.proyectoRepository.actualizar(proyectoId, updates);
      console.log(`[ProcesarConIA] Nombre del proyecto actualizado automáticamente por IA a: "${nombreFinal}"`);
    }

    return {
      proyecto_id: proyectoId,
      nombre_proyecto: nombreFinal,
      descripcion_proyecto: descripcionFinal,
      requerimientos: await this.requerimientoRepository.listarPorProyecto(proyectoId),
      diagramas: await this.diagramaRepository.listarPorProyecto(proyectoId)
    };
  }
}

module.exports = ProcesarConIA;
