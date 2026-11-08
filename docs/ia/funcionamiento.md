# Funcionamiento del componente de IA

## Arquitectura de generación

El navegador solicita una acción al backend. El caso de uso reúne fuentes y contexto aprobados del proyecto, construye el prompt, llama a un adaptador y valida la salida antes de persistirla. La persona usuaria revisa y aprueba.

Los servicios principales son `ModelosIaService`, `FileIngestionService`, `MockupIaService`, validadores de PlantUML, servicios de consistencia y casos de uso de análisis/diseño. Las plantillas versionadas están en `icase-backend/src/infrastructure/prompts/`.

## Modelos y versión utilizada

No existe un único modelo fijo para todas las fases. El entorno configura proveedor, orden y catálogos; una petición puede solicitar `specificModel`. El modo automático puede pasar a otro proveedor por credenciales ausentes, cuota o fallos.

| Tarea | Configuración principal |
| --- | --- |
| Análisis y diagramas | AI_PROVIDER, AI_PROVIDER_ORDER, GEMINI_ANALYSIS_MODELS, GROQ_ANALYSIS_MODELS, DEEPSEEK_MODEL, OPENROUTER_ANALYSIS_MODELS |
| Ingesta multimodal | GEMINI_INGESTION_MODELS, GROQ_WHISPER_MODEL |
| Mockups | MOCKUP_IA_PROVIDER, MOCKUP_PROVIDER_ORDER y catálogos *_MOCKUP_MODELS |
| Resiliencia | AI_TRANSIENT_RETRIES, AI_CIRCUIT_COOLDOWN_MS y parámetros MOCKUP_CIRCUIT_* |

Los identificadores escritos en `.env.example` son ejemplos de configuración del repositorio, no una afirmación de disponibilidad actual. Para cada evidencia registra proveedor/modelo solicitado, proveedor/modelo efectivo cuando lo expongan respuesta o logs, fecha y revisión del prompt. Si el modelo efectivo no queda registrado, anota «no registrado»; no lo deduzcas del selector.

## Aislamiento y trazabilidad

### Casos de uso: cobertura y reparación sin regresiones

El límite de casos se calcula desde los RF vigentes: máximo `max(14, cantidadRF + 4)`, en lugar de forzar proyectos grandes a eliminar funciones para caber en 12–14 óvalos. Las vistas extensas deben organizarse visualmente en módulos. Los controles de cobertura siguen activos y no basta declarar IDs en metadatos.

La reparación recibe el código completo y la lista de RF ya cubiertos. Si su respuesta pierde casos anteriores, se intenta recuperar únicamente los casos faltantes desde esa respuesta, remapeando aliases y conservando los nodos/relaciones del original. No se inventan casos o relaciones para pasar el control. El candidato combinado se valida antes de persistir; si no supera la validación, el trabajo sigue fallando con su causa real. Esta recuperación local solo se aplica a casos de uso, no altera los renderizadores ni las políticas de arquitectura, clases o navegación.

La aceptación HTTP del trabajo no espera a la IA; los rechazos del trabajador en segundo plano se capturan para evitar un fallo no manejado. Si se pierde la conexión al iniciar, el cliente consulta un trabajo activo del mismo tipo antes de permitir otro intento, sin reenviar automáticamente el POST. Un trabajo antiguo completado no se presenta como una nueva generación. La interfaz muestra el error concreto del trabajo fallido, además del mensaje general. Estas medidas no atribuyen todo `ECONNRESET` a la IA: un reinicio o una desconexión real del backend también puede producirlo.

### Fallback de requisitos con presupuesto de entrada

La extracción y redacción ofrecen a Groq una variante compacta construida desde el contrato y los objetivos del lote. Conserva íntegro el insumo original; elimina instrucciones repetidas y la duplicación del inventario auxiliar, que sigue persistido. Los lotes también consideran `GROQ_ANALYSIS_INPUT_BUDGET`, sin dividir las evidencias de un objetivo. No se recortan fuentes ni se aumenta ese límite automáticamente. Si ni un objetivo con el insumo completo cabe, se informa el límite en vez de enviar una petición inválida.

Si ningún proveedor devuelve la extracción, se detiene el recorrido con `AI_REQUIREMENTS_UNAVAILABLE`; no se lanza otro borrador más grande contra los mismos proveedores inactivos. Los requisitos anteriores no se reemplazan. La respuesta incluye causas acotadas por proveedor: saturación temporal, saldo insuficiente, cuota, autenticación, modelo no disponible o límite de entrada, además de espera restante cuando exista un circuito abierto. No se guardan claves, mensajes arbitrarios o prompts en esa telemetría. Una respuesta parcial sigue sujeta a los controles de cobertura y aprobación; no equivale a un análisis completo.

