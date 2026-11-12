# Requisitos y diagramas

## Revisar los requisitos

### Responder dudas del análisis inicial

El modal utiliza dos pasos: escribe la respuesta y pulsa **Proponer cómo incorporar la respuesta**. Después revisa los elementos propuestos, sus categorías, estado, objetivos y evidencias. Una respuesta puede convertirse en varios elementos; no es necesario mezclar una tecnología con una cualidad. Solo se guardará después de tu confirmación. Si falla la IA, el texto no se pierde: puedes reanudar o **Añadir elemento manual**, incluyendo una cita literal de tu respuesta.

Para comprobar un borrador ya guardado utiliza **Revisar calidad del análisis**. No vuelve a extraer las fuentes ni modifica el borrador automáticamente: muestra una propuesta que puedes comparar y aplicar. Si el análisis está aprobado, reábrelo primero. Un estado de revisión parcial no significa cero problemas; las señales orientativas tampoco prueban que haya que dividir una necesidad.

En **Preguntas y aclaraciones**, pulsa **Responder pregunta**. Escribe el acuerdo, indica si corresponde a una decisión, cualidad (RNF), capacidad (RF), regla o restricción, y confirma que puede utilizarse para generar requisitos. Opcionalmente relaciona elementos existentes; estos vínculos no sustituyen su contenido. Para RF/RNF puedes complementar un objetivo de la misma categoría o crear uno nuevo.

**Guardar respuesta y resolver duda** registra el texto como insumo adicional explícito, conserva la pregunta original y crea un elemento vinculado con evidencia en una nueva versión. No consume llamadas de IA ni aprueba automáticamente el análisis. Las respuestas quedan visibles como **Respondida** y no siguen contando como dudas abiertas. Si aún no existe un acuerdo, cancela y conserva la pregunta pendiente. Guarda antes cualquier otra edición para habilitar la respuesta.

En proyectos nuevos primero se muestra **Análisis inicial**. Esta pantalla contiene contexto, problema, objetivos, alcance, actores, necesidades, cualidades, reglas, restricciones, decisiones y preguntas, con sus evidencias. Todavía no son requisitos formales. Revisa especialmente las necesidades que agrupan resultados independientes y las funciones que podrían estar ocultas en una regla de permisos.

Puedes editar, reclasificar, separar resultados o fusionar elementos de la misma categoría. Al separar se conserva el ID original y se asigna uno nuevo al resultado adicional; al fusionar se conservan evidencias y se actualizan relaciones. Escribe una justificación. Para añadir obligaciones no presentes en las fuentes, registra su texto en **Insumo adicional explícito** y úsalo como evidencia; las etiquetas y descripciones de fuentes no son obligaciones.

La corrección puntual con IA requiere indicar los IDs y una instrucción. La propuesta no se aplica sola: compara el antes y después y acéptala expresamente. Los elementos no seleccionados se conservan.

Marca que revisaste las advertencias y pulsa **Aprobar análisis y generar requisitos**. Las preguntas abiertas o métricas desconocidas no se convierten en acuerdos. Las obligaciones con evidencia inválida o errores estructurales impiden aprobar. Esta aprobación inicial **no habilita diagramas**: después debes revisar y aprobar los RF/RNF redactados.

Si falla el encolado, verás **Análisis aprobado; generación pendiente**: reintenta sin repetir la extracción. Si se interrumpe un trabajo, usa **Reanudar pendientes**. Cada etapa conserva su propio progreso y métricas.

La navegación **Fuentes / Análisis inicial / Requisitos** solo cambia de pantalla. Volver o recargar no consume IA ni invalida aprobaciones. Para modificar un análisis aprobado usa **Revisar análisis inicial**: crea un borrador y conserva la versión anterior. Al aprobar cambios se muestra el impacto; actualizar requisitos existentes requiere una confirmación explícita y conserva versiones anteriores y requisitos no afectados. Cambiar solo metadatos no revoca una aprobación sustentada en contenido original sin cambios.

Los proyectos anteriores mantienen su flujo. La pantalla muestra su análisis como heredado, sin atribuirle una aprobación inicial inexistente. Adoptar el flujo separado requiere confirmación y no regenera ni borra información automáticamente.

La herramienta propone requisitos funcionales (RF: comportamientos del sistema) y no funcionales (RNF: restricciones y atributos de calidad).

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
