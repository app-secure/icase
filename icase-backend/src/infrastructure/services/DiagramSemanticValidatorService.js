const { DIAGRAM_TYPES, normalizeDiagramType } = require('../../core/constants/DiagramTypes');

const STOPWORDS = new Set([
  'accion', 'actualizar', 'administrar', 'alta', 'aplicacion', 'baja', 'consultar',
  'crear', 'debe', 'digital', 'el', 'en', 'generar', 'gestionar', 'gestion', 'hacer',
  'la', 'las', 'los', 'manual', 'mostrar', 'nuevo', 'para', 'permitir', 'procesar',
  'realizar', 'registrar', 'sistema', 'una', 'uno', 'validar', 'ver',
  'por', 'del', 'con', 'sin', 'mediante', 'toma', 'tomar'
]);

const SYNONYMS = new Map([
  ['abono', 'pago'], ['cobrar', 'pago'], ['cobro', 'pago'], ['pagado', 'pago'], ['pagar', 'pago'],
  ['cliente', 'usuario'], ['comensal', 'usuario'], ['orden', 'pedido'], ['platillo', 'plato'],
  ['reservacion', 'reserva'], ['reservar', 'reserva'], ['reporte', 'informe'], ['report', 'informe'],
  ['prepagado', 'paquete'], ['prepago', 'paquete']
]);

function sinAcentos(valor) {
  return String(valor || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function separarCamelCase(valor) {
  return String(valor || '').replace(/([a-záéíóúñ])([A-ZÁÉÍÓÚÑ])/g, '$1 $2');
}

function raiz(token) {
  let value = token;
  if (value.length > 6 && value.endsWith('es')) value = value.slice(0, -2);
  else if (value.length > 4 && value.endsWith('s')) value = value.slice(0, -1);
  return SYNONYMS.get(value) || value;
}

function tokens(valor) {
  return [...new Set(sinAcentos(separarCamelCase(valor))
    .toLowerCase()
    .replace(/[^a-z0-9ñ]+/g, ' ')
    .split(/\s+/)
    .map(raiz)
    .filter((token) => token.length >= 3 && !STOPWORDS.has(token) && !/^r?nf\d*$/.test(token)))];
}

function idRequisito(requisito) {
  return String(requisito?.identificador || requisito?.codigo || requisito?.id || '').trim().toUpperCase();
}

function esAlta(requisito) {
  return sinAcentos(requisito?.prioridad).toLowerCase().includes('alta');
}

function extraerEtiquetasCasosUso(codigo) {
  const labels = [];
  const patrones = [
    /^\s*usecase\s+"([^"]+)"(?:\s+as\s+[\w.]+)?/gim,
    /^\s*usecase\s+[\w.]+\s+as\s+"([^"]+)"/gim,
    /^\s*\(([^)]+)\)\s+as\s+[\w.]+/gim
  ];
  for (const patron of patrones) {
    for (const match of String(codigo || '').matchAll(patron)) labels.push(match[1]);
  }
  return [...new Set(labels)];
}

