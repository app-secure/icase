# Documentación de I-CASE

I-CASE es una herramienta CASE asistida por inteligencia artificial para transformar fuentes de un proyecto en requisitos, seis diagramas, mockups y un documento técnico. Incluye planificación de codificación, generadores de una base ejecutable y controles antes de aprobar sus entregables.

Esta documentación describe **la herramienta I-CASE**. Los documentos que exporta para un restaurante, una biblioteca u otro proyecto son productos distintos.

## Por dónde empezar

| Necesidad | Página |
| --- | --- |
| Usar la aplicación por primera vez | [Primeros pasos](usuario/primeros-pasos.md) |
| Revisar requisitos y diagramas | [Flujo de análisis y diseño](usuario/requisitos-y-diagramas.md) |
| Revisar pantallas y descargar el documento | [Mockups y exportación](usuario/mockups-y-exportacion.md) |
| Obtener y verificar código | [Codificación](usuario/codificacion.md) |
| Reproducir un ejemplo | [Caso de estudio](usuario/caso-de-estudio.md) |
| Integrar el backend | [API y Swagger](api/guia.md) |
| Entender prompts y proveedores | [Componente de IA](ia/funcionamiento.md) |
| Instalar y contribuir | [Instalación](desarrollo/instalacion.md) |

## Estado y alcance

Fecha de revisión documental: **20 de octubre de 2026**. La referencia definitiva del comportamiento es el código de la revisión del repositorio utilizada.

- Implementado: cuentas, proyectos, fuentes y metadatos; análisis RF/RNF; generación y aprobación por dependencias; historial de diagramas; mockups; documento y PDF.
- Implementado como base de codificación: decisiones previas, generación CRUD genérica, React, pruebas, infraestructura, CI/CD, paquete ZIP y verificación aislada.
- En desarrollo: reglas semánticas específicas del negocio, fidelidad de las interfaces finales a los mockups y operación productiva endurecida.
- La compilación o una prueba CRUD exitosa no demuestra por sí sola que todos los RF o RNF estén satisfechos.
- No se certifica alta disponibilidad, seguridad productiva ni rendimiento sin pruebas del entorno concreto.

## Correspondencia con el punto 1 de la guía APE

| Entregable solicitado | Dónde se cubre |
| --- | --- |
| Documentación para personas sin conocimientos de programación | Manual de usuario, ejemplo reproducible y resolución de errores |
| Endpoints, integraciones, formatos, autenticación y límites | Guía de API y [OpenAPI](api/openapi.yaml) |
| Artefactos, modelos, prompts y entradas/salidas por fase | Funcionamiento de IA y catálogo de prompts |
| Instalación, arquitectura, dependencias y mantenimiento | README y documentación de desarrollo |
| Reglas de contribución y convivencia | Archivos CONTRIBUTING.md y CODE_OF_CONDUCT.md en la raíz |

Se eligió Markdown para revisión por Git, MkDocs para publicar un sitio navegable, GitHub para versionamiento y OpenAPI/Swagger UI para la API. La configuración documental está separada de la ejecución del producto. Las fuentes oficiales son [MkDocs](https://www.mkdocs.org/) y [Swagger UI](https://swagger.io/open-source/swagger-ui/).

## Evidencias

El [registro de resultados](pruebas/resultados.md) distingue resultados ejecutados de procedimientos pendientes. El caso de estudio es una guía de reproducción, no una ejecución de IA realizada para esta entrega. Las capturas reales deben recogerse siguiendo su lista de evidencias; no se incluyen imágenes simuladas como si fueran pruebas.
