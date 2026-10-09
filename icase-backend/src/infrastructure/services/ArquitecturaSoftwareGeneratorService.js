const { DiagramTypes } = require('../../core/constants/DiagramTypes');

/**
 * Generador especializado para Arquitectura de Software
 * Tipo: arquitectura_software (C4 Container)
 */
class ArquitecturaSoftwareGeneratorService {
  /**
   * Genera el diagrama de arquitectura de software a partir de requerimientos y metadatos
   * @param {Object} params
   * @param {string} params.nombreProyecto
   * @param {Array} params.requerimientos - Lista de RF y RNF
   * @param {Object} [params.opciones]
   * @returns {Object} Diagrama estructurado con código PlantUML y trazabilidad
   */
  generar({ nombreProyecto = 'Sistema de Información', requerimientos = [], opciones = {} } = {}) {
    const safeName = (nombreProyecto || 'Sistema').replace(/["'“”]/g, '').trim();
    const rfs = requerimientos.filter(r => (r.tipo || '').toUpperCase() === 'RF');
    const rnfs = requerimientos.filter(r => (r.tipo || '').toUpperCase() === 'RNF');

    // Detección de necesidades a partir de RNF
    const rnfRendimiento = rnfs.find(r => /latencia|tiempo de respuesta|rendimiento|velocidad|cache/i.test(`${r.nombre} ${r.descripcion} ${r.metrica_medible}`));
    const rnfSeguridad = rnfs.find(r => /seguridad|autenticaci|autorizaci|jwt|cifrado|roles|acceso/i.test(`${r.nombre} ${r.descripcion}`));
    const rnfAuditoria = rnfs.find(r => /auditor|trazabilidad|bit[aá]cora|registro hist/i.test(`${r.nombre} ${r.descripcion}`));
    const rnfMensajeria = rnfs.find(r => /as[ií]ncron|cola|mensajer[ií]a|eventos|desacopl/i.test(`${r.nombre} ${r.descripcion}`));

    // Mapeo explícito de Trazabilidad RNF -> Elemento Arquitectónico
    const trazabilidad = [];

    let incluyeCache = false;
    if (rnfRendimiento) {
      incluyeCache = true;
      trazabilidad.push({
        rnf_id: rnfRendimiento.identificador || 'RNF-Rendimiento',
        elemento: 'Redis Cache (Caché en Memoria)',
        justificacion: `Resuelve requerimiento de tiempo de respuesta y baja latencia (${rnfRendimiento.metrica_medible || rnfRendimiento.nombre}).`
      });
    }

    let incluyeGatewayAuth = false;
    if (rnfSeguridad) {
      incluyeGatewayAuth = true;
      trazabilidad.push({
        rnf_id: rnfSeguridad.identificador || 'RNF-Seguridad',
        elemento: 'API Gateway & Auth Service',
        justificacion: `Centraliza autenticación JWT, RBAC y control perimetral (${rnfSeguridad.nombre}).`
      });
    } else {
      // Gateway estándar
      incluyeGatewayAuth = true;
    }

    let incluyeAuditoria = false;
    if (rnfAuditoria) {
      incluyeAuditoria = true;
      trazabilidad.push({
        rnf_id: rnfAuditoria.identificador || 'RNF-Auditoria',
        elemento: 'Almacén de Bitácoras & Auditoría',
        justificacion: `Almacena eventos inmutables para cumplir trazabilidad (${rnfAuditoria.nombre}).`
      });
    }

    let incluyeMensajeria = false;
    if (rnfMensajeria) {
      incluyeMensajeria = true;
      trazabilidad.push({
        rnf_id: rnfMensajeria.identificador || 'RNF-Mensajeria',
        elemento: 'Broker de Mensajería RabbitMQ',
        justificacion: `Garantiza desacoplamiento y procesamiento asíncrono (${rnfMensajeria.nombre}).`
      });
    }

    // Construcción del código C4 Container PlantUML
    let puml = `@startuml\n`;
    puml += `!include <C4/C4_Container>\n`;
    puml += `SHOW_PERSON_OUTLINE()\n`;
    puml += `title Arquitectura de Software - ${safeName}\n\n`;

    puml += `Person(usuario, "Usuario del Sistema", "Operador / Cliente del sistema")\n`;
    puml += `Person(admin, "Administrador", "Gestor administrativo y supervisor")\n\n`;

    puml += `System_Boundary(sys, "${safeName}") {\n`;
    puml += `  Container(webApp, "Portal Web y Aplicación SPA", "React / TypeScript", "Interfaz interactiva de usuario")\n`;

    if (incluyeGatewayAuth) {
      puml += `  Container(apiGateway, "API Gateway & Seguridad", "Nginx / Express Gateway", "Terminación TLS, Auth JWT y control de acceso")\n`;
    }

    puml += `  Container(coreService, "Servicio Central de Dominio", "Node.js / Express", "Procesa reglas de negocio y transacciones")\n`;

    if (incluyeMensajeria) {
      puml += `  Container(msgBroker, "Broker de Eventos", "RabbitMQ", "Canal de eventos asíncronos")\n`;
    }

    puml += `  ContainerDb(dbPrincipal, "Base de Datos Transaccional", "PostgreSQL", "Almacenamiento relacional ACID de entidades")\n`;

    if (incluyeCache) {
      puml += `  ContainerDb(cacheMem, "Memoria Caché", "Redis", "Caché de consultas de alto tráfico y baja latencia")\n`;
    }

    if (incluyeAuditoria) {
      puml += `  Container(auditLog, "Servicio de Auditoría", "Audit Logger / Elasticsearch", "Registro inmutable de transacciones")\n`;
    }

    puml += `}\n\n`;

    // Relaciones entre componentes
    puml += `Rel(usuario, webApp, "Interactúa con las pantallas", "HTTPS")\n`;
    puml += `Rel(admin, webApp, "Gestiona y supervisa", "HTTPS")\n`;

    if (incluyeGatewayAuth) {
      puml += `Rel(webApp, apiGateway, "Peticiones API", "JSON/HTTPS")\n`;
      puml += `Rel(apiGateway, coreService, "Enruta tráfico autorizado", "gRPC / HTTP")\n`;
    } else {
      puml += `Rel(webApp, coreService, "Peticiones API", "JSON/HTTPS")\n`;
    }

    puml += `Rel(coreService, dbPrincipal, "Persiste operaciones transaccionales", "TCP/SQL")\n`;

    if (incluyeCache) {
      puml += `Rel(coreService, cacheMem, "Lee/Escribe datos en caché rápida", "TCP")\n`;
    }

    if (incluyeMensajeria) {
      puml += `Rel(coreService, msgBroker, "Publica eventos de dominio", "AMQP")\n`;
    }

    if (incluyeAuditoria) {
      puml += `Rel(coreService, auditLog, "Envía bitácoras de eventos", "REST")\n`;
    }

    puml += `@enduml`;

    return {
      tipo: DiagramTypes.ARQUITECTURA_SOFTWARE,
      titulo: `Diagrama de Arquitectura de Software - ${safeName}`,
      descripcion: `Modelo de contenedores lógicos C4 para ${safeName}, detallando aplicaciones clientes, gateway de servicios, lógica de negocio y capas de almacenamiento.`,
      descripcion_jerarquica: [
        'Capa de Presentación: Aplicación web interactiva adaptada para la experiencia del usuario.',
        'Capa de Borde y API: Gateway perimetral con validación de seguridad y distribución de llamadas.',
        'Capa de Servicios de Dominio: Componentes de lógica operativa que implementan las reglas funcionales.',
        'Capa de Persistencia y Caché: Almacén de base de datos relacional complementado con componentes según los RNF.'
      ],
      trazabilidad_rnf: trazabilidad,
      codigo_plantuml: puml
    };
  }
}

module.exports = ArquitecturaSoftwareGeneratorService;
