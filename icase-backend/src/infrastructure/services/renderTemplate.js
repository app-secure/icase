/**
 * Sustituye marcadores `__NOMBRE__` en una plantilla.
 * Una sola pasada sobre la plantilla: los valores insertados no se vuelven a interpretar, se reemplazan
 * todas las ocurrencias (también las de comentarios) y un marcador sin valor lanza un error, para que
 * una plantilla mal rellenada no llegue como código roto al proyecto generado.
 */
function renderTemplate(source, values) {
  const used = new Set();
  const result = String(source).replace(/\b__([A-Z][A-Z0-9_]*)__\b/g, (_match, name) => {
    if (!Object.prototype.hasOwnProperty.call(values, name)) throw new Error(`La plantilla tiene un marcador sin valor: __${name}__.`);
    used.add(name);
    return String(values[name]);
  });
  const unused = Object.keys(values).filter((name) => !used.has(name));
  if (unused.length) throw new Error(`La plantilla no usa los valores: ${unused.join(', ')}.`);
  return result;
}

module.exports = renderTemplate;
