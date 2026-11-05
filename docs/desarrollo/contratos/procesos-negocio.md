# Procesos de negocio transaccionales

Primer bloque experimental, opcional y desactivado por defecto. Soporta Express/NestJS, PostgreSQL y JWT. No convierte un CRUD en un sistema contable ni deduce políticas de aprobación por el nombre del requisito.

## Configuración y aprobación

En la etapa **Módulos**, elegir Personalizado, activar **Procesos transaccionales** e introducir una lista JSON en Definiciones de procesos. Aplicar los cambios y aprobar explícitamente la etapa. Cada definición debe citar RF aprobados y declarar `estado_decision: confirmado`. El backend generado incluye `PROCESSES.md` con el formato y ejemplos ilustrativos.

Las definiciones contienen identificador, estados, estado inicial, terminales, alias de registros vinculados a operaciones, roles de inicio y acciones. Cada acción declara estado de origen/destino, roles, separación opcional del actor anterior y hasta diez actualizaciones con precondiciones de igualdad y valores constantes. Se validan roles, operaciones y campos contra el contrato al generar. No se ejecuta SQL, JavaScript ni texto libre propuesto por IA.

## Ejecución

Ejemplo de definición, únicamente ilustrativo. Solo aplicarlo si el RF, el campo y la política pertenecen al proyecto aprobado:

```json
[
  {
    "id": "revision", "estado_decision": "confirmado", "rf": ["RF-01"],
    "states": ["pendiente", "cerrado"], "initial": "pendiente", "terminal": ["cerrado"],
    "records": {"solicitud": "rf-01"}, "start_roles": ["administrador"],
    "actions": [
      {"id": "cerrar", "from": "pendiente", "to": "cerrado", "roles": ["administrador"], "different_actor": true,
       "steps": [{"record": "solicitud", "expect": {"estado": "pendiente"}, "set": {"estado": "cerrado"}}]}
    ]
  }
]
```

Las instancias guardan la huella de su definición. Cambiarla al regenerar bloquea las anteriores con 409 hasta una migración explícita; este primer bloque no incluye el migrador de instancias.

- `POST /api/processes/{definition}/instances`: vincula registros existentes e inicia estado y versión persistentes.
- `GET /api/processes/instances/{id}`: consulta estado, versión, acciones disponibles y auditoría, sin claves de idempotencia.
- `POST /api/processes/instances/{id}/actions`: requiere acción, versión esperada y clave de idempotencia de 16–100 caracteres.
- `POST /api/processes/instances/{id}/reopen`: solo si la definición declara `reopen`; libera bloqueos y vuelve al estado indicado.
- `GET /api/processes/definitions`: catálogo de procesos que el usuario puede iniciar.
- `GET /api/processes/instances?page=1`: bandeja autorizada, de 20 en 20.

La web generada incorpora `/procesos` y, con móvil, una bandeja Expo: selectores (web), inicio, detalle, acciones, reapertura e historial. No hace falta copiar IDs para iniciar desde la web. Los conflictos de versión se muestran y se vuelve a consultar el estado; una solicitud fallida conserva su clave para reintentar sin duplicar acciones.

JWT y permisos GET/PATCH se comprueban sobre todas las operaciones involucradas; el rol de la acción se comprueba incluso para administradores. Si la acción exige otro actor, otra sesión del mismo usuario no sirve. Los pasos, el estado y la auditoría se confirman juntos en PostgreSQL SERIALIZABLE, con bloqueos, límites de tiempo y rollback ante errores. Un conflicto devuelve 409; no se reintenta silenciosamente. La repetición de una acción confirmada con la misma clave y usuario no vuelve a aplicar sus pasos.

## Alcance y pendientes

Hasta 20 definiciones, 10 registros y pasos por acción, 30 acciones por definición y 100 ejecuciones por instancia. Se conservan las reglas del almacén para validar los cambios. Al iniciar se bloquea la edición y el borrado CRUD de todos los registros vinculados, incluso para administradores y después del cierre. También se rechazan con 409 las asociaciones N:M y los adjuntos sobre registros bloqueados. Los bloqueos comparten la base transaccional y normalizan IDs equivalentes. Otro proceso no puede reclamar esos registros. La reapertura es opt-in (`"reopen":{"to":"pendiente","roles":["administrador"]}`).

