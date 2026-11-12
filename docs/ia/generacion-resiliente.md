# Generación resiliente de requisitos

## Activación gradual

Este flujo es exclusivo de requisitos. Diagramas, mockups y código mantienen sus adaptadores y contratos anteriores. Está desactivado por defecto. En el `.env` del backend:

```dotenv
REQUIREMENTS_RESILIENT_ENABLED=true
AI_FREE_TIER_PROVIDERS=gemini,groq
GEMINI_ACCOUNT_ID=mi-proyecto-google
GROQ_ACCOUNT_ID=mi-organizacion-groq
OPENROUTER_ACCOUNT_ID=mi-cuenta-openrouter
OLLAMA_ENABLED=true
OLLAMA_BASE_URL=http://127.0.0.1:11434
OLLAMA_CONTEXT_LENGTH=8192
OLLAMA_REQUIREMENTS_BATCH_OBJECTIVES=2
OLLAMA_REQUIREMENTS_OUTPUT_TOKENS=4096
```

Incluye Gemini/Groq únicamente después de confirmar que las cuentas usan el perfil gratuito: una clave no acredita su condición de coste. Las cuotas se comparten por cuenta/proyecto lógico; mantén estable su identificador al sustituir una clave. No se rotan claves para multiplicar cuotas. Nunca publiques `.env`.

El catálogo está en `AiModelConfig.requirements`: Gemini Flash Lite/Flash, Groq GPT-OSS 120B/20B, OpenRouter Qwen3.6 Plus/GPT-OSS 120B con sufijo `:free`, y Ollama `qwen3:8b`. Máximo dos modelos cloud por proveedor. OpenRouter requiere catálogo vigente con precio de entrada/salida cero y `response_format`; además impone precio máximo cero al solicitar. Si no puede verificarse, se omite.

OpenAI (`gpt-5.4-mini`, `gpt-5-mini`), DeepSeek (`deepseek-flash`, `deepseek-v4-pro`) y SiliconFlow (`Qwen/Qwen3-8B`) son referencias fuera de este fallback; no se consumen. No se integró SiliconFlow. Los modelos son candidatos pendientes de evaluación, no certificados por estar configurados.

## Routing, errores y privacidad

Automático: Gemini → Groq → OpenRouter → Ollama. En una ejecución se prefiere el proveedor que respondió. Una selección explícita no cruza a otro proveedor. Solo el modo automático autoriza enviar el contexto a los proveedores elegibles del perfil. Las claves permanecen en backend.

Máximo ocho solicitudes cloud por ejecución, dos por proveedor durante el recorrido automático. El presupuesto local es separado: hasta ocho solicitudes, una inferencia simultánea, timeout por solicitud de 120 segundos y ventana total ampliada en 120 segundos. No implica ocho reintentos por ruta. No se recorta el insumo para hacerlo caber: se usa el prompt compacto y se omite una ruta si entrada estimada más salida exceden el contexto.

Los bloqueos se guardan en MongoDB (`AiProviderState`), sin mensajes crudos ni secretos. Se distingue saturación/timeout, frecuencia, cuota diaria, credencial inválida, permiso de modelo, modelo retirado, contexto y respuesta inválida. Se respetan `Retry-After`, restablecimientos informados y esperas progresivas. Una clave reemplazada invalida el bloqueo de autenticación, no el de cuota. Un 403 de modelo no deshabilita toda la cuenta.

Si no hay fecha fiable de restablecimiento diario, se conserva el bloqueo. **Reanudar pendientes** permite una comprobación de esa ruta sin fecha, una vez por ejecución solicitada por el usuario; no reinicia cuotas ni ignora un restablecimiento conocido. Un JSON sintácticamente válido no se considera garantía de calidad.

## Ollama

