# Tiempo real ampliado e integraciones especializadas

## Decisiones y límites

En **Módulos → Personalizado** se incorporan `eventos_replicas`, `pagos_prueba`, `sso_oidc`, `mapas` y `camara_qr`. Están desactivados por defecto. `eventos_replicas` exige seleccionar también `eventos_cambios`. La implementación inicial requiere Express/NestJS con JWT; los stacks no implementados se rechazan, no se reemplazan silenciosamente.

Se actualizaron las huellas para exigir nuevas generaciones y verificaciones. No cambian ZIP anteriores ni datos del proyecto activo. El catálogo sigue distinguiendo estos alcances acotados de capacidades completas como facturación fiscal, SLA de tiempo real, SAML, biometría o geocercas.

## Invalidaciones CRUD y N:M

Las asociaciones y desasociaciones notifican únicamente después del commit/transacción. Se invalidan las operaciones de ambos extremos; cada receptor necesita lectura sobre los dos. Nunca se envían IDs de registros, contenidos o permisos por el canal. El cliente vuelve a consultar por HTTP.

React actualiza las tablas, selectores y listas N:M. Un refresco de fondo no debe borrar la confirmación de una asociación propia ni vaciar los vínculos mientras llega la respuesta. Expo incorpora consulta y edición de vínculos salientes con permisos, además de pausar el canal en segundo plano y resincronizar al volver. La app móvil conserva su alcance genérico (operación inicial y primeros 50 vínculos); no sustituye una interfaz nativa diseñada para cada dominio.

Los avisos se agrupan y las colas son acotadas. Reconectar implica suscripción y reconsulta; una reconciliación HTTP cada 30 segundos activos recupera cambios perdidos. No se ofrece replay ni entrega garantizada de eventos. SQL externo, chat, push y presencia quedan fuera.

## Coordinación entre procesos

`EVENTS_REDIS_URL` y `EVENTS_NAMESPACE` coordinan invalidaciones mediante Redis Pub/Sub. El namespace debe ser distinto por aplicación y entorno; el emisor de un aviso no sustituye la autorización local de cada réplica. Un error de Redis desconecta sockets para que vuelvan a sincronizarse.

La infraestructura incorpora Redis privado de desarrollo y un override para dos réplicas:

```bash
docker compose -p MI_PROYECTO --env-file ops/.env -f ops/docker-compose.yml -f ops/docker-compose.events-replicas.yml up --build
```

Acceder por el frontend, no publicar un mismo puerto de backend para dos réplicas. Nginx resuelve el servicio dinámicamente; el transporte exclusivamente WebSocket no requiere afinidad de long-polling. Para aplicaciones distintas usar proyectos Compose distintos. Un Redis externo de producción necesita autenticación, TLS, ACL y operación revisada; se puede configurar una URL `rediss://`.

La infraestructura rechaza combinar réplicas con los módulos actuales de estado local: archivos, recuperación, pagos y SSO. Antes se deben sustituir esos almacenes por persistencia compartida revisada. No se acredita alta disponibilidad de Redis, failover completo ni SLA/latencia de una aplicación concreta.

## Pagos: Stripe test

