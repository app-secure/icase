/**
 * Reglas de sentido común que no inventan cifras: un importe o una cantidad no son negativos y una fecha de cierre no
 * es anterior a la de apertura. Se proponen como pendientes: una persona las confirma o las rechaza como cualquier otra.
 * Es determinista y solo mira los nombres y tipos del modelo de dominio aprobado.
 */
const strip = (value) => String(value || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');

const NON_NEGATIVE = /^(?:precio|monto|importe|costo|subtotal|total[a-z0-9]*|saldo|cantidad|stock|existencia|puntos|capacidad|tarifa|peso|duracion|descuento|comision|propina)$/;

// Pares (inicio -> fin) de fechas: el fin no puede ser anterior al inicio.
const PAIRS = [['apertura', 'cierre'], ['inicio', 'fin'], ['desde', 'hasta'], ['entrada', 'salida'], ['emision', 'vencimiento']];

const baseOf = (name) => strip(name).replace(/^(?:fechahora|fecha|hora)/, '');

class SanityRuleService {
  /**
   * @param {Array} entidades entidades del modelo de dominio (con `schema.properties`)
   * @param {Map<string,string[]>|Object} rfPorEntidad RF que sustentan cada entidad, por clave de entidad
   */
  derivar({ entidades = [], rfPorEntidad = {} } = {}) {
    const lookup = (entity) => (rfPorEntidad instanceof Map ? rfPorEntidad.get(entity.key) : rfPorEntidad[entity.key]) || [];
    const reglas = [];
    for (const entity of entidades) {
      const rf = lookup(entity);
      if (!rf.length) continue;
      const properties = Object.entries(entity.schema?.properties || {}).filter(([name, property]) => name !== 'id' && !property['x-references'] && property.type !== 'array');
      for (const [name, property] of properties) {
        if (['number', 'integer'].includes(property.type) && NON_NEGATIVE.test(strip(name))) {
          reglas.push({ id: `SEN-${entity.key}-${name}`, tipo: 'rango', entidad: entity.name, campo: name, min: 0, rf, origen: 'inferido', estado_decision: 'pendiente',
            mensaje: `${name} no puede ser negativo.`, justificacion: 'Un importe o una cantidad no puede ser negativo.' });
        }
      }
      const temporal = properties.filter(([, property]) => property.type === 'string' && ['date', 'date-time'].includes(property.format));
      for (const [start, end] of PAIRS) {
        const from = temporal.find(([name]) => baseOf(name) === start);
        const to = temporal.find(([name]) => baseOf(name) === end);
        if (from && to && from[1].format === to[1].format) {
          reglas.push({ id: `SEN-${entity.key}-${to[0]}-${from[0]}`, tipo: 'comparacion', entidad: entity.name, campo: to[0], operador: '>=', con_campo: from[0], rf, origen: 'inferido', estado_decision: 'pendiente',
            mensaje: `${to[0]} no puede ser anterior a ${from[0]}.`, justificacion: 'El fin de un período no puede ocurrir antes de su inicio.' });
        }
      }
    }
    return reglas;
  }
}

module.exports = SanityRuleService;
