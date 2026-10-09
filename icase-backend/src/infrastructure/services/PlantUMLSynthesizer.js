const { DiagramTypes } = require('../../core/constants/DiagramTypes');
const ArquitecturaSoftwareGeneratorService = require('./ArquitecturaSoftwareGeneratorService');
const ArquitecturaSistemaGeneratorService = require('./ArquitecturaSistemaGeneratorService');
const ArquitecturaSistemaValidatorService = require('./ArquitecturaSistemaValidatorService');

class PlantUMLSynthesizer {
  static normalizar(diagramasRecibidos, contexto = {}) {
    const list = Array.isArray(diagramasRecibidos) ? [...diagramasRecibidos] : [];
    const nombreProyecto = contexto.nombreProyecto || contexto.nombre_proyecto || 'Sistema de Información';
    const requerimientos = Array.isArray(contexto.requerimientos) ? contexto.requerimientos : [];

    const softwareGen = new ArquitecturaSoftwareGeneratorService();
    const sistemaGen = new ArquitecturaSistemaGeneratorService();
    const sistemaValidator = new ArquitecturaSistemaValidatorService();

    const tiposRequeridos = [
      {
        tipo: DiagramTypes.CASOS_DE_USO,
        matcher: d => (d.tipo || '').toLowerCase().includes('caso') || (d.tipo || '').toLowerCase().includes('use'),
        titulo: 'Diagrama de Casos de Uso (IEEE 830)'
      },
      {
        tipo: DiagramTypes.ARQUITECTURA_SOFTWARE,
        matcher: d => {
          const t = (d.tipo || '').toLowerCase();
          return t === DiagramTypes.ARQUITECTURA_SOFTWARE || t.includes('software') || (t.includes('arqui') && !t.includes('sistema') && !t.includes('system'));
        },
        titulo: 'Diagrama de Arquitectura de Software (C4 Container)'
      },
      {
        tipo: DiagramTypes.ARQUITECTURA_SISTEMA,
        matcher: d => {
          const t = (d.tipo || '').toLowerCase();
          return t === DiagramTypes.ARQUITECTURA_SISTEMA || t.includes('sistema') || t.includes('system') || t.includes('despliegue') || t.includes('deploy');
        },
        titulo: 'Diagrama de Arquitectura de Sistema e Infraestructura (C4 Deployment)'
      },
      {
        tipo: DiagramTypes.CLASES,
        matcher: d => (d.tipo || '').toLowerCase().includes('clase') || (d.tipo || '').toLowerCase().includes('class'),
        titulo: 'Diagrama de Clases del Dominio'
      },
      {
        tipo: DiagramTypes.ARBOL_NAVEGACION,
        matcher: d => (d.tipo || '').toLowerCase().includes('arbol') || (d.tipo || '').toLowerCase().includes('nav') || (d.tipo || '').toLowerCase().includes('wbs'),
        titulo: 'Árbol de Navegación del Sistema (WBS)'
      }
    ];

    return tiposRequeridos.map(cfg => {
      const existing = list.find(cfg.matcher);
      let code = existing?.codigo_plantuml?.trim();
      let esValido = code && code.length > 20 && code.includes('@start');

      let trazabilidadRnf = Array.isArray(existing?.trazabilidad_rnf)
        ? existing.trazabilidad_rnf
        : (existing?.trazabilidad_rnf ? [existing.trazabilidad_rnf] : []);

      // Si es casos de uso y tenemos requerimientos, asegurar que todos los actores de los RFs estén presentes
      if (cfg.tipo === DiagramTypes.CASOS_DE_USO && esValido && requerimientos.length > 0) {
        const normalizarActor = (value) => String(value || '')
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, ' ')
          .trim();

        const rawActores = requerimientos
          .filter((requisito) => String(requisito.tipo || '').toUpperCase() === 'RF')
          .flatMap((requisito) => {
            const arr = Array.isArray(requisito.actores) ? requisito.actores : [requisito.actores];
            return arr.flatMap(a => String(a || '').split(/[,;|]/)).map(s => s.trim()).filter(Boolean);
          });

        const actoresRequeridos = [...new Set(rawActores.map(normalizarActor).filter(Boolean))];
        const actoresDiagramados = [...code.matchAll(/^\s*actor\s+(?:"([^"]+)"|([^\s]+))(?:\s+as\s+([\w.]+))?/gim)]
          .map((match) => ({ nombre: normalizarActor(match[1] || match[2]), alias: match[3] || match[2] }))
          .filter((actor) => actor.nombre);

        const faltantes = actoresRequeridos.filter((actor) => !actoresDiagramados.some(({ nombre }) => nombre === actor || nombre.includes(actor) || actor.includes(nombre)));

        if (faltantes.length > 0) {
          console.warn(`[PlantUMLSynthesizer] Asegurando actores requeridos en Casos de Uso: ${faltantes.join(', ')}`);
          const ucMatches = [...code.matchAll(/(?:usecase\s+"[^"]+"\s+as\s+([\w.]+)|usecase\s+([\w.]+)\s+as|\(([^\)]+)\)\s+as\s+([\w.]+))/gim)]
            .map(m => m[1] || m[2] || m[4])
            .filter(Boolean);
          const targetUc = ucMatches[0] || 'UC_Principal';

          let inyeccion = '\n\' === ACTORES DE REQUISITOS ASEGURADOS POR TRAZABILIDAD ===\n';
          faltantes.forEach((nomNorm, idx) => {
            const originalNombre = rawActores.find(r => normalizarActor(r) === nomNorm) || nomNorm;
            const safeAlias = `ActorReq_${idx}_${nomNorm.replace(/\s+/g, '_').slice(0, 15)}`;
            inyeccion += `actor "${originalNombre}" as ${safeAlias}\n`;
            inyeccion += `${safeAlias} --> ${targetUc} : <<interactúa>>\n`;
          });

          if (code.includes('@enduml')) {
            code = code.replace('@enduml', `${inyeccion}\n@enduml`);
          } else {
            code += `${inyeccion}\n@enduml`;
          }
        }
      }

      // Si es arquitectura de software y no vino o no es válido, sintetizar con requerimientos
      if (cfg.tipo === DiagramTypes.ARQUITECTURA_SOFTWARE && (!esValido || requerimientos.length > 0)) {
        if (!esValido) {
          const synth = softwareGen.generar({ nombreProyecto, requerimientos });
          code = synth.codigo_plantuml;
          esValido = true;
          if (trazabilidadRnf.length === 0) trazabilidadRnf = synth.trazabilidad_rnf;
        } else if (trazabilidadRnf.length === 0 && requerimientos.length > 0) {
          const synth = softwareGen.generar({ nombreProyecto, requerimientos });
          trazabilidadRnf = synth.trazabilidad_rnf;
        }
      }

      // Si es arquitectura de sistema: verificar estricta regla de Alta Disponibilidad
      if (cfg.tipo === DiagramTypes.ARQUITECTURA_SISTEMA) {
        if (!esValido) {
          const synth = sistemaGen.generar({ nombreProyecto, requerimientos });
          code = synth.codigo_plantuml;
          esValido = true;
          trazabilidadRnf = synth.trazabilidad_rnf;
        } else {
          // Si el LLM devolvió código pero agregó alta disponibilidad sin que los RNF la soliciten, corregir
          const validacionHA = sistemaValidator.validar({ codigo: code, rnfList: requerimientos });
          if (!validacionHA.valido && validacionHA.alta_disponibilidad_detectada && !validacionHA.alta_disponibilidad_solicitada) {
            console.warn('[PlantUMLSynthesizer] Corrigiendo diagrama de arquitectura_sistema: Se detectó alta disponibilidad no solicitada.');
            const synth = sistemaGen.generar({ nombreProyecto, requerimientos });
            code = synth.codigo_plantuml;
            trazabilidadRnf = synth.trazabilidad_rnf;
          } else if (trazabilidadRnf.length === 0 && requerimientos.length > 0) {
            const synth = sistemaGen.generar({ nombreProyecto, requerimientos });
            trazabilidadRnf = synth.trazabilidad_rnf;
          }
        }
      }

      let fallbackMensaje = '@startuml\nrectangle "No hay diagrama disponible"\n@enduml';
      if (cfg.tipo === DiagramTypes.ARBOL_NAVEGACION) {
        fallbackMensaje = '@startwbs\n* Sistema\n** Portal de Acceso\n*** Inicio de Sesión\n** Panel Principal\n*** No hay diagrama de navegación disponible\n@endwbs';
      }

      return {
        tipo: existing?.tipo || cfg.tipo,
        titulo: existing?.titulo || cfg.titulo,
        descripcion: existing?.descripcion || (esValido ? 'Diagrama generado y alineado con los requerimientos.' : 'No se generó diagrama para este módulo.'),
        descripcion_jerarquica: Array.isArray(existing?.descripcion_jerarquica) && existing.descripcion_jerarquica.length > 0
          ? existing.descripcion_jerarquica
          : (existing?.descripcion ? [existing.descripcion] : []),
        trazabilidad_rnf: trazabilidadRnf,
        codigo_plantuml: esValido ? code : fallbackMensaje
      };
    });
  }
}

module.exports = PlantUMLSynthesizer;
