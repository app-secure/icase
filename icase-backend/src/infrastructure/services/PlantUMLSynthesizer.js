class PlantUMLSynthesizer {
  static normalizar(diagramasRecibidos) {
    const list = Array.isArray(diagramasRecibidos) ? [...diagramasRecibidos] : [];

    const tiposRequeridos = [
      { tipo: 'casos_de_uso', titulo: 'Diagrama de Casos de Uso (IEEE 830)' },
      { tipo: 'arquitectura', titulo: 'Diagrama de Arquitectura Técnica Integral (C4 Container)' },
      { tipo: 'clases', titulo: 'Diagrama de Clases del Dominio' },
      { tipo: 'arbol_navegacion', titulo: 'Árbol de Navegación del Sistema (WBS)' }
    ];

    return tiposRequeridos.map(cfg => {
      const existing = list.find(d => (d.tipo || '').toLowerCase().includes(cfg.tipo));
      const code = existing?.codigo_plantuml?.trim();
      const esValido = code && code.length > 20 && code.includes('@start');

      const fallbackMensaje = cfg.tipo === 'arbol_navegacion'
        ? '@startwbs\n* No hay diagrama disponible\n@endwbs'
        : '@startuml\nrectangle "No hay diagrama disponible"\n@enduml';

      return {
        tipo: cfg.tipo,
        titulo: existing?.titulo || cfg.titulo,
        descripcion: existing?.descripcion || (esValido ? 'Diagrama generado por IA' : 'No se generó diagrama para este módulo.'),
        descripcion_jerarquica: Array.isArray(existing?.descripcion_jerarquica) && existing.descripcion_jerarquica.length > 0
          ? existing.descripcion_jerarquica
          : (existing?.descripcion ? [existing.descripcion] : []),
        codigo_plantuml: esValido ? code : fallbackMensaje
      };
    });
  }
}

module.exports = PlantUMLSynthesizer;
