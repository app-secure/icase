class ClasesDisenoSynthesizer {
  static sintetizar({
    casosDeUsoAprobados = [],
    clasesDominio = [],
    arquitecturaSoftware = null,
    tecnologiasSeleccionadas = {},
    versionesOrigen = {}
  }) {
    // Normalizar casos de uso / RFs de entrada
    const reqs = Array.isArray(casosDeUsoAprobados) ? casosDeUsoAprobados : [];
    const rfIds = reqs
      .map(r => r.identificador || r.id)
      .filter(Boolean);
    const requisitosRelacionados = rfIds.length > 0 ? rfIds : ['RF-01'];

    // Normalizar entidades de dominio
    let entidades = [];
    if (Array.isArray(clasesDominio)) {
      entidades = clasesDominio.map(c => typeof c === 'string' ? c : (c.nombre || c.name || 'Entidad'));
    } else if (clasesDominio && typeof clasesDominio === 'object' && Array.isArray(clasesDominio.entidades)) {
      entidades = clasesDominio.entidades.map(e => typeof e === 'string' ? e : (e.nombre || 'Entidad'));
    }
    if (entidades.length === 0) {
      entidades = ['Usuario', 'Proyecto'];
    }

    // Normalizar tecnología de base de datos
    const dbTech = String(
      tecnologiasSeleccionadas.database ||
      tecnologiasSeleccionadas.db ||
      (typeof arquitecturaSoftware === 'string' && arquitecturaSoftware.toLowerCase().includes('sql') ? 'Sql' : 'Mongo')
    );
    const prefixRepo = dbTech.toLowerCase().includes('sql') || dbTech.toLowerCase().includes('postgres')
      ? 'Sql'
      : 'Mongo';

    // Determinar si debemos modularizar por paquetes (si hay más de 1 entidad / varios RFs)
    const requiereModularizacion = entidades.length >= 2 || reqs.length >= 2;

    const lineas = [
      '@startuml',
      'skinparam classAttributeIconSize 0',
      'skinparam linetype ortho',
      ''
    ];

    const modulos = entidades.map((entidad, idx) => {
      const rfAsociado = reqs[idx]?.identificador || reqs[0]?.identificador || `RF-0${idx + 1}`;
      const nombreModulo = `Módulo ${entidad}`;
      const nameCap = entidad.charAt(0).toUpperCase() + entidad.slice(1);

      return {
        nombreModulo,
        rfAsociado,
        controller: `${nameCap}Controller`,
        useCase: `Gestionar${nameCap}UseCase`,
        repoInterface: `I${nameCap}Repository`,
        repoImpl: `${prefixRepo}${nameCap}Repository`,
        entity: nameCap,
        dtoRequest: `Crear${nameCap}DTO`,
        dtoResponse: `${nameCap}ResponseDTO`
      };
    });

    for (const mod of modulos) {
      if (requiereModularizacion) {
        lineas.push(`package "${mod.nombreModulo}" {`);
      }

      lineas.push(
        `  class ${mod.controller} <<Controller>> {`,
        `    +ejecutar(dto: ${mod.dtoRequest}): ${mod.dtoResponse}`,
        `  }`,
        `  class ${mod.useCase} <<UseCase>> {`,
        `    +procesar(dto: ${mod.dtoRequest}): ${mod.entity}`,
        `  }`,
        `  interface ${mod.repoInterface} <<Repository>> {`,
        `    +guardar(entidad: ${mod.entity}): Promise<void>`,
        `    +obtenerPorId(id: String): Promise<${mod.entity}>`,
        `  }`,
        `  class ${mod.repoImpl} <<Repository>> {`,
        `    +guardar(entidad: ${mod.entity}): Promise<void>`,
        `    +obtenerPorId(id: String): Promise<${mod.entity}>`,
        `  }`,
        `  class ${mod.entity} <<Entity>> {`,
        `    -id: String`,
        `    -estado: String`,
        `  }`,
        `  class ${mod.dtoRequest} <<DTO>> {`,
        `    +datos: String`,
        `  }`,
        `  class ${mod.dtoResponse} <<DTO>> {`,
        `    +resultado: String`,
        `  }`
      );

      if (requiereModularizacion) {
        lineas.push('}');
      }
      lineas.push('');

      // Dependencias entre capas
      lineas.push(
        `${mod.controller} ..> ${mod.useCase} : invoca`,
        `${mod.controller} ..> ${mod.dtoRequest} : recibe`,
        `${mod.controller} ..> ${mod.dtoResponse} : retorna`,
        `${mod.useCase} ..> ${mod.repoInterface} : requiere`,
        `${mod.useCase} ..> ${mod.entity} : gestiona`,
        `${mod.repoImpl} --|> ${mod.repoInterface} : implementa`,
        `${mod.repoImpl} ..> ${mod.entity} : persiste`,
        ''
      );

      // Trazabilidad
      lineas.push(
        `note top of ${mod.controller}`,
        `  Trazabilidad Requisito: ${mod.rfAsociado}`,
        `  Artefactos Origen: casos_de_uso, clases_dominio, arquitectura_software`,
        `end note`,
        ''
      );
    }

    lineas.push('@enduml');

    const codigoPlantUML = lineas.join('\n');

    return {
      tipo: 'clases_diseno',
      titulo: 'Diagrama de Clases de Diseño',
      descripcion: 'Diagrama de clases de diseño estructurado en capas (Controladores, Casos de Uso, Repositorios, Entidades y DTOs) con trazabilidad a requisitos.',
      codigo_plantuml: codigoPlantUML,
      requisitos_relacionados: requisitosRelacionados,
      versiones_origen: {
        casos_de_uso: versionesOrigen.casos_de_uso || 1,
        clases_dominio: versionesOrigen.clases_dominio || 1,
        arquitectura_software: versionesOrigen.arquitectura_software || 1
      }
    };
  }
}

module.exports = ClasesDisenoSynthesizer;
