# Resultados, evidencias y hallazgos

Consulta la [evaluación del análisis inicial y su revisión de calidad](analisis-inicial-calidad.md) para las pruebas de la nueva integración y sus límites de aceptación.

## Cómo interpretar este registro

Los resultados históricos siguientes proceden de verificaciones reportadas durante el desarrollo. No constituyen una ejecución nueva de IA sobre todas las pantallas ni una medición de producción. Una verificación nueva debe registrar revisión Git y salida completa.

| Ejecución histórica | Resultado observado | Alcance y límite |
| --- | --- | --- |
| Suite Jest de backend, 19/10/2026 | 155 pruebas correctas, una omitida | Regresión del estado de código de esa ejecución |
| Build de I-CASE frontend, 19/10/2026 | Correcto; advertencia de chunks grandes | Compilación, no certificación de usabilidad |
| NestJS/PostgreSQL genérico | Arranque y CRUD correctos | Caso sintético de biblioteca |
| Express/MongoDB genérico | Arranque y CRUD correctos | Prueba de humo del backend |
| React/Expo genéricos | Build web y bundle Android correctos | No prueba en dispositivo ni APK firmado |
| Integral biblioteca con Docker | Servicios saludables; trazabilidad e integración correctas; tres pruebas Playwright correctas | Contrato CRUD y navegación de dos pantallas |

No se conservaron en esta carpeta los logs originales de esas ejecuciones; no presentar esta tabla como un informe firmado ni asociarla a un commit inexistente. La validación actual del portal se registra en [Evidencias de documentación](evidencias-documentacion.md).

## Ejecución real N:M — 1 de noviembre de 2026

Se ejecutó `scripts/verify-associations-runtime.js` contra Docker Engine 28.4.0, desde el árbol de trabajo sin un nuevo commit. Caso sintético determinista: biblioteca con autores/libros, una relación N:M, roles lector/editor y administrador; sin generación IA ni reglas de negocio específicas adicionales.

| Backend generado | Motor real | Arranque, CRUD, permisos y N:M HTTP | React y Playwright |
| --- | --- | --- | --- |
| Express | PostgreSQL | Correcto | Correcto, incluida interacción N:M |
| Express | MySQL | Correcto | Correcto, incluida interacción N:M |
| Express | MongoDB con replica set | Correcto | Correcto, incluida interacción N:M |
| NestJS | PostgreSQL | Correcto tras corregir tipos de Express | No ejecutado en esta combinación |
| NestJS | MySQL | Correcto | No ejecutado en esta combinación |
| NestJS | MongoDB con replica set | Correcto | Correcto, incluida interacción N:M |
| Spring Boot | PostgreSQL | Correcto | No ejecutado en esta combinación |
| Spring Boot | MySQL | Correcto | Correcto, incluida interacción N:M |

Los casos completos ejecutaron nueve pruebas Node correctas y siete pruebas Playwright correctas. Una prueba Playwright de validación junto al campo quedó omitida porque este caso no declara reglas de campos; el escenario N:M sí se ejecutó. No confundir esa omisión con una cobertura de reglas inexistentes.

Hallazgo corregido: NestJS no compilaba por `TS7016`, al faltar `@types/express` para las declaraciones del limitador HTTP. El generador incorpora ahora tipos compatibles con Express 4 y hay regresión automatizada. También se corrigió el diagnóstico para conservar errores TypeScript que antes quedaban ocultos por la traza de BuildKit.

La instalación de NestJS reportó siete vulnerabilidades de dependencias (tres altas) en una de las compilaciones. La verificación funcional fue correcta, pero **no constituye aprobación de seguridad**; queda pendiente investigar y resolver la auditoría, sin aplicar actualizaciones mayores a ciegas.

Los informes locales de las ejecuciones posteriores a incorporar su almacenamiento están en `icase-backend/verification-results/nm/`, con fecha UTC, huella de archivos y salidas recortadas. Las primeras ejecuciones quedaron en la consola de esta sesión. La carpeta está excluida de Git; conservar los JSON por separado si se requieren como entregables. Los recursos temporales de cada ejecución se eliminaron al terminar, sin operar sobre la base de I-CASE.

Límites de esta primera tanda: no se probó IA real, datos del restaurante, carga, carreras concurrentes exhaustivas ni despliegue productivo. Se usó el Compose del verificador; la comprobación adicional de los archivos exportados se registra a continuación. El caso sintético no aprueba automáticamente los artefactos de otros proyectos ni garantiza todos sus RF/RNF.

### Verificación adicional del Compose exportado

El mismo caso se ejecutó con `--exported`, usando los Dockerfiles y Compose de entrega y un overlay de aislamiento (sin puertos al host, red interna, secretos temporales y ejecutores de prueba).