function extraerClases(codigo) {
  return [...String(codigo || '').matchAll(/^\s*(?:abstract\s+)?(?:class|interface|enum)\s+(?:"([^"]+)"|([\w.]+))/gim)]
    .map((match) => match[1] || match[2])
    .filter(Boolean);
}

class DiagramSemanticValidatorService {
  validar({ tipo, codigo, requisitos = [], requisitos_relacionados = [] } = {}) {
    const tipoNormalizado = normalizeDiagramType(tipo);
    const funcionales = (Array.isArray(requisitos) ? requisitos : [])
      .filter((requisito) => String(requisito?.tipo || '').toUpperCase() === 'RF' && requisito?.aprobado !== false);

    if (!funcionales.length || ![DIAGRAM_TYPES.USE_CASES, DIAGRAM_TYPES.DOMAIN_CLASSES].includes(tipoNormalizado)) {
      return { valido: true, errores: [], advertencias: [], metricas: {} };
    }
    if (tipoNormalizado === DIAGRAM_TYPES.USE_CASES) {
      return this.validarCasosUso(codigo, funcionales, requisitos_relacionados);
    }
    return this.validarClasesDominio(codigo, funcionales);
  }

  validarCasosUso(codigo, requisitos, relacionados) {
    const errores = [];
    const advertencias = [];
    const idsConocidos = new Set(requisitos.map(idRequisito).filter(Boolean));
    const idsRelacionados = new Set((Array.isArray(relacionados) ? relacionados : [])
      .map((item) => String(typeof item === 'object' ? (item.identificador || item.id || '') : item).trim().toUpperCase())
      .filter(Boolean));
    const textoCodigo = sinAcentos(codigo).toUpperCase();
    const tokensCasos = new Set(extraerEtiquetasCasosUso(codigo).flatMap(tokens));
    const cubiertos = [];
    const omitidosAltos = [];
    const omitidosRevisables = [];
    const trazabilidadSinEvidencia = [];

    for (const requisito of requisitos) {
      const id = idRequisito(requisito);
      const nombreTokens = tokens(requisito.nombre || requisito.descripcion);
      const coincidencias = nombreTokens.filter((token) => tokensCasos.has(token));
      const minimo = nombreTokens.length >= 4 ? 2 : 1;
      const trazado = (id && textoCodigo.includes(id)) || coincidencias.length >= minimo;
      if (id && idsRelacionados.has(id) && !trazado) trazabilidadSinEvidencia.push(id);
      if (trazado) cubiertos.push(id || requisito.nombre);
      else if (esAlta(requisito)) omitidosAltos.push(id || requisito.nombre || 'RF sin identificador');
      else omitidosRevisables.push(id || requisito.nombre || 'RF sin identificador');
    }

    const idsDesconocidos = [...idsRelacionados].filter((id) => !idsConocidos.has(id));
    if (omitidosAltos.length) errores.push(`Casos de uso no representa los requisitos funcionales de prioridad alta: ${omitidosAltos.join(', ')}.`);
    if (omitidosRevisables.length) advertencias.push(`Revisa la cobertura de los requisitos funcionales: ${omitidosRevisables.join(', ')}.`);
    if (idsDesconocidos.length) advertencias.push(`La trazabilidad referencia requisitos inexistentes o no aprobados: ${idsDesconocidos.join(', ')}.`);
    if (trazabilidadSinEvidencia.length) advertencias.push(`La trazabilidad declara RF sin un caso de uso o nota visible que los respalde: ${trazabilidadSinEvidencia.join(', ')}.`);

    return {
      valido: errores.length === 0,
      errores,
      advertencias,
      metricas: {
        rf_evaluados: requisitos.length,
        rf_cubiertos: cubiertos.length,
        rf_cubiertos_ids: cubiertos,
        cobertura_rf_porcentaje: Math.round((cubiertos.length / requisitos.length) * 100),
        rf_omitidos: [...omitidosAltos, ...omitidosRevisables],
        trazabilidad_sin_evidencia: trazabilidadSinEvidencia
      }
    };
  }

  validarClasesDominio(codigo, requisitos) {
    const errores = [];
    const advertencias = [];
    const clases = extraerClases(codigo);
    const tecnicas = clases.filter((nombre) => /(?:controller|controlador|dto|repository|repositorio|service|servicio|usecase|caso.*uso|gateway|adapter|adaptador)$/i.test(nombre));
    // Solo elementos UML: las notas y listas de RF no acreditan cobertura.
    const elementos = [];
    let enClase = false;
    for (const linea of String(codigo || '').split(/\r?\n/)) {
      if (/^\s*(?:abstract\s+)?(?:class|interface|enum)\s+/i.test(linea)) {
        enClase = linea.includes('{');
        elementos.push(linea.replace(/<<.*?>>/g, ''));
      } else if (enClase) {
        if (/^\s*}/.test(linea)) enClase = false;
        else elementos.push(linea);
      } else if (/^\s*[\w.]+\s+(?:"[^"]*"\s+)?[.*o<|>-]{2,}/.test(linea)) {
        elementos.push(linea);
      }
    }
    const tokensClases = new Set([...clases.flatMap(tokens), ...elementos.flatMap(tokens)]);
    const transversales = requisitos.filter(requisito =>
      /autentic|autoriza|control de acceso|copia.*seguridad|backup|despliegue|monitoreo|infraestructura/i.test(sinAcentos(requisito.nombre)));
    const evaluables = requisitos
      .filter(requisito => !transversales.includes(requisito))
      .map((requisito) => ({ requisito, conceptos: tokens(requisito.nombre || requisito.descripcion) }))
      .filter(({ conceptos }) => conceptos.length > 0);
    const cubiertos = evaluables.filter(({ conceptos }) => conceptos.some((token) => tokensClases.has(token)));
    const omitidosAltos = evaluables
      .filter(({ requisito, conceptos }) => esAlta(requisito) && !conceptos.some((token) => tokensClases.has(token)))
      .map(({ requisito }) => idRequisito(requisito) || requisito.nombre);
    const cobertura = evaluables.length ? cubiertos.length / evaluables.length : 1;

    if (tecnicas.length) errores.push(`Clases de dominio contiene elementos técnicos que pertenecen al diseño: ${tecnicas.join(', ')}.`);
    // El parecido léxico no demuestra corrección semántica ni justifica bloquear.
    if (omitidosAltos.length) {
      for (const { requisito, conceptos } of evaluables.filter(({ requisito }) => omitidosAltos.includes(idRequisito(requisito) || requisito.nombre))) {
        advertencias.push(`Cobertura de dominio por verificar: ${idRequisito(requisito)} — ${requisito.nombre || requisito.descripcion}. No se encontró correspondencia léxica en clases, atributos, operaciones o asociaciones (conceptos: ${conceptos.join(', ')}). Es una comprobación heurística, no prueba de omisión; representa el concepto solo si lo exige el negocio.`);
      }
    }

    return {
      valido: errores.length === 0,
      errores,
      advertencias,
      metricas: {
        clases_dominio: clases.length,
        clases_tecnicas: tecnicas,
        rf_transversales_no_exigen_entidad: transversales.map(idRequisito),
        rf_evaluados_semanticamente: evaluables.length,
        rf_con_concepto_representado: cubiertos.length,
        cobertura_conceptos_porcentaje: Math.round(cobertura * 100),
        rf_altos_sin_concepto: omitidosAltos
      }
    };
  }
}

module.exports = DiagramSemanticValidatorService;