Una acción puede declarar `"notify":{"roles":["cliente"],"plantilla":"accion"}` para correo SMTP con las mismas variables que la recuperación de cuentas. Sin SMTP configurado responde 503 y no confirma la transición. No cubre SMS, WhatsApp ni push.

Con `eventos_cambios`, la acción guarda sus invalidaciones en el outbox PostgreSQL dentro de la misma transacción. Un worker publica las filas confirmadas; un rollback no deja avisos. Las instancias abiertas se reconsultan en la web. La bandeja se actualiza manualmente para descubrir nuevas instancias.

Pendientes: búsqueda avanzada de instancias, creación de registros en pasos, cálculos entre registros, trabajos largos, compensaciones e integraciones externas. No se afirma soporte de MySQL/MongoDB/Spring ni transacciones distribuidas. El inicio de instancias no se deduplica; la idempotencia se aplica a acciones dentro de una instancia.

## Outbox durable

La migración `0006_business_process_outbox` añade una fila única por instancia/versión/operación. Se activa con procesos y eventos; sin eventos no se encolan avisos. Los workers arrancan después de las migraciones y la inicialización del transporte; bloquean filas con `FOR UPDATE SKIP LOCKED`, publican y guardan el ack. Varias réplicas pueden consumir la misma cola sin tomar simultáneamente una fila. Un fallo libera la fila para reintento con espera progresiva de 1 a 60 segundos; no se descarta por alcanzar un número de intentos.

La garantía es al menos una vez **hacia el transporte**, no recepción por todos los clientes ni exactamente una vez. Puede duplicarse un aviso si se publica y el servidor falla antes de registrar el ack; los clientes solo reconsultan datos autorizados. No sustituye la reconexión, no ordena avisos entre workers ni añade replay a Socket.IO/Redis Pub/Sub. Tampoco es una cola general de pagos o correos.

El alcance son las acciones de procesos: CRUD y N:M ajenos al motor mantienen su canal anterior. Redis rechaza publicaciones mientras no está listo en lugar de acumular una cola offline no durable en memoria; el worker conserva el reintento en PostgreSQL.

Hasta 10 000 pendientes: si se llena, la acción completa revierte y responde 503. Hasta diez avisos por ciclo de un segundo, timeout de publicación de cinco segundos y límites de consulta/conexión. Limpieza gradual de publicados de más de siete días, sin purgar pendientes. Los errores persistidos son códigos, no mensajes con credenciales. Desactivar eventos detiene el consumo pero conserva la cola; errores permanentes necesitan revisión operativa.

Verificación: `node scripts/verify-process-outbox-runtime.js Express` o `NestJS`. Se usan Docker y PostgreSQL aislados: rollback, reconexión, reintento, ack fallido, dos workers y productor que termina antes de publicar seguido de reinicio real de PostgreSQL y recuperación desde otro contenedor. La publicación se simula en esa prueba para controlar fallos; la publicación Socket.IO y la bandeja se comprueban en el recorrido completo `verify-specialized-runtime.js processes ...`.

La migración `0005_business_process_locks` recupera bloqueos de instancias compatibles. Falla de forma transaccional si una definición histórica no coincide o varias instancias reclaman el mismo registro; no borra datos ni decide automáticamente cuál prevalece. Esos casos requieren resolución explícita antes del despliegue.

La verificación reproducible usa datos sintéticos: `node scripts/verify-specialized-runtime.js processes Express` y `processes NestJS`, desde `icase-backend/`. La prueba específica verifica separación de actores, fallo del segundo paso sin cambios parciales, concurrencia, auditoría e idempotencia. Sus resultados quedan en `verification-results/specialized/`; no equivalen a una auditoría de procesos empresariales reales.