| Archivos exportados | Compilación y arranque | CRUD, permisos y N:M | Integración y navegador |
| --- | --- | --- | --- |
| Express + MongoDB autenticado, replica set de un nodo | Correcto | Correcto | Correcto |
| NestJS + MySQL | Correcto | Correcto | Correcto |
| Spring Boot + PostgreSQL | Correcto | Correcto | Correcto |

Se conservaron informes `*-exported-auth-*.json` en la carpeta local de evidencias. Incluyen el protocolo `compose-exportado-v1`, separado del protocolo HTTP N:M. La inicialización autenticada de MongoDB y su clave interna persistida se ejercieron realmente en contenedores temporales; esto no equivale a alta disponibilidad ni a comprobar una recuperación tras pérdida de datos.

La ejecución no altera el Compose del paquete: el overlay únicamente lo aísla y le aporta la configuración de prueba. No se han ensayado todas las combinaciones exportadas, puertos publicados, TLS ni despliegues productivos. Las alertas de dependencias de NestJS y la validación de RF/RNF particulares continúan pendientes.

## Auditoría de dependencias — 1 de noviembre de 2026

Se auditó el package.json generado dentro de un contenedor Node 22, conservando informe y lockfile locales. Las candidatas solo modificaron un manifiesto temporal: no se migraron proyectos ni se cambió la base del generador.

| Manifiesto auditado | Moderadas | Altas | Críticas | Total |
| --- | --- | --- | --- | --- |
| NestJS 10, base anterior | 4 | 3 | 0 | 7 |
| Candidata NestJS `^11.1.18` | 0 | 2 | 0 | 2 |
| Candidata NestJS `^12.3.2` | 0 | 0 | 0 | 0 |
| Express, base actual | 0 | 0 | 0 | 0 |