La URL solo se configura en el servidor, no desde peticiones del usuario. Se consulta `/api/tags`; el modelo debe estar instalado. iCase no descarga modelos, modifica firewall ni publica Ollama. Se utiliza `/api/chat`, JSON Schema, `think:false`, contexto inicial 8192 y concurrencia uno. Los lotes de redacción local contienen como máximo dos objetivos distintos y pueden disponer de hasta 4096 tokens de salida; extracción y auditoría conservan su límite anterior. Servidor apagado, modelo ausente, contexto insuficiente o timeout conservan la etapa pendiente. Mantén Ollama en una red de confianza.

Cada intento registra etapa, modelo, duración, causa tipificada, `done_reason`, tokens de entrada/salida informados por Ollama y límite de salida. No se registran prompts ni respuestas completas en esa telemetría. Si Ollama no comunica el uso, el campo queda vacío; `sin_respuesta` por sí solo no identifica la causa. El evaluador real guarda los intentos en `intentos_detallados` de `resultado.json`.

## Trabajos y recuperación

Se reutiliza `TrabajoGeneracion`, con tipo `requisitos`. Los checkpoints guardan candidatos, resultado validado, hash del prompt/etapa, proveedor/modelo y métricas. Solo la validación de dominio habilita recuperar una etapa: evidencia, clasificación, cobertura y conservación siguen vigentes.

La identidad incluye usuario, proyecto, fuentes, requisitos existentes y versión del contrato. No se comparten checkpoints entre proyectos. Al cambiar fuentes o requisitos se rechaza aplicar una respuesta obsoleta y se solicita un nuevo trabajo. Este puede heredar checkpoints validados del mismo usuario/proyecto: únicamente se recuperan si coincide el hash de la versión, etapa y prompt completo. Cambiar el resultado de una dependencia cambia los prompts siguientes y obliga a volver a ejecutarlos; no se reutilizan por semejanza textual.

Se usa claim atómico/lease para evitar dos ejecutores y una exclusión de escrituras por proyecto al aplicar resultados. Los requisitos aprobados no se sustituyen. No equivale a una transacción multi-documento ante fallos de MongoDB durante la publicación; debe mantenerse una copia de seguridad operativa.

Después de una interrupción, al expirar el lease el trabajo aparece como `interrumpido`. No consume llamadas hasta pulsar Reanudar. Si solo falla la auditoría, las etapas anteriores validadas se recuperan; una auditoría parcial/no completada no se presenta como satisfactoria. El borrador pendiente se conserva en el trabajo sin reemplazar requisitos actuales.

## API

Todas las rutas exigen sesión y propiedad del proyecto/trabajo:

- `POST /proyectos/:id/trabajos-requisitos`: iniciar; devuelve 202 y estado.
- `GET /proyectos/:id/trabajos-requisitos/ultimo`: último trabajo o `null`.
- `GET /proyectos/trabajos-requisitos/:trabajoId`: progreso sanitizado.
- `POST /proyectos/trabajos-requisitos/:trabajoId/reanudar`: continuar pendientes, 202.
- `GET /proyectos/modelos-ia?objetivo=requisitos`: configurado, disponible, causa y evaluación pendiente por modelo.

El endpoint anterior `procesar-ia` conserva su respuesta cuando termina; con el perfil activo delega al mismo orquestador. Si queda pausado devuelve 503 y el identificador para continuar mediante trabajos. La interfaz nueva usa 202 más consultas de progreso.

## Verificación y promoción

```powershell
cd icase-backend
npx jest tests/requirements-resilient.test.js --runInBand
npm run test:requirements
npm run test:requirements:safety
node scripts/evaluate-requirements-real.cjs --run-real --resilient --providers=ollama --case=biblioteca-comunitaria
```

La evaluación real no usa la base de proyectos, conserva resultados sintéticos en `verification-results/requirements-evaluation` y emplea bloqueos en memoria. Para evaluar cloud, usa claves renovadas y cuentas gratuitas confirmadas. Las pruebas reales pueden consumir cuota; no se ejecutan en el test unitario.

