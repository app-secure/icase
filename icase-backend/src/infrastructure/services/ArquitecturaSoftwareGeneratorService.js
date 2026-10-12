const { DiagramTypes } = require('../../core/constants/DiagramTypes');

function requirementsText(requirements = []) {
  return requirements.map((item) => [
    item.nombre,
    item.descripcion,
    item.metrica_medible,
    Array.isArray(item.actores) ? item.actores.join(' ') : item.actores
  ].filter(Boolean).join(' ')).join('\n');
}

function firstTechnology(text, candidates) {
  return candidates.find(([pattern]) => pattern.test(text))?.[1] || 'Tecnología por definir';
}

function safe(value) {
  return String(value || '').replace(/["'“”\r\n]+/g, ' ').trim();
}

function capabilities(requirements = []) {
  const groups = [
    [/men[uú]|cat[aá]logo|plato|precio/i, 'Catálogo y Menú'],
    [/reserva|mesa|silla|c[oó]digo qr|\bqr\b/i, 'Reservas y QR'],
    [/pedido|comanda|cocina|kds|stock|agotad/i, 'Comandas y Cocina KDS'],
    [/cobro|pago|caja|prepago|paquete|saldo/i, 'Caja y Prepagos'],
    [/reporte|venta|administr|usuario|rol|permiso/i, 'Administración y Reportes']
  ];
  const found = groups.filter(([pattern]) => requirements.some((item) => pattern.test(requirementsText([item]))))
    .map(([, label]) => label);
  return found.length ? found : ['Casos de uso aprobados'];
}

class ArquitecturaSoftwareGeneratorService {
  generar({ nombreProyecto = 'Sistema', requerimientos = [] } = {}) {
    const projectName = safe(nombreProyecto) || 'Sistema';
    const text = requirementsText(requerimientos);
    const rfs = requerimientos.filter((item) => String(item.tipo || '').toUpperCase() === 'RF');
    const rnfs = requerimientos.filter((item) => String(item.tipo || '').toUpperCase() === 'RNF');

    const hasMobile = /m[oó]vil|smartphone|android|ios|react native|flutter/i.test(text);
    const hasWeb = /\bweb\b|navegador|spa|react|vue|angular|tailwind/i.test(text);
    const needsData = /base de datos|persist|almacen|guardar|registr|historial|conservar|transacci/i.test(text);
    const needsAudit = rnfs.some((item) => /auditor|trazabilidad|bit[aá]cora|registro hist/i.test(requirementsText([item])));
    const needsMessaging = /broker|mensajer[ií]a|cola de mensajes|rabbitmq|kafka|event bus/i.test(text);
    const needsRealtime = /socket\.io|websocket|tiempo real|actualizaci[oó]n inmediata|sincroniz/i.test(text);
    const needsCache = rnfs.some((item) => /redis|cach[eé]|acelerador/i.test(requirementsText([item])));
    const functionalCapabilities = capabilities(rfs);

    const mobileTech = firstTechnology(text, [
      [/react native/i, 'React Native'], [/flutter/i, 'Flutter']
    ]);
    const webTech = firstTechnology(text, [
      [/\breact\b/i, /tailwind/i.test(text) ? 'React + Tailwind' : 'React'],
      [/\bvue\b/i, 'Vue'], [/angular/i, 'Angular']
    ]);
    const backendTech = firstTechnology(text, [
      [/nestjs/i, 'NestJS'], [/express/i, 'Express'], [/spring boot/i, 'Spring Boot'],
      [/django/i, 'Django'], [/laravel/i, 'Laravel'], [/\.net/i, '.NET']
    ]);
    const dataTech = firstTechnology(text, [
      [/postgres(?:ql)?/i, 'PostgreSQL'], [/mongodb/i, 'MongoDB'], [/mysql/i, 'MySQL'], [/sql server/i, 'SQL Server']
    ]);
    const messagingTech = firstTechnology(text, [
      [/rabbitmq/i, 'RabbitMQ'], [/kafka/i, 'Kafka']
    ]);
    const protocol = firstTechnology(text, [
      [/socket\.io/i, 'Socket.IO'], [/websocket/i, 'WebSocket'], [/grpc/i, 'gRPC'], [/\brest\b/i, 'REST']
    ]).replace('Tecnología', 'Protocolo');

    const actors = [...new Set(rfs.flatMap((item) => Array.isArray(item.actores) ? item.actores : [item.actores])
      .flatMap((item) => String(item || '').split(/[,;|]/))
      .map((item) => safe(item))
      .filter(Boolean))].slice(0, 4);

    const trace = rnfs.map((rnf) => {
      const rnfText = requirementsText([rnf]);
      const isAudit = /auditor|trazabilidad|bit[aá]cora/i.test(rnfText) && needsAudit;
      const isCache = /redis|cach[eé]|rendimiento|latencia/i.test(rnfText) && needsCache;
      const element = isAudit ? 'Registro de Auditoría' : isCache ? 'Caché' : 'Servicio de Aplicación';
      return {
        rnf_id: rnf.identificador || rnf.id || 'RNF',
        elemento_id: isAudit ? 'auditStore' : isCache ? 'cacheStore' : 'appService',
        elemento: element,
        justificacion: `Responsabilidad asociada a la métrica aprobada: ${safe(rnf.metrica_medible || 'Por confirmar con el usuario')}`
      };
    });

    const lines = [
      '@startuml',
      '!include <C4/C4_Container>',
      'SHOW_PERSON_OUTLINE()',
      'LAYOUT_LEFT_RIGHT()',
      `title Arquitectura de Software - ${projectName}`,
      ''
    ];
    actors.forEach((actor, index) => lines.push(`Person(actor${index + 1}, "${actor}", "Actor definido en requisitos")`));
    if (actors.length) lines.push('');
    lines.push(`System_Boundary(sys, "${projectName}") {`);
    if (hasMobile) lines.push(`  Container(mobileApp, "Aplicación Móvil", "${mobileTech}", "Canal móvil solicitado")`);
    if (hasWeb) lines.push(`  Container(webApp, "Aplicación Web", "${webTech}", "Canal web solicitado")`);
    if (!hasMobile && !hasWeb) lines.push('  Container(userInterface, "Interfaz de Usuario", "Tecnología por definir", "Canal de interacción por definir")');
    lines.push(`  Container(appService, "Servicio de Aplicación", "${backendTech}", "Módulos: ${functionalCapabilities.join(', ')}")`);
    if (needsRealtime) lines.push('  Container(realtimeService, "Sincronización en Tiempo Real", "Socket.IO / WebSocket", "Propaga comandas, stock y estados a los canales aprobados")');
    if (needsData) lines.push(`  ContainerDb(dataStore, "Almacén de Datos", "${dataTech}", "Persistencia requerida por los RF")`);
    if (needsCache) lines.push('  ContainerDb(cacheStore, "Caché", "Redis o tecnología aprobada", "Acelera las lecturas sujetas a la métrica de rendimiento")');
    if (needsMessaging) lines.push(`  Container(eventChannel, "Canal de Mensajería", "${messagingTech}", "Comunicación asíncrona solicitada")`);
    if (needsAudit) lines.push('  Container(auditStore, "Registro de Auditoría", "Tecnología por definir", "Conserva la trazabilidad solicitada")');
    lines.push('}', '');

    const interfaceAliases = hasMobile || hasWeb
      ? [['mobileApp', hasMobile], ['webApp', hasWeb]].filter(([, enabled]) => enabled).map(([alias]) => alias)
      : ['userInterface'];
    actors.forEach((actor, index) => lines.push(`Rel(actor${index + 1}, ${interfaceAliases[index % interfaceAliases.length]}, "Usa", "Canal aprobado")`));
    interfaceAliases.forEach((alias) => {
      lines.push(`Rel(${alias}, appService, "Solicita capacidades", "${protocol}")`);
      if (needsRealtime) lines.push(`Rel(${alias}, realtimeService, "Recibe estados sincronizados", "Socket.IO / WebSocket")`);
    });
    if (needsRealtime) lines.push('Rel(realtimeService, appService, "Publica y consulta cambios", "Canal interno")');
    if (needsData) lines.push('Rel(appService, dataStore, "Lee y persiste", "Protocolo por definir")');
    if (needsCache) lines.push('Rel(appService, cacheStore, "Lee y actualiza", "Protocolo aprobado")');
    if (needsMessaging) lines.push(`Rel(appService, eventChannel, "Publica y consume", "${messagingTech === 'Tecnología por definir' ? 'Protocolo por definir' : messagingTech}")`);
    if (needsAudit) lines.push('Rel(appService, auditStore, "Registra eventos", "Protocolo por definir")');
    trace.forEach((item, index) => lines.push(`note right of ${item.elemento_id} as RNF_NOTE_${index + 1}\n  ${safe(item.rnf_id)}: ${safe(rnfs[index]?.metrica_medible || 'Por confirmar con el usuario')}\nend note`));
    lines.push('@enduml');

    return {
      tipo: DiagramTypes.ARQUITECTURA_SOFTWARE,
      titulo: `Diagrama de Arquitectura de Software - ${projectName}`,
      descripcion: `Vista lógica de los canales y responsabilidades de software derivados de los requisitos aprobados de ${projectName}.`,
      descripcion_jerarquica: [
        'Canales: Interfaces exigidas por los requisitos aprobados.',
        'Aplicación: Responsabilidad central que realiza los casos de uso.',
        `Cobertura funcional: ${functionalCapabilities.join(', ')}.`,
        `Persistencia: ${needsData ? 'Almacén requerido por las operaciones aprobadas.' : 'No se añadió un almacén sin evidencia.'}`,
        'Decisiones técnicas: Las tecnologías ausentes permanecen por definir.'
      ],
      requisitos_relacionados: requerimientos.map((item) => item.identificador || item.id).filter(Boolean),
      trazabilidad_rnf: trace,
      codigo_plantuml: lines.join('\n')
    };
  }
}

module.exports = ArquitecturaSoftwareGeneratorService;
