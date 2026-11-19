const contract = require('./InitialAnalysisContract');
module.exports = async function repair(extraction, input, request) {
  const errors = contract.errors(extraction);
  if (!errors.length) return { value: extraction, estado: 'no_necesaria' };
  let response;
  try {
    response = await request('reparacion_secciones_analisis', `${contract.instructions}\nRepara SOLO las secciones ausentes o inválidas indicadas. No devuelvas ni modifiques inventario_necesidades. Conserva datos correctos; no inventes contenido. Devuelve un objeto con sintesis y actores cuando requieran corrección.\nERRORES:${JSON.stringify(errors)}\nANÁLISIS:${JSON.stringify(extraction)}\nCONTENIDO ORIGINAL:${input}`);
  } catch { return { value: extraction, estado: 'fallo_proveedor', errores: errors }; }
  const candidate = { ...extraction };
  for (const field of ['sintesis', 'actores']) if (errors.some(e => e.startsWith(field)) && response?.[field] !== undefined) candidate[field] = response[field];
  const remaining = contract.errors(candidate);
  return remaining.length ? { value: extraction, estado: 'invalida', errores: remaining } : { value: candidate, estado: 'reparada_pendiente_revision' };
};