La saturación transitoria de Gemini usa un enfriamiento máximo de 15 segundos, separado de cuota/saldo. El backend no puede corregir saldo agotado ni disponibilidad externa. Si todos los proveedores siguen inactivos, devuelve una causa accionable y no requisitos artificiales. Las auditorías que no quepan en el presupuesto quedan pendientes y no se presentan como exitosas.

Dentro del presupuesto de requisitos, un 429 de Groq puede tener un solo reintento si el proveedor indica una espera de hasta 30 segundos y quedan tiempo y solicitudes suficientes. La espera es cancelable, se registra en métricas y no reinicia el presupuesto global. No se hace una espera indefinida ni se incrementan cuotas o límites de entrada.

El contexto funcional debe provenir de las fuentes y requisitos del proyecto consultado. Las dependencias aprobadas y sus versiones acotan la generación de cada diagrama. La reutilización evita trabajo repetido dentro del flujo; el estado de circuit breaker es operativo y no es una memoria de requisitos de otros proyectos.

La existencia de filtros por proyecto no debe confundirse con permisos robustos entre usuarios: véase [API](../api/guia.md). Las pruebas `prompt-isolation.test.js` revisan construcción de contexto; no equivalen a una auditoría de seguridad multiusuario.

## Requisitos y controles

La salida de requisitos exige origen, evidencia y confirmación cuando corresponde. Una métrica no proporcionada debe quedar por confirmar; no se debe imponer un RNF numérico por conveniencia técnica.

El contrato v2 clasifica las necesidades en RF, RNF, reglas de negocio, restricciones técnicas, contexto, preguntas y decisiones. La IA consolida resultados de negocio antes de redactarlos; no se impone una cuota de requisitos ni se crea uno por frase, dispositivo o campo. Las evidencias complementarias de un mismo resultado comparten `objetivo_id`. Un requisito puede referenciar varias necesidades de ese objetivo mediante `necesidades_origen`; sus detalles se conservan en `criterios_aceptacion`, cada uno con descripción y referencias. `reglas_relacionadas` vincula reglas del análisis sin convertirlas en funciones adicionales.

La redacción usa lotes de objetivos completos según una estimación conservadora del tamaño de salida, sin separar evidencias de un objetivo. Cada lote conserva el insumo completo como contexto. Los inventarios anteriores sin agrupación explícita conservan el procesamiento legado de cinco elementos por lote. Cada generación de requisitos tiene un presupuesto por petición: `AI_REQUIREMENTS_TIMEOUT_MS` (180000 ms por defecto), `AI_REQUIREMENTS_REQUEST_TIMEOUT_MS` (35000 ms por llamada) y `AI_REQUIREMENTS_MAX_ATTEMPTS` (8 solicitudes HTTP acumuladas, incluidos reintentos y fallback). Al vencer el plazo se cancelan los HTTP activos y no se lanzan nuevas llamadas. El proveedor que respondió correctamente se prioriza en las siguientes etapas del mismo recorrido automático. Diagramas y autocompletado conservan sus límites anteriores. El límite de IA no es una garantía de duración total del endpoint, que también realiza validación y persistencia.

`metricas_ejecucion` registra duración, intentos HTTP y etapas sin copiar prompts, claves ni contenido de fuentes. Si queda un borrador parcial se conservan sus datos con las omisiones advertidas; si no hay requisitos utilizables, no se reemplazan los existentes. Los presupuestos usan contextos asíncronos separados: no se comparten entre proyectos ni entre llamadas concurrentes.

Se comprueban referencias, identificadores, criterios, objetivos repetidos, clasificación contra el análisis y cobertura. Esos controles estructurales no certifican que la IA haya clasificado semánticamente todo correctamente. Se permite una corrección parcial acotada, preservando los requisitos válidos. No se intenta reparar una generación vacía ni recrear lotes completos fallidos con una petición masiva. Un resultado parcial muestra una advertencia de cobertura, pero no cambia artificialmente todas las decisiones del usuario a pendientes de confirmación. Una respuesta sin requisitos utilizables interrumpe la generación sin reemplazar los datos. Los proveedores conservan sus mecanismos propios de reintentos y fallback.

