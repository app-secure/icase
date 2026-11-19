// Los metadatos orientan la extracción, pero nunca forman parte del texto citable.
const clean = value => String(value || '').replace(/[\r\n]+/g, ' ').trim();

function build(sources = []) {
  const usable = sources.filter(source => String(source.texto_transcrito || '').trim());
  return {
    content: usable.map(source => `[Fuente enriquecida]\nArchivo: ${clean(source.nombre_archivo)}\n[contenido_original]\n${String(source.texto_transcrito).trim()}`).join('\n\n---\n\n'),
    hints: usable.map(source => {
      const tags = Array.isArray(source.etiquetas) ? source.etiquetas.map(clean).filter(Boolean).slice(0, 8) : [];
      return {
        archivo: clean(source.nombre_archivo),
        procedencia: source.metadatos_generados_ia ? 'sugeridos_por_ia' : 'registrados_en_fuente',
        categoria: clean(source.categoria || source.tipo),
        tipo_contenido: clean(source.tipo_contenido),
        autor_origen: clean(source.autor_origen),
        descripcion: clean(source.descripcion).slice(0, 450),
        etiquetas: tags
      };
    })
  };
}

module.exports = { build };
