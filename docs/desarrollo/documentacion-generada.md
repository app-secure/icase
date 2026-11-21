# Documentación del proyecto generado

La sección **Documentación del proyecto generado** está disponible en el documento final y en la vista de generación de código. Genera documentación del proyecto seleccionado, no de la herramienta I-CASE.

## Cinco manuales

1. Usuario: funciones, roles, precondiciones, resultados esperados y flujo.
2. Desarrollador: tecnologías aprobadas, contratos y documentos del repositorio.
3. Mantenimiento: operación, respaldo, recuperación, actualización y diagnóstico.
4. Instalación y despliegue: arranque de la entrega, MkDocs, PDF y Pages.
5. Referencia técnica: RNF, fuentes de diagramas aprobados, versiones y contrato OpenAPI cuando existe.

Los insumos provienen de requisitos, diagramas, decisiones y artefactos aprobados. Las versiones rechazadas o desactualizadas no se incluyen. Los documentos originales de los artefactos se conservan; una licencia existente se respeta. Si no hay licencia aprobada, se indica la decisión pendiente, sin otorgar una licencia automáticamente.

## Revisar y exportar

Pulsa **Generar documentación**. El panel sigue la interfaz de I-CASE, con pestañas independientes para los cinco manuales y una vista de guías animadas. **PDF completo** imprime los cinco manuales, aunque estés consultando una pestaña. **HTML completo** conserva el documento y los diagramas que pudieron incrustarse.

Los Markdown de los artefactos aprobados (README, CONTRIBUTING y otros manuales) aparecen renderizados: encabezados, listas, tablas, enlaces y bloques de código. **Ver Markdown original** permite consultar la fuente; los archivos originales se conservan sin cambios en `documentation/repository/`. El renderizado desactiva HTML ejecutable y protocolos de enlace peligrosos.

**Descargar MkDocs** genera un ZIP con `documentation/mkdocs.yml`, cinco páginas, documentos originales, infografía SVG por roles, fuentes de diagramas, estilos de impresión y manifiesto SHA-256. Generar o descargar no publica en GitHub. También se incluyen las fuentes documentales al generar un paquete final de entrega nuevo.

La opción de imágenes utiliza el servidor PlantUML del visor. Si no está disponible, se conserva la fuente y se informa del fallo.

## Flujos separados por rol

Cada recorrido utiliza los actores de los requisitos, los permisos aprobados y los actores de las operaciones confirmadas. Las funciones se agrupan por responsable; una función compartida aparece en los recorridos de los roles correspondientes. Se incluyen todos los RF aprobados, sin limitar el flujo a los primeros cuatro.

Cada paso muestra requisito, descripción, acciones autorizadas cuando se especifican, precondiciones y resultado esperado. Las funciones sin responsable confirmado aparecen bajo **Rol por confirmar**. El orden es una guía de consulta: no inventa dependencias operativas que no estén documentadas. La infografía exportada conserva esta separación.

## Guías animadas

En **Guías animadas**, elige un rol y pulsa **Crear y reproducir guía**. Puedes verla dentro del panel y descargar el WebM individual. **ZIP con guías** incluye los cinco manuales y los videos de la selección actual; **Todos los roles** incluye todas las guías disponibles.

Cada clip usa el estilo visual de la herramienta, un índice de pasos, requisito de origen, progreso animado y tres momentos: preparar, ejecutar y comprobar. Los recorridos largos se dividen en clips de hasta cuatro funciones; ninguna función desaparece por el límite de un clip. La guía de mantenimiento se distingue de los roles de negocio.

Los videos son guías narrativas sin audio, no grabaciones de la aplicación ni evidencia de pruebas funcionales. Mantén la pestaña visible durante la captura. Son compatibles con navegadores Chromium que soporten MediaRecorder, como Chrome, Brave y Edge. Para demostrar interacciones reales, el equipo debe grabarlas sobre una entrega ejecutable y revisada.

## Construir HTML y PDF

Extrae el ZIP y ejecuta desde `documentation/`:

```sh
python -m pip install -r requirements.txt
python -m playwright install chromium
python -m mkdocs serve
```

Para construir los archivos HTML y el PDF completo:

```sh
python -m mkdocs build --strict
python tools/export_pdf.py
```

El script imprime `site/manual-completo.html` con Chromium y guarda `site/documentacion.pdf`. Conserva la misma composición y abre los bloques de fuentes para que no se omitan al imprimir. La variable opcional `DOCUMENTATION_BROWSER_CHANNEL=chrome` permite usar Chrome ya instalado para la revisión local; por defecto usa Chromium de Playwright.

## GitHub Actions opcional

Marca **Incluir GitHub Actions** antes de generar. El ZIP incluye `.github/workflows/documentation.yml` en la raíz de la entrega. El workflow solo tiene disparador manual: construye HTML/PDF y guarda un artefacto descargable. Para publicar, activa Pages con fuente GitHub Actions y ejecuta el workflow con `publicar=true`; el valor por defecto es `false`.

No sube archivos a GitHub ni despliega al generar o descargar la documentación.

## Informe final

El visor PDF continúa párrafos y filas extensas entre páginas, ajusta títulos y etiquetas de tablas, repite encabezados de tabla y reserva espacio para imágenes y firmas. El estado de auditoría se muestra según los datos del proyecto; no se afirma una aprobación inexistente. Los requisitos se conservan aunque su texto contenga referencias a correcciones o revisión experta.

## Validación local

En `icase-backend/`:

```sh
npm test -- --runInBand tests/project-documentation.test.js tests/pdf-presentation.test.js tests/generated-summary-component.test.js
node scripts/preview-documentation.cjs RUTA_DE_SALIDA
```

Con el frontend disponible en `http://127.0.0.1:5180` y Chrome instalado:

```sh
node scripts/verify-documentation-ui.cjs RUTA_DE_SALIDA
```

Esta comprobación utiliza datos sintéticos y una API simulada; exporta videos, capturas móvil/escritorio y un PDF con textos largos sin modificar proyectos ni usar credenciales.