El módulo crea Checkout únicamente con claves `sk_test_...`; rechaza claves live. Configurar `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `PAYMENT_NAMESPACE` único, `PAYMENT_RETURN_URL` HTTPS y `PAYMENT_BINDINGS`:

```json
{"rf-01":{"amountField":"importe_menor","currency":"usd"}}
```

El campo debe existir como entero y estar aprobado para expresar unidades menores de la moneda. No se selecciona automáticamente un número como precio ni se inventan impuestos o redondeo. El importe procede del registro del servidor, no del cuerpo enviado por el navegador. Crear checkout requiere GET/PATCH sobre la operación.

El ledger e idempotency key impiden que solicitudes simultáneas creen distintos checkouts para el mismo registro. El webhook comprueba firma sobre bytes originales, timestamp, modo test, sesión, moneda e importe. Repetirlo no duplica la confirmación. La URL de retorno no confirma pagos. El estado de la solicitud lo consulta su propietario o un administrador con acceso a la operación.

El ledger reside en `APP_DATA_DIR/payments`; requiere backup y un proceso. No hay cobros reales, reembolsos, suscripciones, facturas fiscales, conciliación o cumplimiento automático de pedidos/reservas. Eso necesita reglas y servicios adicionales.

## SSO OpenID Connect

Configurar `OIDC_ISSUER`, `OIDC_CLIENT_ID`, opcionalmente `OIDC_CLIENT_SECRET`, `OIDC_REDIRECT_URI` y `OIDC_APP_URL`. Fuera del entorno de pruebas se exige HTTPS. Solo se admiten identidades preautorizadas ligadas a cuentas locales activas:

```json
{"https://issuer.example":{"subject-estable":"usuario-local@example.com"}}
```

Ese es el formato de `OIDC_SUBJECTS`. La identidad es **issuer + subject**, no el correo que afirme el proveedor. El rol procede de la base local; no se autoaprovisionan usuarios ni se asciende un rol por claims externos.

El flujo web usa Authorization Code, PKCE S256, state ligado al navegador, nonce y validación JWKS de firma/issuer/audience/azp/exp/iat. State de cinco minutos y ticket de intercambio de 30 segundos, consumido una sola vez. Cookies HttpOnly/SameSite=Lax/Secure fuera del entorno de prueba. El intercambio exige el Origin aprobado y el JWT no aparece en una URL.

No incluye SAML, sincronización general de identidades ni SSO nativo Expo mediante deep links. Una prueba con un emisor simulado no acredita cuentas reales de Google, Microsoft u otro proveedor.

## Mapas y cámara/QR

`mapas` incorpora Leaflet en web. `MAP_FIELDS` debe identificar campos numéricos ya existentes; por ejemplo `{"rf-01":{"latitude":"latitud","longitude":"longitud"}}`. Configurar `MAP_TILE_URL` HTTPS y `MAP_ATTRIBUTION`. Si hace falta una clave de navegador, usar una pública restringida por dominio, nunca un secreto. Solo se solicitan tiles al pulsar «Mostrar mapa». Coordenadas fuera de rango se rechazan para visualización; no se inventan ubicaciones. No hay geocodificación, rutas, seguimiento GPS o mapa nativo Expo.

`camara_qr` solicita permiso al pulsar el botón, utiliza jsQR en web y CameraView en Expo, y cierra la cámara al leer/cerrar/pasar a segundo plano. No solicita audio. El contenido se muestra como **no validado**, hasta 2048 caracteres; no navega automáticamente a una URL ni autoriza una reserva o pago. En web usarlo como búsqueda requiere otra acción explícita. No incluye OCR ni biometría.

## Pruebas, credenciales y trazabilidad

Los tests pueden usar un fixture aprobado `modulos.pruebas_integracion` con solo nombres no secretos:

```json
{"operation":"rf-01","amountField":"importe_menor","latitude":"latitud","longitude":"longitud"}
```

Los campos deben existir en el modelo. La verificación iCase crea un proveedor local aislado: RSA/JWKS efímero, Checkout ficticio, webhook firmado y tiles/QR locales. No contacta Stripe ni proveedores OIDC reales. La prueba de QR usa una imagen QR real y un stream de cámara simulado; no acredita un sensor físico. Sin fixture o `TEST_PROVIDER_URL`, los casos especializados se indican como omitidos, no como validados.

La prueba de réplicas escribe por `backend_peer` y observa por `frontend → backend`, evitando confundir dos clientes de un proceso con coordinación entre servidores. La prueba de concurrencia usa 12 clientes y 30 escrituras; prueba el ciclo pausa/reanudación del mismo cliente que usa Expo. No representa una prueba de carga ni un SLA.

```bash
cd icase-backend
node scripts/verify-specialized-runtime.js realtime Express
node scripts/verify-specialized-runtime.js realtime NestJS
node scripts/verify-specialized-runtime.js integrations Express
node scripts/verify-specialized-runtime.js integrations NestJS
```

Los informes quedan en `verification-results/specialized/`. Los generadores incluyen OpenAPI, `backend/CHANGE-EVENTS.md` y `backend/INTEGRATIONS.md` en las entregas. El pipeline incorpora namespace por ejecución para Redis. Los tests de integración con proveedor siguen necesitando el fixture/servidor de prueba; actualizar la plantilla CI/CD no demuestra ejecución remota o integración real con proveedores.

Para una prueba manual en Expo Go: `node scripts/prepare-mobile-preview.js IP_LAN`, instalar dependencias en la carpeta móvil generada e iniciar Expo con la IP anunciada de la LAN. Se usan servicios y credenciales sintéticos; no se publican Redis ni la base. Si el teléfono no llega a `/health`, primero resolver conectividad privada. No modificar automáticamente el firewall o abrir un túnel público. Mantener esa prueba como pendiente hasta observar el comportamiento en el dispositivo.

## Referencias de implementación

### Evidencia móvil y despliegue entre réplicas

El 2 de noviembre de 2026 el usuario confirmó lectura QR y actualización inmediata de relaciones en ambos sentidos entre Expo Go en teléfono y la web del escenario sintético Biblioteca replicada. No se midió un SLA. Android necesitó permitir explícitamente el origen HTTP de la API en `CORS_ORIGINS`, además del origen web; no se habilitaron comodines ni se desactivó autenticación. El móvil muestra el estado del canal.

La prueba del Compose exportado verifica la salud del backend principal, de la réplica y del frontend antes de comenzar las operaciones. La réplica de prueba hereda explícitamente el servicio del Compose base; heredar solo la sección del overlay omitía la configuración de base de datos y provocaba conexiones a localhost. Se mantienen puertos sin publicar y credenciales sintéticas. Resultados y alcance en `icase-backend/verification-results/specialized/resultado.md` dentro del repositorio.

- [Stripe Checkout](https://docs.stripe.com/api/checkout/sessions/create) y [firmas y webhooks](https://docs.stripe.com/events/manage-webhook-endpoints).
- [OpenID Connect Core](https://openid.net/specs/openid-connect-core-1_0.html#IDTokenValidation).
- [Socket.IO y Redis](https://socket.io/docs/v4/redis-adapter): el Pub/Sub no es un registro durable. Aquí se utiliza un puente de invalidaciones para reautorizar antes de cada envío local, no un broadcast de datos de registros.
- [Expo Camera](https://docs.expo.dev/versions/latest/sdk/camera/), [Expo CLI](https://docs.expo.dev/more/expo-cli/) y [Leaflet estable](https://leafletjs.com/reference-1.9.4.html).
