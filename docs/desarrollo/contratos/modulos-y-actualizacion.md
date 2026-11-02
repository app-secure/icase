# Módulos funcionales y actualización segura

## Alcance y selección

En la etapa **Módulos**, cambiar a modo personalizado y activar `archivos_imagenes`, `reportes_calculos` y/o `recuperacion_cuentas`. Están desactivados por defecto: no se incorporan tecnologías ni servicios sin aprobación. Requieren Express o NestJS con JWT aprobado. Spring se rechaza explícitamente para estas selecciones y para el nuevo cálculo declarativo; no se sustituyen tecnologías silenciosamente.

Las huellas de backend, frontend, pruebas, infraestructura, pipeline y entrega cambiaron. Se deben generar, revisar y verificar nuevas versiones. No se modifican ZIP ya descargados ni se alteran proyectos activos al actualizar el generador.

## Archivos e imágenes

- `POST /api/files/{operation}/{record}`: cuerpo binario, `Content-Type` PNG/JPEG/PDF y nombre codificado con `encodeURIComponent` en `X-File-Name`. Requiere PATCH sobre la operación y un registro existente.
- `GET /api/files/{operation}/{record}`: listar adjuntos; requiere GET.
- `GET /api/download/{id}`: descarga autenticada con `Content-Disposition: attachment`, `nosniff` y caché privada desactivada.
- `DELETE /api/download/{id}`: eliminar adjunto; requiere PATCH. Borrar un registro intenta purgar sus adjuntos y los de operaciones alias sobre la misma entidad.

Identificadores aleatorios, rutas no elegidas por el usuario, comprobación de firma y MIME, 512 KiB por archivo, cuota de 50 MiB y máximo 5000 archivos por instancia. Las imágenes PNG tienen límite de dimensiones. No se publica una carpeta estática ni se incrusta HTML/SVG. La firma no sustituye una decodificación completa ni un antivirus.

React incorpora adjuntos por registro, carga, descarga y eliminación. Expo incorpora DocumentPicker, subida autenticada y descarga/compartición mediante su caché privada. La compilación de un bundle no certifica la experiencia en un teléfono.

Los archivos quedan bajo `APP_DATA_DIR/files`. Compose monta `app-data` para conservarlos al recrear contenedores; respaldar este volumen junto con la base. No usar `down -v` para actualizar. No se incluyen S3, un CDN, antivirus, deduplicación ni almacenamiento multi-réplica. Los permisos heredan el control por rol/operación: no añaden propiedad de registros.

## Reportes y cálculos

`GET /api/reports/{operation}?format=json|csv|pdf` usa permisos GET de la operación. Deriva columnas del contrato y ofrece cantidad de registros, suma, promedio, mínimo y máximo de campos numéricos; las columnas con nombres de contraseñas/secretos/tokens no se exportan. La interfaz permite consultar y descargar. CSV neutraliza fórmulas de hoja de cálculo; PDF es un reporte textual, no un dashboard diseñado.

Se rechazan reportes de más de 10000 registros o 2 MiB de datos en vez de devolver totales truncados. La lectura paginada no es una instantánea transaccional; no utilizarla como cierre contable con escrituras concurrentes.

Las fórmulas solo proceden de reglas `calculo` **confirmadas**, ligadas a RF y campos numéricos existentes. Ejemplo de decisión:

```json
{
  "id": "RN-01",
  "tipo": "calculo",
  "entidad": "Producto",
  "campo": "total",
  "expresion": {
    "op": "*",
    "izquierda": { "campo": "precio" },
    "derecha": { "campo": "cantidad" }
  },
  "decimales": 2,
  "rf": ["RF-01"],
  "mensaje": "Total según precio y cantidad",
  "estado_decision": "confirmado",
  "origen": "manual"
}
```

El ejemplo solo es válido si el proyecto define esos campos y aprueba esa fórmula. No es una regla predeterminada para otros proyectos. La IA no puede introducir tasas, impuestos o redondeo sin sustento: si falta una definición, debe proponer una decisión pendiente.

Se admiten constantes, campos y operaciones `+ - * /`, máximo 63 nodos, profundidad 8 y 0–6 decimales. Se rechazan ciclos, dependencias entre campos calculados, resultados no finitos, división por cero y salida fuera de rango. No hay `eval`, ejecución de JavaScript recibido ni llamadas externas. Al crear/editar se calcula en el servidor y se ignora un valor de salida enviado por el cliente. React muestra la salida como calculada y no editable.

No equivale a un motor de nómina, amortizaciones o contabilidad. Usa números de JavaScript, no aritmética decimal financiera exacta. No recalcula automáticamente registros históricos ni proporciona transacciones compuestas entre entidades.

## Recuperación y correo

- `POST /api/auth/forgot-password`, JSON `{ "email": "..." }`: respuesta 202 genérica, sin revelar si existe la cuenta.
- `POST /api/auth/reset-password`, JSON `{ "token": "...", "password": "..." }`: consume el enlace y cambia la contraseña.

Tokens aleatorios de 256 bits, solo su hash se usa como nombre de archivo; caducan a los 15 minutos. Un token consumido no puede reutilizarse. Se limita la frecuencia HTTP y la repetición para una misma cuenta; se purgan tokens vencidos al solicitar recuperación. La actualización usa compare-and-set en la base: no sobrescribe un cambio concurrente de contraseña o desactivación. Los JWT anteriores dejan de funcionar tras cambiar la contraseña.

