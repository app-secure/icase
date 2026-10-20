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

El contexto funcional debe provenir de las fuentes y requisitos del proyecto consultado. Las dependencias aprobadas y sus versiones acotan la generación de cada diagrama. La reutilización evita trabajo repetido dentro del flujo; el estado de circuit breaker es operativo y no es una memoria de requisitos de otros proyectos.

La existencia de filtros por proyecto no debe confundirse con permisos robustos entre usuarios: véase [API](../api/guia.md). Las pruebas `prompt-isolation.test.js` revisan construcción de contexto; no equivalen a una auditoría de seguridad multiusuario.

## Requisitos y controles

La salida de requisitos exige origen, evidencia y confirmación cuando corresponde. Una métrica no proporcionada debe quedar por confirmar; no se debe imponer un RNF numérico por conveniencia técnica.

Los controles deterministas evalúan sintaxis, actores, relaciones, cobertura funcional de arquitectura, RNF y dependencias. Pueden emitir advertencias que necesitan juicio humano. La reparación controlada del caso de uso de generación tiene un número acotado de intentos y recibe los problemas detectados; su resultado vuelve a validarse.

No se garantiza que una auditoría automática detecte todos los errores semánticos. Las aprobaciones conservan responsabilidad de revisión.

## Generación determinista y generación mediante IA

El análisis y propuestas visuales usan IA. Normalizaciones, validaciones, planificación y generadores genéricos de código/pruebas/infraestructura utilizan reglas y plantillas locales. No atribuir a un LLM código que en realidad salió de un generador determinista.

## Registro reproducible

Para comparar resultados conserva: insumos anonimizados, proyecto, revisión Git, fecha, configuración sin secretos, proveedor/modelo efectivo, hash o revisión de plantilla, artefacto inicial, cambios manuales, advertencias, aprobación y exportación final.

Las plantillas completas y su relación por fase se consultan en [Prompts](prompts.md).
