function useCaseLimits(requirements = []) {
  const count = (Array.isArray(requirements) ? requirements : []).filter(item => String(item.tipo || '').toUpperCase() === 'RF' && item.aprobado !== false && !['rechazado', 'fuera_de_alcance'].includes(item.estado_decision)).length;
  return { min: count === 1 ? 1 : 2, max: Math.max(14, count + 4), rf: count };
}
module.exports = { useCaseLimits };
