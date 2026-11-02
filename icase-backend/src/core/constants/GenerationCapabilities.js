/**
 * Capacidades que un requisito puede pedir y que el generador NO produce.
 *
 * La detección es por palabras clave sobre el nombre, la descripción y la métrica del RF: sirve para avisar, no para
 * demostrar que un RF «completo» no esconde otra cosa. Cada entrada dice qué ocurre en su lugar para que el aviso no sea
 * solo un «no».
 */
const CAPABILITIES = Object.freeze([
  {
    id: 'tiempo_real',
    etiqueta: 'Tiempo real',
    patron: /tiempo real|websocket|socket\.?io|en vivo|chat\b|notificaci[oó]n(?:es)? (?:push|instant[aá]nea)/i,
    alternativa: 'eventos_cambios invalida CRUD y N:M en React/Expo; eventos_replicas coordina por Redis con reautorización local. No acredita chat, push, replay ni un SLA de latencia/entrega.'
  },
  {
    id: 'archivos',
    etiqueta: 'Archivos e imágenes',
    patron: /\b(?:subir|cargar|adjuntar|adjunt[oa]s?)\b|\b(?:foto|fotograf[ií]a|imagen|im[aá]genes|logo|avatar)s?\b|almacenamiento de archivos/i,
    alternativa: 'El módulo opcional archivos_imagenes adjunta PNG/JPEG/PDF privados por registro (512 KiB) en Express/NestJS con JWT y almacenamiento local de un proceso. No incluye S3, antivirus ni gestión avanzada de medios.'
  },
  {
    id: 'reportes',
    etiqueta: 'Reportes, gráficos y exportación',
    patron: /\breportes?\b|\binformes?\b|estad[ií]sticas?|dashboard|panel de (?:control|indicadores)|gr[aá]ficos?|\bkpi\b|indicadores|exportar|imprimir|\bpdf\b|\bexcel\b|\bcsv\b/i,
    alternativa: 'El módulo opcional reportes_calculos ofrece agregados numéricos por operación y CSV/PDF autorizados, hasta 10000 registros o 2 MiB. No genera gráficos, reportes específicos ni cierres contables.'
  },
  {
    id: 'calculos',
    etiqueta: 'Cálculos y procesos de negocio',
    patron: /\bcalcul\w*|totaliz\w*|prorrate\w*|conciliaci[oó]n|liquidaci[oó]n|n[oó]mina|planilla|cierre (?:de caja|mensual|diario|contable)|autom[aá]ticamente (?:se )?(?:genera|calcula|asigna|aprueba|actualiza)|recomendaci[oó]n(?:es)? (?:autom|inteligent)|predic\w*/i,
    alternativa: 'Las reglas calculo confirmadas permiten fórmulas aritméticas acotadas. procesos_negocio es experimental PostgreSQL/JWT: estados, acciones por rol, actualizaciones transaccionales, bloqueo CRUD y bandeja web sobre definiciones confirmadas. Con eventos incluye outbox de invalidaciones al menos una vez al transporte, no confirmación por cliente. No inventa fórmulas ni implementa nóminas, conciliaciones o procesos contables completos.'
  },
  {
    id: 'notificaciones',
    etiqueta: 'Correo, SMS y notificaciones',
    patron: /\benvi\w*\b(?:\s+\S+){0,4}?\s+(?:por\s+|v[ií]a\s+)?(?:e-?mail|correo|sms|whatsapp|mensaje|notificaci[oó]n)|(?:confirm|notific|avis|inform|record)\w*\b(?:\s+\S+){0,3}?\s+por\s+(?:correo|e-?mail|sms|whatsapp)|\bnotific\w*|recordatorios?|\bsms\b|whatsapp|alertas? (?:por|v[ií]a)/i,
    alternativa: 'recuperacion_cuentas puede enviar enlaces por SMTP configurado. No es un motor general de notificaciones y no incluye SMS, WhatsApp o push.'
  },
  {
    id: 'pagos',
    etiqueta: 'Pagos en línea y facturación',
    patron: /pasarela|stripe|paypal|mercado\s?pago|webpay|culqi|payu|tarjeta de (?:cr[eé]dito|d[eé]bito)|pago(?:s)? en l[ií]nea|pagar en l[ií]nea|cobro(?:s)? en l[ií]nea|factura(?:ci[oó]n)? electr[oó]nica|comprobante(?:s)? electr[oó]nico/i,
    alternativa: 'pagos_prueba integra Checkout Stripe test e identifica confirmaciones firmadas e idempotentes. No se cobra dinero real ni se emite factura electrónica; no hay reembolsos ni conciliación.'
  },
  {
    id: 'ubicacion',
    etiqueta: 'Mapas y geolocalización',
    patron: /\bmapas?\b|geolocaliz\w*|\bgps\b|google maps|coordenadas|ubicaci[oó]n (?:en tiempo real|del (?:usuario|dispositivo))|geocerca/i,
    alternativa: 'mapas muestra coordenadas existentes con Leaflet y un proveedor de tiles configurado. No incluye geocodificación, seguimiento de ubicación, rutas o geocercas.'
  },
  {
    id: 'integraciones',
    etiqueta: 'Integraciones y acceso externo',
    patron: /\bapi (?:externa|de terceros)|servicio(?:s)? externo|integraci[oó]n con|sincroniz\w*|webhook|\berp\b|\bsunat\b|\breniec\b|\boauth\b|inicio de sesi[oó]n (?:con|mediante) (?:google|facebook|microsoft)|\bsso\b|\bldap\b|active directory/i,
    alternativa: 'sso_oidc integra identidades emisor+sujeto preautorizadas con PKCE y roles locales. No es un conector genérico de APIs/ERP/SAML ni autoprovisiona usuarios.'
  },
  {
    id: 'dispositivos',
    etiqueta: 'Cámara, códigos QR y biometría',
    patron: /c[aá]mara|escane\w*|c[oó]digo(?:s)? (?:qr|de barras)|\bqr\b|biom[eé]tric\w*|huella digital|reconocimiento (?:facial|de voz)|\bocr\b/i,
    alternativa: 'camara_qr lee QR mediante cámara web/Expo con permiso explícito. La lectura no valida una reserva/pago ni ejecuta enlaces; no incluye OCR, biometría o todos los formatos de barras.'
  },
  {
    id: 'cuentas',
    etiqueta: 'Recuperación de contraseña y verificación de cuenta',
    patron: /recuperar (?:la |su |mi )?contrase|restablecer (?:la |su |mi )?contrase|olvid[eé] (?:mi )?contrase|verificaci[oó]n (?:de|del) correo|verificar (?:el |su )?correo|autenticaci[oó]n de (?:dos|2) (?:factores|pasos)|\b2fa\b|\bmfa\b/i,
    alternativa: 'recuperacion_cuentas ofrece enlaces SMTP de un uso, caducidad e invalidación de sesiones al cambiar contraseña en Express/NestJS. No incluye verificación de correo, MFA ni 2FA.'
  }
]);

