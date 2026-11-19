# Plan y ejecución de pruebas

## Objetivo y alcance

Comprobar que I-CASE conserva información, genera y revisa artefactos coherentes y bloquea avances incorrectos. Separar pruebas de **I-CASE** de pruebas del **software que genera**.

Alcance: proyectos, fuentes, RF/RNF, diagramas, versiones, aprobaciones, mockups, exportación y codificación. Se incluyen controles de sintaxis, semántica seleccionada, regresión, compilación e integración. La evaluación de rendimiento requiere una ejecución específica pendiente, no una conclusión obtenida del tiempo de una prueba unitaria.

Responsables propuestos: responsable de funcionalidad prepara datos y corrige; otra persona revisa resultados; responsable de integración conserva revisión Git y entorno. El equipo asigna nombres al ejecutar, sin asumir responsables personales aún no acordados.

## Verificación de seguridad del backend Spring generado

El ZIP incluye `backend/src/test/java/app/HttpSecurityFilterTest.java`. Ejecuta `mvn -B test` desde `backend/` con Java 21 y Maven. Las seis pruebas usan peticiones servlet simuladas: no necesitan credenciales, base de datos ni arrancar el contexto Spring. Verifican CORS, cabeceras, preflight, límites generales y de autenticación, configuración inválida y saneamiento de errores. El CI Java generado también ejecuta esta tarea.

Además, `AssociationStoreTest.java` añade seis pruebas de vínculos SQL: selección de dialecto, transacciones, rollback, paginación por cursor, validación, permisos sobre ambos extremos y uso de rutas decodificadas. En total se ejecutan doce pruebas Java. Las de vínculos usan JDBC simulado; no sustituyen las pruebas con PostgreSQL/MySQL reales.

Para comprobar desde I-CASE que el generador exporta un proyecto Java compilable, desde `icase-backend/` en PowerShell:

```powershell
$env:RUN_GENERATED_JAVA_TESTS='true'
npx jest tests/generated-spring-security.test.js --runInBand
Remove-Item Env:RUN_GENERATED_JAVA_TESTS
```

La prueba crea y elimina exclusivamente un directorio temporal bajo `tests/`. Maven puede descargar dependencias; para usar solamente las que ya estén en caché, añade `JAVA_TEST_OFFLINE=true`. Sin `RUN_GENERATED_JAVA_TESTS`, Jest comprueba la presencia y conexión de los archivos exportados, pero no afirma haber compilado Java.

## Verificación N:M durante la ejecución aislada

La comprobación del backend y del paquete ejecuta un protocolo compartido con las pruebas de integración exportadas. Para cada relación declarada crea extremos de prueba (y sus padres obligatorios), valida IDs y extremos inexistentes, asocia y desasocia de forma idempotente, recorre dos páginas con cursor y comprueba que borrar un extremo vinculado responda 409. Con autenticación habilitada verifica acceso anónimo, tokens inválidos y permisos sobre ambos extremos para cada rol. Una relación sin API u operaciones de creación hace fallar la prueba: no se omite silenciosamente.

La limpieza intenta eliminar únicamente los vínculos y registros creados por la prueba. Ejecútala exclusivamente sobre bases aisladas: no es una prueba de producción ni de carga. Los límites HTTP del sandbox se amplían para evitar que la cantidad de casos cause falsos fallos; esto no sustituye las pruebas específicas de rate limiting.

El resultado incorpora `protocolo: runtime-v2-associations`. Los backends y paquetes N:M con evidencias anteriores deben volver a verificarse. La versión del protocolo no significa que se hayan validado todas las reglas de negocio, RNF o carreras concurrentes.

Las pruebas de I-CASE comprueban el protocolo con dobles en memoria. Solo una ejecución Docker satisfactoria constituye evidencia contra el motor real; sin Docker, la aprobación sigue bloqueada. El smoke se ejecuta también cuando se verifica la suite o el paquete integrado, antes de las otras pruebas.

