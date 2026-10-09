const { DiagramTypes } = require('../../core/constants/DiagramTypes');

/**
 * Generador especializado para Arquitectura de Sistema e Infraestructura
 * Tipo: arquitectura_sistema (C4 Deployment / Infraestructura de Despliegue)
 */
class ArquitecturaSistemaGeneratorService {
  /**
   * Determina si la lista de requerimientos o texto solicita explícitamente Alta Disponibilidad
   * @param {Array} rnfs
   * @returns {boolean}
   */
  solicitaAltaDisponibilidad(rnfs = []) {
    const textToCheck = rnfs
      .map(r => `${r.nombre || ''} ${r.descripcion || ''} ${r.metrica_medible || ''}`)
      .join(' ');

    const patronHA = /alta disponibilidad|high availability|tolerancia a fallos|failover|conmutaci[oó]n|99\.9%|99\.99%|redundancia activa|activo-pasivo|cl[uú]ster redundante|balanceo de carga con r[eé]plica/i;
    return patronHA.test(textToCheck);
  }

  /**
   * Detecta si el sistema tiene usuarios o módulos móviles
   * @param {Array} requerimientos
   * @returns {boolean}
   */
  detectaComponenteMovil(requerimientos = []) {
    const texto = requerimientos
      .map(r => `${r.nombre || ''} ${r.descripcion || ''} ${r.actores || ''}`)
      .join(' ');
    // Si menciona explícitamente móvil, app, smartphone, campo, etc., o por defecto en sistemas con clientes
    return /m[oó]vil|app\b|celular|smartphone|android|ios|flutter|react native|campo|repartidor|conductor|chofer|cliente/i.test(texto);
  }

