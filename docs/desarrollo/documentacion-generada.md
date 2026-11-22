# Documentación del proyecto generado

La documentación describe el proyecto seleccionado, usando requisitos, decisiones, diseños y código aprobados. Se conservan cinco manuales en Markdown real: usuario, desarrollador, mantenimiento, instalación y referencia técnica. Los recorridos se separan por roles y conservan la trazabilidad con requisitos y criterios de aceptación.

## Preparar el servidor

Desde icase-backend:

```powershell
npm install
npm run docs:setup
npm run dev
```

El instalador prepara Python/MkDocs Material/print-site y Chromium/FFmpeg dentro de carpetas locales ignoradas por Git. Requiere Python y conexión durante la instalación. Después las capturas y los videos de mockups funcionan sin consultar CDN; Tailwind se compila localmente. PlantUML se renderiza en el servidor indicado por DOCUMENTATION_PLANTUML_SERVER; Mermaid se renderiza con la dependencia local.

El exportador PDF usa temporales privados por ejecución. El servidor comprueba que puede escribir y pasa esa ruta a Python y al driver de Playwright mediante TEMP, TMP y TMPDIR. La exportación local prepara su carpeta `.icase-runtime` dentro de documentation, sin depender del Temp general de Windows, y limpia los temporales al terminar. ICASE_DOCUMENTATION_TEMP permite indicar una carpeta alternativa escribible; en Windows utiliza una ruta corta si extraes el ZIP dentro de muchas subcarpetas. El detalle de un fallo de exportación queda en export-pdf.log, fuera del ZIP; la interfaz muestra un mensaje breve. Una versión fallida anterior se conserva: después de actualizar el servidor, genera una nueva versión.

Configuración opcional: ICASE_DOCUMENTATION_DIR cambia el almacén persistente; DOCUMENTATION_PYTHON selecciona Python; DOCUMENTATION_BROWSER_CHANNEL=chrome permite usar Chrome instalado; BEDROCK_DOCUMENTATION_MODEL selecciona el modelo de redacción (por defecto Haiku 4.5 mediante el cliente Bedrock existente). No incluyas claves en los manuales.

## Generar y revisar

1. Elige una licencia (MIT, Apache 2.0, propietaria, conservar existente o decidir después). Para asignar una licencia, escribe el titular.
2. Opcionalmente activa videos y el recorrido de la aplicación en Docker. El arranque necesita una entrega aprobada. Se reutiliza el servicio de ejecución local; no se detienen aplicaciones existentes.
3. Opcionalmente activa IA. La primera llamada propone secciones con referencias; la segunda revisa cada afirmación. Las referencias inexistentes y las secciones no sustentadas se descartan. Los fallos conservan las plantillas. Las secciones aceptadas se etiquetan y su revisión se guarda en revision-ia.json. Esta revisión asistida no certifica veracidad ni exhaustividad.
4. Pulsa **Generar documentación**. La cola del servidor conserva estado, fuentes y versiones. Cerrar la página no cancela el trabajo. Un reinicio marca los trabajos incompletos como interrumpidos; genera una nueva versión.
5. Revisa las cinco pestañas y los avisos. Descarga el ZIP, los manuales en PDF o el informe final. El selector permite volver a una versión anterior.

La grabación real recorre pantallas de la aplicación levantada en Docker. El acceso automático disponible corresponde al administrador de la entrega; para roles sin acceso confirmado se graban sus mockups y se etiqueta el origen. No se presenta un recorrido de mockups como prueba de ejecución. Los videos son opcionales y se producen en el servidor, con rótulos por rol y pantalla.

## Contenido del ZIP

- README.md, CONTRIBUTING.md, ARCHITECTURE.md, CHANGELOG.md y LICENSE.md en la raíz. Se conservan las instrucciones originales y se agrega la información de la entrega.
- documentation/docs/*.md: las cinco páginas y el inicio, sin un manual HTML editorial paralelo.
- Cuatro infografías SVG: flujo por rol, módulos y pantallas, modelo de datos y arquitectura. Los diagramas aprobados se guardan como SVG y fuentes editables; no se incrustan como base64.
- Capturas PNG de todos los mockups aprobados y videos WebM opcionales por rol.
- documentation/site/: sitio Material con búsqueda, modo oscuro, navegación por pestañas y soporte Mermaid; print_page.html y documentacion.pdf se derivan de las mismas páginas.
- informe-final.md, informe-final.html e informe-final.pdf: reporte desde los datos aprobados, capturado e impreso en el servidor con CSS de impresión.
- documentation/documentation-manifest.json: versiones de origen, avisos, medios y huellas SHA-256. Las imágenes fallidas se señalan; se conserva la fuente del diagrama.

Instalación y mantenimiento describen los servicios, puertos, healthchecks y dependencias de Compose, variables de .env.example (sin secretos), semillas, scripts de package.json y endpoints/modelos de OpenAPI. Un dato ausente se señala como pendiente.

## HTML, PDF y GitHub Actions

Dentro de la carpeta documentation del ZIP:

```powershell
python -m pip install -r requirements.txt
python -m playwright install chromium
python -m mkdocs serve
python tools/export_pdf.py
```

El exportador construye con MkDocs en modo estricto, comprueba enlaces y anclas locales e imprime site/print_page.html. No existe manual-completo.html escrito a mano. Los enlaces externos no se sondean automáticamente.

El workflow se ejecuta manualmente y al cambiar documentation/** (push/pull request). Construye HTML/PDF y guarda el resultado como artefacto. Publicar en Pages requiere seleccionar publicar en una ejecución manual o habilitar DOCUMENTATION_PUBLISH=true como variable del repositorio para push. Configura Pages con GitHub Actions y revisa los permisos antes de habilitar la publicación. Generar y descargar no publica.

## Entrega y conservación

Antes de crear el paquete final, genera una documentación terminada de las fuentes aprobadas actuales. La entrega fija su versión de documentación y combina sus medios al descargar. Cambiar fuentes obliga a generar una nueva versión. Respalda la carpeta ICASE_DOCUMENTATION_DIR junto con la base: contiene fuentes, PDF, capturas y grabaciones. No hay borrado automático de versiones.

## API autenticada por proyecto

- POST /proyectos/:id/codificacion/documentacion: fuentes y vista Markdown de compatibilidad.
- POST /proyectos/:id/codificacion/documentacion/versiones: inicia trabajo; responde 202.
- GET /proyectos/:id/codificacion/documentacion/versiones: historial.
- GET /proyectos/:id/codificacion/documentacion/versiones/:version: progreso y resultado.
- GET /proyectos/:id/codificacion/documentacion/versiones/:version/archivo?ruta=...: archivo de una versión terminada, con sesión y propiedad del proyecto. Sin ruta descarga el ZIP.

## Verificación

```powershell
node node_modules/jest/bin/jest.js --runInBand tests/project-documentation.test.js
node scripts/verify-documentation-ui.cjs --output verification-results/documentation-48 --videos
node scripts/verify-documentation-ui.cjs --output verification-results/documentation-real --project ID_PROYECTO
```

El caso amplio tiene 48 pantallas sintéticas y se etiqueta como tal. El modo --project lee el proyecto real sin modificar sus fuentes o aprobaciones. DOCS_TEST_URL=http://127.0.0.1:5188 agrega comprobaciones de la interfaz con Vite activo: Markdown renderizado, imágenes, descarga de PDF y ancho móvil. Las evidencias incluyen ZIP, PDF, capturas y resultado.json.
