const { DIAGRAM_TYPES, normalizeDiagramType } = require('../../core/constants/DiagramTypes');

const IGNORED = new Set([
  'aplicacion', 'componente', 'contenedor', 'del', 'el', 'la', 'las', 'los', 'modulo',
  'servicio', 'sistema', 'vista', 'web', 'usecase', 'controller', 'dto', 'repository',
  'crear', 'consultar', 'gestionar', 'procesar', 'registrar', 'validar', 'actualizar', 'ver',
  'permitir', 'controlar', 'administrar',
  // Palabras que no distinguen un elemento de otro: conectores y términos genéricos de interfaz o de acción.
  'de', 'en', 'por', 'para', 'con', 'sin', 'al', 'un', 'una', 'que', 'se', 'mediante', 'desde', 'sobre',
  'pantalla', 'formulario', 'visualizar', 'mostrar', 'revisar', 'solicitar', 'realizar', 'seleccionar', 'obtener'
]);

const SYNONYMS = new Map([
  ['db', 'datos'], ['database', 'datos'], ['basedatos', 'datos'],
  ['cliente', 'usuario'], ['comensal', 'usuario'],
  ['cobro', 'pago'], ['pagar', 'pago'],
  ['reservacion', 'reserva'], ['reservar', 'reserva']
]);