El correo contiene un enlace con el token en el fragmento `#reset=...`, no en una consulta enviada al servidor. La interfaz lo elimina del historial visible y permite definir la nueva contraseña, incluso si ya existe una sesión abierta.

Configurar `SMTP_HOST`, `SMTP_PORT`, `SMTP_FROM`, opcionalmente `SMTP_USER`/`SMTP_PASSWORD`, `SMTP_SECURE`, y `RESET_PUBLIC_URL`. Producción exige HTTPS y transporte SMTP TLS; nunca activar el perfil de correo de pruebas en producción. Un proveedor no configurado produce 503, no un correo ficticio. Los errores de envío no revelan la existencia de cuentas ni incluyen tokens en logs. No se incluyen SMS, WhatsApp, verificación de correo, MFA o un motor general de notificaciones.

### Correo de pruebas

La infraestructura incluye `ops/docker-compose.test-mail.yml`, exclusivamente para pruebas. Añade Mailpit y configura el backend en modo de prueba con SMTP sin TLS en la red local. La interfaz de Mailpit solo se publica en `127.0.0.1:8025`.

```bash
docker compose --env-file ops/.env -f ops/docker-compose.yml -f ops/docker-compose.test-mail.yml up --build
```

Al ejecutar las pruebas en el host, definir `TEST_SMTP_URL=http://localhost:8025`, junto con `BASE_API_URL`, `BASE_WEB_URL` y las credenciales del administrador **de pruebas**. El pipeline generado usa este perfil para verificar correo; su modificación no ejecuta ni publica un workflow real por sí sola. Sin `TEST_SMTP_URL`, la prueba SMTP indica omisión, no éxito.

## Migraciones incrementales

El backend anterior se utiliza como referencia al regenerar. Se mantienen las migraciones históricas sin cambiarlas. Las nuevas incorporan IDs posteriores a `0003`, por ejemplo `0004_alter_<hash>`.

Se admiten tablas nuevas y columnas opcionales sin referencias nuevas. Se rechazan cambios de motor, eliminación/renombrado de tablas o columnas, cambios de tipos, índices únicos, activación/eliminación de autenticación sobre una base previa y columnas que requieran restricciones o backfill. Estas operaciones requieren un plan manual revisado y backup. MongoDB conserva documentos y admite nuevas colecciones/índices; agregar un atributo opcional no requiere DDL.

PostgreSQL aplica cada migración en transacción y mantiene su bloqueo de migraciones. MySQL no hace DDL transaccional: las adiciones de columna comprueban existencia/tipo para reanudar, pero una migración más compleja puede necesitar recuperación manual. No se ejecutan DROP, TRUNCATE ni reinicios de la base como mecanismo de actualización.

## Actualización de archivos exportados

Cada nueva entrega incluye `.icase/baseline.json` y `tools/update.cjs`. La plataforma no conoce los cambios que el desarrollador realizó fuera de ella: para conservarlos, actualizar la entrega local con esta herramienta, no extrayendo el ZIP encima.

1. Guardar una copia o commit del proyecto y backup de datos.
2. Extraer el ZIP nuevo en otra carpeta.
3. Desde la raíz de la entrega anterior ejecutar `node tools/update.cjs --from RUTA_NUEVA`.
4. Revisar la vista previa por archivo, diferencias (hasta 80 líneas por lado), cambios manuales y conflictos. Esta operación no escribe archivos.
5. Aplicar con `node tools/update.cjs --from RUTA_NUEVA --apply --approve HASH`, usando la aprobación mostrada.

Se compara baseline anterior, archivo local y nueva versión. Se preservan ediciones exclusivamente manuales y archivos retirados; un conflicto bloquea toda la aplicación. Una aprobación queda invalidada si cambian archivos desde la vista previa. Se respaldan archivos reemplazados y baseline en `.icase/backups`; las escrituras individuales usan reemplazo temporal. No es una transacción global: un fallo de disco/interrupción puede requerir recuperar los respaldos antes de repetir.

No modifica `.env`, datos, `.git`, `node_modules` ni sigue enlaces simbólicos. Rechaza traversal y reescritura de migraciones históricas. No hace una fusión textual automática, no sustituye Git ni una revisión humana de cambios de arquitectura y no importa modificaciones locales al servidor iCase.

Una entrega antigua sin `.icase/baseline.json` necesita reconstruir su referencia a partir del ZIP original o fusionarse mediante Git. La herramienta no adivina qué cambios eran manuales: sin baseline se detiene sin sobrescribir archivos.

## Verificación reproducible

Desde el repositorio iCase, con Docker activo:

```bash
cd icase-backend
node scripts/verify-extended-modules-runtime.js Express
node scripts/verify-extended-modules-runtime.js NestJS
```

Genera un inventario genérico, precarga el esquema anterior con un registro y prueba el nuevo esquema, servicios, API, Mailpit, React, descargas y bundle Expo. Repite con el Compose exportado. Los informes quedan en `verification-results/extended-modules/`. No requiere IA ni usa datos/secretos del proyecto activo. La ejecución real registrada con PostgreSQL no acredita por sí sola MySQL, MongoDB, dispositivos físicos, SMTP de producción o un workflow remoto de CI/CD.
