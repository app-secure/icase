# Plan y ejecución de pruebas

## Objetivo y alcance

Comprobar que I-CASE conserva información, genera y revisa artefactos coherentes y bloquea avances incorrectos. Separar pruebas de **I-CASE** de pruebas del **software que genera**.

Alcance: proyectos, fuentes, RF/RNF, diagramas, versiones, aprobaciones, mockups, exportación y codificación. Se incluyen controles de sintaxis, semántica seleccionada, regresión, compilación e integración. La evaluación de rendimiento requiere una ejecución específica pendiente, no una conclusión obtenida del tiempo de una prueba unitaria.

Responsables propuestos: responsable de funcionalidad prepara datos y corrige; otra persona revisa resultados; responsable de integración conserva revisión Git y entorno. El equipo asigna nombres al ejecutar, sin asumir responsables personales aún no acordados.

## Entornos y datos

Usa MongoDB de prueba independiente, fuentes anonimizadas y cuentas ficticias. Para IA usa credenciales de prueba y registra coste/tokens si están disponibles. Para código generado usa contenedores temporales con red interna. Nunca apuntes un escenario de eliminación a la base real del equipo.

Datos recomendados: biblioteca, clínica y tienda; incluir decisiones explícitas, restricciones excluidas y métricas pendientes. Probar el mismo texto en proyectos distintos y fuentes diferentes para comprobar trazabilidad.

## Casos funcionales

La columna Resultado se completa en el registro de ejecución con obtenido, estado y evidencia.

| ID | Precondición y entrada | Pasos | Resultado esperado |
| --- | --- | --- | --- |
| DOC-F01 | Cuenta ficticia | Registrar, iniciar sesión, consultar perfil | Token y perfil correctos; contraseña no expuesta |
| DOC-F02 | Proyecto de prueba | Crear y cargar texto con descripción | Fuente vinculada solo al proyecto |
| DOC-F03 | Audio/PDF revisable | Cargar y cotejar extracción | Texto contrastado con original |
| DOC-F04 | Entrevista de biblioteca | Generar RF/RNF y revisar evidencia | No inventar cifra ni alcance excluido |
| DOC-F05 | Requisitos sin aprobar | Intentar aprobar diagrama dependiente | Operación bloqueada |
| DOC-F06 | Dependencias aprobadas | Generar, editar y aprobar diagrama | Una versión revisable y estado coherente |
| DOC-F07 | Historial con contenido distinto | Restaurar y repetir sin cambios | Sin duplicación por consulta de historial |
| DOC-F08 | Árbol aprobado | Generar pantallas y comparar RF | Campos/acciones relevantes identificables |
| DOC-F09 | Cambio de RF aprobado | Guardar cambio y consultar flujo | Descendientes desactualizados |
| DOC-F10 | Mockups aprobados | Obtener documento y PDF | Auditoría aplicada, imágenes legibles |
| DOC-F11 | JWT y plan aprobado | Generar código y editar un archivo | Se invalida verificación anterior |
| DOC-F12 | Docker activo | Verificar backend y suite | Servicios saludables, CRUD y navegador correctos |
| DOC-F13 | Artefacto sin verificar | Intentar aprobar o descargar paquete | Bloqueo y mensaje explicativo |
| DOC-F14 | Dos proyectos | Generar con fuentes distintas | Sin contaminación de contenido |

## Ejecución automatizada

En backend:

```powershell
npm test -- --runInBand
npm test -- --runInBand tests/prompt-isolation.test.js tests/diagram-versions.test.js
```

En frontend:

```powershell
npm run build
```

En backend, con Docker:

```powershell
node scripts/verify-generic-runtime.js PostgreSQL NestJS full
node scripts/verify-generic-runtime.js MongoDB Express
```

El script integral usa un caso sintético de biblioteca; comprueba contratos y CRUD, no todos los dominios posibles.

Para modelos reales, el archivo `real-model-flow.e2e.test.js` requiere `RUN_REAL_AI_E2E=true`. Carga antes el entorno en el proceso Jest (por ejemplo, dotenv/config) y confirma claves; el script npm existente utiliza sintaxis de Windows. Estas llamadas consumen cuota. La suite cubre requisitos/diagramas/Markdown y no certifica por sí sola capturas PDF o una sesión UI completa.

## Rendimiento y evaluación de IA

Diseño de prueba pendiente: medir una operación representativa de I-CASE (consulta de proyecto o exportación), con cargas escalonadas acordadas y k6/JMeter. Registrar duración, concurrencia, tasa de fallos y timeout. Para generación IA, separar cola, proveedor y validación, además de tokens si se obtienen.

Para calidad IA, revisar cobertura RF, actores, evidencia, exclusiones, relaciones y coherencia entre fases con una rúbrica. Guardar primera respuesta y correcciones; comparar modelos usando las mismas entradas y versiones de prompt.

## Aceptación y evidencias

Una ejecución se acepta si los criterios del caso se cumplen, las pruebas relevantes pasan y no hay defectos críticos abiertos. Un mockup bonito o un endpoint 200 no basta para declarar cobertura semántica.

Conserva comandos, versión Git, entorno, salida, fecha, capturas y hallazgos. Usa [Resultados](resultados.md) como registro; no rellenes resultados esperados como si fueran obtenidos.