El inventario y el resultado del control se guardan en `auditoria_requisitos` del proyecto. Las decisiones de alcance negativas se mantienen fuera de la lista RF/RNF; las prohibiciones operativas de acceso sí son requisitos funcionales. Una necesidad explícita sin métrica conserva su origen explícito y queda pendiente de confirmar. Esta cobertura es relativa al inventario extraído: una omisión semántica en el propio inventario todavía puede requerir revisión humana. Los proyectos anteriores no se reprocesan automáticamente.

La interfaz presenta las categorías auxiliares aparte y permite editar criterios, referencias y clasificación. Las restricciones y reglas conservadas se incluyen en el modelado y en las propuestas de código. Cambiar obligaciones o criterios invalida derivados. Antes de aprobar se recalcula el control contra los requisitos guardados, no contra un aviso antiguo: se bloquean listas vacías o malformadas, identificadores duplicados, necesidades sin cobertura, criterios faltantes y referencias incompatibles. Los detalles pendientes y los análisis anteriores sin inventario v2 generan advertencias. La auditoría semántica asistida ya está integrada, pero su eficacia con modelos reales debe evaluarse; no garantiza exhaustividad.

La validación de esa lista es por elemento: conserva los correctos y distingue identificadores ausentes o duplicados, tipo/estado inválidos y evidencia ausente o no localizada. Solo se normalizan formato y comillas envolventes, sin aceptar paráfrasis como citas. Si hay elementos defectuosos, intenta una reparación de hasta cinco posiciones en una sola solicitud; las correcciones no pueden modificar posiciones válidas ni reutilizar sus IDs. `diagnostico_inventario` conserva los errores iniciales y pendientes con sus elementos y el número de intentos. Si queda algún elemento sin validar, se muestra como advertencia y no se declara cobertura verificada; no se descarta todo el inventario. El borrador directo sin inventario se utiliza únicamente cuando no queda ninguna necesidad validada.

Los controles deterministas evalúan sintaxis, actores, relaciones, cobertura funcional de arquitectura, RNF y dependencias. Pueden emitir advertencias que necesitan juicio humano. La reparación controlada del caso de uso de generación tiene un número acotado de intentos y recibe los problemas detectados; su resultado vuelve a validarse.

No se garantiza que una auditoría automática detecte todos los errores semánticos. Las aprobaciones conservan responsabilidad de revisión.

## Generación determinista y generación mediante IA

El análisis y propuestas visuales usan IA. Normalizaciones, validaciones, planificación y generadores genéricos de código/pruebas/infraestructura utilizan reglas y plantillas locales. No atribuir a un LLM código que en realidad salió de un generador determinista.

## Registro reproducible

Para comparar resultados conserva: insumos anonimizados, proyecto, revisión Git, fecha, configuración sin secretos, proveedor/modelo efectivo, hash o revisión de plantilla, artefacto inicial, cambios manuales, advertencias, aprobación y exportación final.

Las plantillas completas y su relación por fase se consultan en [Prompts](prompts.md).
# Granularidad por resultado funcional

## Evidencias múltiples y necesidades pendientes

### Auditoría semántica y corrección parcial

Después de la comprobación estructural, la generación real solicita una auditoría que compara el insumo original completo, el inventario, los pendientes y los requisitos. Detecta omisiones, clasificación, agrupaciones, duplicados y obligaciones añadidas. Cada hallazgo necesita referencias existentes y fragmentos verificables; una observación sin sustento se registra aparte y no se convierte en requisito ni error confirmado.

Se intenta una sola corrección semántica cuando hay hasta cinco hallazgos y no quedan problemas estructurales previos. El parche tiene un máximo de veinte elementos entre altas, sustituciones y eliminaciones. Solo puede modificar IDs afectados y crear IDs nuevos; no puede sobrescribir pendientes de evidencia. Se valida el inventario, la cobertura, las citas y los criterios del candidato, y después se solicita una nueva revisión semántica antes de aplicarlo. Si falla cualquiera de esos pasos, el borrador original se conserva. Se guarda el parche y el estado anterior afectado para trazabilidad.

Las etapas `revision_semantica`, `correccion_semantica` y `verificacion_correccion_semantica` comparten el presupuesto global existente; no lo reinician. Se añade una solicitud lógica si no hay hallazgos, y hasta dos adicionales al intentar corregir. Un fallo o agotamiento se muestra como revisión incompleta. Los hallazgos de IA son advertencias; solo los confirmados como críticos por una persona bloquean adicionalmente el pase. Una revisión sin hallazgos no certifica exhaustividad.

