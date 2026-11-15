# Compartir y recuperar proyectos

Desde **Mis proyectos → Importar / exportar** puedes trasladar un proyecto a otra instalación de I-CASE sin regenerarlo con IA. No es el ZIP de código generado: es un paquete `.icase.json` con los datos del proyecto y los originales adjuntos.

## Qué incluye

Fuentes y sus metadatos, archivos originales disponibles, versiones de análisis inicial, requisitos, auditorías, diagramas e historiales, mockups, planificación y artefactos de código guardados. Conserva las aprobaciones como antecedentes del proyecto.

No incluye cuentas, sesiones, claves de proveedores, `.env` del servidor, trabajos activos, checkpoints ni contenedores. Las comprobaciones de ejecución del código se deberán repetir en el equipo receptor. El contenido aportado por el usuario y el código generado podrían contener información sensible: revísalos antes de compartir.

## Exportar

Para duplicar dentro de la misma instalación, pulsa el icono **Copiar proyecto** de la tarjeta (o la opción del menú en vista de lista), indica un nombre y confirma **Crear copia**. No necesitas descargar ni seleccionar archivos. La copia se verifica y el original permanece intacto; se aplican los mismos límites y exclusiones de la transferencia.

1. Guarda tus cambios y espera a que finalicen los trabajos de IA.
2. Regresa a **Mis proyectos** y abre **Importar / exportar**.
3. En **Exportar**, selecciona el proyecto y pulsa **Exportar copia**.
4. Guarda el paquete descargado y pulsa **Descargar informe Markdown**.
5. Conserva ambos archivos juntos. El informe enumera registros y originales con sus tamaños y huellas SHA-256.

Si falta un original o hay un trabajo activo, la exportación se rechaza: no se entrega silenciosamente una copia incompleta. El límite del paquete es 64 MiB; los originales sumados pueden ocupar hasta 45 MiB porque se transportan codificados en base64.

## Probar localmente antes de compartir

1. Con MongoDB, backend y frontend iniciados, exporta el proyecto siguiendo los pasos anteriores.
2. Sin borrar el origen, abre **Importar / exportar → Importar** y selecciona el archivo `.icase.json`.
3. Pulsa **Verificar paquete**. Comprueba que los recuentos y originales coincidan con el informe.
4. Escribe un nombre distinguible, como `Restaurante — prueba de transferencia`, y confirma que confías en la procedencia.
5. Pulsa **Crear copia importada**. Descarga su informe Markdown: acredita también la lectura posterior de los registros y archivos escritos.
6. Abre la copia. Comprueba fuentes, evidencias, aprobación del análisis, RF/RNF, diagramas, versiones, mockups y código disponible, según el avance real del origen.
7. Recarga la página y vuelve a abrirla. Comprueba que persiste y que el proyecto original sigue intacto.
8. Puedes repetirlo desde otra cuenta local: la copia pertenecerá a la cuenta que importe, sin dar acceso al proyecto original.

La importación asigna IDs nuevos y actualiza las referencias. No sobrescribe otro proyecto ni inicia IA. Un reintento con el mismo identificador de importación no crea otra copia; verificar de nuevo el archivo inicia una operación nueva y sí permite crear otra copia.

## Entrega al compañero

Comparte el paquete y el informe por un canal privado. Ambos equipos deben usar el mismo commit de I-CASE y esquemas compatibles; si no coinciden, actualicen primero la herramienta. Tu compañero configura sus propias variables de entorno, inicia sesión e importa mediante los pasos anteriores. No necesita tu base de datos ni tus claves API.

Las huellas detectan alteraciones accidentales, pero no son una firma del autor ni demuestran que el software generado funcione. No importes paquetes de procedencia desconocida. Después de importar, repite la verificación de código/Docker antes de exportar una entrega ejecutable.

## Pruebas técnicas reproducibles

Desde `icase-backend`:

```powershell
npm run test:project-transfer
npm run test:project-transfer:local
npm run test:project-transfer:browser
```

Las dos últimas requieren MongoDB accesible. Usan una base aislada `icase_transfer_test_<id>` que se elimina al terminar, no la base activa. La prueba de navegador requiere haber compilado el frontend (`npm run build` en `icase-frontend`) y Chromium (`npm run test:browser:install` en el backend). Alternativamente, configura `PLAYWRIGHT_CHANNEL=chrome` para utilizar Chrome instalado.

Las evidencias quedan en `icase-backend/verification-results/project-transfer/<id>/`: paquete, informes, resultado y capturas de escritorio/móvil. No se envían datos a proveedores IA.

Si una escritura falla se retira la copia parcial. El servidor conserva un registro interno para recuperar importaciones interrumpidas: confirma una copia íntegra o limpia una incompleta al reiniciar y en su revisión periódica.
