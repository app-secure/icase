/**
 * Validador especializado para Diagramas de Arquitectura de Software
 * Tipo: arquitectura_software (C4 Container)
 */
class ArquitecturaSoftwareValidatorService {
  /**
   * Valida un diagrama de arquitectura de software
   * @param {Object} params
   * @param {string} params.codigo - Código PlantUML
   * @param {Array} [params.rnfList] - Lista de requerimientos no funcionales
   * @param {Array} [params.trazabilidad_rnf] - Mapeo explícito RNF -> elemento
   * @returns {Object} { valido, errores, advertencias, trazabilidad, componentes_detectados }
   */
  validar({ codigo, rnfList = [], trazabilidad_rnf = [] } = {}) {
    const errores = [];
    const advertencias = [];
    const componentesDetectados = [];

    if (!codigo || typeof codigo !== 'string' || codigo.trim() === '') {
      return {
        valido: false,
        errores: ['El código PlantUML de arquitectura_software está vacío.'],
        advertencias: [],
        trazabilidad: [],
        componentes_detectados: []
      };
    }

    const trimmed = codigo.trim();

    // 1. Sintaxis base PlantUML
    if (!trimmed.startsWith('@startuml')) {
      errores.push('El diagrama de arquitectura_software debe iniciar con @startuml.');
    }
    if (!trimmed.includes('@enduml')) {
      errores.push('El diagrama de arquitectura_software debe finalizar con @enduml.');
    }

    const lowerCode = trimmed.toLowerCase();

    // 2. Componentes de Software requeridos (aplicaciones, capas, servicios, base de datos, mensajería)
    const tieneContenedores = /container(?:db)?\s*\(|component\s+|rectangle\s+/i.test(trimmed);
    if (!tieneContenedores) {
      errores.push('Debe modelar contenedores o componentes de software (Container, ContainerDb, component o rectangle).');
    }

    const tieneRelaciones = /rel\s*\(/i.test(trimmed) || trimmed.includes('-->') || trimmed.includes('->');
    if (!tieneRelaciones) {
      errores.push('Debe definir la comunicación o relaciones explícitas entre los componentes de software (Rel o flechas).');
    }

    // Detección de capas y tipos de componentes
    if (/containerdb|database|basededatos|postgres|mongo|sql|mysql|oracle/i.test(trimmed)) {
      componentesDetectados.push('base_de_datos');
    }
    if (/api|gateway|service|servicio|backend|microservicio/i.test(trimmed)) {
      componentesDetectados.push('servicios_api');
    }
    if (/web|movil|mobile|frontend|portal|spa|pwa|cliente|app/i.test(trimmed)) {
      componentesDetectados.push('aplicacion_cliente');
    }
    if (/\bqueue\b|cola de mensajes|kafka|rabbitmq|broker de|mensajer[ií]a|event bus/i.test(trimmed)) {
      componentesDetectados.push('mensajeria');
    }
    if (/cache|redis|memcached/i.test(trimmed)) {
      componentesDetectados.push('cache');
    }
    if (/auth|jwt|seguridad|oauth|filtro|proxy/i.test(trimmed)) {
      componentesDetectados.push('seguridad_gateway');
    }

    // 3. Trazabilidad de RNF sin prescribir productos. Un atributo de calidad
    // define una responsabilidad y una métrica, no una tecnología concreta.
    const trazabilidadProcesada = this.normalizarTrazabilidad(trazabilidad_rnf, lowerCode);
    if (Array.isArray(rnfList) && rnfList.length > 0) {
      for (const rnf of rnfList) {
        const desc = `${rnf.nombre || ''} ${rnf.descripcion || ''} ${rnf.metrica_medible || ''}`.toLowerCase();
        const id = String(rnf.identificador || rnf.id || '').trim();
        const esArquitectonico = /rendimiento|latencia|tiempo de respuesta|seguridad|autenticaci|autorizaci|cifrado|auditor|trazabilidad|bit[aá]cora|interoperabilidad|escalabilidad|disponibilidad/i.test(desc);
        const mapeo = trazabilidadProcesada.find((item) => String(item.rnf_id || '').toLowerCase() === id.toLowerCase());
        const citadoEnCodigo = id && lowerCode.includes(id.toLowerCase());
        if (esArquitectonico && !mapeo && !citadoEnCodigo) {
          advertencias.push(`El RNF ${id || rnf.nombre || 'sin identificador'} no tiene trazabilidad hacia una responsabilidad de la arquitectura de software.`);
        } else if (mapeo && !mapeo.presente_en_codigo) {
          advertencias.push(`La trazabilidad de ${id || rnf.nombre} apunta a "${mapeo.elemento}", pero ese elemento no aparece en el diagrama.`);
        }
      }
    }

    const idsAprobados = new Set((Array.isArray(rnfList) ? rnfList : [])
      .map((rnf) => String(rnf.identificador || rnf.id || '').toLowerCase())
      .filter(Boolean));
    for (const mapeo of trazabilidadProcesada) {
      if (idsAprobados.size > 0 && !idsAprobados.has(String(mapeo.rnf_id || '').toLowerCase())) {
        advertencias.push(`La trazabilidad referencia ${mapeo.rnf_id}, que no corresponde a un RNF aprobado.`);
      }
    }

    return {
      valido: errores.length === 0,
      errores,
      advertencias,
      trazabilidad: trazabilidadProcesada,
      componentes_detectados: componentesDetectados
    };
  }

  normalizarTrazabilidad(trazabilidadInput, codigoLower) {
    if (!trazabilidadInput) return [];
    const list = Array.isArray(trazabilidadInput) ? trazabilidadInput : [trazabilidadInput];

    return list.map(item => {
      if (typeof item === 'string') {
        const parts = item.split(/->|:|,/).map(s => s.trim());
        const rnfId = parts[0] || 'RNF';
        const elemento = parts[1] || parts[0];
        return {
          rnf_id: rnfId,
          elemento: elemento,
          presente_en_codigo: codigoLower.includes(elemento.toLowerCase())
        };
      }
      if (typeof item === 'object' && item !== null) {
        const elemento = item.elemento || item.componente || '';
        return {
          rnf_id: item.rnf_id || item.rnf || item.id || 'RNF',
          elemento: elemento,
          justificacion: item.justificacion || item.motivo || '',
          presente_en_codigo: elemento ? codigoLower.includes(elemento.toLowerCase()) : true
        };
      }
      return { rnf_id: 'RNF', elemento: String(item), presente_en_codigo: true };
    });
  }
}

module.exports = ArquitecturaSoftwareValidatorService;
