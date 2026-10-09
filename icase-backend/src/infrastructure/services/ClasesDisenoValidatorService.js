class ClasesDisenoValidatorService {
  validar(codigo, tipo = 'clases_diseno') {
    if (!codigo || typeof codigo !== 'string' || codigo.trim() === '') {
      return { valido: false, error: 'El código PlantUML está vacío.' };
    }

    const trimmed = codigo.trim();

    if (!trimmed.startsWith('@start')) {
      return {
        valido: false,
        error: 'El diagrama de clases de diseño debe comenzar con @startuml'
      };
    }

    if (!trimmed.includes('@enduml')) {
      return {
        valido: false,
        error: 'El diagrama de clases de diseño debe finalizar con @enduml'
      };
    }

    const lineas = trimmed.split(/\r?\n/);
    if (lineas.some((linea) => linea.length > 320)) {
      return { valido: false, error: 'El diagrama contiene líneas excesivamente largas que afectan su renderizado.' };
    }

    const aperturas = (trimmed.match(/\{/g) || []).length;
    const cierres = (trimmed.match(/\}/g) || []).length;
    if (aperturas !== cierres) {
      return { valido: false, error: 'El diagrama contiene bloques con llaves desbalanceadas.' };
    }

    // 1. Controladores o Adaptadores
    const tieneControladorOAdaptador = /class\s+[\w.]*(?:Controller|Adapter|Handler)/i.test(trimmed) ||
      /<<\s*(?:Controller|Adapter|Handler)\s*>>/i.test(trimmed);
    if (!tieneControladorOAdaptador) {
      return { valido: false, error: 'El diagrama de clases de diseño debe incluir controladores o adaptadores de entrada.' };
    }

    // 2. Casos de Uso o Servicios de Aplicación
    const tieneCasoUsoOServicio = /class\s+[\w.]*(?:UseCase|Service|ApplicationService)/i.test(trimmed) ||
      /<<\s*(?:UseCase|Service|ApplicationService)\s*>>/i.test(trimmed);
    if (!tieneCasoUsoOServicio) {
      return { valido: false, error: 'El diagrama de clases de diseño debe incluir casos de uso o servicios de aplicación.' };
    }

    // 3. Interfaces e Implementaciones de Repositorios
    const tieneInterfaceRepo = /interface\s+[\w.]*Repository/i.test(trimmed) ||
      /interface\s+I[\w.]*/i.test(trimmed) ||
      /<<\s*Repository\s*>>/i.test(trimmed);
    const tieneImplRepo = /class\s+[\w.]*(?:Mongo|Sql|Postgres|Memory|Impl)?Repository/i.test(trimmed);
    if (!tieneInterfaceRepo || !tieneImplRepo) {
      return { valido: false, error: 'El diagrama de clases de diseño debe incluir interfaces e implementaciones de repositorios.' };
    }

    // 4. Entidades de Dominio
    const clasesDeclaradas = Array.from(trimmed.matchAll(/^\s*class\s+([A-Za-z0-9_]+)/gim)).map(m => m[1]);
    const tieneClaseEntidadPura = clasesDeclaradas.some(nombre => !/(?:Controller|Adapter|Handler|UseCase|Service|Repository|DTO)$/i.test(nombre));
    const tieneEntidades = tieneClaseEntidadPura || /class\s+[\w.]*Entity\b/i.test(trimmed) || /<<\s*Entity\s*>>/i.test(trimmed);
    if (!tieneEntidades) {
      return { valido: false, error: 'El diagrama de clases de diseño debe incluir entidades de dominio.' };
    }

    // 5. DTOs
    const tieneDTO = /class\s+[\w.]*DTO/i.test(trimmed) ||
      /<<\s*DTO\s*>>/i.test(trimmed);
    if (!tieneDTO) {
      return { valido: false, error: 'El diagrama de clases de diseño debe incluir Data Transfer Objects (DTO).' };
    }

    // 6. Dependencias entre capas
    const tieneDependencias = /(?:\.\.>|-->|--\|>)/.test(trimmed);
    if (!tieneDependencias) {
      return { valido: false, error: 'El diagrama de clases de diseño debe indicar las relaciones y dependencias entre capas.' };
    }

    // 7. División por módulos (packages) si el diagrama es grande (>6 clases)
    const cantidadClases = (trimmed.match(/^\s*(?:abstract\s+)?(?:class|interface)\s+/gim) || []).length;
    const tienePackages = trimmed
      .split(/\r?\n/)
      .map((linea) => linea.trim().toLowerCase())
      .some((linea) => linea.startsWith('package ') && linea.includes('{'));
    if (cantidadClases > 6 && !tienePackages) {
      return { valido: false, error: 'El diagrama de clases de diseño resulta demasiado grande y debe dividirse por módulos utilizando bloques package.' };
    }

    // 8. Trazabilidad a requisitos y artefactos de origen
    const lowerTrimmed = trimmed.toLowerCase();
    const tieneTrazabilidadReq = /\b(?:RF|RNF)-\d+\b/i.test(trimmed);
    const tieneTrazabilidadNota = lowerTrimmed.includes('note') && (lowerTrimmed.includes('trazabilidad') || lowerTrimmed.includes('origen'));
    const tieneTrazabilidadArtefacto = ['casos_de_uso', 'clases_dominio', 'arquitectura_software'].some((token) => lowerTrimmed.includes(token));
    const tieneTrazabilidad = tieneTrazabilidadReq || tieneTrazabilidadNota || tieneTrazabilidadArtefacto;
    if (!tieneTrazabilidad) {
      return { valido: false, error: 'El diagrama de clases de diseño debe incluir trazabilidad hacia requisitos (RF/RNF) u objetos de origen.' };
    }

    return { valido: true, error: null };
  }
}

module.exports = ClasesDisenoValidatorService;
