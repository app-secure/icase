const RequirementSemanticsService = require('./RequirementSemanticsService');
const { normalizeTraceability } = require('./ArchitectureTraceabilityService');

/**
 * Validador especializado para Diagramas de Arquitectura de Sistema e Infraestructura
 * Tipo: arquitectura_sistema (C4 Deployment / Nodos de Infraestructura)
 */
class ArquitecturaSistemaValidatorService {
  constructor() {
    this.requirementSemantics = new RequirementSemanticsService();
  }
  /**
   * Determina si la lista de requerimientos o texto solicita explícitamente Alta Disponibilidad
   * @param {Array|string} rnfList
   * @returns {boolean}
   */
  requiereAltaDisponibilidad(rnfList = []) {
    if (!rnfList) return false;
    if (typeof rnfList === 'string') {
      return this.requirementSemantics.requestsHighAvailability({ descripcion: rnfList });
    }
    return (Array.isArray(rnfList) ? rnfList : []).some((requirement) =>
      this.requirementSemantics.requestsHighAvailability(requirement)
    );
  }

  /**
   * Valida un diagrama de arquitectura de sistema
   * @param {Object} params
   * @param {string} params.codigo - Código PlantUML
   * @param {Array} [params.rnfList] - Lista de requerimientos no funcionales
   * @param {Array} [params.trazabilidad_rnf] - Mapeo RNF -> elemento
   * @returns {Object} { valido, errores, advertencias, trazabilidad, alta_disponibilidad_solicitada, alta_disponibilidad_detectada }
   */
  validar({ codigo, rnfList = [], trazabilidad_rnf = [] } = {}) {
    const errores = [];
    const advertencias = [];

    if (!codigo || typeof codigo !== 'string' || codigo.trim() === '') {
      return {
        valido: false,
        errores: ['El código PlantUML de arquitectura_sistema está vacío.'],
        advertencias: [],
        trazabilidad: [],
        alta_disponibilidad_solicitada: false,
        alta_disponibilidad_detectada: false
      };
    }

    const trimmed = codigo.trim();

    // 1. Sintaxis base PlantUML
    if (!trimmed.startsWith('@startuml')) {
      errores.push('El diagrama de arquitectura_sistema debe iniciar con @startuml.');
    }
    if (!trimmed.includes('@enduml')) {
      errores.push('El diagrama de arquitectura_sistema debe finalizar con @enduml.');
    }

    const lowerCode = trimmed.toLowerCase();

    // 2. Elementos de Infraestructura (nodos, servidores, despliegue)
    const tieneNodos = /deployment_node|node\s+|server|servidor|host|instance|cloud|vps|cluster/i.test(trimmed);
    if (!tieneNodos) {
      errores.push('Debe modelar nodos de infraestructura o servidores (Deployment_Node, node o servidor).');
    }

    // 3. Verificación de Alta Disponibilidad
    const haSolicitada = this.requiereAltaDisponibilidad(rnfList);

    // Detección de elementos de alta disponibilidad en el código PlantUML
    const patronesDetectoresHA = [
      /failover/i,
      /hot standby|standby|esclavo|slave/i,
      /r[eé]plica\s+(?:en\s+caliente|standby|pasiva)/i,
      /conmutaci[oó]n/i,
      /nodo\s+r[eé]plica/i,
      /balanceador.*(?:failover|redundante)/i
    ];

    const haDetectada = patronesDetectoresHA.some(p => p.test(trimmed));

    // REGLA FUNDAMENTAL: "No agregar alta disponibilidad si los requisitos no la solicitan"
    if (!haSolicitada && haDetectada) {
      errores.push(
        'Regla de arquitectura incumplida: Se incluyó alta disponibilidad (failover / réplicas en caliente / redundancia) sin que los requerimientos la soliciten.'
      );
    } else if (haSolicitada && !haDetectada) {
      advertencias.push(
        'Los requisitos solicitan Alta Disponibilidad, pero el diagrama de infraestructura no incluye explícitamente balanceador, nodos réplica ni conmutación por error (failover).'
      );
    }

    // 4. Monitoreo y observabilidad solo son obligatorios cuando existe un RNF
    // aprobado que los solicite.
    const tieneMonitoreo = /monitor|prometheus|grafana|cloudwatch|health|telemetr/i.test(lowerCode);
    const monitoreoSolicitado = Array.isArray(rnfList) && rnfList.some((rnf) =>
      /monitor|observabilidad|telemetr|m[eé]trica operativa|health check/i.test(`${rnf.nombre || ''} ${rnf.descripcion || ''} ${rnf.metrica_medible || ''}`)
    );
    if (monitoreoSolicitado && !tieneMonitoreo) {
      advertencias.push('Existe un RNF de monitoreo u observabilidad sin un elemento responsable en la arquitectura del sistema.');
    }

    // 5. Trazabilidad RNF -> elemento arquitectónico de infraestructura
    const trazabilidadProcesada = normalizeTraceability(trazabilidad_rnf, trimmed);
    const idsAprobados = new Set((Array.isArray(rnfList) ? rnfList : [])
      .map((rnf) => String(rnf.identificador || rnf.id || '').toLowerCase())
      .filter(Boolean));
    for (const mapeo of trazabilidadProcesada) {
      if (idsAprobados.size > 0 && !idsAprobados.has(String(mapeo.rnf_id || '').toLowerCase())) {
        advertencias.push(`La trazabilidad referencia ${mapeo.rnf_id}, que no corresponde a un RNF aprobado.`);
      } else if (!mapeo.presente_en_codigo) {
        advertencias.push(`La trazabilidad de ${mapeo.rnf_id} apunta a "${mapeo.elemento}", pero ese elemento no aparece en el diagrama.`);
      }
    }

    return {
      valido: errores.length === 0,
      errores,
      advertencias,
      trazabilidad: trazabilidadProcesada,
      alta_disponibilidad_solicitada: haSolicitada,
      alta_disponibilidad_detectada: haDetectada
    };
  }

  normalizarTrazabilidad(trazabilidadInput, codigoLower) {
    return normalizeTraceability(trazabilidadInput, codigoLower);
  }
}

module.exports = ArquitecturaSistemaValidatorService;