/** Límites que valen para todo proyecto generado, sin depender de lo que digan los RF. Algunos dependen de los módulos activos. */
function generalLimits({ formulariosTipados = false, paginacion = false, seed = false } = {}) {
  return [
    formulariosTipados
      ? 'La interfaz web muestra un formulario por campo y una tabla derivados del esquema de cada entidad, pero no reproduce el diseño de los mockups; una operación sin campos declarados se edita como JSON. La app móvil sigue usando JSON.'
      : 'La interfaz es genérica: cada requisito tiene una pantalla donde el registro se escribe como JSON en un cuadro de texto y las listas muestran el JSON; no hay formularios por campo ni tablas, ni se reproduce el diseño del mockup.',
    paginacion
      ? 'Las listas en la API y en la interfaz soportan paginación (parámetros page y limit), búsqueda textual (parámetro search) y filtros por campo.'
      : 'Las listas devuelven todos los registros: no hay paginación, filtros ni búsqueda.',
    seed
      ? 'Se generan datos iniciales (seed) deterministas derivados del esquema del modelo de dominio para pruebas de arranque.'
      : 'No se cargan datos iniciales (seed) salvo el usuario administrador.',
    'Los permisos son por rol y operación; no existe «propiedad» de registros (un usuario no queda limitado a los suyos).',
    'No extraer un ZIP sobre archivos modificados: usar la vista previa y aprobación de tools/update.cjs. Se preservan cambios manuales y se bloquean conflictos. Las migraciones automáticas son solo aditivas; restricciones/backfill requieren revisión.'
  ];
}

module.exports = { CAPABILITIES, generalLimits };
