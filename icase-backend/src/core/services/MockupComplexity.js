/**
 * Complejidad de una pantalla de mockup, para elegir el modelo de IA según la dificultad:
 *  - «simple»: acceso, recuperación, detalles y formularios cortos de un solo requisito (un modelo barato las resuelve bien).
 *  - «densa»: listados, tableros, KDS, reportes, pedidos con líneas y pantallas con varios requisitos (conviene un modelo más fuerte).
 * La comparación de modelos mostró que los baratos necesitan reintentos justo en las pantallas densas.
 *
 * No se decide solo por el nombre: se suman señales del contenido (requisitos, criterios de aceptación y campos de sus operaciones).
 * Con `puntos >= 2` la pantalla es densa; `explicar` devuelve los motivos para dejarlos en el registro.
 */
const strip = (value) => String(value || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

const SIMPLE_NAME = /^(?:pantalla de )?(?:inicio de sesion|iniciar sesion|login|recuperacion|restablecer|detalle|formulario|perfil|mi perfil|confirmacion)\b/;
const DENSE_NAME = /\b(?:comanda|kds|reporte|panel|tablero|dashboard|pedido|catalogo|menu|mesa|cobro|cierre|usuario|reserva|paquete|recompensa|listado|historial|mapa|calendario|venta|inventario|plato|canje|precio)s?\b/;
// Lo que pide el requisito: vistas con varios elementos, datos que se actualizan o se cruzan.
const DENSE_TEXT = /\b(?:listar|listado|lista de|tabla|historial|reporte|resumen|panel|tablero|filtr\w*|buscar|busqueda|estadistic\w*|grafic\w*|tiempo real|en vivo|monitor\w*|kds|mapa|calendario|agrup\w*|ordenar|exportar|total(?:es)?|acumulad\w*|por rol|por estado)\b/g;
const LINES_TEXT = /\b(?:lineas? de|detalle de(?:l)? pedido|varios (?:platos|productos|items)|cada (?:plato|producto|item)|carrito|agregar (?:platos|productos))\b/;

const PASS = 2;

class MockupComplexity {
  /**
   * @param {object} input nombre/slug de la pantalla, `rfs` (ids), `requisitos` (registros de esos RF) y `operaciones` (contrato de enlaces).
   * @returns {{ complejidad: 'simple'|'densa', puntos: number, motivos: string[] }}
   */
  static explicar({ nombre = '', slug = '', rfs = [], requisitos = [], operaciones = [] } = {}) {
    const name = strip(nombre || String(slug).replace(/-/g, ' '));
    const ids = [...new Set([...(rfs || []), ...(requisitos || []).map((item) => item.identificador)].filter(Boolean).map((id) => String(id).toUpperCase()))];
    const motivos = [];
    let points = 0;
    const add = (value, reason) => { points += value; motivos.push(`${value > 0 ? '+' : ''}${value} ${reason}`); };

    if (SIMPLE_NAME.test(name)) add(-2, 'el nombre es de una pantalla simple (acceso, detalle o formulario)');
    else if (DENSE_NAME.test(name)) add(2, 'el nombre sugiere un listado o tablero');
    if (ids.length > 1) add(4, `trata ${ids.length} requisitos`);

    const mine = (requisitos || []).filter((item) => !ids.length || ids.includes(String(item.identificador).toUpperCase()));
    const text = strip(mine.map((item) => `${item.nombre || ''} ${item.descripcion || ''} ${(item.criterios_aceptacion || []).join(' ')}`).join(' '));
    const hits = new Set(text.match(DENSE_TEXT) || []);
    if (hits.size >= 2) add(2, `sus requisitos piden vistas de datos (${[...hits].slice(0, 3).join(', ')})`);
    else if (hits.size === 1) add(1, `sus requisitos piden una vista de datos (${[...hits][0]})`);
    if (LINES_TEXT.test(text)) add(4, 'sus requisitos describen líneas de detalle (pedido con varios elementos)');
    const criteria = mine.reduce((total, item) => total + (Array.isArray(item.criterios_aceptacion) ? item.criterios_aceptacion.length : 0), 0);
    if (criteria >= 4) add(1, `${criteria} criterios de aceptación`);

    const fields = (operaciones || []).filter((operation) => ids.includes(String(operation.id).toUpperCase()))
      .reduce((total, operation) => total + Object.values(operation.schema?.properties || {}).filter((property) => !property?.readOnly).length, 0);
    if (fields >= 7) add(1, `${fields} campos en sus operaciones`);
    const actors = new Set(mine.flatMap((item) => (Array.isArray(item.actores) ? item.actores : [])).map(strip));
    if (actors.size > 1) add(1, 'la usan varios actores');

    return { complejidad: points >= PASS ? 'densa' : 'simple', puntos: points, motivos };
  }

  /** @returns {'simple'|'densa'} */
  static of(input = {}) {
    return MockupComplexity.explicar(input).complejidad;
  }
}

module.exports = MockupComplexity;
