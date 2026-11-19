module.exports = function merge(content, { id, ids = [], contenido }) {
  const inventory = content.inventario || [];
  const target = inventory.find(item => item.id === id);
  const selected = [...new Set([id, ...ids])];
  const rows = selected.map(key => inventory.find(item => item.id === key));
  if (!target || rows.some(item => !item || item.tipo !== target.tipo || ['rechazado', 'fuera_de_alcance'].includes(item.estado)) || rows.length < 2 || !String(contenido || '').trim()) throw Object.assign(new Error('Selecciona al menos dos elementos activos del mismo tipo y revisa el contenido final.'), { status: 400 });
  if (target.tipo === 'pregunta') throw Object.assign(new Error('Las preguntas se resuelven por separado para conservar sus respuestas.'), { status: 400 });
  const removed = new Set(selected.filter(key => key !== id));
  const goals = new Set(rows.filter(item => removed.has(item.id)).map(item => item.objetivo_id).filter(Boolean));
  function references(value, key = '') {
    if (Array.isArray(value)) return [...new Set(value.map(entry => references(entry, key)))];
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, references(v, k)]));
    if (typeof value === 'string' && key !== 'id' && key !== 'origenes' && key !== 'fusionado_en') {
      if (removed.has(value)) return id;
      if (goals.has(value) && target.objetivo_id && !inventory.some(item => !selected.includes(item.id) && item.objetivo_id === value && !['rechazado', 'fuera_de_alcance'].includes(item.estado))) return target.objetivo_id;
    }
    return value;
  }
  const original = structuredClone(rows);
  const updated = references(content);
  const evidence = [...new Map(rows.flatMap(item => item.evidencias?.length ? item.evidencias : item.evidencia ? [{ texto: item.evidencia }] : []).map(entry => [JSON.stringify([entry.fuente, entry.texto]), entry])).values()];
  updated.inventario = updated.inventario.map(item => {
    if (removed.has(item.id)) return { ...inventory.find(n => n.id === item.id), estado: 'rechazado', fusionado_en: id };
    if (item.id !== id) return item;
    return { ...item, necesidad: contenido.trim(), evidencias: evidence, evidencia: evidence[0]?.texto || '', reglas_ids: [...new Set(rows.flatMap(n => n.reglas_ids || []))], origenes: [...new Set(rows.flatMap(n => [n.id, ...(n.origenes || [])]))] };
  });
  updated.historial_fusiones = [...(content.historial_fusiones || []), { destino: id, originales: original, fecha: new Date().toISOString() }];
  return updated;
};