Para reproducirlo desde `icase-backend/`, con Docker accesible:

```text
npm run verify:nm -- Express PostgreSQL
npm run verify:nm -- Express MySQL --full
npm run verify:nm -- Express MongoDB --full
npm run verify:nm -- NestJS MongoDB --full
npm run verify:nm -- "Spring Boot" MySQL --full
```

El script genera una biblioteca sintética con autores, libros y una relación N:M, además de roles lector/editor y administrador. No consume claves IA ni datos de la aplicación. `--full` añade React y Playwright: el caso N:M selecciona extremos en el panel, asocia, verifica persistencia mediante API y desasocia. Una pantalla u operación faltante hace fallar el caso, sin convertirlo en una prueba omitida. `--no-auth` permite verificar la variante pública.

Cada ejecución guarda un JSON con huella de archivos, fecha UTC, pasos y salidas recortadas en `icase-backend/verification-results/nm/` (excluido de Git). `--verbose` imprime más detalle. El entorno se elimina al finalizar: únicamente contenedores, redes, volúmenes e imágenes temporales de esa ejecución; las imágenes base y cachés de Docker pueden permanecer. Por defecto y con `--full` se usa el Compose del verificador.

### Arranque del Compose exportado

```text
npm run verify:nm -- Express MongoDB --exported
npm run verify:nm -- NestJS MySQL --exported
npm run verify:nm -- "Spring Boot" PostgreSQL --exported
```

`--exported` añade la infraestructura generada y ejecuta también los Dockerfiles y el Compose incluidos en ella. La verificación del artefacto `paquete_entrega` incluye esta fase automáticamente. Tras construir y arrancar los servicios comprueba HTTP, CRUD, permisos, N:M y Playwright sobre el despliegue exportado.

Un overlay temporal solo deshabilita puertos publicados, configura una red interna y añade los ejecutores de prueba. Las variables de configuración se rellenan con credenciales temporales y orígenes/límites apropiados a las pruebas. No se reemplazan los comandos, Dockerfiles, entrypoints ni imágenes de backend, frontend o base. Requiere Compose compatible con `!reset`; la eliminación de puertos sigue la [semántica oficial de merge de Docker](https://docs.docker.com/reference/compose-file/merge/).

Antes del arranque se revisa la configuración resuelta: se rechazan montajes fuera del directorio temporal, volúmenes externos o no exclusivos, privilegios ampliados, redes no aisladas y tags de build ajenos. El resultado incorpora `protocolo_despliegue: compose-exportado-v1`; las verificaciones anteriores del paquete deben repetirse antes de aprobarlo. Este control no sustituye la declaración de alcance funcional ni la auditoría de seguridad. Tampoco prueba puertos publicados, dominio/TLS, HA, backups o producción.

## Preparación de entornos y datos

### Auditoría reproducible de dependencias Node

Desde `icase-backend/`, con Docker disponible:

```text
npm run audit:generated -- NestJS
npm run audit:generated -- Express
npm run audit:generated -- NestJS --nest-version=^12.3.2
```

El script genera únicamente el package.json de prueba, resuelve su lockfile dentro de un contenedor Node y consulta `npm audit --json`. No instala dependencias en I-CASE ni modifica decisiones o artefactos existentes. Conserva el informe y el lockfile en `verification-results/audit/`, excluidos de Git. Devuelve código 1 ante alertas altas/críticas o un error de auditoría. La opción candidata solo cambia el manifiesto temporal y no demuestra compatibilidad de compilación o ejecución.

Este informe CLI incluye también dependencias de desarrollo. La compuerta Docker de entrega usa `--omit=dev`, mientras que el CI mantiene su auditoría más amplia. No confundir los resultados entre alcances ni presentar una ausencia de avisos como garantía absoluta. La caché de auditoría se invalida con un argumento temporal por ejecución, conforme al mecanismo de [invalidación de Docker](https://docs.docker.com/build/cache/invalidation/).

### Datos de prueba

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