  /**
   * Genera el diagrama de arquitectura de sistema a partir de requerimientos y metadatos
   * @param {Object} params
   * @param {string} params.nombreProyecto
   * @param {Array} params.requerimientos - Lista de RF y RNF
   * @returns {Object} Diagrama estructurado con código PlantUML y trazabilidad
   */
  generar({ nombreProyecto = 'Sistema de Información', requerimientos = [] } = {}) {
    const safeName = (nombreProyecto || 'Sistema').replace(/["'“”]/g, '').trim();
    const rnfs = requerimientos.filter(r => (r.tipo || '').toUpperCase() === 'RNF');

    const tieneHA = this.solicitaAltaDisponibilidad(rnfs);
    const incluyeMovil = this.detectaComponenteMovil(requerimientos);

    const rnfMonitoreo = rnfs.find(r => /monitoreo|observabilidad|m[eé]tricas|salud|alerta/i.test(`${r.nombre} ${r.descripcion}`));
    const rnfSeguridadRed = rnfs.find(r => /red|firewall|per[ií]metro|ssl|tls|vpc|puerto/i.test(`${r.nombre} ${r.descripcion}`));
    const rnfHA = rnfs.find(r => /alta disponibilidad|disponibilidad|tolerancia a fallos|failover|conmutaci/i.test(`${r.nombre} ${r.descripcion} ${r.metrica_medible}`));

    const trazabilidad = [];

    // Trazabilidad de Alta Disponibilidad o dimensionamiento ajustado
    if (tieneHA && rnfHA) {
      trazabilidad.push({
        rnf_id: rnfHA.identificador || 'RNF-Disponibilidad',
        elemento: 'Cluster con Nodos Réplica y Failover Activo-Pasivo',
        justificacion: `Garantiza alta disponibilidad (${rnfHA.metrica_medible || rnfHA.nombre}) mediante balanceador y conmutación automática.`
      });
    } else {
      trazabilidad.push({
        rnf_id: 'RNF-Infraestructura',
        elemento: 'Servidor Standalone Mononodo',
        justificacion: 'Alineado al principio de no sobre-dimensionar alta disponibilidad ya que los requisitos no la solicitan.'
      });
    }

    // Trazabilidad de Monitoreo
    if (rnfMonitoreo) {
      trazabilidad.push({
        rnf_id: rnfMonitoreo.identificador || 'RNF-Monitoreo',
        elemento: 'Agente Prometheus & Grafana',
        justificacion: `Observabilidad y métricas de salud del sistema (${rnfMonitoreo.nombre}).`
      });
    } else {
      trazabilidad.push({
        rnf_id: 'RNF-Observabilidad',
        elemento: 'Agente de Monitoreo del Servidor',
        justificacion: 'Supervisión continua de consumo de recursos y estado del host.'
      });
    }

    if (rnfSeguridadRed) {
      trazabilidad.push({
        rnf_id: rnfSeguridadRed.identificador || 'RNF-Seguridad-Red',
        elemento: 'Firewall & Zona DMZ Perimetral',
        justificacion: `Filtrado de puertos y protección perimetral (${rnfSeguridadRed.nombre}).`
      });
    }

    // Construcción del código PlantUML
    let puml = `@startuml\n`;
    puml += `!include <C4/C4_Deployment>\n`;
    puml += `title Arquitectura de Sistema e Infraestructura - ${safeName}\n\n`;

    // 1. DISPOSITIVOS CLIENTES (Nodos de despliegue donde se ejecutan las interfaces)
    puml += `' === DISPOSITIVOS CLIENTES ===\n`;
    if (incluyeMovil) {
      puml += `Deployment_Node(clientMobile, "Dispositivo Móvil del Usuario", "Android / iOS Smartphone") {\n`;
      puml += `  Container(appMobile, "Aplicación Móvil", "Flutter / React Native", "Cliente móvil instalado para operaciones y consultas rápidas")\n`;
      puml += `}\n\n`;
    }

    puml += `Deployment_Node(clientPc, "Estación de Trabajo / Cliente Web", "Windows / macOS / Linux") {\n`;
    puml += `  Deployment_Node(browser, "Navegador Web", "Google Chrome / Firefox / Edge") {\n`;
    puml += `    Container(appWeb, "Aplicación Web / SPA", "React / TypeScript", "Interfaz web para administración y gestión")\n`;
    puml += `  }\n`;
    puml += `}\n\n`;

    if (tieneHA) {
      // TOPOLOGÍA CON ALTA DISPONIBILIDAD (Solicitada explícitamente)
      puml += `' === INFRAESTRUCTURA DE SERVIDOR (ALTA DISPONIBILIDAD) ===\n`;
      puml += `Deployment_Node(cloud, "Nube Privada / Virtual Private Cloud", "Red VPC Segura Multi-AZ") {\n`;
      puml += `  Deployment_Node(dmz, "Zona DMZ / Red Pública", "Subred Externa con SSL") {\n`;
      puml += `    Deployment_Node(lbNode, "Nodo Balanceador de Carga", "Linux / Nginx HAProxy") {\n`;
      puml += `      Container(lb, "Balanceador con Failover", "Nginx", "Distribución de tráfico y conmutación activa")\n`;
      puml += `    }\n`;
      puml += `  }\n\n`;

      puml += `  Deployment_Node(appZone, "Zona de Aplicación", "Subred Privada") {\n`;
      puml += `    Deployment_Node(node1, "Servidor de Aplicación Primario", "Instancia Compute AZ-1") {\n`;
      puml += `      Container(appInst1, "Servicio Backend (Instancia 1)", "Docker Container", "Ejecución de procesos activos")\n`;
      puml += `    }\n`;
      puml += `    Deployment_Node(node2, "Servidor de Aplicación Réplica", "Instancia Compute AZ-2 (Hot Standby)") {\n`;
      puml += `      Container(appInst2, "Servicio Backend (Instancia 2)", "Docker Container", "Réplica activa para failover")\n`;
      puml += `    }\n`;
      puml += `  }\n\n`;

      puml += `  Deployment_Node(dataZone, "Zona de Datos Transaccionales", "Subred de Persistencia") {\n`;
      puml += `    Deployment_Node(dbMasterNode, "Servidor Base de Datos Primario", "Master DB Instance") {\n`;
      puml += `      ContainerDb(dbMaster, "PostgreSQL Master", "RDBMS", "Escrituras y transacciones primarias")\n`;
      puml += `    }\n`;
      puml += `    Deployment_Node(dbReplicaNode, "Servidor Base de Datos Standby", "Replica DB Instance") {\n`;
      puml += `      ContainerDb(dbReplica, "PostgreSQL Replica", "RDBMS Standby", "Replicación en caliente y failover")\n`;
      puml += `    }\n`;
      puml += `  }\n\n`;

      puml += `  Deployment_Node(monZone, "Zona de Monitoreo", "Observabilidad") {\n`;
      puml += `    Deployment_Node(monNode, "Servidor de Monitoreo", "Prometheus & Grafana") {\n`;
      puml += `      Container(monAgent, "Agente de Salud y Métricas", "Prometheus", "Monitoreo continuo de latencia y failover")\n`;
      puml += `    }\n`;
      puml += `  }\n`;
      puml += `}\n\n`;

      // Relaciones desde clientes hacia balanceador
      if (incluyeMovil) {
        puml += `Rel(appMobile, lb, "Solicitudes API Móvil", "HTTPS :443 / TLS 1.3")\n`;
      }
      puml += `Rel(appWeb, lb, "Tráfico Web y API", "HTTPS :443 / TLS 1.3")\n\n`;

      // Relaciones internas de infraestructura
      puml += `Rel(lb, appInst1, "Enruta solicitudes primarias", "HTTPS :443")\n`;
      puml += `Rel(lb, appInst2, "Conmutación por error (Failover)", "HTTPS :443")\n`;
      puml += `Rel(appInst1, dbMaster, "Operaciones ACID", "TCP :5432")\n`;
      puml += `Rel(appInst2, dbMaster, "Operaciones ACID", "TCP :5432")\n`;
      puml += `Rel(dbMaster, dbReplica, "Replicación sincrónica / WAL", "TCP :5432")\n`;
      puml += `Rel(monAgent, node1, "Telemetría de salud", "HTTP :9090")\n`;
      puml += `Rel(monAgent, node2, "Telemetría de salud", "HTTP :9090")\n`;
      puml += `Rel(monAgent, dbMasterNode, "Telemetría de salud", "HTTP :9090")\n`;
    } else {
      // TOPOLOGÍA STANDALONE (Sin Alta Disponibilidad solicitada - REGLA ESTRICTA)
      puml += `' === INFRAESTRUCTURA DE SERVIDOR (STANDALONE MONONODO) ===\n`;
      puml += `Deployment_Node(server, "Servidor Standalone VPS", "Ubuntu Linux / Docker Host") {\n`;
      puml += `  Deployment_Node(netZone, "Zona de Red del Servidor", "Firewall UFW") {\n`;
      puml += `    Deployment_Node(appContainerNode, "Contenedor de Aplicación", "Docker Runtime") {\n`;
      puml += `      Container(appBackend, "Servicio de Aplicación", "Node.js / Express", "Instancia única de ejecución de la aplicación")\n`;
      puml += `    }\n`;
      puml += `    Deployment_Node(dbContainerNode, "Contenedor de Base de Datos", "Docker Volume") {\n`;
      puml += `      ContainerDb(dbStandalone, "Base de Datos Primaria", "PostgreSQL", "Instancia única sin réplica redundante")\n`;
      puml += `    }\n`;
      puml += `    Deployment_Node(monContainerNode, "Contenedor de Observabilidad", "Docker Host") {\n`;
      puml += `      Container(monAgent, "Agente de Monitoreo y Salud", "Prometheus Exporter", "Supervisión de salud del host")\n`;
      puml += `    }\n`;
      puml += `  }\n`;
      puml += `}\n\n`;

      // Relaciones desde clientes hacia servidor
      if (incluyeMovil) {
        puml += `Rel(appMobile, appBackend, "Solicitudes API Móvil", "HTTPS :443 / TLS 1.3")\n`;
      }
      puml += `Rel(appWeb, appBackend, "Tráfico Web y API", "HTTPS :443 / TLS 1.3")\n\n`;

      // Relaciones internas de infraestructura
      puml += `Rel(appBackend, dbStandalone, "Persistencia de datos", "TCP :5432")\n`;
      puml += `Rel(monAgent, appBackend, "Chequeo de salud del servicio", "HTTP :3000/health")\n`;
      puml += `Rel(monAgent, dbStandalone, "Supervisión de estado DB", "TCP :5432")\n`;
    }

    puml += `@enduml`;

    const descHA = tieneHA
      ? 'Topología distribuida con balanceador de carga, nodos de aplicación redundantes y clúster de base de datos con réplica en caliente y conmutación automática (failover) conforme a los RNF de alta disponibilidad.'
      : 'Topología standalone mononodo con servidor único de aplicación y base de datos local, optimizando recursos sin sobre-dimensionar alta disponibilidad ya que los requisitos no la solicitan.';

    return {
      tipo: DiagramTypes.ARQUITECTURA_SISTEMA,
      titulo: `Diagrama de Arquitectura de Sistema e Infraestructura - ${safeName}`,
      descripcion: `Topología de despliegue e infraestructura física/cloud para ${safeName}, integrando dispositivos clientes (móvil y web) con el entorno de servidor. ${descHA}`,
      descripcion_jerarquica: [
        'Dispositivos Clientes: Nodos de ejecución en smartphones y navegadores web para acceso del usuario.',
        'Zonas de Red y Seguridad: Segmentación de red, cifrado TLS 1.3 y cortafuegos de acceso perimetral.',
        tieneHA
          ? 'Cómputo con Alta Disponibilidad: Nodos primario y réplica con conmutación en caliente.'
          : 'Cómputo Standalone: Servidor único de aplicación dimensionado a la demanda requerida.',
        tieneHA
          ? 'Persistencia Replicada: Base de datos master con nodo de réplica standby para failover.'
          : 'Persistencia Directa: Instancia única de base de datos transaccional.',
        'Observabilidad: Agente de monitoreo y telemetría para supervisión continua de recursos.'
      ],
      trazabilidad_rnf: trazabilidad,
      codigo_plantuml: puml
    };
  }
}

module.exports = ArquitecturaSistemaGeneratorService;
