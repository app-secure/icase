# Requisitos y diagramas

## Revisar los requisitos

Solicita el análisis después de revisar las fuentes. La herramienta propone requisitos funcionales (RF: comportamientos del sistema) y no funcionales (RNF: restricciones y atributos de calidad).

Para cada requisito revisa:

- descripción, prioridad y actores;
- precondiciones y resultado esperado;
- evidencia o fuente de origen;
- si fue explícito, inferido o requiere confirmación;
- métricas RNF: deben proceder de una decisión real, no de un número inventado.

Una función de autenticación puede ser RF; las restricciones de seguridad relacionadas pueden ser RNF. El uso de JWT es una decisión técnica que debe estar sustentada. Evita duplicar el mismo comportamiento en ambas categorías.

Edita los requisitos incorrectos antes de aprobar el análisis. Aprobar significa aceptar esa versión como base del diseño. Añadir o cambiar un requisito después puede retirar aprobaciones y marcar diagramas dependientes como desactualizados.

## Generar y aprobar cada diagrama

| Diagrama | Qué revisar | Dependencias aprobadas |
| --- | --- | --- |
| Casos de uso | Todos los actores y funciones relevantes dentro del sistema | Requisitos |
| Clases de dominio | Entidades, relaciones y conceptos del negocio | Casos de uso |
| Arquitectura de software | Aplicaciones, módulos, servicios lógicos, tecnologías y RNF aplicables | Casos de uso y dominio |
| Arquitectura del sistema | Nodos, infraestructura, comunicación y despliegue justificados | Arquitectura de software |
| Clases de diseño | Clases técnicas, operaciones, interfaces y dependencias | Casos de uso, dominio y software |
| Árbol de navegación | Pantallas, roles, acciones y cobertura de RF | Casos de uso y software |

La interfaz presenta un orden recomendado; las dependencias de esta tabla son las compuertas del flujo. Clases de dominio y clases de diseño tienen propósitos diferentes.

1. Abre la pestaña habilitada.
2. Genera únicamente el artefacto necesario.
3. Espera el resultado. El trabajo de diagrama conserva estado y progreso.
4. Examina la vista gráfica, explicación y código.
5. Solicita un cambio concreto o edita el código cuando sea necesario.
6. Aprueba la versión revisada, o recházala con una observación clara.
7. Continúa con el siguiente artefacto habilitado.

Ejemplo de corrección: «El actor Bibliotecario tiene que registrar devoluciones según RF-03; añade esa relación sin cambiar los demás actores».

## Control de calidad

Un error crítico impide la aprobación. Una advertencia requiere revisión y no prueba automáticamente un fallo del diagrama. Las reglas revisan estructura, trazabilidad y algunas omisiones; no reemplazan la evaluación de negocio.

En arquitectura del sistema, añade redundancia o failover solo cuando el alcance lo exige. Un monitoreo de salud no equivale a alta disponibilidad. Un servicio lógico Socket.IO puede aparecer en software y su despliegue físico en sistema, con vistas distintas del mismo elemento.

## Código, historial y cambios

Usa la vista de código para inspeccionar PlantUML y guardar cambios. El historial contiene versiones previas con contenido diferente. Restaurar carga un borrador y no aumenta la versión: guarda explícitamente si quieres persistirlo. Después de guardar, comprueba versión activa, aprobación y dependencias; un retorno a contenido anterior no vuelve vigentes todos sus descendientes automáticamente.

Volver a la vista de requisitos es una consulta. Reprocesar o modificar sí es una operación distinta: guarda lo necesario y confirma el impacto antes de cambiar una base aprobada.

## Problemas frecuentes

| Síntoma | Acción |
| --- | --- |
| Pestaña bloqueada | Consulta y aprueba las dependencias pendientes |
| Diagrama desactualizado | Revisa el cambio de origen y regenera esa dependencia |
| Gráfico vacío o imagen rota | Revisa código, conexión al renderizador y mensajes de calidad |
| Trabajo fallido | Lee el error, corrige el insumo o proveedor y reintenta de forma explícita |
| Modelo omite actores o conceptos | Comprueba evidencia y solicita una corrección delimitada |

Continúa con [Mockups y exportación](mockups-y-exportacion.md).