Antes de promover un modelo revisa manualmente clínica, biblioteca y restaurante: evidencia localizable, funciones críticas, cualidades independientes, exclusiones, preguntas pendientes, conservación al reparar y honestidad de auditoría. Registra calidad, latencia, solicitudes y uso informado. Una coincidencia léxica o un test de transporte no certifican calidad semántica. Las rutas no evaluadas permanecen pendientes.

### Evidencias de esta entrega (10 de noviembre de 2026)

- Requisitos: 86 pruebas base, 45 de seguridad/calidad y 23 de resiliencia, HTTP y repositorio, aprobadas.
- Accesos y trabajos de diagramas: 34 pruebas de regresión aprobadas.
- Compilación frontend aprobada; persiste la advertencia previa de paquetes JavaScript grandes.
- Chromium: diagnóstico, aprobación bloqueada por omisiones, edición accesible, persistencia de resolución, viewport móvil y reanudación explícita del componente. El callback de reanudación es simulado; no acredita un reinicio real de MongoDB/backend desde la interfaz.
- Ollama `qwen3:8b`, biblioteca: primera ejecución no completó redacción por contexto; usando el prompt compacto produjo un borrador en unos 148 segundos, con 0 RF y 8 RNF y auditoría no completada. **No supera la evaluación de calidad ni se promueve.** El orquestador persistente mantiene pendiente una auditoría incompleta en lugar de aplicar ese borrador.
- No se consumieron APIs cloud en esta entrega. Quedan pendientes los tres dominios completos con proveedores gratuitos confirmados, reinicio real contra MongoDB y promoción manual. Los tests de recuperación del worker/repositorio son deterministas; no equivalen a reiniciar una base activa.

Los artefactos locales están en `verification-results/requirements-evaluation/2026-11-10T17-14-42-355Z` y `verification-results/requirements-browser/2026-11-10T17-19-59-635Z`. El evaluador ahora distingue borrador pendiente de resultado revisado: los informes anteriores que dicen `generado` deben interpretarse junto con sus métricas, no como aprobación.

### Comparación local con lotes pequeños

Se repitió `archivo-clinico` con el mismo insumo y `qwen3:8b`, dividiendo la redacción en lotes de dos objetivos y permitiendo hasta 4096 tokens de salida por lote. Cada intento ahora registra etapa, causa tipificada, tokens de entrada/salida informados por Ollama, límite de salida, motivo de finalización y duración, sin guardar el texto en la telemetría. Un `done_reason=length` se considera salida truncada y no se acepta como JSON útil.

La primera ejecución de esta configuración (`2026-11-10T23-41-56-666Z`) produjo 3 RF y 29 RNF, con duplicados, requisitos fuera de sus lotes y presupuesto local agotado antes de la auditoría. Los lotes respondidos terminaron con `stop`, no por longitud. Se añadió un control que rechaza el lote entero si incluye requisitos ajenos, referencias cruzadas indebidas o más de un requisito por objetivo.

La repetición con ese control (`2026-11-10T23-49-14-755Z`) duró 138 segundos: el primer lote devolvió 9 requisitos para 2 objetivos y fue rechazado; los cinco lotes siguientes devolvieron 2 cada uno. El inventario clasificó solo 2 necesidades como RF y 10 como RNF; al descartarse el primer lote, el borrador conservó 0 RF y 10 RNF. La auditoría semántica no se ejecutó por contexto excesivo. Ninguna respuesta aceptada terminó por longitud; las entradas de redacción fueron aproximadamente 1020–1076 tokens y las salidas 462–2594, por debajo del límite de 4096.

Conclusión limitada a esta configuración: `qwen3:8b` es técnicamente viable para ejecutar etapas locales, pero **no es fiable como generador autónomo y aprobable de requisitos** en este flujo. El fallo observado es principalmente semántico (clasificación y respeto de lotes), además de una auditoría que supera el contexto configurado; aumentar solo la salida no lo resuelve. Puede mantenerse como respaldo experimental o para tareas acotadas, siempre con los mismos controles y revisión humana. Un modelo mayor requiere evaluación separada; no se lo considera validado por inferencia.

