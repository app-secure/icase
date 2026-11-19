# Integraciones especializadas (opcionales)

Express/NestJS con JWT. Las credenciales se configuran en el entorno de despliegue: nunca en prompts, RF, frontend, fixtures o control de versiones. Sin configuración, la operación responde 503 con una explicación; no se simula éxito. No se soportan todavía las variantes de estos módulos en otros stacks.

## Stripe test

Configurar `STRIPE_SECRET_KEY` (`sk_test_...`), `STRIPE_WEBHOOK_SECRET`, `PAYMENT_NAMESPACE` único por aplicación/entorno, `PAYMENT_RETURN_URL` HTTPS y `PAYMENT_BINDINGS` con campos aprobados:

```json
{"rf-01":{"amountField":"importe_menor","currency":"usd"}}
```

El campo debe existir como entero y representar explícitamente unidades menores de la moneda aprobada. No se deduce qué campo es un importe ni se inventan impuestos, tasas o redondeos. `POST /api/integrations/payments/{operation}/{record}` exige GET y PATCH; toma el importe del registro, no del cuerpo del cliente. Las solicitudes simultáneas reutilizan el mismo checkout mediante ledger e idempotency key aislada por namespace. Un cambio incompatible de precio/propietario se rechaza, no genera otro cobro implícito.

`POST /api/integrations/payments/webhook` comprueba HMAC de los bytes originales, timestamp de cinco minutos, modo test, sesión, importe y moneda antes de marcar el ledger como pagado. La URL de retorno no confirma pagos. `GET /api/integrations/payments/status/{reference}` requiere al propietario de la solicitud o un administrador, además de GET sobre la operación. La interfaz abre el Checkout en otra pestaña y consulta el estado verificado.

Se rechazan claves live. No hay cobros reales, reembolsos, suscripciones, facturas fiscales, conciliación ni cumplimiento automático de un pedido/reserva: eso requiere reglas de negocio adicionales. El ledger conserva el estado en `APP_DATA_DIR/payments`; respaldarlo. Este módulo no admite réplicas sin sustituir el estado local por una implementación compartida revisada.

## SSO OpenID Connect

Configurar `OIDC_ISSUER`, `OIDC_CLIENT_ID`, opcionalmente `OIDC_CLIENT_SECRET`, `OIDC_REDIRECT_URI` (callback público HTTPS) y `OIDC_APP_URL` (URL de la web). Las identidades deben estar preaprovisionadas como cuentas locales activas; su rol siempre procede de la base local.

`OIDC_SUBJECTS` identifica explícitamente **emisor + sujeto**, no el correo declarado por el proveedor:

```json
{"https://issuer.example":{"subject-inmutable-del-proveedor":"usuario-local@example.com"}}
```

Flujo `/api/integrations/sso/start` → proveedor → `/api/integrations/sso/callback` → web → `POST /api/integrations/sso/session`. Authorization Code con PKCE S256, state ligado a cookie de navegador, nonce, JWKS, firmas RS256/ES256, issuer/audience/azp, exp/iat. El state caduca a los cinco minutos; el ticket de intercambio caduca a los 30 segundos y se consume una sola vez. Las cookies son HttpOnly/SameSite=Lax y Secure fuera del entorno de prueba. El intercambio exige el Origin de la aplicación. No se transporta un JWT en la URL.

No autoasigna roles por claims ni vincula una cuenta por coincidencia de correo. No hay SAML, aprovisionamiento automático ni un flujo nativo Expo con deep links. La implementación web necesita HTTPS y configuración real del proveedor; una prueba con emisor simulado no acredita Google/Microsoft/Auth0 reales.

## Mapas

Configurar `MAP_FIELDS` únicamente con campos numéricos del modelo aprobado:

```json
{"rf-01":{"latitude":"latitud","longitude":"longitud"}}
```

Configurar `MAP_TILE_URL` HTTPS, por ejemplo la plantilla de tiles de un proveedor autorizado con `{z}/{x}/{y}`, y `MAP_ATTRIBUTION`. Si el proveedor requiere clave de navegador, utilizar una clave pública restringida por dominio; nunca una clave privada. `GET /api/integrations/maps/{operation}` exige GET y valida los campos. El proveedor se consulta solo al pulsar «Mostrar mapa». Latitud/longitud fuera de rango no se muestran.

Leaflet se usa en la web; no se generan coordenadas, geocodificación, rutas, geocercas ni seguimiento GPS. El proveedor recibe las solicitudes de tiles: revisar privacidad, licencia, atribución y cuotas. No se incluye una vista cartográfica nativa Expo.

## Cámara y QR

La web solicita permiso solo al pulsar «Escanear QR», utiliza jsQR y detiene el stream al cerrar, leer o pasar a segundo plano. HTTPS/localhost y navegador compatible son necesarios. Expo utiliza CameraView y permiso de cámara; se detiene al salir de primer plano. No se solicita micrófono para esta función.

Se muestra el texto como **contenido leído, no validado**, máximo 2048 caracteres. No se abre una URL ni se ejecuta una compra/validación de reserva automáticamente. En web, usarlo como búsqueda requiere pulsar otro botón. No se incluyen OCR, biometría o todos los formatos de barras.

## Entornos y pruebas

### Comprobación previa sin llamadas externas

Desde `backend/`, ejecutar `npm run check:integrations` con Node.js 22.12+ y la configuración en `.env` o variables del proceso. También está disponible en la imagen Docker: `docker compose exec backend npm run check:integrations` desde `ops/`. Comprueba únicamente módulos seleccionados y devuelve código 1 ante errores de configuración, sin imprimir secretos, URLs o identidades. No crea sesiones, cobros ni solicitudes a proveedores.

Se validan modo test, namespace, URLs HTTPS, campos enteros aprobados para importes y campos numéricos para mapas. OIDC exige mapeo explícito emisor/sujeto y callback en el mismo origen que la aplicación para el intercambio mediante cookie. Cámara queda como prueba manual pendiente. Un resultado `ready: true` solo significa configuración local coherente: aún hay que comprobar credenciales reales de sandbox, webhook firmado, cuenta local activa y navegador/dispositivo. No colocar secretos en el chat, en prompts ni en Git.

El manifiesto puede contener un fixture aprobado `pruebas_integracion` con solo nombres de operación/campos: `operation`, `amountField`, `latitude`, `longitude`. No admite secretos. La verificación de iCase crea un proveedor local aislado, claves RSA efímeras y credenciales ficticias; no contacta Stripe ni proveedores SSO reales. Los tests comprueban firma JWT/JWKS real, PKCE, checkout idempotente, webhook firmado/repetido, tiles locales y QR real con cámara simulada. Sin fixture/proveedor de prueba, esos casos se marcan como omitidos, nunca como validados contra un proveedor real.

Para repetir desde el repositorio iCase:

```bash
node scripts/verify-specialized-runtime.js integrations Express
node scripts/verify-specialized-runtime.js integrations NestJS
node scripts/verify-specialized-runtime.js realtime Express
node scripts/verify-specialized-runtime.js realtime NestJS
```

El SDK móvil se compila y se prueba el cliente de eventos compartido, pero eso no equivale a probar un dispositivo. Los fixtures se limitan a PostgreSQL en esta matriz. No se acredita SLA, seguridad de producción, hardware móvil o conectividad LAN del usuario sin sus pruebas respectivas.
