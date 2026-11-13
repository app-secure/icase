class ClasesDisenoValidatorService {
  validar(codigo, tipo = 'clases_diseno') {
    if (!codigo || typeof codigo !== 'string' || codigo.trim() === '') {
      return { valido: false, error: 'El código PlantUML está vacío.' };
    }

    const trimmed = codigo.trim();
    const advertencias = [];
    const dtos = [...trimmed.matchAll(/class\s+\w+DTO\b[^\n{]*\{([^}]+)}/gi)];
    const placeholders = dtos.filter(match => {
      const fields = match[1].split(/\r?\n/).map(line => line.trim()).filter(Boolean);
      return fields.length === 1 && /^[+\-#~]?\s*(?:datos|resultado)\s*:\s*String\s*$/i.test(fields[0]);
    });
    if (placeholders.length) {
      const names = placeholders.map(match => match[0].match(/class\s+(\w+DTO)/i)?.[1]).filter(Boolean);
      advertencias.push(`Diseño por verificar: DTO genéricos con datos/resultado: String en ${names.join(', ')}. Define campos tipados derivados de las operaciones aprobadas; si el dato es legítimamente opaco, explica su finalidad. No crees un módulo CRUD por entidad o rol.`);
    }

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
    // Una asociación con cardinalidad pero sin segundo extremo no compila.
    // No completar por proximidad: el destino debe venir del modelo aprobado.
    let inBlockComment = false;
    let inNote = false;
    for (const [index, raw] of lineas.entries()) {
      const line = raw.trim();
      if (line.startsWith("/'")) { inBlockComment = !line.includes("'/"); continue; }
      if (inBlockComment) { if (line.includes("'/")) inBlockComment = false; continue; }
      if (/^end\s+note\b/i.test(line)) { inNote = false; continue; }
      if (/^note\b/i.test(line)) { inNote = !line.includes(':'); continue; }
      if (inNote || line.startsWith("'")) continue;
      const incomplete = line.match(/^(?:[\w.]+|"[^"]+")\s*(?:"[^"]*"\s*)?(?:[<|*o+.#{}-]*[-.]{2,}[>|*o+.#{}-]*)(?:\[[^\]]*\])?\s*(?:"[^"]*"\s*)?(?::.*)?$/);
      if (incomplete) return {
        valido: false,
        error: `Relación PlantUML incompleta en línea ${index + 1}: ${line}. Falta la clase destino después de la flecha y cardinalidad. Recupera el extremo del dominio aprobado; conserva las demás clases y operaciones.`
      };
    }
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
    const declaracionesInterfaces = [...trimmed.matchAll(/^\s*interface\s+([\w.]+)(?:\s+<<\s*([^>]+)\s*>>)?/gim)];
    const declaracionesClases = [...trimmed.matchAll(/^\s*class\s+([\w.]+)(?:\s+<<\s*([^>]+)\s*>>)?/gim)];
    const tieneInterfaceRepo = declaracionesInterfaces.some((match) =>
      /(?:Repository|Repositorio)/i.test(match[1]) || /(?:Repository|Repositorio)/i.test(match[2] || '')
    );
    const tieneImplRepo = declaracionesClases.some((match) =>
      /(?:Repository|Repositorio)(?:Impl|Adapter)?$/i.test(match[1]) ||
      /^(?:Mongo|Sql|Postgres|PostgreSql|Memory)[\w.]*(?:Repository|Repositorio)(?:Impl)?$/i.test(match[1]) ||
      /(?:Repository|Repositorio)/i.test(match[2] || '')
    );
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

    const outgoing = new Set([...trimmed.matchAll(/^\s*(\w+)\s+(?:\.\.>|-->)\s*\w+/gm)].map(match => match[1]));
    const explained = new Set([...trimmed.matchAll(/^\s*note\s+(?:top|bottom|left|right)\s+of\s+(\w+)\s*:\s*(.+)$/gim)]
      .filter(match => /sin puerto propio|no necesita dependencias|no declara persistencia/i.test(match[2]))
      .map(match => match[1]));
    for (const match of trimmed.matchAll(/^\s*class\s+(\w+)(?:\s+<<([^>]+)>>)?/gim)) {
      if (/(?:UseCase|CasoUso)$/i.test(match[1]) || /UseCase|CasoUso/i.test(match[2] || '')) {
        if (!outgoing.has(match[1]) && !explained.has(match[1])) advertencias.push(`Diseño por verificar: ${match[1]} no declara dependencias de salida hacia entidades, puertos u otros servicios. Comprueba cómo realiza la operación; si es pura, explica que no necesita dependencias. No inventes un repositorio por clase.`);
      }
    }

    return { valido: true, error: null, advertencias };
  }
}

module.exports = ClasesDisenoValidatorService;