### Contexto de fuentes para requisitos

La política vigente de checkpoints es `requirements-job-v7-initial-quality` / `requirements-stages-v6-initial-quality`. Conserva los resultados guardados, pero no recupera trabajos calculados con contratos anteriores.

Desde la versión `requirements-job-v2-source-context`, el backend compone el contenido original de las fuentes guardadas y envía sus metadatos como pistas separadas solo en la extracción inicial. La descripción y etiquetas, incluidas las sugeridas por IA, no constituyen evidencia ni decisiones confirmadas; los lotes de redacción y la auditoría contrastan el contenido original. La comprobación de citas simples y estructuradas se limita al contenido del archivo indicado o al insumo directo. Proyectos antiguos con el marcador `[Contenido extraído]` conservan lectura, pero sus encabezados tampoco pueden citarse. Los trabajos anteriores no reutilizan checkpoints con el contrato nuevo.

Las pruebas deterministas comprueban que una tecnología presente únicamente en la descripción no se acredita como evidencia, que las fuentes mantienen sus nombres y que el texto enviado por el navegador no se duplica cuando hay fuentes persistidas. **Esto no acredita todavía una mejora semántica con IA real**: para medirla se debe repetir el mismo proyecto antes/después con el mismo proveedor y modelo, comparando solicitudes, uso de tokens informado, tiempo, cobertura, omisiones y contenido no sustentado. No se infieren ahorros de tokens a partir de la longitud de los textos.

### Análisis inicial aprobado y redacción separada

Los proyectos nuevos utilizan `version_flujo_analisis: 2`. La extracción crea exclusivamente análisis inicial. El botón **Aprobar análisis y generar requisitos** guarda primero la aprobación y después inicia otra ejecución de redacción; `analisis_aprobado` sigue reservándose para la aprobación de los requisitos antes del diseño. Navegar entre pantallas no inicia llamadas de IA.

Las versiones se guardan en la colección de análisis inicial mediante `AnalisisInicialSchema`, con referencias separadas a borrador y aprobación en el proyecto. La aprobación no modifica su contenido. Editar, dividir, fusionar, aplicar una propuesta o reabrir crea otra versión con justificación y control de concurrencia. Las propuestas identifican elementos concretos y muestran su resultado antes de aplicarse. Las obligaciones nuevas deben incorporarse como insumo adicional explícito, no como metadatos.

Los trabajos existentes distinguen `analisis_inicial`, `redaccion_requisitos`, `correccion_analisis_inicial` y `legacy`. La huella de trabajos es `requirements-job-v7-initial-quality`: cambiar de pantalla no invalida resultados; modificar contenido impide redactar desde una aprobación obsoleta. Cambiar solo metadatos afecta extracciones pendientes, no obligaciones ya aprobadas con contenido original inalterado. La redacción reutiliza el inventario aprobado y mantiene sus pendientes, actores y clasificación.

Los proyectos antiguos conservan el flujo anterior. Adoptar el nuevo flujo requiere confirmación explícita. Reabrir no elimina requisitos ni diagramas. Una aprobación modificada informa el impacto; las actualizaciones posteriores requieren seleccionar requisitos y conservan los no seleccionados y su historial. Las rutas antiguas no permiten saltarse la aprobación inicial en proyectos nuevos.

Validación del 11 de noviembre: 14 pruebas de separación y ciclo HTTP, 89 regresiones de requisitos, 45 de seguridad/calidad, 26 de resiliencia y 10 de actores/identificadores/inventario aprobadas. La compilación frontend y el validador de documentación (77 operaciones HTTP) finalizaron correctamente. Chromium comprobó edición, propuestas, recarga, aprobación, navegación de consulta y viewport móvil sin errores JavaScript. Evidencia: `icase-backend/verification-results/initial-analysis-browser/2026-11-11T15-41-31-248Z`.