Los avisos incluyen dependencias transitivas como Multer y body-parser. El [aviso revisado de NestJS core](https://github.com/advisories/GHSA-36xv-jgw5-4q75) documenta una corrección en 11.1.18, pero corregir ese aviso no elimina todos los problemas de la plataforma: la candidata 11 todavía presentó alertas altas. El informe local refleja la base de avisos consultada en esa fecha, no una certificación permanente.

Se añadió una auditoría obligatoria durante las verificaciones y construcciones Node. Una ejecución real con NestJS 10 quedó correctamente bloqueada por `npm audit --omit=dev --audit-level=high`. Express/MongoDB volvió a pasar el despliegue exportado completo con navegador y la evidencia `npm-audit-prod-high-v2`, usando un nonce distinto en cada construcción para no reutilizar una auditoría en caché. Las evidencias funcionales anteriores de Node deben renovarse: no cubrían esta compuerta.

Tras la autorización se implementó la base NestJS 12.3.2, fijando los tres paquetes principales, tipos Express 5 y Node.js 22.12+ o 24+. Se mantiene CommonJS con un Node compatible, según la [guía oficial de migración](https://docs.nestjs.com/migration-guide). Las decisiones que fijan otra versión requieren revisión; los proyectos exportados no se modifican. No se aplicaron overrides incompatibles ni `audit fix --force` para ocultar los avisos.

La nueva base pasó en Docker con PostgreSQL: compilación TypeScript, arranque con health checks, CRUD, relaciones N:M, permisos y autenticación; nueve pruebas de integración y siete de navegador correctas, con una omitida por no haber reglas de negocio en el caso sintético. La auditoría de producción no encontró vulnerabilidades en esta ejecución. La evidencia está en `verification-results/nm/NestJS-PostgreSQL-full-auth-1793555155682.json`. Esta prueba determinista no acredita generación con IA ni requisitos específicos de otro proyecto.

También pasaron **NestJS 12.3.2 + MySQL** y **NestJS 12.3.2 + MongoDB** con `--exported`: compilación y arranque de los Dockerfiles/Compose del paquete, comprobaciones HTTP, CRUD, N:M, permisos y pruebas de integración/navegador. Ambas ejecuciones renovaron la auditoría obligatoria de dependencias y terminaron sin errores. Informes: `NestJS-MySQL-exported-auth-1793559937840.json` y `NestJS-MongoDB-exported-auth-1793559940287.json`, en `verification-results/nm/`. Se retiraron los contenedores, volúmenes e imágenes temporales de estas pruebas. La suite local final terminó con **545 pruebas correctas y una omitida**, en 52 suites correctas y una omitida.

Los informes JSON y lockfiles están en `icase-backend/verification-results/audit/`. El umbral bloqueante es alto/crítico, y la evidencia renovada usa `npm-audit-prod-high-v2`. La auditoría de las dependencias de la plataforma I-CASE, Maven e imágenes base queda fuera de esta ejecución.

## Evidencias adicionales pendientes

### Historial, recuperación, aislamiento, diversidad y CI real — 1 de noviembre de 2026

Las pruebas ampliadas con HTTP/MongoDB reales terminaron con **8 comprobaciones correctas y 2 fallidas**. Funcionaron el historial secuencial, restaurar sin guardar, invalidación de dependientes, sesión caducada/revocada, recuperación de diagramas tras reiniciar y conservación de requisitos ante fallo IA. Se rechazaron 11 accesos cruzados, con controles positivos del propietario, incluida descarga de un ZIP real verificado. Los fallos IA/Docker fueron simulados solo en el proceso de pruebas; no se apagó el motor Docker.

Se reprodujeron dos defectos: guardados concurrentes pueden perder una edición pese a responder ambos HTTP 200; una verificación interrumpida puede seguir en `procesando` tras reiniciar hasta que se solicita un reintento explícito. No se corrigieron dentro del ensayo.

La extracción de un PDF sintético de clínica y la transcripción de audio sintético de biblioteca funcionaron. Se probaron Gemini y Groq con ambos insumos. Biblioteca/Gemini llegó a seis diagramas estructuralmente válidos; clínica/Groq se bloqueó en diagramas por el presupuesto de contexto. Biblioteca/Groq devolvió 12 RF sin evidencia literal válida. Estas pruebas no acreditan ZIP de ambos dominios ni audio humano en condiciones de ruido.

Se revisaron visualmente las **23 páginas** del PDF. Falta clases de diseño por discrepancia entre `designClassDiagram` y `designClasses`; hay cabeceras recortadas, saltos de página deficientes y solapamientos en algunos mockups. La trazabilidad mostrada es excesiva y mezcla RNF bajo el rótulo RF. La extracción y descarga válidas de ensayos anteriores no detectaban estos defectos visuales/semánticos.

Con autorización se publicó únicamente el ZIP limpio en [ManuelNKI/icase-test](https://github.com/ManuelNKI/icase-test), commit `e30d7c2e830d31fa98b457f749744ee0f0aa0704`. [GitHub Actions ejecutó el workflow real](https://github.com/ManuelNKI/icase-test/actions/runs/41348939484): compilaciones de backend/frontend y bundle Android correctos; fallo en auditoría de dependencias por la alerta alta de Playwright [GHSA-7mvr-c777-76hp](https://github.com/advisories/GHSA-7mvr-c777-76hp). `test` y `package` se omitieron. No hubo despliegue cloud ni se deshabilitó la auditoría para forzar éxito.

Evidencias y alcance detallados: `verification-results/extended/resultado.md`, `resilience.json`, `diversidad.json`, `visual.json`, imágenes de las 23 páginas, `ci-github.json` y `ci-failure.log`. Las 49 pruebas locales de regresión seleccionadas también pasaron, pero no sustituyen los defectos detectados por estas pruebas reales.

### ZIP parcial descargado y ejecutado — 1 de noviembre de 2026

Se confirmó explícitamente la entrega parcial del fixture sintético por la interfaz, conservando las capacidades y RF pendientes en el informe. Tras regenerar y verificar los artefactos afectados, Chromium descargó un ZIP de **659.528 bytes**. No se editó manualmente el código generado para superar las pruebas.

El ZIP se extrajo con controles de rutas y tamaño. Se verificaron **102 huellas SHA-256** del manifiesto antes y después del ensayo. Su Compose y Dockerfiles pasaron compilación, arranque de PostgreSQL/backend/frontend, disponibilidad HTTP, operaciones CRUD, permisos, relaciones declaradas y pruebas de integración/navegador. Las dos ejecuciones independientes terminaron **aptas**, sin reconstruir artefactos desde MongoDB ni llamar a la API de iCase. No se acredita que todos los servicios locales estuvieran apagados: la comprobación de puertos detectó un servicio aún disponible y no se detuvieron procesos sin atribución segura. El overlay solo aisló puertos/red/credenciales y añadió clientes de prueba; no sustituyó fuentes ni Dockerfiles del ZIP. También se comprobó la carga de configuración de los comandos documentados desde raíz y ops.

Evidencias: `verification-results/zip-delivery/resultado.md`, `resumen.json`, `arranque.json`, capturas y `entrega.zip`. La conclusión es **entrega parcial ejecutable**, no cobertura completa del restaurante, despliegue productivo, ejecución real de CI/CD ni aplicación móvil probada en dispositivo. Las afirmaciones de ensayos anteriores donde el ZIP quedó bloqueado describen su estado histórico; no se deben borrar ni confundir con este ensayo posterior con aceptación explícita de limitaciones.

### Comprobaciones de interacción y descarga — 1 de noviembre de 2026

Sobre el fixture aprobado se ejecutó Chromium automatizado con **14 comprobaciones correctas, ninguna fallida y ningún error JavaScript no capturado**. Se comprobó inicio de sesión, sidebar de requisitos sin reprocesamiento, seis pestañas con código/gráfico SVG e historial, zoom/restablecimiento cuando está disponible, vuelta a requisitos, mockup visual/código, aprobación y navegación a codificación, compuerta de entrega parcial, descarga PDF y persistencia tras recarga.

La comparación antes/después conservó exactamente contenido, identificadores, versiones y estados de requisitos/diagramas, así como HTML/versiones de mockups. No se realizaron llamadas de generación IA durante este ensayo. La única solicitud de generación fue el intento deliberado del paquete, rechazado con HTTP 400 por cobertura parcial no confirmada.

Descargas reales recibidas por Chromium: HTML del mockup (4.330 bytes) y PDF (783.160 bytes, 23 páginas, 22.506 caracteres extraíbles). Se comprobaron formato y contenido del archivo. No certifica fidelidad visual de todas las páginas, todas las resoluciones ni restauración de versiones históricas. **La descarga positiva de ZIP y su arranque siguen sin acreditarse.**

Evidencias: `verification-results/ui-interactions/resultado.md`, `report.json`, capturas numeradas, `mockup.html` y `documento.pdf`. Los scripts `ui-interaction-checks.cjs` y `summarize-ui-interactions.cjs` registran el ensayo local; la sesión/credenciales privadas no deben publicarse.

### Corrección y repetición del HTML de mockups — 1 de noviembre de 2026

El análisis de los tres HTML rechazados mostró un falso diagnóstico de truncamiento: tenían `<<!DOCTYPE html>` y/o un `>` adicional después del cierre. Se añadió normalización limitada de delimitadores/cercos antes de sanitizar y decidir reparaciones. No se inventan cierres perdidos ni contenido. También se rechazan respuestas que Gemini u otros proveedores declaran cortadas por límite de salida; la reparación aislada recibe ahora el HTML anterior y los defectos concretos.

Los tres HTML originales pasan al normalizarse, sin llamadas a IA. En una repetición por interfaz con Gemini sobre los seis diagramas ya aprobados, se generaron **12 mockups válidos y ninguno inválido**, frente a tres inválidos antes. Las reparaciones automáticas aisladas pasaron de cuatro a una; la aprobación respondió HTTP 200 y abrió planificación de código. No hubo ediciones manuales del HTML entre generación y aprobación. Es un ensayo, no una garantía de que toda salida futura sea válida.

Se preservaron las evidencias anteriores. La repetición está en `verification-results/mockups-html-v2/`, incluidos capturas, HTML, trabajos y `resultado.md`. Solo se renovó la contraseña de la cuenta sintética para recuperar acceso tras reiniciar el backend; no se alteraron cuentas reales ni artefactos aprobados. La suite local terminó con **563 pruebas correctas y una omitida**.

Un recorrido adicional desde cero se bloqueó antes de mockups: los casos de uso omitieron RF-08 incluso tras su reparación automática. Por eso la repetición focalizada no debe presentarse como un flujo nuevo completo exitoso. La continuación desde el fixture aprobado se registra por separado en `verification-results/real-ui-code/`.

La continuación por interfaz llegó hasta CI/CD: backend, frontend y pruebas quedaron aprobados tras verificaciones de ejecución en Docker (incluido bundle Android; no se ensayó en dispositivo). Infraestructura y pipeline quedaron aprobados con verificación **estructural**, no con un despliegue productivo ni ejecución de GitHub Actions. La generación del paquete final fue rechazada: «Confirma la entrega parcial y sus limitaciones en la etapa Módulos; regenera el backend». No se confirmó esa excepción ni se regeneraron artefactos para eludirla. **No hubo ZIP descargado ni arranque de una entrega exportada en este recorrido.** Los estados, cobertura y motivos quedan en `real-ui-code/verificaciones.json`, `report.json` y `resultado.md`.

### Primer recorrido con IA real e interfaz — 1 de noviembre de 2026

Se probó el escenario de restaurante mediante Chromium automatizado en Docker, backend real y MongoDB separado (`icase_real_ui`). Se cargó un TXT por la interfaz, se crearon usuario/proyecto de prueba y se aceptaron las propuestas iniciales sin editar ni regenerar manualmente artefactos. El enrutamiento automático utilizó Gemini `gemini-3.5-flash-lite`.

- Se obtuvieron 15 requisitos (10 RF y 5 RNF) y se aprobaron los seis diagramas mediante la interfaz.
- La arquitectura de software y las clases de diseño necesitaron la reparación automática controlada ya implementada. No equivale a que el primer resultado bruto del modelo fuera correcto.
- Se generaron 12 mockups: tres quedaron inválidos porque el validador detectó HTML incompleto/truncado (gestión de platos agotados, registro de pedidos y validación de reserva).
- La aprobación fue rechazada con HTTP 400. El control bloqueó correctamente el avance; no se corrigieron las pantallas para hacer pasar la prueba.
- **No se alcanzaron codificación, descarga ZIP ni arranque del proyecto generado. Este recorrido no acredita una entrega completa.**

Además se detectaron RF que agrupan objetivos independientes, cambio del nombre del proyecto durante el modelado y una etiqueta de aprobación que anuncia Documento aunque el manejador dirige a planificación de código. Se requiere revisar estos puntos sin confundirlos con fallos del navegador de prueba.

Las evidencias locales están en `icase-backend/verification-results/real-ui/`: capturas, `report.json`, `resultado.md`, `artefactos.json` y HTML de mockups. La sesión `browser-state.private.json` es privada y no debe compartirse. Los scripts `real-ui-flow.cjs` y `collect-real-ui-evidence.cjs` permiten inspeccionar este ensayo aislado; no son aún una suite general de CI ni un recorrido automatizado completo hasta ZIP.

Se incluye la captura real de acceso en el manual. No acredita el flujo autenticado ni una generación IA completa.

- Capturas del caso de estudio por una persona usando la interfaz.
- Prueba de carga sobre una funcionalidad de I-CASE.
- Comparativa de artefactos iniciales con modelos reales y prompt versionado.
- Fidelidad del PDF respecto al panel en varios tamaños y navegadores.
- Validación de reglas específicas del negocio y autorización multiusuario.

Estas tareas no se consideran realizadas por existir un plan o un generador de pruebas.

## Hallazgos actuales

| ID | Severidad | Hallazgo y causa | Evidencia de código | Recomendación |
| --- | --- | --- | --- | --- |
| H01 | Alta | Autenticación no obligatoria en varios routers | proyectoRoutes, fuenteRoutes, requerimientoRoutes, diagramaRoutes, mockupRoutes | Proteger rutas y comprobar propiedad del recurso |
| H02 | Alta | Secreto JWT de respaldo si falta configuración | authMiddleware | Exigir secreto al desplegar |
| H03 | Alta | CRUD genérico no implementa invariantes de RF | GenericBackendGenerator | Modelos, reglas y pruebas semánticas antes de producción |
| H04 | Media | URL local de API fija | frontend/src/services/api.js | Configuración por entorno |
| H05 | Media | Verificación prolongada dentro de petición | GestionarArtefactosCodigo | Trabajo persistente con progreso y recuperación |
| H06 | Media | Evidencias de carga y UI no completadas en esta entrega | Este registro | Ejecutar y adjuntar resultados reproducibles |
| H07 | Baja | Bundle de frontend con chunks grandes | Build histórico | Revisar división de carga y medir impacto real |

La severidad es una evaluación documental y debe confirmarse por el equipo al gestionar las incidencias.

## Repetición correctiva del 1 de noviembre de 2026

Se corrigieron y reprodujeron los fallos de edición concurrente de diagramas y recuperación de verificaciones interrumpidas. La batería HTTP/MongoDB aislada pasó de 8 correctas y 2 fallidas a **11 correctas y 0 fallidas**. Los fallos de IA/Docker de esta batería son inyectados. La suite del backend completó **572 pruebas correctas y una omitida**; el frontend compiló con advertencias de tamaño de chunks.

La exportación corregida descargada mediante navegador contiene 24 páginas y las seis secciones de diagramas, incluida clases de diseño. Se comprobó visualmente la cabecera larga de la página 5. Queda pendiente la aprobación visual completa de los mockups.

Se validó Playwright 1.56.1 en Docker con NestJS/PostgreSQL y navegador. La candidata móvil Expo 58.0.22 completó el bundle Android: su auditoría no detectó altas/críticas, pero mantiene 11 moderadas; no se probó un dispositivo real. El CI externo se ejecuta únicamente en el repositorio autorizado `ManuelNKI/icase-test`. Las entregas anteriores no se consideran recertificadas por estos cambios.

Evidencia local: `icase-backend/verification-results/correcciones/resultado.md`, `despues.json`, `documento-corregido.pdf` y `mobile-bundle.json`. Estas pruebas no resuelven por sí mismas los pendientes semánticos y de diversidad de modelos de la auditoría anterior.

La repetición de [CI en GitHub Actions](https://github.com/ManuelNKI/icase-test/actions/runs/41365333719), commit `d284bdb`, terminó correctamente en sus tres jobs: validación, pruebas y empaquetado. Incluyó arranque Docker, integración y navegador. Se fijó Ubuntu 24.04 por incompatibilidad de Playwright con el nuevo `ubuntu-latest`, y se ajustaron exclusivamente los límites de solicitudes del entorno de pruebas. La auditoría de dependencias sigue activa. No equivale a despliegue cloud ni a validación funcional exhaustiva; el paquete CI no incluye el cliente móvil ni un APK.

## Corrección de presentación del PDF

La comparación del HTML original y su captura reprodujo un solapamiento causado por pérdida de fuentes en el SVG de html2canvas. Se corrigió incrustando y reponiendo las fuentes tras el clonado. La pantalla comparada se revisó visualmente sin el solapamiento anterior. El PDF final normal tiene 25 páginas, seis secciones de diagramas y 12 títulos de mockups con su epígrafe en la misma página. Se separan referencias RF/RNF y se aclara que las aprobaciones no constituyen certificación normativa. Nueve pruebas específicas pasaron; build del frontend correcto. Una ejecución intermedia detectó omisión de diagramas al fallar PlantUML; se añadió respaldo textual con aviso. La cobertura excesiva de RF y la revisión visual del resto de pantallas siguen pendientes. Evidencias en `verification-results/correcciones/documento-final-respaldo*` y `mockup-original-navegador.png`.

## Reevaluación de trazabilidad local

Se sustituyó la coincidencia de cualquier palabra del requisito por evidencia local: se excluyen navegación compartida, CSS, scripts y metadatos globales; con HTML disponible no bastan etiquetas declaradas por la IA. Las referencias heredadas se recalculan y las referencias antiguas sin evidencia no contribuyen a la cobertura. Las discrepancias de roles siguen siendo advertidas por el auditor, sin inventar equivalencias entre nombres de actores.

La reevaluación de las 12 pantallas guardadas pasó de 96 asociaciones anteriores a 12 candidatas; no se modificó la base de datos ni se invocó a IA. Evidencia: `verification-results/correcciones/trazabilidad-local.json`. Es una heurística conservadora, no una prueba de cobertura completa; los requisitos compuestos y los sinónimos pueden requerir revisión. Se aplica al generar, aprobar o auditar nuevamente; no reescribe silenciosamente entregas anteriores. La generación de frontend respeta una lista corregida vacía y no vuelve a heredar referencias del árbol.

Validación final del bloque: 41 pruebas relacionadas correctas en cuatro suites.

## Repetición con IA real y nuevos filtros

Se repitió desde un insumo nuevo con Gemini 3.5 Flash-Lite y Chromium en bases aisladas. Un primer intento quedó bloqueado en casos de uso; se corrigió un falso rechazo reproducible del validador. El segundo generó 15 requisitos, seis diagramas y 15 mockups. Las pantallas reales revelaron falsos negativos por encabezados locales eliminados, interpretación de `overflow-hidden`, estados en plural y nombres descriptivos de actores. Se añadieron regresiones y se corrigió el filtro sin editar el HTML generado.

La aprobación desde interfaz respondió HTTP 200 y se confirmó planificación de código. Los hashes de los 15 HTML permanecieron iguales. El control negativo, ejecutado únicamente en memoria, retiró el contenido del RF-01 y el auditor detectó su ausencia. Persisten advertencias sobre detalle de plato y nueva reserva, y se identificó que la reserva no evidencia claramente elegir mesa/silla. No se considera cobertura funcional completa ni validación de código/ZIP. Evidencias locales: `verification-results/traceability-real-replay-v2/resultado.md`, `controles.json` y capturas; el intento inicial bloqueado se conserva aparte.

La suite completa posterior finalizó con **588 pruebas correctas y una omitida**, sin fallos, en 56 suites correctas. Evidencia: `verification-results/traceability-real-replay-v2/jest.json`.

## Criterios funcionales concretos de los mockups

Se añadió validación estática del HTML para campos enumerados, opciones, determinadas acciones explícitas y estados enumerados. Se inspeccionan controles locales con parse5, sin ejecutar scripts; no bastan metadatos ni texto descriptivo. Los criterios explícitos omitidos de RF altos bloquean; las alternativas inferidas solo advierten. El mismo contrato se incluye en el contexto de futuras generaciones.

La reevaluación de las 15 pantallas reales detectó tres criterios, con evidencia para uno: efectivo/transferencia. Se advierte por mesa/silla y por falta de una acción identificable de escaneo QR. No se modificaron HTML ni aprobaciones persistidas. La interfaz distingue vínculo RF de evidencia de criterios. Suite completa: 596 pruebas correctas y una omitida; nueve pruebas específicas pasaron tras añadir otra prueba del contexto. Build frontend correcto. Evidencia: `verification-results/traceability-real-replay-v2/cobertura-funcional.md` y `cobertura-funcional.json`. Falta repetir generación real con el nuevo contexto; no se acredita funcionamiento de los controles en ejecución.

## Regeneración con criterios UI en el contexto

Se regeneraron con Gemini 3.5 Flash-Lite los 15 mockups de una copia aislada del proyecto, manteniendo requisitos y diagramas. Una única generación terminó con 15 HTML nuevos en versión 2. La evidencia de criterios mejoró de 1/3 a 2/3: ahora existe la elección mesa/silla y se conserva efectivo/transferencia; escaneo QR sigue pendiente de revisión. No se forzó aprobación: un HTML de cocina quedó truncado y persisten conflictos de asociaciones/roles en RF-01 y RF-10. No se certifica una entrega completa ni un ZIP nuevo. Evidencias: `verification-results/mockups-functional-repeat/resultado.md`, `comparacion.json` y `revision-final.png`.

## Reparación controlada de mockups

Se implementó el modo `soloReparar` en los trabajos persistentes y el botón Reparar pendientes. Limita la ejecución a cinco pantallas y un intento por pantalla, conserva originales si no hay mejora y registra historial para cambios aceptados. Los guardados usan comparación atómica del diseño para no sobrescribir ediciones concurrentes.

La prueba real por Chromium/Gemini intentó únicamente cocina truncada y escaneo QR. Ninguna propuesta superó los controles: se conservaron los 15 HTML y versiones, sin forzar aprobación. No se presenta la finalización del trabajo como reparación funcional exitosa. El caso positivo de guardado se verifica con pruebas deterministas. Evidencia: `verification-results/mockup-repair-real/resultado.md` y `comparacion.json`.

Suite completa: 609 pruebas correctas, una omitida y 59 suites correctas. Build frontend correcto con advertencias de tamaño de chunks. Evidencia: `verification-results/mockup-repair-real/jest-final.json`.

## ZIP nuevo y ejecución de los archivos descargados

Se copió el proyecto sintético previamente aprobado a una base aislada sin copiar código ni verificaciones. Se generaron, verificaron y aprobaron los seis artefactos actuales y se descargó el ZIP por el endpoint normal. El archivo tiene 662531 bytes y se comprobaron 102 huellas SHA-256 antes/después de ejecutarlo.

La ejecución con los Dockerfiles y Compose del ZIP pasó compilación, arranque, HTTP, CRUD/permisos, integración y navegador (16 pruebas correctas y una omitida). El contrato de esta entrega no contiene asociaciones N:M; no se acreditan escenarios N:M por la etiqueta genérica del verificador. Los tres comandos documentados resolvieron correctamente sus variables de prueba. Se confirmaron Playwright 1.56.1, Expo 58 y Ubuntu 24.04 en el contenido descargado.

Es una **entrega parcial ejecutable**, no el restaurante completo: mantiene capacidades y confirmaciones RF pendientes previamente aceptadas. No se ejecutó CI/CD remoto nuevo ni despliegue cloud. No se acreditó que el puerto de iCase estuviera apagado; el despliegue ejercitado usa sus propios servicios en red Docker interna. Evidencias: `verification-results/zip-current/resultado.md`, `arranque.json`, `resumen.json` y `entrega.zip`.

## Eventos de cambios: bloque experimental backend

Se añadió el módulo opcional `eventos_cambios`, desactivado por defecto, para Express/NestJS con JWT. Publica invalidaciones de CRUD sin registros ni datos personales y revalida sesión/permisos antes de emitir. Las pruebas usan servidor HTTP/clientes Socket.IO reales con núcleo de permisos simulado; cubren conexiones y suscripciones denegadas, escrituras fallidas y pérdida de permisos/sesión. Suite completa: 619 pruebas correctas y una omitida.

Este resultado no acredita Docker con el módulo activado, conexión React/Expo, proxy WebSocket, alta disponibilidad ni latencia. El catálogo conserva tiempo real como capacidad no completada. El ZIP anterior no se recertifica automáticamente. Evidencia: `verification-results/change-events/resultado.md` y `jest.json`.

## Plantilla de ejecución de casos

```text
ID de caso:
Fecha:
Responsable:
Commit:
Entorno (Node, navegador, MongoDB, Docker):
Proveedor/modelo efectivo y revisión del prompt, si aplica:
Datos utilizados (anonimizados):
Comando o pasos:
Resultado esperado:
Resultado obtenido:
Estado: correcto / fallido / no ejecutado
Duración y métricas:
Evidencia:
Hallazgos y seguimiento:
```
## Evaluación de requisitos · 7 de noviembre de 2026

### Corrección del fallback por presupuesto de entrada

Se añadió una alternativa compacta de extracción/redacción para Groq que conserva todo el insumo y las citas verificadas de los objetivos, con lotes ajustados al presupuesto de entrada. No se aumentó `GROQ_ANALYSIS_INPUT_BUDGET=3000`. El fallo de extracción por indisponibilidad ya no lanza otro borrador más grande; devuelve diagnóstico acotado por proveedor. Saturación, cuota y saldo insuficiente se distinguen. El 429 permite un solo reintento corto dentro del presupuesto global.

La comprobación final está en `icase-backend/verification-results/requirements-evaluation/2026-11-07T22-29-31-712Z/`: Groq generó 8 requisitos en 30.289 segundos y 5 solicitudes HTTP. Una espera indicada por el proveedor de 15.250 ms permitió recuperar la redacción del segundo lote. No se agotó el presupuesto global ni hubo bloqueos estructurales o evidencias no verificables. La auditoría semántica siguió pendiente por límite de entrada; la expectativa léxica de autenticación no encontró coincidencia. Por tanto, se acredita la recuperación operativa, no exhaustividad semántica ni el recorrido hasta ZIP. Los intentos previos incompletos también se conservaron. No se modificó `.env` ni se aprobaron proyectos de trabajo.

Se implementó el protocolo reproducible descrito en [Evaluación de requisitos](evaluacion-requisitos.md). Las nuevas pruebas HTTP reales con repositorios en memoria y los componentes React en JSDOM pasaron; no acreditan navegador ni persistencia MongoDB tras reiniciar.

Se ejecutaron llamadas reales con dos dominios sintéticos (archivo clínico y biblioteca). No se obtuvo una generación completa utilizable en esta sesión: Gemini informó alta demanda en los modelos configurados; un modelo alternativo fue rechazado por disponibilidad para la cuenta; Groq respondió a la extracción pero la redacción superó el presupuesto de entrada configurado. Una de sus solicitudes también alcanzó el límite de tokens por minuto. Una repetición clínica registró expresamente `limite_entrada_proveedor` en la etapa `redaccion_lote_1`. No se aumentaron límites para ocultar el bloqueo y no se aprobaron resultados fallidos.

Los informes de cada intento se guardaron en `icase-backend/verification-results/requirements-evaluation/`, bajo las carpetas fechadas `2026-11-07T21-43-09-857Z`, `2026-11-07T21-46-11-512Z` y `2026-11-07T21-49-19-662Z`. El intento previo dentro del sandbox terminó por restricciones de red y no mide la calidad del proveedor.

La prueba de navegador quedó `bloqueado_entorno`: Playwright/Chromium no estaban instalados en el entorno de ejecución; tampoco se obtuvo conexión del controlador de navegador ni del motor Docker. No se presentan los tests JSDOM como sustitutos de navegador. Falta ejecutar ese escenario en un entorno habilitado, resolver/evaluar el presupuesto de entrada de Groq y repetir las generaciones con cuota disponible antes de concluir sobre calidad semántica o mejoras comparativas. No se modificaron proyectos de trabajo ni la base activa.

### Seguimiento: navegador instalado y prueba ejecutada

### Nueva ejecución de la prueba pendiente

Las evidencias más recientes están en `verification-results/requirements-evaluation/2026-11-07T22-12-45-847Z/` (incluye `revision-manual.md`) y `verification-results/requirements-browser/2026-11-07T22-12-36-166Z/`. Chromium pasó cuatro comprobaciones sin errores JavaScript. Gemini produjo el caso clínico en 15.3 segundos (6 RF, 2 RNF), con aprobación estructural habilitada y métricas pendientes. Biblioteca tardó 27.8 segundos (4 RF, 3 RNF): faltan gestión de usuarios e inicio de sesión, y respaldo/recuperación queda solo como restricción. Distintos RNF comparten un objetivo incorrecto, por lo que la aprobación se bloquea. La auditoría semántica no señaló esas omisiones: se registró como falso negativo, no como éxito. Groq continuó limitado por presupuesto de entrada/cuota. Las pruebas de navegador y proveedores se ejecutaron por separado; no son el recorrido completo de App hasta ZIP. No se hicieron correcciones al producto durante esta ejecución.

Se incorporó `@playwright/test` como dependencia de desarrollo con versión fija y se descargó Chromium oficial mediante `npm run test:browser:install`. La caché está dentro de `node_modules` y no se versiona. La ejecución local ya no depende de Docker ni de la conexión externa del asistente.

La prueba real del navegador terminó correctamente en `icase-backend/verification-results/requirements-browser/2026-11-07T22-08-25-428Z/resultado.json`, con captura `revision.png`. Pasaron cuatro comprobaciones: validación desde el botón, bloqueo de aprobación con necesidad pendiente, corrección de fragmento mediante formulario y conservación de la resolución al recargar. No se registraron errores JavaScript. Durante la preparación se corrigió una duplicación de React en el empaquetado del escenario aislado, no en el producto. Los intentos fallidos anteriores se conservan como historial.

Este resultado acredita componentes productivos y API con repositorios en memoria, no navegación completa de `App`, MongoDB tras reiniciar, IA real, diagramas, ZIP o despliegue. Los bloqueos de proveedores descritos arriba siguen pendientes. La instalación npm informó diez vulnerabilidades en el árbol total de dependencias (tres altas); no se ejecutó `audit fix` ni se atribuyen automáticamente a Playwright.
