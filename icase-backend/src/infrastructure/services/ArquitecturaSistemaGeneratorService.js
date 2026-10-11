const { DiagramTypes } = require('../../core/constants/DiagramTypes');

function textOf(requirements = []) {
  return requirements.map((item) => [item.nombre, item.descripcion, item.metrica_medible, item.actores]
    .flat().filter(Boolean).join(' ')).join('\n');
}

function safe(value) {
  return String(value || '').replace(/["'“”\r\n]+/g, ' ').trim();
}

function selected(text, candidates, fallback = 'Por definir') {
  return candidates.find(([pattern]) => pattern.test(text))?.[1] || fallback;
}

class ArquitecturaSistemaGeneratorService {
  solicitaAltaDisponibilidad(rnfs = []) {
    return /alta disponibilidad|high availability|tolerancia a fallos|failover|conmutaci[oó]n|99\.9%|99\.99%|redundancia activa|activo-pasivo|cl[uú]ster redundante/i.test(textOf(rnfs));
  }

  detectaComponenteMovil(requerimientos = []) {
    return /m[oó]vil|smartphone|android|ios|react native|flutter/i.test(textOf(requerimientos));
  }

  generar({ nombreProyecto = 'Sistema', requerimientos = [] } = {}) {
    const projectName = safe(nombreProyecto) || 'Sistema';
    const text = textOf(requerimientos);
    const rnfs = requerimientos.filter((item) => String(item.tipo || '').toUpperCase() === 'RNF');
    const hasHA = this.solicitaAltaDisponibilidad(rnfs);
    const hasMobile = this.detectaComponenteMovil(requerimientos);
    const hasWeb = /\bweb\b|navegador|spa|react|vue|angular|tailwind/i.test(text);
    const needsData = /base de datos|persist|almacen|guardar|registr|historial|conservar|transacci/i.test(text);
    const monitoringRnf = rnfs.find((item) => /monitor|observabilidad|telemetr|m[eé]tricas de salud|health check/i.test(textOf([item])));
    const haRnf = rnfs.find((item) => this.solicitaAltaDisponibilidad([item]));

    const mobileTech = selected(text, [[/react native/i, 'React Native'], [/flutter/i, 'Flutter']]);
    const webTech = selected(text, [[/\breact\b/i, 'React'], [/\bvue\b/i, 'Vue'], [/angular/i, 'Angular']]);
    const backendTech = selected(text, [[/nestjs/i, 'NestJS'], [/express/i, 'Express'], [/spring boot/i, 'Spring Boot'], [/django/i, 'Django'], [/laravel/i, 'Laravel']]);
    const dataTech = selected(text, [[/postgres(?:ql)?/i, 'PostgreSQL'], [/mongodb/i, 'MongoDB'], [/mysql/i, 'MySQL'], [/sql server/i, 'SQL Server']]);
    const monitoringTech = selected(text, [[/prometheus/i, 'Prometheus'], [/grafana/i, 'Grafana'], [/cloudwatch/i, 'CloudWatch']]);
    const externalProtocol = selected(text, [[/socket\.io/i, 'Socket.IO'], [/websocket/i, 'WebSocket'], [/https/i, 'HTTPS'], [/\brest\b/i, 'REST']], 'Canal por definir');

    const trace = [];
    if (hasHA && haRnf) {
      trace.push({
        rnf_id: haRnf.identificador || haRnf.id || 'RNF',
        elemento: 'Mecanismo de Distribución y Failover',
        justificacion: `Realiza la disponibilidad aprobada: ${safe(haRnf.metrica_medible || haRnf.descripcion)}`
      });
    }
    if (monitoringRnf) {
      trace.push({
        rnf_id: monitoringRnf.identificador || monitoringRnf.id || 'RNF',
        elemento: 'Observabilidad',
        justificacion: `Realiza el monitoreo aprobado: ${safe(monitoringRnf.metrica_medible || monitoringRnf.descripcion)}`
      });
    }

    const lines = [
      '@startuml',
      '!include <C4/C4_Deployment>',
      `title Arquitectura de Sistema e Infraestructura - ${projectName}`,
      ''
    ];
    if (hasMobile) {
      lines.push(`Deployment_Node(mobileDevice, "Dispositivo Móvil", "Plataforma aprobada") {`,
        `  Container(mobileArtifact, "Aplicación Móvil", "${mobileTech}", "Artefacto cliente")`, '}');
    }
    if (hasWeb) {
      lines.push(`Deployment_Node(webDevice, "Dispositivo Web", "Plataforma por definir") {`,
        `  Container(webArtifact, "Aplicación Web", "${webTech}", "Artefacto cliente")`, '}');
    }
    if (!hasMobile && !hasWeb) {
      lines.push('Deployment_Node(userDevice, "Dispositivo de Usuario", "Plataforma por definir") {',
        '  Container(clientArtifact, "Interfaz de Usuario", "Tecnología por definir", "Artefacto cliente")', '}');
    }
    lines.push('');

    if (hasHA) {
      lines.push('Deployment_Node(trafficNode, "Mecanismo de Distribución y Failover", "Tecnología por definir") {',
        '  Container(trafficManager, "Distribución de Tráfico", "Tecnología por definir", "Conmutación solicitada")', '}',
        `Deployment_Node(appNode1, "Nodo de Aplicación 1", "Entorno por definir") {`,
        `  Container(appInstance1, "Servicio de Aplicación 1", "${backendTech}", "Instancia de ejecución")`, '}',
        `Deployment_Node(appNode2, "Nodo de Aplicación 2", "Entorno por definir") {`,
        `  Container(appInstance2, "Servicio de Aplicación 2", "${backendTech}", "Instancia redundante")`, '}');
      if (needsData) {
        lines.push('Deployment_Node(dataPrimaryNode, "Nodo de Datos Primario", "Entorno por definir") {',
          `  ContainerDb(dataPrimary, "Datos Primarios", "${dataTech}", "Persistencia principal")`, '}',
          'Deployment_Node(dataReplicaNode, "Nodo de Datos Réplica", "Entorno por definir") {',
          `  ContainerDb(dataReplica, "Réplica de Datos", "${dataTech}", "Réplica exigida por disponibilidad")`, '}');
      }
    } else {
      lines.push('Deployment_Node(appNode, "Nodo de Aplicación", "Entorno por definir") {',
        `  Container(appInstance, "Servicio de Aplicación", "${backendTech}", "Instancia de ejecución")`, '}');
      if (needsData) {
        lines.push('Deployment_Node(dataNode, "Nodo de Datos", "Entorno por definir") {',
          `  ContainerDb(dataInstance, "Almacén de Datos", "${dataTech}", "Persistencia requerida")`, '}');
      }
    }

    if (monitoringRnf) {
      lines.push('Deployment_Node(monitoringNode, "Observabilidad", "Entorno por definir") {',
        `  Container(monitoringAgent, "Monitoreo", "${monitoringTech}", "Telemetría solicitada")`, '}');
    }
    lines.push('');

    const clients = hasMobile || hasWeb
      ? [['mobileArtifact', hasMobile], ['webArtifact', hasWeb]].filter(([, enabled]) => enabled).map(([alias]) => alias)
      : ['clientArtifact'];
    const entry = hasHA ? 'trafficManager' : 'appInstance';
    clients.forEach((client) => lines.push(`Rel(${client}, ${entry}, "Accede", "${externalProtocol}")`));
    if (hasHA) {
      lines.push('Rel(trafficManager, appInstance1, "Distribuye", "Canal por definir")',
        'Rel(trafficManager, appInstance2, "Conmuta", "Canal por definir")');
      if (needsData) {
        lines.push('Rel(appInstance1, dataPrimary, "Lee y escribe", "Protocolo por definir")',
          'Rel(appInstance2, dataPrimary, "Lee y escribe", "Protocolo por definir")',
          'Rel(dataPrimary, dataReplica, "Replica", "Mecanismo por definir")');
      }
    } else if (needsData) {
      lines.push('Rel(appInstance, dataInstance, "Lee y escribe", "Protocolo por definir")');
    }
    if (monitoringRnf) lines.push(`Rel(monitoringAgent, ${hasHA ? 'appNode1' : 'appNode'}, "Observa", "Canal por definir")`);
    lines.push('@enduml');

    return {
      tipo: DiagramTypes.ARQUITECTURA_SISTEMA,
      titulo: `Diagrama de Arquitectura de Sistema e Infraestructura - ${projectName}`,
      descripcion: `Vista de despliegue mínima de ${projectName}, derivada de plataformas, tecnologías y restricciones aprobadas.`,
      descripcion_jerarquica: [
        'Clientes: Solo se muestran plataformas sustentadas por los requisitos.',
        `Aplicación: ${hasHA ? 'Instancias redundantes exigidas por disponibilidad.' : 'Una instancia sin redundancia no solicitada.'}`,
        `Datos: ${needsData ? 'Persistencia representada con tecnología aprobada o pendiente.' : 'No se añadió persistencia sin evidencia.'}`,
        `Operación: ${monitoringRnf ? 'Observabilidad solicitada por un RNF.' : 'No se añadió monitoreo sin un RNF.'}`
      ],
      requisitos_relacionados: requerimientos.map((item) => item.identificador || item.id).filter(Boolean),
      trazabilidad_rnf: trace,
      codigo_plantuml: lines.join('\n')
    };
  }
}

module.exports = ArquitecturaSistemaGeneratorService;
