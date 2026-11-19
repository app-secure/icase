/**
 * Complejidad de una pantalla de mockup, para elegir el modelo de IA según la dificultad:
 *  - «simple»: acceso, recuperación, detalles y formularios de un solo requisito (un modelo barato las resuelve bien).
 *  - «densa»: listados, tableros, KDS, reportes, pedidos con líneas y cualquier pantalla con varios requisitos (conviene un modelo más fuerte).
 * La comparación de modelos mostró que los baratos necesitan reintentos justo en las pantallas densas.
 */
const strip = (value) => String(value || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

const SIMPLE = /^(?:pantalla de )?(?:inicio de sesion|iniciar sesion|login|recuperacion|restablecer|detalle|formulario|perfil|mi perfil|confirmacion)\b/;
const DENSE = /\b(?:comanda|kds|reporte|panel|tablero|dashboard|pedido|catalogo|menu|mesa|cobro|cierre|usuario|reserva|paquete|recompensa|listado|historial|mapa|calendario|venta|inventario|plato|canje|precio)s?\b/;

class MockupComplexity {
  /** @returns {'simple'|'densa'} */
  static of({ nombre = '', slug = '', rfs = [] } = {}) {
    const name = strip(nombre || String(slug).replace(/-/g, ' '));
    if (SIMPLE.test(name)) return (rfs || []).length > 1 ? 'densa' : 'simple';
    if ((rfs || []).length > 1 || DENSE.test(name)) return 'densa';
    return 'simple';
  }
}

module.exports = MockupComplexity;
