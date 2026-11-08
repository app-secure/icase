# Evaluación de la generación de requisitos

El bloque de evaluación separa cuatro niveles. No deben presentarse como equivalentes:

- Pruebas unitarias y de regresión: contratos, evidencias, cobertura, reparación y decisiones.
- Integración HTTP real con repositorios en memoria: autenticación, aislamiento, persistencia durante la prueba y aprobación. No acredita persistencia MongoDB tras reiniciar.
- Componentes React productivos en JSDOM: botones, formularios, fallos y lectura. No es un navegador ni prueba visual.
- Proveedores reales y navegador real: ejecución opt-in, con resultados y bloqueos registrados por separado.

## Ejecución reproducible

Desde `icase-backend`:

```powershell
npm run test:requirements
npm run test:requirements:real -- --providers=gemini,groq
npm run test:requirements:browser
```

El evaluador real carga las credenciales del entorno sin imprimirlas, envía únicamente insumos sintéticos y no conecta MongoDB, aprueba requisitos ni modifica proyectos. Los casos versionados están en `tests/fixtures/requirements-evaluation.json`. Sus expectativas léxicas pertenecen exclusivamente a las pruebas, no al generador productivo. No se impone un número de requisitos.

Se puede limitar una ejecución:

```powershell
node scripts/evaluate-requirements-real.cjs --run-real --providers=gemini --case=archivo-clinico
```

`--model=IDENTIFICADOR` fija la lista de modelos solo para el proceso de evaluación y no modifica `.env`. Un modelo puede no estar disponible: ese resultado se registra como fallo, no se reemplaza silenciosamente por otro. OpenAI queda omitido si no hay credencial. No se debe interpretar una omisión o un límite de cuota como fallo semántico del generador.

Playwright está incluido como dependencia de desarrollo con versión fijada en `package-lock.json`. Tras instalar las dependencias de backend y frontend, prepara Chromium una vez:

```powershell
# Desde icase-backend
npm ci
npm run test:browser:install
npm run test:requirements:browser
```

El instalador oficial guarda Chromium en `icase-backend/node_modules/.cache/ms-playwright`, ignorado por Git. No cambia el navegador del usuario ni necesita Docker, la extensión de automatización o una conexión externa del asistente. La primera descarga requiere acceso a los servidores oficiales de Playwright. Después de `npm ci`, o al actualizar Playwright, puede ser necesario ejecutar de nuevo el instalador.

`PLAYWRIGHT_BROWSERS_PATH` permite usar una caché explícita y `REQUIREMENTS_PLAYWRIGHT_MODULE` indicar otro módulo instalado. El instalador y el ejecutor comparten la misma caché por defecto. Si falta el ejecutable, el informe termina como `bloqueado_entorno`, no como éxito. El servidor de prueba escucha solo en loopback, utiliza identidades sintéticas y repositorios en memoria. Ejercita `RequirementsView` y `RequirementReviewPanel` productivos con las rutas reales de revisión y aprobación; no es una prueba de toda la navegación de `App`, diagramas, ZIP o despliegue.

## Evidencias y métricas

Cada ejecución crea una carpeta nueva bajo `verification-results/requirements-evaluation` o `verification-results/requirements-browser`. Se conservan fecha, revisión del código, huella del insumo, proveedor/modelo solicitado, solicitudes, duración, presupuesto, controles y artefactos sintéticos cuando se obtienen. No se guardan claves ni sesiones de usuarios reales.

La cobertura léxica solo ayuda a seleccionar posibles omisiones para revisión humana. No calcula exactitud semántica, precisión de clasificación ni tasa real de invención. Estos indicadores requieren revisar cada resultado frente al insumo; obtener todas las palabras esperadas no demuestra que el requisito sea correcto. No se inventan consumo de tokens ni coste cuando el adaptador no los devuelve. Comparar ejecuciones exige el mismo hash de insumo, protocolo y configuración; los informes históricos de otros textos no son una línea base equivalente.

## Criterios de evaluación humana

- Revisar cada objetivo explícito: presente, omitido, incorrectamente agrupado o clasificado.
- Comprobar que los criterios no añadan reglas, periodicidades, cifras o tecnologías sin acuerdo.
- Verificar que cualidades sin cifra sigan presentes con detalles pendientes.
- Revisar exclusiones y su llegada a arquitecturas y planificación.
- Contar intervenciones manuales necesarias para aprobar y falsas alarmas del auditor.
- Conservar errores de proveedor, límites de entrada y cuotas como causas operativas separadas.

No se considera acreditado el recorrido integral hasta PDF/ZIP únicamente por superar estas pruebas. Audio/PDF, MongoDB real tras reinicio, fidelidad visual y despliegue continúan requiriendo sus escenarios específicos.
