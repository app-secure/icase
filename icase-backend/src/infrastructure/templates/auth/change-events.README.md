# Invalidaciones CRUD y N:M

Socket.IO sobre el puerto HTTP, transporte WebSocket, `auth.token` con JWT. `subscribe` recibe claves de operaciones y confirma `{ok:true}`. `records:changed` contiene únicamente `operation` y `method`; no contiene registros, IDs ni permisos. Siempre volver a consultar la API autorizada.

Las escrituras CRUD notifican después de completarse. Las asociaciones/desasociaciones notifican tras COMMIT (o tras la transacción MongoDB). Un fallo de transacción no notifica. Antes de avisar se revalidan sesión y GET; para N:M se requieren permisos de lectura sobre ambos extremos. Operaciones alias se invalidan juntas.

React actualiza registros, selectores y vínculos sin borrar el formulario ni la confirmación de la acción. Expo incluye vínculos salientes de la operación seleccionada, pausa en segundo plano y reconsulta al volver. Se elimina la conexión al desmontar/cerrar sesión. Al reconectar se suscribe y reconsulta; adicionalmente, cada 30 segundos activos se reconcilia por HTTP para recuperar avisos perdidos. No es un registro durable de eventos.

## Réplicas

Activar `eventos_cambios` y `eventos_replicas`. Configurar `EVENTS_NAMESPACE` único por aplicación y entorno. La infraestructura incorpora Redis sin publicar su puerto; `EVENTS_REDIS_URL` puede apuntar a un Redis externo con autenticación/TLS (`rediss://`). El Redis local es una configuración de desarrollo, no una certificación de seguridad de producción.

Desde la raíz de una entrega configurada:

```bash
docker compose -p MI_PROYECTO --env-file ops/.env -f ops/docker-compose.yml -f ops/docker-compose.events-replicas.yml up --build
```

Usar la API a través del frontend: el override evita el conflicto de publicar un mismo puerto de backend en dos réplicas. Nginx resuelve dinámicamente el servicio. WebSocket evita requerir afinidad de sesiones HTTP long-polling. Redis Pub/Sub distribuye solo avisos; cada réplica reautoriza a sus propios clientes. Namespace y proyecto Compose deben ser distintos entre aplicaciones/entornos.

Las colas se acotan a 200 invalidaciones distintas y coalescen repeticiones. Hasta 200 conexiones por proceso, 300 intentos por IP/minuto, 30 cambios de suscripción por socket/minuto y 20 claves por suscripción. Cuerpo Socket.IO máximo 8 KiB; los mensajes internos Redis tienen límite de 16 KiB. Los errores de Redis desconectan sockets para forzar resincronización posterior. No se confirma una garantía de latencia, escalado, SLA o entrega: debe probarse con la carga real de cada aplicación.

No combinar réplicas con módulos que mantienen estado privado local (archivos, recuperación, pagos, SSO): la infraestructura lo rechaza hasta disponer de persistencia compartida revisada. No incluye SQL externo, chat, push, replay, presencia o failover del propio Redis.

## Pruebas generadas

Para Expo/Android con acceso directo a la API, incluir también el origen HTTP(S) público de esa API en `CORS_ORIGINS`, separado por comas del origen web. Android puede enviar ese `Origin` durante el handshake WebSocket. Usar direcciones explícitas, nunca `*`; JWT y permisos siguen siendo obligatorios. Si cambia la IP LAN, actualizar los orígenes, la publicación de puertos y `EXPO_PUBLIC_API_URL`, y reiniciar Metro. La pantalla móvil muestra el estado del canal; la reconciliación periódica no demuestra entrega inmediata por WebSocket.

La suite prueba 12 clientes y 30 escrituras concurrentes, pausa/reanudación del cliente compartido por Expo, recuperación offline y N:M entre usuarios. La verificación de réplicas escribe contra `backend_peer` y observa las vistas conectadas a `backend`, para no confundir dos usuarios de un único proceso con coordinación entre servidores. Compilar Expo y simular su ciclo de vida no certifica hardware móvil.
