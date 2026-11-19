/**
 * Qué papel cumple una pantalla del árbol: formulario, listado, detalle, tablero o acceso, y cuál es su formulario hermano.
 * Evita que el modelo mezcle en una pantalla lo que el árbol separó en dos («Registrar pedido» con su listado de pedidos y, además, la
 * pantalla «Formulario de pedido» con el mismo formulario).
 */
const strip = (value) => String(value || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

const VERB = /^(?:registrar|agregar|anadir|crear|nuevo|nueva|editar|modificar|reasignar|actualizar|cambiar)\b/;
const PREFIX = /^(?:pantalla de |formulario de |formulario |registrar |agregar |anadir |crear |nuevo |nueva |editar |modificar |reasignar |actualizar |cambiar |detalle de |listado de |historial de |mis |el |la |los |las |del |de )+/;

/** Sustantivo principal de una pantalla: «Registrar pedido web» → «pedido». */
const noun = (name) => strip(name).replace(PREFIX, '').replace(/\b(?:web|movil)\b/g, '').replace(/s\b/g, '').trim();

class MockupScreenRole {
  /**
   * @param {object} screen pantalla del árbol (`nombre`, `tipo`, `rf_trazabilidad`).
   * @param {object[]} all todas las pantallas del árbol, para encontrar su formulario hermano.
   * @returns {{ tipo: string, formularioHermano: string|null }}
   */
  static of(screen = {}, all = []) {
    const name = strip(screen.nombre || screen.nombre_visible || '');
    let tipo = screen.tipo || 'list';
    const verbStart = VERB.test(name);
    if (verbStart && tipo === 'list') tipo = 'form';

    const mine = new Set((screen.rf_trazabilidad || []).map((id) => String(id).toUpperCase()));
    const mineNoun = noun(name);
    const sibling = (all || []).find((other) => {
      if (other === screen || (other.slug && other.slug === screen.slug)) return false;
      const otherName = strip(other.nombre || other.nombre_visible || '');
      if (!/^formulario\b/.test(otherName)) return false;
      const shared = (other.rf_trazabilidad || []).some((id) => mine.has(String(id).toUpperCase()));
      const otherNoun = noun(otherName);
      const sameNoun = mineNoun.length >= 4 && otherNoun.length >= 4 && (mineNoun.includes(otherNoun) || otherNoun.includes(mineNoun));
      return sameNoun || (shared && !mineNoun);
    });

    // «Registrar pedido» junto a «Formulario de pedido»: la primera es el punto de entrada (listado), no un segundo formulario.
    if (sibling && verbStart && tipo === 'form') tipo = 'list';
    return { tipo, formularioHermano: sibling && tipo !== 'form' ? (sibling.nombre || sibling.nombre_visible) : null };
  }
}

module.exports = MockupScreenRole;
