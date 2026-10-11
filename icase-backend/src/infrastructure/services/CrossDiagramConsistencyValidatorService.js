const { DIAGRAM_TYPES, normalizeDiagramType } = require('../../core/constants/DiagramTypes');

const IGNORED = new Set([
  'aplicacion', 'componente', 'contenedor', 'del', 'el', 'la', 'las', 'los', 'modulo',
  'servicio', 'sistema', 'vista', 'web', 'usecase', 'controller', 'dto', 'repository',
  'crear', 'consultar', 'gestionar', 'procesar', 'registrar', 'validar', 'actualizar', 'ver',
  'permitir', 'controlar', 'administrar'
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
      let result = token;
      if (result.length > 6 && result.endsWith('es')) result = result.slice(0, -2);
      else if (result.length > 4 && result.endsWith('s')) result = result.slice(0, -1);
      return SYNONYMS.get(result) || result;
    })
    .filter((token) => token.length >= 2 && !IGNORED.has(token)))];
}

function matches(source, candidates) {
  const expected = tokens(source);
  if (!expected.length) return true;
  return candidates.some((candidate) => {
    const actual = tokens(candidate);
    if (!actual.length) return false;
    const common = expected.filter((token) => actual.includes(token)).length;
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
  return labels.filter(Boolean);
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
    return this.resultadoCobertura({
      elementos: extractUseCases(origen.codigo_plantuml),
      candidatos,
      metrica: 'casos_uso_representados_arquitectura',
      etiqueta: 'los módulos funcionales de los casos de uso aprobados',
      umbralError: 0.5
    });
  }

  validarDespliegue(codigo, diagramas) {
    const origen = latest(diagramas, DIAGRAM_TYPES.SOFTWARE_ARCHITECTURE);
    if (!origen?.codigo_plantuml) return this.sinOrigen('arquitectura_software');

    const contenedores = [...origen.codigo_plantuml.matchAll(/^\s*Container(?:Db)?\s*\(\s*[^,]+,\s*"([^"]+)"/gim)]
      .map((match) => match[1]);
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
    const origen = latest(diagramas, DIAGRAM_TYPES.DOMAIN_CLASSES);
    if (!origen?.codigo_plantuml) return this.sinOrigen('clases_dominio');

    return this.resultadoCobertura({
      elementos: extractClasses(origen.codigo_plantuml),
      candidatos: extractClasses(codigo),
      metrica: 'clases_dominio_realizadas',
      etiqueta: 'clases del dominio aprobado',
      umbralError: 0.6
    });
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

  resultadoCobertura({ elementos, candidatos, metrica, etiqueta, umbralError, soloErrorSinCobertura = false }) {
    const unique = [...new Set(elementos.filter(Boolean))];
    if (!unique.length) return { valido: true, errores: [], advertencias: [], metricas: { [metrica]: 0 } };
    const cubiertos = unique.filter((elemento) => matches(elemento, candidatos));
    const omitidos = unique.filter((elemento) => !cubiertos.includes(elemento));
    const ratio = cubiertos.length / unique.length;
    const errores = [];
    const advertencias = [];

    if ((soloErrorSinCobertura && cubiertos.length === 0 && unique.length >= 3) || (!soloErrorSinCobertura && ratio < umbralError)) {
      errores.push(`El diagrama no conserva suficiente consistencia con ${etiqueta}. Faltan: ${omitidos.join(', ')}.`);
    } else if (omitidos.length) {
      advertencias.push(`Revisa elementos del artefacto origen que no se reconocen en este diagrama: ${omitidos.join(', ')}.`);
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