El contrato admite `evidencias: [{texto, fuente, inicio, fin}]` junto al campo legado `evidencia`. La IA propone citas y fuentes; el backend verifica los fragmentos por separado y calcula offsets UTF-16 `[inicio, fin)` sobre el insumo procesado. No representan posiciones gráficas del PDF ni tiempos de audio. Las citas ambiguas requieren más contexto. Una cita puede pertenecer a una fuente y su confirmación a otro fragmento, sin concatenarlas artificialmente. Los registros antiguos siguen admitiendo su evidencia única.

Los elementos inválidos se conservan en `necesidades_pendientes`, con diagnóstico, estado e historial. No se consideran falsos por fallar su cita. RF/RNF activos pendientes impiden aprobar hasta resolverlos; las categorías auxiliares mantienen advertencias. La API `POST /proyectos/{id}/necesidades/{necesidadId}/resolver` y su formulario permiten corregir fragmentos y clasificación o descartar justificadamente, conservando originales. No crean requisitos: una función corregida todavía debe cubrirse. Exigen propiedad del proyecto y no permiten modificaciones con requisitos aprobados.

### Revisión humana y consistencia entre fases

El panel permite confirmar una incidencia como advertencia o crítica, registrar una resolución manual, descartar observaciones o aceptar una corrección aplicada, siempre con justificación. Marcar una resolución manual no equivale a una nueva evaluación de IA. `POST /proyectos/{id}/revision-requisitos` recalcula la estructura actual y registra decisiones. La comprobación puede ejecutarse en modo de lectura, pero no se modifican especificaciones aprobadas. Al aprobar se guarda el control y una instantánea del contexto aprobado.

`RequirementAnalysisContext` construye desde el inventario vigente reglas, restricciones, exclusiones y preguntas, preservando sus estados. Este contexto llega a diagramas, mockups, planificación de código e informe Markdown. Las propuestas de código lo conservan y las huellas de backend, frontend e infraestructura lo incluyen. Las citas, offsets, diagnósticos y tiempos de ejecución quedan fuera de la huella semántica del contexto. Una edición de reglas o decisiones invalida derivados; corregir solo evidencia no lo hace. Los cambios de clasificación y las generaciones nuevas conservan historial/versiones; los proyectos antiguos funcionan sin migración destructiva.

La invalidación semántica también deja obsoletos el plan de codificación y los artefactos generados, incluido el ZIP aprobado, sin borrar sus propuestas, versiones o archivos manuales. Un artefacto desactualizado no se reutiliza como resultado vigente aunque coincida una huella antigua; debe generarse/revisarse nuevamente. La nueva generación de análisis revoca igualmente la vigencia de código anterior. Las pruebas automatizadas cubren estas transiciones, pero todavía se requiere el recorrido real de IA y navegador del bloque de evaluación.

La extracción y la redacción comparten una política de granularidad: un objetivo es el resultado de una operación, no un módulo o todas las tareas de un rol. Las capacidades ejecutables y aprobables por separado se separan desde el inventario; campos, filtros, estados visibles, medios alternativos y pasos necesarios de una operación permanecen como criterios. No se fija una cuota de requisitos ni se añaden llamadas para esta revisión dentro del prompt.

Esta instrucción reduce el riesgo de agrupación excesiva, pero no certifica la interpretación semántica del modelo. Las pruebas automatizadas verifican el contrato y la propagación de la política; hace falta repetir la generación real para medir su efecto. Los proyectos existentes no se modifican automáticamente.
# Contexto por vista de diseño

La generación secuencial recibe las instrucciones de la vista solicitada y solo sus dependencias aprobadas, completas (sin cortar su PlantUML a 6.000 caracteres). El contexto clasificado incluye reglas, restricciones técnicas, contexto de uso, decisiones y preguntas con sus estados; no incluye evidencias ni metadatos de auditoría. Se conservan los RF/RNF aprobados para evitar omisiones por filtros léxicos, así como restricciones y decisiones ambiguas o enlazadas a objetivos. Solo se excluyen detalles claramente de infraestructura de las vistas funcionales y reglas puramente funcionales del despliegue. Esta selección es conservadora, no un clasificador semántico exhaustivo.

Cuando existe análisis clasificado se evita reenviar la transcripción original, que podría reintroducir propuestas no confirmadas. Los proyectos legados sin contexto clasificado mantienen el insumo como respaldo. No se imponen máximos fijos de actores/contenedores ni un máximo bloqueante de veinte clases de diseño; los modelos extensos reciben una recomendación de organización por paquetes. Los límites de transporte y salida del proveedor siguen existiendo: no equivalen a una cuota de elementos del modelo.
