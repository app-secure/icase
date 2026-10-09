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

    const tieneRelaciones = /rel\s*\(|-->|--\>/i.test(trimmed);
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
    if (/queue|cola|kafka|rabbitmq|broker|mensajeria|event/i.test(trimmed)) {
      componentesDetectados.push('mensajeria');
    }
    if (/cache|redis|memcached/i.test(trimmed)) {
      componentesDetectados.push('cache');
    }
    if (/auth|jwt|seguridad|oauth|filtro|proxy/i.test(trimmed)) {
      componentesDetectados.push('seguridad_gateway');
    }

    // 3. Reflejo concreto de RNF según lista
    if (Array.isArray(rnfList) && rnfList.length > 0) {
      for (const rnf of rnfList) {
        const desc = `${rnf.nombre || ''} ${rnf.descripcion || ''} ${rnf.metrica_medible || ''}`.toLowerCase();

        // Rendimiento / Latencia
        if (/rendimiento|latencia|tiempo de respuesta|velocidad|cache/i.test(desc)) {
          const tieneComponenteRendimiento = /redis|cache|in-memory|memcached|cdn|pooling/i.test(lowerCode);
          if (!tieneComponenteRendimiento) {
            advertencias.push(`El RNF de rendimiento (${rnf.identificador || rnf.nombre}) debería reflejarse con un componente concreto (ej. Redis Cache o acelerador).`);
          }
        }

        // Seguridad / Autenticación / Cifrado
        if (/seguridad|autenticaci|autorizaci|cifrado|jwt|roles|rbac/i.test(desc)) {
          const tieneComponenteSeguridad = /auth|gateway|jwt|filtro|token|oauth|firewall|ssl|tls/i.test(lowerCode);
          if (!tieneComponenteSeguridad) {
            advertencias.push(`El RNF de seguridad (${rnf.identificador || rnf.nombre}) debería reflejarse con un componente concreto (ej. API Gateway, Auth Filter o Token JWT).`);
          }
        }

        // Auditoría / Trazabilidad
        if (/auditor|trazabilidad|bit[aá]cora|logs/i.test(desc)) {
          const tieneComponenteAuditoria = /audit|bitacora|log|loki|elastic/i.test(lowerCode);
          if (!tieneComponenteAuditoria) {
            advertencias.push(`El RNF de auditoría (${rnf.identificador || rnf.nombre}) debería reflejarse con un componente de bitácora o almacén de eventos.`);
          }
        }
      }
    }

    // 4. Validación de Trazabilidad RNF -> elemento arquitectónico
    const trazabilidadProcesada = this.normalizarTrazabilidad(trazabilidad_rnf, lowerCode);

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
