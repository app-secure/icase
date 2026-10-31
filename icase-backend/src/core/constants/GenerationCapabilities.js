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
    alternativa: 'Los datos se consultan al abrir o recargar la pantalla; no hay actualización automática ni canal de eventos.'
  },
  {
    id: 'archivos',
    etiqueta: 'Archivos e imágenes',
    patron: /\b(?:subir|cargar|adjuntar|adjunt[oa]s?)\b|\b(?:foto|fotograf[ií]a|imagen|im[aá]genes|logo|avatar)s?\b|almacenamiento de archivos/i,
    alternativa: 'No hay subida ni descarga de archivos; el registro solo guarda campos de texto, números y fechas.'
  },
  {
    id: 'reportes',
    etiqueta: 'Reportes, gráficos y exportación',
    patron: /\breportes?\b|\binformes?\b|estad[ií]sticas?|dashboard|panel de (?:control|indicadores)|gr[aá]ficos?|\bkpi\b|indicadores|exportar|imprimir|\bpdf\b|\bexcel\b|\bcsv\b/i,
    alternativa: 'Las listas muestran los registros tal cual; no se agregan, totalizan ni exportan.'
  },
  {
    id: 'calculos',
    etiqueta: 'Cálculos y procesos de negocio',
    patron: /\bcalcul\w*|totaliz\w*|prorrate\w*|conciliaci[oó]n|liquidaci[oó]n|n[oó]mina|planilla|cierre (?:de caja|mensual|diario|contable)|autom[aá]ticamente (?:se )?(?:genera|calcula|asigna|aprueba|actualiza)|recomendaci[oó]n(?:es)? (?:autom|inteligent)|predic\w*/i,
    alternativa: 'Los valores se escriben a mano; las reglas solo validan (requerido, único, rango, longitud, formato, comparación, estados, inmutable, valor por defecto) y no calculan.'
  },
  {
    id: 'notificaciones',
    etiqueta: 'Correo, SMS y notificaciones',
    patron: /\benvi\w*\b(?:\s+\S+){0,4}?\s+(?:por\s+|v[ií]a\s+)?(?:e-?mail|correo|sms|whatsapp|mensaje|notificaci[oó]n)|(?:confirm|notific|avis|inform|record)\w*\b(?:\s+\S+){0,3}?\s+por\s+(?:correo|e-?mail|sms|whatsapp)|\bnotific\w*|recordatorios?|\bsms\b|whatsapp|alertas? (?:por|v[ií]a)/i,
    alternativa: 'La aplicación no envía mensajes; el correo solo existe como un dato más del registro.'
  },
  {
    id: 'pagos',
    etiqueta: 'Pagos en línea y facturación',
    patron: /pasarela|stripe|paypal|mercado\s?pago|webpay|culqi|payu|tarjeta de (?:cr[eé]dito|d[eé]bito)|pago(?:s)? en l[ií]nea|pagar en l[ií]nea|cobro(?:s)? en l[ií]nea|factura(?:ci[oó]n)? electr[oó]nica|comprobante(?:s)? electr[oó]nico/i,
    alternativa: 'Se puede registrar un pago como dato, pero no se cobra ni se emite factura electrónica.'
  },
  {
    id: 'ubicacion',
    etiqueta: 'Mapas y geolocalización',
    patron: /\bmapas?\b|geolocaliz\w*|\bgps\b|google maps|coordenadas|ubicaci[oó]n (?:en tiempo real|del (?:usuario|dispositivo))|geocerca/i,
    alternativa: 'La dirección o las coordenadas se guardan como texto o número; no hay mapa ni cálculo de rutas.'
  },
  {
    id: 'integraciones',
    etiqueta: 'Integraciones y acceso externo',
    patron: /\bapi (?:externa|de terceros)|servicio(?:s)? externo|integraci[oó]n con|sincroniz\w*|webhook|\berp\b|\bsunat\b|\breniec\b|\boauth\b|inicio de sesi[oó]n (?:con|mediante) (?:google|facebook|microsoft)|\bsso\b|\bldap\b|active directory/i,
    alternativa: 'La aplicación funciona sola, con su propia base de datos y usuarios; no se conecta a otros sistemas.'
  },
  {
    id: 'dispositivos',
    etiqueta: 'Cámara, códigos QR y biometría',
    patron: /c[aá]mara|escane\w*|c[oó]digo(?:s)? (?:qr|de barras)|\bqr\b|biom[eé]tric\w*|huella digital|reconocimiento (?:facial|de voz)|\bocr\b/i,
    alternativa: 'No se accede al hardware del dispositivo; los códigos se escriben como texto.'
  },
  {
    id: 'cuentas',
    etiqueta: 'Recuperación de contraseña y verificación de cuenta',
    patron: /recuperar (?:la |su |mi )?contrase|restablecer (?:la |su |mi )?contrase|olvid[eé] (?:mi )?contrase|verificaci[oó]n (?:de|del) correo|verificar (?:el |su )?correo|autenticaci[oó]n de (?:dos|2) (?:factores|pasos)|\b2fa\b|\bmfa\b/i,
    alternativa: 'Las cuentas las administra un usuario con permiso; no hay envío de enlaces de recuperación ni segundo factor.'
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
    'Si se vuelve a generar el código se pierden las ediciones manuales hechas en los archivos.'
  ];
}

module.exports = { CAPABILITIES, generalLimits };
