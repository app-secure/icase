# Calidad del análisis inicial: implementación y aceptación

## Comportamiento implementado

La extracción nueva valida citas y referencias, revisa el análisis completo y permite una sola reparación de contenido, seguida de verificación. Se conserva el original si la corrección no se puede verificar. Las señales léxicas son observaciones, no divisiones ni bloqueos automáticos. La revisión debe identificar los elementos revisados y justificar los candidatos a agrupación; una respuesta incompleta no aparece como ausencia de problemas.

Los trabajos admiten `revision_calidad` y `analisis_respuesta`, sin una cola adicional. La revisión de un borrador es una propuesta: no aplica cambios hasta que el usuario los confirma. Las respuestas se proponen en elementos editables y pueden introducirse manualmente si falla la IA; cada elemento conserva evidencia literal de la respuesta. El guardado es versionado y atómico respecto al puntero activo, reserva IDs históricos y pendientes y rechaza versiones o propuestas obsoletas. Se mantiene compatibilidad con la entrada antigua de un elemento.

Se reserva presupuesto para revisión y verificación, sin ampliar el máximo de solicitudes ni el tiempo configurado. Los checkpoints válidos se recuperan; una edición posterior marca la revisión de contenido como parcial. Los contratos vigentes son `initial-analysis-v2-quality`, `requirements-job-v7-initial-quality` y `requirements-stages-v6-initial-quality`. No se migran ni regeneran automáticamente análisis anteriores.

## Verificación ejecutada

El recorrido Chromium determinista comprueba respuesta propuesta antes de guardar, corrección desde diagnósticos, revisión sin reextracción, aplicación explícita, persistencia al recargar, navegación de consulta, foco de modales y viewport móvil. Evidencia final: `icase-backend/verification-results/initial-analysis-browser/2026-11-12T00-00-46-759Z` (incluye captura del modal móvil). Las cinco suites de `test:initial-analysis` suman 29 pruebas aprobadas; también pasaron las regresiones de requisitos, seguridad/calidad y resiliencia, la compilación frontend y la validación documental de 77 operaciones HTTP.

Las pruebas HTTP y unitarias cubren IDs pendientes/históricos, separación de categorías en respuestas, citas inexistentes, estados parciales, reparación sin verificación, reservas de presupuesto, versión obsoleta y ausencia de modificaciones automáticas sobre los requisitos existentes.

## Ensayos con Gemini real

Los ensayos usaron UI/API productivas con repositorios de prueba en memoria: no modificaron la base activa. Los resultados HTTP y de navegación no equivalen a aceptación semántica.

- Restaurante: `initial-analysis-browser/2026-11-11T23-47-28-695Z` y `2026-11-11T23-54-09-115Z`. Se observaron agrupaciones persistentes, omisiones y asociaciones de carga/latencia no sustentadas, pese a respuestas de auditoría inicialmente sin hallazgos. Esto motivó exigir justificación de candidatos y mantener señales orientativas.
- Biblioteca: `initial-analysis-browser/2026-11-11T23-47-42-812Z` detectó descripciones copiadas de plantilla. Se eliminó el texto de ejemplo de la instrucción principal y se añadió su detección. La repetición `2026-11-11T23-50-57-900Z` produjo descripciones concretas, pero encontró una referencia a objetivo inexistente y no continuó a requisitos. Se incorporó esa validación antes de revisar el inventario.
- Clínica: `initial-analysis-browser/2026-11-11T23-47-57-155Z` conservó el original cuando la reparación no se verificó. `2026-11-11T23-54-22-593Z` completó la navegación con necesidades concretas; siguen siendo necesarios criterios humanos sobre confirmaciones y responsabilidades.

La revisión aislada posterior reutilizó los artefactos, sin nuevas extracciones. En restaurante (`initial-analysis-quality/2026-11-11T23-57-18-561Z`) detectó dos agrupaciones y aplicó una reparación verificada: 3 solicitudes, 8,4 segundos. Biblioteca y clínica se registraron en `2026-11-11T23-57-39-670Z` y `2026-11-11T23-57-44-844Z`. Los directorios contienen `resultado.json` y `revision.json`, con estado, métricas e intentos del proveedor. Los tokens se registran cuando el proveedor los informa; no se estiman como medición real.

**Conclusión de aceptación:** la integración y los controles están implementados. La calidad semántica no está certificada como totalmente automática: los ensayos reales encontraron defectos que el usuario debe poder reconocer y revisar. Tampoco se acredita aquí persistencia tras reiniciar MongoDB, pues estos ensayos utilizan repositorios en memoria.

## Repetir

Desde `icase-backend`, ejecutar `npm run test:initial-analysis` y `npm run test:initial-analysis:browser` después de compilar el frontend. Para consumir IA real, añadir `--real` al script de navegador, con `--case=biblioteca-comunitaria`, `--case=archivo-clinico` o `--input-file=...`.

Para revisar un resultado guardado sin extraerlo otra vez: `node scripts/evaluate-initial-analysis-review.cjs --run-real --artifact=RUTA_ANALISIS_JSON --case=biblioteca-comunitaria` (o `--input-file=RUTA_FUENTE`). Requiere claves solo en el backend; no deben incluirse en informes ni comandos.
