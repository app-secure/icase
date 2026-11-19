const example = { sintesis: { contexto: '', problema: '', objetivos: [], alcance: '' }, actores: [], inventario_necesidades: [] };
const instructions = `Devuelve las tres secciones obligatorias: ${JSON.stringify(example)}. Los objetivos son frases de resultados del proyecto, nunca IDs O-xx. Si no hay información suficiente conserva la sección y explica la incertidumbre en secciones_pendientes:[{seccion,motivo}]. No inventes contenido para llenar secciones. Separa resultados independientes y cualidades distintas; conserva filtros, estados y validaciones de una operación. Distingue acuerdos, propuestas y condiciones. Conserva funciones reguladas por permisos, tecnologías y preguntas abiertas. Las citas deben identificar actor, acción y condición: usa contexto literal suficiente, no verbos aislados repetidos.`;
function errors(value) {
  const result = [];
  if (!value || typeof value !== 'object') return ['Respuesta ausente o inválida'];
  for (const field of ['actores', 'inventario_necesidades']) if (!Array.isArray(value[field])) result.push(`${field}: sección ausente o tipo inválido`);
  if (!value.sintesis || typeof value.sintesis !== 'object' || Array.isArray(value.sintesis)) result.push('sintesis: sección ausente o tipo inválido');
  else {
    for (const field of ['contexto', 'problema', 'alcance']) if (typeof value.sintesis[field] !== 'string') result.push(`sintesis.${field}: debe ser texto`);
    if (!Array.isArray(value.sintesis.objetivos) || value.sintesis.objetivos.some(v => typeof v !== 'string' || /^O-\d+$/i.test(v.trim()))) result.push('sintesis.objetivos: requiere resultados legibles, no códigos aislados');
  }
  return result;
}
module.exports = { instructions, errors };
