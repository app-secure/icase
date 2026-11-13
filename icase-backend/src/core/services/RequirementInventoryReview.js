const normalize = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
// Solo selecciona candidatos para revisión semántica; no divide ni reclasifica por palabras.
function candidates(inventory) {
  return inventory.filter(item => {
    const text = normalize(item.necesidad).replace(/\bdisponibilidad actualizada\b/g, 'disponibilidad').replace(/\bdesde (?:la |su )?toma\b/g, 'antiguedad');
    if (['RF', 'RNF'].includes(item.tipo)) {
      const source = `${item.necesidad || ''} ${item.evidencia || ''}`;
      if (/confirma que|[¿?]/.test(source) || /^(?:no\b|pero no|sin que|solamente|únicamente|unicamente)\b/i.test(String(item.necesidad || '').trim())) return false;
      if (item.tipo === 'RNF' && [/segur|confidencial|integridad/, /usabil|facilidad de uso|aprendi/, /rendimiento|latencia|tiempo de respuesta/, /disponibilidad|continuidad/, /recuper|respald/].filter(pattern => pattern.test(text)).length >= 2) return true;
      const families = [/consult|visualiz|\bver\b|\brevis/, /\b(?:tomar|toman|registrar|registra|registran|crear|crean|comprar|compra|compran|reservar|reservan|pedir|pide|piden)\b/, /modific|actualiz|\bmarca|\bcambiar\b|\bcambia\b|\breasign/, /\bcerr|\bcierr/, /valid|escane/, /\bcobra|\bcobro\b/, /acumul/, /\bgestion/].filter(pattern => pattern.test(text));
      return families.length >= 2;
    }
    return false;
  });
}
async function review({ inventory, input, request, inspect }) {
  const targets = candidates(inventory);
  if (!targets.length) return { inventory, diagnostic: { estado: 'sin_candidatos', candidatos: [] } };
  const diagnostic = { estado: 'pendiente', candidatos: targets.map(item => item.id) };
  let response;
  try { response = await request(`REVISIÓN ACOTADA DEL INVENTARIO ANTES DE REDACTAR. ${require('../../infrastructure/services/RequirementGranularityPolicy')}
Las señales léxicas seleccionaron candidatos, NO prueban defectos. Comprueba contra TODO el insumo. Devuelve JSON {"correcciones":[{"id":"N-existente","elementos":[]}]} solo cuando se necesite separar resultados o rescatar una obligación positiva oculta en una regla/decisión. Para elementos correctos no devuelvas cambios. Cada sustitución debe conservar TODO lo sustentado del original: usa su ID en el primer elemento y nuevos IDs N/O únicos para los adicionales. No elimines una restricción ni transformes prohibiciones o exclusiones en funciones. No confundas medios de pago, saldo necesario para cobrar, filtros o estados con objetivos independientes. Para cada elemento incluye tipo, necesidad, objetivo_id si es RF/RNF, estado y evidencias literales con fuente. El inventario no seleccionado es inmutable.
CANDIDATOS: ${JSON.stringify(targets)}
INVENTARIO PARA EVITAR DUPLICADOS: ${JSON.stringify(inventory)}
INSUMO ORIGINAL: ${input}`); } catch { return { inventory, diagnostic }; }
  if (!Array.isArray(response?.correcciones)) return { inventory, diagnostic };
  const selected = new Set(targets.map(item => item.id));
  const patches = new Map();
  for (const patch of response.correcciones) {
    if (!selected.has(patch.id) || patches.has(patch.id) || !Array.isArray(patch.elementos) || !patch.elementos.length || patch.elementos[0].id !== patch.id) continue;
    patches.set(patch.id, patch.elementos);
  }
  const next = inventory.flatMap(item => patches.get(item.id) || [item]);
  const checked = inspect(next, input);
  if (checked.invalid.length) return { inventory, diagnostic: { ...diagnostic, estado: 'respuesta_invalida', causas: checked.invalid.map(item => ({ id: item.id, errores: item.errores })) } };
  await require('../../infrastructure/services/RequirementExecutionContext').validated('revision_inventario', response);
  return { inventory: checked.valid, diagnostic: { ...diagnostic, estado: patches.size ? 'aplicada' : 'sin_cambios_propuestos', corregidos: [...patches.keys()], limites: 'Revisión asistida por IA; conservar evidencia no demuestra por sí solo equivalencia semántica.' } };
}
module.exports = { candidates, review };
