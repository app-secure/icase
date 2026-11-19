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
  revisar(html, ajustes = [], { papel = null } = {}) {
    const defectos = [];
    const main = /<main\b[^>]*>([\s\S]*?)<\/main>/i.exec(String(html || ''));
    const body = main ? main[1] : (/<body\b[^>]*>([\s\S]*?)<\/body>/i.exec(String(html || '')) || [, html])[1];
    if ((ajustes || []).some((item) => /script (?:peligroso|no autorizado)/i.test(item))) {
      defectos.push('incluye un <script>: la maqueta es HTML estático; quita el script y escribe en el HTML las filas, tarjetas y valores de ejemplo');
    }
    if (/<tbody\b[^>]*>(?:\s|<tr\b[^>]*>\s*<td\b[^>]*>\s*(?:cargando|loading)[^<]*<\/td>\s*<\/tr>)*\s*<\/tbody>/i.test(body)) {
      defectos.push('hay tablas con el cuerpo vacío o con filas «Cargando…»; escribe 3 a 5 filas de ejemplo con datos del negocio');
    }
    // Una pantalla hace una sola cosa: un formulario no lleva listados, y un listado con formulario hermano no repite sus campos.
    if (papel?.tipo === 'form' && /<table\b[\s\S]*?<tbody\b[\s\S]*?(?:<tr\b[\s\S]*?){3}/i.test(body)) {
      defectos.push('es una pantalla de formulario y trae una tabla o listado; quita la tabla (un listado va en su propia pantalla) y deja solo el formulario');
    }
    if (papel?.tipo === 'list' && papel.formularioHermano) {
      const create = /<form\b[^>]*data-accion\s*=\s*["'][^"']*\.(?:crear|editar)["'][^>]*>([\s\S]*?)<\/form>/gi;
      let match;
      while ((match = create.exec(body)) !== null) {
        if ((match[1].match(/<(?:input|select|textarea)\b[^>]*name=/gi) || []).length >= 3) {
          defectos.push(`es un listado y dibuja el formulario de alta o edición completo; ese formulario es la pantalla «${papel.formularioHermano}». Deja el listado con un botón «Nuevo» (data-accion="ui")`);
          break;
        }
      }
    }
    return defectos;
  }
}

module.exports = MockupContentLint;