function normalize(value) {
  return String(value || '')
    .replace(/([a-záéíóúñ])([A-ZÁÉÍÓÚÑ])/g, '$1 $2')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function tokens(value) {
  return [...new Set(normalize(value)
    .replace(/[^a-z0-9]+/g, ' ')
    .split(/\s+/)
    .map((token) => {
      const result = require('../../core/services/SpanishPlural').singular(token);
      return SYNONYMS.get(result) || result;
    })
    .filter((token) => token.length >= 2 && !IGNORED.has(token)))];
}

/**
 * Dos palabras se consideran la misma si son iguales o si una es el comienzo de la otra con poca diferencia
 * («paquete» y «paquetes», «compra» y «comprar», «comanda» y «comandas»): así los plurales, las conjugaciones y los
 * sustantivos derivados de un verbo no cuentan como elementos distintos.
 */
function sameWord(left, right) {
  if (left === right) return true;
  const [short, long] = left.length <= right.length ? [left, right] : [right, left];
  return short.length >= 4 && long.startsWith(short) && long.length - short.length <= 3;
}

function matches(source, candidates) {
  const expected = tokens(source);
  if (!expected.length) return true;
  return candidates.some((candidate) => {
    const actual = tokens(candidate);
    if (!actual.length) return false;
    const common = expected.filter((token) => actual.some((other) => sameWord(token, other))).length;
    return common / Math.min(expected.length, actual.length) >= 0.5;
  });
}

function latest(diagrams, type) {
  return (Array.isArray(diagrams) ? diagrams : [])
    .filter((diagram) => normalizeDiagramType(diagram?.tipo) === type && diagram?.aprobado !== false)
    .sort((left, right) => Number(right?.version || 1) - Number(left?.version || 1))[0] || null;
}

function extractClasses(code) {
  return [...String(code || '').matchAll(/^\s*(?:abstract\s+)?(?:class|interface|enum)\s+(?:"([^"]+)"|([\w.]+))/gim)]
    .map((match) => match[1] || match[2])
    .filter(Boolean);
}

function extractUseCases(code) {
  const labels = [];
  for (const match of String(code || '').matchAll(/^\s*usecase\s+(?:"([^"]+)"|[\w.]+\s+as\s+"([^"]+)")/gim)) {
    labels.push(match[1] || match[2]);
  }
  return labels.filter(Boolean).map(label => label.replace(/\\[nr]/g, ' ').replace(/\s+/g, ' ').trim());
}

class CrossDiagramConsistencyValidatorService {
  validar({ tipo, codigo, diagramasDependencia = [] } = {}) {
    const normalizedType = normalizeDiagramType(tipo);
    if (normalizedType === DIAGRAM_TYPES.SOFTWARE_ARCHITECTURE) {
      return this.validarArquitecturaSoftware(codigo, diagramasDependencia);
    }
    if (normalizedType === DIAGRAM_TYPES.SYSTEM_ARCHITECTURE) {
      return this.validarDespliegue(codigo, diagramasDependencia);
    }
    if (normalizedType === DIAGRAM_TYPES.DESIGN_CLASSES) {
      return this.validarClasesDiseno(codigo, diagramasDependencia);
    }
    if (normalizedType === DIAGRAM_TYPES.NAVIGATION_TREE) {
      return this.validarNavegacion(codigo, diagramasDependencia);
    }
    return { valido: true, errores: [], advertencias: [], metricas: {} };
  }

  validarArquitecturaSoftware(codigo, diagramas) {
    const origen = latest(diagramas, DIAGRAM_TYPES.USE_CASES);
    if (!origen?.codigo_plantuml) return this.sinOrigen('casos_de_uso');

    const candidatos = [
      ...String(codigo || '').matchAll(/"([^"]+)"/g),
      ...String(codigo || '').matchAll(/(?:Container|Component|System|Boundary)\s*\([^,]+,\s*([^,)]+)/gim)
    ].map((match) => match[1]).filter(Boolean);
    // Las responsabilidades pueden estar en notas de contenedores existentes.
    // No cuentan títulos, comentarios ni notas huérfanas para fingir cobertura.
    const aliases = require('./ArchitectureTraceabilityService').aliasesFromCode(codigo);
    for (const match of String(codigo || '').matchAll(/^\s*note\s+(?:right|left|top|bottom)\s+of\s+([\w.]+)(?:\s+as\s+\w+)?\s*\n([\s\S]*?)^\s*end\s*note\b/gim)) {
      if (aliases.has(match[1].toLowerCase())) candidatos.push(match[2].replace(/\b(?:RF|RNF)-\d+\b/gi, ''));
    }
    for (const match of String(codigo || '').matchAll(/^\s*note\s+(?:right|left|top|bottom)\s+of\s+([\w.]+)\s*:\s*(.+)$/gim)) {
      if (aliases.has(match[1].toLowerCase())) candidatos.push(match[2].replace(/\b(?:RF|RNF)-\d+\b/gi, ''));
    }
    return this.resultadoCobertura({
      elementos: extractUseCases(origen.codigo_plantuml).map(label => label.replace(/\bRF-\d+\b/gi, '')),
      candidatos,
      metrica: 'casos_uso_representados_arquitectura',
      etiqueta: 'los módulos funcionales de los casos de uso aprobados',
      umbralError: 0.5
    });
  }

  validarDespliegue(codigo, diagramas) {
    const origen = latest(diagramas, DIAGRAM_TYPES.SOFTWARE_ARCHITECTURE);
    if (!origen?.codigo_plantuml) return this.sinOrigen('arquitectura_software');

    const todos = [...origen.codigo_plantuml.matchAll(/^\s*Container(?:Db)?\s*\(\s*[^,]+,\s*"([^"]+)"/gim)]
      .map((match) => match[1]);
    // «Servicio de Catálogo», «Módulo de Ventas»: partes lógicas del backend, no unidades que se desplieguen aparte. Se exigen las
    // unidades reales (interfaz, API, base de datos); si no hay ninguna distinta de esas partes, se comparan todas como antes.
    const unidades = todos.filter((nombre) => !/^(?:servicio|modulo|módulo|componente|service|module)\s+(?:de|del|para)?\s*/i.test(nombre.trim()));
    const contenedores = unidades.length >= 2 ? unidades : todos;
    const elementosDespliegue = [...String(codigo || '').matchAll(/"([^"]+)"/g)].map((match) => match[1]);
    return this.resultadoCobertura({
      elementos: contenedores,
      candidatos: elementosDespliegue,
      metrica: 'contenedores_software_desplegados',
      etiqueta: 'contenedores aprobados de arquitectura de software',
      umbralError: 0.6
    });
  }

  validarClasesDiseno(codigo, diagramas) {
    const dominio = latest(diagramas, DIAGRAM_TYPES.DOMAIN_CLASSES);
    if (!dominio?.codigo_plantuml) return this.sinOrigen('clases_dominio');

    const coberturaDominio = this.resultadoCobertura({
      elementos: extractClasses(dominio.codigo_plantuml),
      candidatos: extractClasses(codigo),
      metrica: 'clases_dominio_realizadas',
      etiqueta: 'clases del dominio aprobado',
      soloAdvertencias: true,
      umbralError: 0.6
    });
    const casosUso = latest(diagramas, DIAGRAM_TYPES.USE_CASES);
    if (!casosUso?.codigo_plantuml) return coberturaDominio;
    const candidatos = [
      ...extractClasses(codigo).filter(name => /(?:UseCase|CasoUso|Service|Servicio|Controller|Controlador|Gateway|Handler)/i.test(name)),
      ...this.operacionesDiseno(codigo)
    ];
    const coberturaFuncional = this.resultadoCobertura({
      elementos: extractUseCases(casosUso.codigo_plantuml),
      candidatos,
      metrica: 'casos_uso_realizados_diseno',
      etiqueta: 'los casos de uso aprobados',
      soloAdvertencias: true,
      umbralError: 0.5
    });
    return {
      valido: coberturaDominio.valido && coberturaFuncional.valido,
      errores: [...coberturaDominio.errores, ...coberturaFuncional.errores],
      advertencias: [...coberturaDominio.advertencias, ...coberturaFuncional.advertencias],
      metricas: { ...coberturaDominio.metricas, ...coberturaFuncional.metricas }
    };
  }

  validarNavegacion(codigo, diagramas) {
    const origen = latest(diagramas, DIAGRAM_TYPES.USE_CASES);
    if (!origen?.codigo_plantuml) return this.sinOrigen('casos_de_uso');

    const nodos = String(codigo || '').split(/\r?\n/)
      .filter((line) => /^\s*\*+\s+\S/.test(line))
      .map((line) => line.replace(/^\s*\*+\s+/, '').trim());
    return this.resultadoCobertura({
      elementos: extractUseCases(origen.codigo_plantuml),
      candidatos: nodos,
      metrica: 'casos_uso_con_ruta_navegable',
      etiqueta: 'casos de uso con interacción navegable',
      umbralError: 0,
      soloErrorSinCobertura: true
    });
  }

  operacionesDiseno(codigo) {
    const operations = [];
    // Solo métodos de entrada/aplicación; una nota RF o método de entidad no realiza un flujo.
    for (const match of String(codigo || '').matchAll(/class\s+(?:"([^"]+)"(?:\s+as\s+\w+)?|([\w.]+))\s*(?:<<([^>]+)>>)?\s*\{([^}]*)}/gi)) {
      if (!/(?:Controller|Controlador|UseCase|CasoUso|Service|Servicio|Gateway|Handler|Adapter)/i.test(`${match[1] || match[2]} ${match[3] || ''}`)) continue;
      for (const method of match[4].matchAll(/(?:^|\n)\s*[+\-#~]?\s*(\w+)\s*\(/g)) operations.push(method[1]);
    }
    return operations;
  }

  resultadoCobertura({ elementos, candidatos, metrica, etiqueta, umbralError, soloErrorSinCobertura = false, soloAdvertencias = false }) {
    const unique = [...new Set(elementos.filter(Boolean))];
    if (!unique.length) return { valido: true, errores: [], advertencias: [], metricas: { [metrica]: 0 } };
    const cubiertos = unique.filter((elemento) => matches(soloAdvertencias ? elemento.replace(/\b(?:RF|RNF)-\d+\b/gi, '') : elemento, candidatos));
    const omitidos = unique.filter((elemento) => !cubiertos.includes(elemento));
    const ratio = cubiertos.length / unique.length;
    const errores = [];
    const advertencias = [];

    if (!soloAdvertencias && ((soloErrorSinCobertura && cubiertos.length === 0 && unique.length >= 3) || (!soloErrorSinCobertura && ratio < umbralError))) {
      errores.push(`El diagrama no conserva suficiente consistencia con ${etiqueta}. Faltan: ${omitidos.join(', ')}.`);
    } else if (omitidos.length) {
      advertencias.push(`${soloAdvertencias ? 'Diseño por verificar: ' : ''}Revisa elementos del artefacto origen que no se reconocen en este diagrama: ${omitidos.join(', ')}. La comparación es léxica: no demuestra una omisión funcional. Comprueba las responsabilidades descritas en elementos o relaciones; una lista de RF no explica su realización.`);
    }

    return {
      valido: errores.length === 0,
      errores,
      advertencias,
      metricas: {
        [`${metrica}_total`]: unique.length,
        [metrica]: cubiertos.length,
        [`${metrica}_porcentaje`]: Math.round(ratio * 100),
        elementos_origen_omitidos: omitidos
      }
    };
  }

  sinOrigen(tipo) {
    return {
      valido: true,
      errores: [],
      advertencias: [`No fue posible comprobar consistencia porque no se recibió ${tipo} aprobado.`],
      metricas: {}
    };
  }
}

module.exports = CrossDiagramConsistencyValidatorService;
