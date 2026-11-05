# Procesos transaccionales — primer bloque experimental

Solo Express/NestJS con JWT y PostgreSQL. Activar `procesos_negocio` en Módulos, introducir `procesos` y aprobar la etapa. No se generan automáticamente aprobaciones, cierres, roles o fórmulas. Cada definición debe tener `estado_decision: confirmado` y citar RF existentes. El backend rechaza definiciones incoherentes con operaciones, campos o roles del contrato.

Ejemplo ilustrativo (sustituir por requisitos y campos reales; NO se aplica automáticamente):

```json
{
  "id": "revision", "estado_decision": "confirmado", "rf": ["RF-01"],
  "states": ["pendiente", "aprobado", "cerrado"], "initial": "pendiente", "terminal": ["cerrado"],
  "records": {"solicitud": "rf-01"}, "start_roles": ["administrador"],
  "actions": [
    {"id": "aprobar", "from": "pendiente", "to": "aprobado", "roles": ["administrador"], "different_actor": true,
      "steps": [{"record": "solicitud", "expect": {"estado": "pendiente"}, "set": {"estado": "aprobado"}}]},
    {"id": "cerrar", "from": "aprobado", "to": "cerrado", "roles": ["administrador"], "different_actor": false,
      "steps": [{"record": "solicitud", "expect": {"estado": "aprobado"}, "set": {"estado": "cerrado"}}]}
  ]
}
```

La lista `procesos` contiene definiciones como esta. `records` vincula alias a operaciones existentes. Cada acción tiene hasta 10 pasos de actualización, con valores constantes explícitos. `expect` comprueba igualdad antes del cambio. No se admite SQL, JavaScript, expresiones, HTTP ni importes inferidos. Las validaciones de tipos, reglas de negocio y campos calculados del almacén siguen aplicándose.

## API autenticada

1. `POST /api/processes/revision/instances` con `{"records":{"solicitud":"1"}}` inicia una instancia y devuelve su UUID, estado y versión 0.
2. `GET /api/processes/instances/UUID` consulta estado, versión, acciones disponibles y auditoría. Guardar el UUID para continuar después de reiniciar el servidor.
3. `POST /api/processes/instances/UUID/actions` con `{"action":"aprobar","version":0,"key":"identificador-unico-0001"}` ejecuta la acción. Si `different_actor` es true, se necesita otro usuario, no solo otra pestaña o sesión.

Se exige GET y PATCH en todas las operaciones del proceso y el rol explícito de la acción, incluso al administrador. La instancia se bloquea en PostgreSQL y los pasos y la auditoría se guardan en una transacción SERIALIZABLE. Cualquier fallo revierte todo. Conflictos de versión, precondiciones o serialización devuelven 409; consultar antes de reintentar. Repetir la misma clave, acción, versión y usuario no vuelve a ejecutar la acción; una clave reutilizada con otros datos se rechaza. Máximo 100 acciones por instancia.

## Límites que NO deben confundirse con soporte completo

- La instancia conserva su propia máquina de estados. Al iniciar se bloquea la edición y borrado CRUD de todos sus registros vinculados, incluso para administradores y después del cierre. Otro proceso no puede tomar el mismo registro. La reapertura es opt-in (`reopen` en la definición): libera `icase_process_locks` y vuelve a un estado no terminal. También se bloquean altas/bajas N:M y adjuntos sobre extremos bloqueados (409).
- La web incluye `/procesos` y, con plataforma móvil, una bandeja Expo equivalente: lista paginada, inicio, detalle, historial, acciones y reapertura. No hay búsqueda avanzada de instancias. Se requiere actualizar manualmente la bandeja para descubrir nuevas instancias creadas en otra sesión.
- No crea ni borra registros, no ejecuta sumas arbitrarias, pagos, tareas programadas, compensaciones o transacciones distribuidas. Una acción puede declarar `notify` por correo SMTP a roles locales; sin `SMTP_HOST`/`SMTP_FROM` responde 503 y no confirma la transición.
- Con `eventos_cambios`, cada aviso se guarda en `icase_process_outbox` dentro de la misma transacción que los cambios y la auditoría. Un worker publica solo filas confirmadas y marca el aviso cuando el transporte lo acepta. Si falla o el servidor termina antes de marcarlo, se reintenta. La web reconsulta la API autorizada; no se envían datos de los registros.
- Idempotencia de acciones dentro de una instancia; iniciar dos instancias diferentes no se deduplica automáticamente.
- Cada instancia guarda la huella de su definición. Si se modifica el proceso al regenerar, las instancias anteriores se bloquean con 409 hasta una migración explícita; nunca se reinterpretan silenciosamente. El primer bloque no incluye esa herramienta de migración.
- No se afirma aislamiento por propietario de registro: rige la autorización por operaciones de la aplicación generada.
- La aprobación de la etapa en iCase es distinta de aprobar una instancia del proceso en la aplicación generada.