**Límites de aceptación:** el navegador utiliza repositorios en memoria y respuestas deterministas; no acredita persistencia tras reiniciar MongoDB. Los ensayos reales de restaurante, biblioteca y clínica quedaron pausados por fallos transitorios de Gemini antes de completar la extracción. Sus evidencias están en `initial-analysis-browser/2026-11-11T15-13-51-652Z`, `2026-11-11T15-24-20-527Z` y `2026-11-11T15-26-27-672Z`. No se acredita todavía la aceptación semántica con IA real ni se han modificado proyectos de la base activa. Con MongoDB/Docker disponibles debe completarse la verificación de reinicio y reanudación sobre persistencia real.

### Objetivos y actores (11 de noviembre de 2026)

La política de granularidad es compartida por los prompts completos y compactos. Antes de redactar, una revisión acotada selecciona hasta cinco candidatos por señales léxicas y pide a la IA comprobar si contienen resultados independientes o capacidades positivas ocultas en reglas/decisiones. Las señales no dividen requisitos automáticamente ni bloquean la aprobación. Las respuestas sin evidencia verificable conservan el inventario anterior y un diagnóstico visible. El modo explícito de solo borrador omite esta revisión semántica.

Las generaciones nuevas reciben identificadores RF/RNF correlativos con sus referencias actualizadas; las revisiones de proyectos guardados conservan sus IDs. Tras obtener un lote válido se reserva una solicitud cloud para auditoría cuando el límite total permite al menos tres solicitudes. La reserva no amplía el presupuesto ni garantiza disponibilidad del proveedor. Una auditoría incompleta, con contrastes pendientes o respuestas rechazadas no se presenta como satisfactoria.

El catálogo `auditoria_requisitos.actores` se extrae junto al inventario, sin solicitud adicional obligatoria. Conserva nombre, responsabilidad, tipo persona/sistema externo, alias, origen, estado y evidencias localizadas. Los actores inferidos permanecen pendientes. No se fusionan nombres distintos por suponer equivalencia ni se generan automáticamente clases, pantallas o permisos.

En la sección colapsable **Actores del sistema** se pueden añadir actores manuales pendientes, editar, confirmar y fusionar con justificación. La fusión conserva alias/evidencias, actualiza los nombres asociados en requisitos y registra historial. Confirmar no convierte un origen inferido o manual en evidencia explícita. El endpoint existente `POST /proyectos/:id/revision-requisitos` admite `agregar_actor`, `editar_actor`, `confirmar_actor` y `fusionar_actor` (requiere `destino_id`). Las modificaciones exigen propiedad y análisis abierto. Las fases posteriores muestran el catálogo de solo lectura en el sidebar; los proyectos antiguos derivan una vista heredada sin inventar citas ni llamar a IA.

Validación técnica: 89 pruebas base, 45 de seguridad/calidad, 26 de resiliencia y 10 de actores/identificadores/revisión del inventario aprobadas. Compilación frontend correcta. Chromium verificó formularios, persistencia, aprobación bloqueada por omisiones, viewport móvil y sidebar de actores sin edición con ocultar/mostrar. Evidencia: `verification-results/requirements-browser/2026-11-11T12-46-31-623Z` (API productiva y repositorios sintéticos en memoria, no base activa).

**Aceptación semántica pendiente:** dos ensayos reales con la entrevista y Gemini no acreditaron un resultado completo sin correcciones. El primero produjo 12 RF, 3 RNF y cinco actores, pero conservó agrupaciones y una auditoría parcial; el segundo agotó ocho solicitudes con fallos de proveedor, diez RF y obligaciones omitidas explícitamente diagnosticadas. Artefactos: `verification-results/requirements-evaluation/2026-11-11T12-39-45-631Z` y `2026-11-11T12-43-59-679Z`. La última corrección amplió la detección de candidatos conjugados (por ejemplo, «registra» y «cierra»); está cubierta por regresiones, pero aún requiere repetición real satisfactoria. No se aprobaron ni alteraron proyectos de la base activa durante estos ensayos.
