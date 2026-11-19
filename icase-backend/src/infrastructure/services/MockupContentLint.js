/**
 * Defectos de contenido que no se reparan sin inventar: la IA debe volver a generar la pantalla. Cada mensaje dice qué corregir.
 * Lo que sí se puede arreglar de forma determinista (filas «Cargando…», clases sin definir) lo hace MockupContentRepair.
 */
class MockupContentLint {
  /**
   * @param {string} html HTML ya saneado de la pantalla.
   * @param {string[]} ajustes Avisos del saneamiento (para saber si se eliminó un script).
   * @returns {string[]} mensajes de defectos; vacío si la pantalla es aceptable.
   */
  revisar(html, ajustes = []) {
    const defectos = [];
    const main = /<main\b[^>]*>([\s\S]*?)<\/main>/i.exec(String(html || ''));
    const body = main ? main[1] : (/<body\b[^>]*>([\s\S]*?)<\/body>/i.exec(String(html || '')) || [, html])[1];
    if ((ajustes || []).some((item) => /script (?:peligroso|no autorizado)/i.test(item))) {
      defectos.push('incluye un <script>: la maqueta es HTML estático; quita el script y escribe en el HTML las filas, tarjetas y valores de ejemplo');
    }
    if (/<tbody\b[^>]*>(?:\s|<tr\b[^>]*>\s*<td\b[^>]*>\s*(?:cargando|loading)[^<]*<\/td>\s*<\/tr>)*\s*<\/tbody>/i.test(body)) {
      defectos.push('hay tablas con el cuerpo vacío o con filas «Cargando…»; escribe 3 a 5 filas de ejemplo con datos del negocio');
    }
    return defectos;
  }
}

module.exports = MockupContentLint;