La migración crea `icase_process_instances`; no borrar esa tabla para regenerar. Respaldar su contenido junto a los datos de negocio. La auditoría contiene IDs de actores, estados y fechas, no tokens ni claves en el endpoint de consulta. El motor debe someterse a prueba Docker del proyecto real antes de habilitar la exportación.

`0005_business_process_locks` crea bloqueos persistentes y reconstruye los de instancias previas compatibles. Si las definiciones cambiaron o dos instancias históricas reclaman el mismo registro, la migración falla y revierte, sin elegir una política ni borrar datos. Resolver explícitamente esas instancias antes de desplegar; no saltar la migración para permitir escrituras. Iniciar otra instancia sobre un registro bloqueado devuelve 409.

## Outbox durable de invalidaciones

Se activa automáticamente al combinar `procesos_negocio` y `eventos_cambios`. Sin eventos no se encolan avisos ni arranca el worker. La migración `0006_business_process_outbox` se conserva al regenerar y no borra instancias ni datos existentes.

- Una fila única por instancia, versión y operación. El reintento de una acción confirmada no crea otra fila.
- Workers concurrentes con `FOR UPDATE SKIP LOCKED`. Hasta diez avisos por ciclo, sondeo de un segundo; no se solapan ciclos del mismo worker.
- Timeout de publicación de cinco segundos; espera progresiva de 1 a 60 segundos. Los fallos no se descartan tras N intentos ni almacenan mensajes secretos del proveedor.
- Hasta 10 000 pendientes. Si se alcanza el límite, la acción devuelve 503 y revierte completa; no se confirma negocio sin guardar su aviso.
- Con el worker activo se limpian por lotes de hasta 100 los avisos entregados hace más de siete días. Nunca se purgan pendientes automáticamente. No se garantiza eliminación instantánea al cumplir siete días.

La semántica es **al menos una vez hacia el transporte**, no exactamente una vez ni confirmación por cliente. Un fallo después de publicar pero antes del ack puede duplicar avisos; son invalidaciones idempotentes, no instrucciones para volver a ejecutar acciones de negocio. También pueden llegar desordenadas entre workers. Socket.IO/Redis Pub/Sub no almacena replay para clientes desconectados; la reconexión y la consulta periódica siguen siendo necesarias. El cierre de un proceso no implica un correo o pago.

El outbox cubre las acciones del motor de procesos, no los avisos CRUD/N:M ajenos al motor. Redis no acumula comandos de publicación en una cola offline de memoria: un fallo vuelve al outbox persistente. La base de datos es el origen de los reintentos.

Si un aviso queda pendiente por una operación retirada del contrato o un transporte indisponible, requiere revisión del operador; no se elimina silenciosamente. Desactivar eventos deja de ejecutar el worker y conserva la cola. La infraestructura debe respaldar también el outbox y vigilar su volumen.

Diagnóstico SQL de solo lectura para operadores autorizados:

```sql
SELECT count(*) FILTER (WHERE delivered_at IS NULL) AS pendientes,
       count(*) FILTER (WHERE delivered_at IS NOT NULL) AS publicados,
       max(attempts) AS intentos_maximos
FROM icase_process_outbox;
```
