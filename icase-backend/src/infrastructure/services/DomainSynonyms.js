/**
 * Sinónimos de negocio (ya sin plural ni tildes) con los que un RF y una entidad del dominio hablan de lo mismo
 * aunque usen palabras distintas ("cobrar" un pedido = registrar un "pago" = una "transacción").
 * Solo entran equivalencias de uso casi universal; ante la duda, la palabra no se unifica.
 */
const GROUPS = {
  pago: ['cobro', 'cobrar', 'pagar', 'transaccion', 'abono', 'abonar'],
  reserva: ['reservacion', 'reservar'],
  informe: ['reporte', 'report'],
  respaldo: ['copia', 'backup'],
  recuperacion: ['restauracion', 'restaurar'],
  factura: ['comprobante', 'boleta'],
  plato: ['platillo'],
  // «sesión» no se unifica: «cierre de sesión de caja» no es autenticación. Las frases de acceso se resuelven en cada servicio.
  autenticacion: ['login', 'credencial']
};

const SYNONYMS = new Map(Object.entries(GROUPS).flatMap(([canonical, words]) => words.map((word) => [word, canonical])));

module.exports = { SYNONYMS, GROUPS };
