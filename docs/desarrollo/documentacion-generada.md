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

Pulsa **Generar documentación**. La vista previa muestra el manual completo en HTML. **Imprimir / guardar PDF** abre el diálogo de impresión del navegador; selecciona Guardar como PDF. **Descargar HTML** conserva el manual completo, incluidas las imágenes que pudieron incrustarse.

**Descargar MkDocs** genera un ZIP con `documentation/mkdocs.yml`, cinco páginas, documentos originales, infografía SVG, fuentes de diagramas, estilos de impresión y manifiesto SHA-256. La exportación no modifica el proyecto guardado ni publica el sitio. También se incluyen las fuentes documentales al generar un paquete final de entrega nuevo.

La opción de imágenes utiliza el mismo servidor PlantUML del visor. Si no está disponible, se conserva el código fuente y se informa el fallo; no se sustituye el diagrama por una imagen ficticia.

## Videos cortos

**Descargar con 3 videos** añade guías animadas WebM: flujo, funciones del proyecto y mantenimiento. Se generan en el navegador, sin audio, y se vinculan desde el manual de usuario. Mantén la pestaña visible durante la captura. Chrome y Edge compatibles con MediaRecorder pueden producir estos videos.

Son guías narrativas basadas en los insumos aprobados. No son grabaciones de la aplicación ejecutándose ni evidencia de pruebas funcionales. Para demostrar interacciones reales, el equipo debe grabarlas sobre una entrega ejecutable y revisada.

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
