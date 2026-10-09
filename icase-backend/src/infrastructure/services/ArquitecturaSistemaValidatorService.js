/**
 * Validador especializado para Diagramas de Arquitectura de Sistema e Infraestructura
 * Tipo: arquitectura_sistema (C4 Deployment / Nodos de Infraestructura)
 */
class ArquitecturaSistemaValidatorService {
  /**
   * Determina si la lista de requerimientos o texto solicita explícitamente Alta Disponibilidad
   * @param {Array|string} rnfList
   * @returns {boolean}
   */
  requiereAltaDisponibilidad(rnfList = []) {
    if (!rnfList) return false;
    const textToCheck = typeof rnfList === 'string'
      ? rnfList
      : rnfList.map(r => `${r.nombre || ''} ${r.descripcion || ''} ${r.metrica_medible || ''}`).join(' ');

    const patronHA = /alta disponibilidad|high availability|tolerancia a fallos|failover|conmutaci[oó]n|99\.9%|99\.99%|redundancia activa|activo-pasivo|cl[uú]ster redundante|balanceo de carga con r[eé]plica/i;
    return patronHA.test(textToCheck);
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

    // 4. Monitoreo y Observabilidad
    const tieneMonitoreo = /monitor|prometheus|grafana|cloudwatch|health|telemetr/i.test(lowerCode);
    if (!tieneMonitoreo) {
      advertencias.push('Se recomienda incluir un componente o agente de monitoreo/salud en la infraestructura.');
    }

    // 5. Trazabilidad RNF -> elemento arquitectónico de infraestructura
    const trazabilidadProcesada = this.normalizarTrazabilidad(trazabilidad_rnf, lowerCode);

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

module.exports = ArquitecturaSistemaValidatorService;
