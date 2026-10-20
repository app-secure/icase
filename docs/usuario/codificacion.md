# Codificación

Esta fase está disponible como una **base de generación genérica en desarrollo**. Las operaciones CRUD almacenan y modifican datos; no implementan automáticamente todas las reglas de negocio descritas en lenguaje natural.

## Decisiones previas

Inicia sesión antes de entrar: este módulo exige autenticación. Revisa y aprueba, en este orden:

1. Alcance y plataformas: web, móvil y exclusiones.
2. Herramientas y tecnologías.
3. Arquitectura de implementación.
4. Estructura de carpetas.

Las sugerencias de planificación actuales se construyen mediante reglas deterministas a partir de artefactos aprobados. Revisar una propuesta sigue siendo necesario. No asumas que una tecnología escrita libremente tiene un generador compatible.

## Generar, verificar y aprobar

| Entregable | Entradas principales | Comprobación disponible |
| --- | --- | --- |
| Backend | Decisiones y RF aprobados | Estructura, compilación, arranque, persistencia y CRUD de humo |
| Frontend | Mockups, navegación y decisiones | Estructura y compilación; interacción integral en la suite |
| Pruebas | Backend y frontend aprobados | Trazabilidad, integración CRUD y navegador |
| Infraestructura | Código y arquitecturas aprobadas | Revisión estructural; configuración Compose en paquete |
| CI/CD | Pruebas e infraestructura aprobadas | Revisión estructural del workflow |
| Paquete final | Todos los anteriores aprobados y vigentes | Compilación, servicios saludables y suite aislada |

Para cada entregable genera, inspecciona los archivos, selecciona **Verificar** y revisa los pasos y errores. Aprueba únicamente cuando corresponda. Editar un archivo invalida la evidencia anterior; vuelve a verificar esa versión.

Docker Desktop debe estar iniciado en el equipo que ejecuta el backend. La primera construcción puede tardar al descargar imágenes. No cierres el servidor durante la verificación.

## Qué se genera actualmente

Cada RF tiene una clave estable, por ejemplo `rf-01`, y una ruta `/api/operations/rf-01`. La base ofrece consulta, creación, modificación y eliminación de documentos de datos. Las pantallas React se conectan mediante sus identificadores RF.

Esta base no sustituye modelos de dominio, formularios finales, controles de acceso del sistema generado ni reglas particulares como «un ejemplar solo puede tener un préstamo activo». Aunque pase las pruebas CRUD, tales reglas siguen pendientes de implementación y validación.

Los adaptadores actuales cubren Node.js con Express/NestJS, React/Vite y persistencia MongoDB/PostgreSQL/MySQL. El soporte debe comprobarse para la combinación elegida. El bundle Expo es opcional y no constituye un APK/IPA firmado.

## Exportar el ZIP

Genera el paquete cuando las etapas previas estén aprobadas. Verifica el paquete, apruébalo y descarga. Conserva su manifiesto, versión e informes.

Si la exportación se bloquea, consulta archivos pendientes, aprobaciones desactualizadas y evidencia que no coincide con la huella actual. Un resultado estructural por sí solo no basta para los artefactos que requieren ejecución.

## Limitaciones operativas

La verificación aislada se atiende dentro de la petición actual y puede durar varios minutos; todavía no es un sistema de trabajos persistentes para todos los controles de código. El ZIP se valida con ayudantes de ejecución controlados: una configuración Compose sintácticamente válida no certifica todos los aspectos de su despliegue productivo.

Consulta [la guía de despliegue](../despliegue/guia.md) para conocer los límites del entorno de prueba.
