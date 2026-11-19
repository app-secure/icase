/** Verbos válidos que declaran los mockups aprobados para cada RF ({ 'RF-06': ['consultar', 'editar'] }). */
function verbosPorRf(diseno) {
  const verbs = {};
  for (const link of (diseno?.mockups || []).flatMap((item) => item.enlaces || [])) {
    if (link.estado !== 'valido' || !link.rf || !link.verbo) continue;
    const key = String(link.rf).toUpperCase();
    verbs[key] = [...new Set([...(verbs[key] || []), link.verbo])];
  }
  return Object.fromEntries(Object.keys(verbs).sort().map((key) => [key, verbs[key].sort()]));
}

module.exports = { verbosPorRf };
