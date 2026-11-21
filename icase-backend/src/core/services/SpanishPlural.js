/**
 * Singular de una palabra española ya normalizada (minúsculas, sin tildes) para comparar términos.
 * «-es» solo se quita tras consonante (vendedores → vendedor, operaciones → operacion); en «clientes» o «reportes»
 * sobra solo la «s». Quitar siempre «-es» dejaba «clientes» en «client», que no coincide con «cliente», y hacía que
 * los validadores y la trazabilidad descartaran «Gestionar clientes» de pantallas y diagramas que sí lo cubren.
 */
function singular(token) {
  const value = String(token || '');
  if (value.length > 6 && /[lrndzj]es$/.test(value)) return value.slice(0, -2);
  if (value.length > 4 && value.endsWith('s')) return value.slice(0, -1);
  return value;
}

module.exports = { singular };
