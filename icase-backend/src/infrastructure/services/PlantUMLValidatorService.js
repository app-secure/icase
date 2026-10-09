const { DIAGRAM_TYPES, normalizeDiagramType } = require('../../core/constants/DiagramTypes');
const ArquitecturaSoftwareValidatorService = require('./ArquitecturaSoftwareValidatorService');
const ArquitecturaSistemaValidatorService = require('./ArquitecturaSistemaValidatorService');
const ClasesDisenoValidatorService = require('./ClasesDisenoValidatorService');

class PlantUMLValidatorService {
  constructor() {
    this.softwareValidator = new ArquitecturaSoftwareValidatorService();
    this.sistemaValidator = new ArquitecturaSistemaValidatorService();
    this.disenoValidator = new ClasesDisenoValidatorService();
  }

  validar(codigo, options = '') {
    const errores = [];
    const advertencias = [];
    const metricas = {};
    const opts = typeof options === 'string' ? { tipo: options } : (options || {});
    const tipoNormalizado = normalizeDiagramType(opts.tipo || opts.type || '');
    let detalles = null;

    if (!codigo || typeof codigo !== 'string' || codigo.trim() === '') {
      return this.resultado(['El código PlantUML está vacío.'], advertencias, metricas);
    }

    const trimmed = codigo.trim();
    const inicio = trimmed.match(/^@(startuml|startwbs|startmindmap)\b/i)?.[1]?.toLowerCase();
    if (!inicio) {
      errores.push('El diagrama debe comenzar con @startuml, @startwbs o @startmindmap.');
    } else {
      const cierreEsperado = `@end${inicio.replace('start', '')}`;
      if (!trimmed.includes(cierreEsperado)) errores.push(`El diagrama debe finalizar con ${cierreEsperado}.`);
    }

    const lineas = trimmed.split(/\r?\n/);
    metricas.lineas = lineas.length;
    if (lineas.some((linea) => linea.length > 320)) {
      errores.push('El diagrama contiene líneas excesivamente largas que afectan su renderizado.');
    }

    if (inicio === 'startuml') {
      const aperturas = (trimmed.match(/\{/g) || []).length;
      const cierres = (trimmed.match(/\}/g) || []).length;
      if (aperturas !== cierres) errores.push('El diagrama contiene bloques con llaves desbalanceadas.');
    }

    if (tipoNormalizado === DIAGRAM_TYPES.SOFTWARE_ARCHITECTURE) {
      detalles = this.softwareValidator.validar({
        codigo: trimmed,
        rnfList: opts.rnfList,
        trazabilidad_rnf: opts.trazabilidad_rnf
      });
      return {
        ...this.resultado(detalles.errores || [], detalles.advertencias || [], metricas),
        detalles
      };
    }

    if (tipoNormalizado === DIAGRAM_TYPES.SYSTEM_ARCHITECTURE) {
      detalles = this.sistemaValidator.validar({
        codigo: trimmed,
        rnfList: opts.rnfList,
        trazabilidad_rnf: opts.trazabilidad_rnf
      });
      return {
        ...this.resultado(detalles.errores || [], detalles.advertencias || [], metricas),
        detalles
      };
    }

    if (tipoNormalizado === DIAGRAM_TYPES.DESIGN_CLASSES) {
      detalles = this.disenoValidator.validar(trimmed, tipoNormalizado);
      return {
        ...this.resultado(detalles.valido ? [] : [detalles.error].filter(Boolean), [], metricas),
        detalles
      };
    }

    if (tipoNormalizado === DIAGRAM_TYPES.USE_CASES) {
      const actores = (trimmed.match(/^\s*actor\s+/gim) || []).length;
      const casos = (trimmed.match(/^\s*usecase\s+/gim) || []).length;
      const relaciones = (trimmed.match(/(?:--+|\.\.+|<[-.]+|[-.]+>)/g) || []).length;
      Object.assign(metricas, { actores, casos_uso: casos, relaciones });
      if (actores < 1 || actores > 10) errores.push('Casos de uso debe contener entre 1 y 10 actores.');
      if (casos < 2 || casos > 14) errores.push('Casos de uso debe contener entre 2 y 14 casos para conservar legibilidad.');
      if (!/^\s*(?:rectangle|package)\s+/im.test(trimmed)) errores.push('Los casos de uso deben estar delimitados por el sistema o por módulos.');
      if (relaciones < actores) advertencias.push('Algunos actores podrían no estar relacionados con casos de uso.');
    }

    if (tipoNormalizado === DIAGRAM_TYPES.SOFTWARE_ARCHITECTURE) {
      const personas = (trimmed.match(/^\s*Person\s*\(/gim) || []).length;
      const contenedores = (trimmed.match(/^\s*Container(?:Db)?\s*\(/gim) || []).length;
      const relaciones = (trimmed.match(/^\s*Rel\s*\(/gim) || []).length;
      Object.assign(metricas, { personas, contenedores, relaciones });
      if (!/!include\s+<C4\/C4_Container>/i.test(trimmed)) errores.push('La arquitectura de software debe usar C4 Container.');
      if (!/System_Boundary\s*\(/i.test(trimmed)) errores.push('La arquitectura de software debe delimitar el sistema con System_Boundary.');
      if (personas > 6) errores.push('La arquitectura contiene demasiadas personas para una vista C4 legible.');
      if (contenedores < 2 || contenedores > 10) errores.push('La arquitectura de software debe contener entre 2 y 10 contenedores.');
      if (relaciones < 2 || relaciones > 24) errores.push('La arquitectura de software necesita entre 2 y 24 relaciones legibles.');
    }

    if (tipoNormalizado === DIAGRAM_TYPES.SYSTEM_ARCHITECTURE) {
      const nodos = (trimmed.match(/^\s*(?:node|cloud|frame|database|queue|artifact)\b/gim) || []).length;
      const relaciones = (trimmed.match(/(?:--+|\.\.+|<[-.]+|[-.]+>)/g) || []).length;
      Object.assign(metricas, { nodos_infraestructura: nodos, relaciones });
      if (inicio !== 'startuml') errores.push('La arquitectura del sistema debe ser un diagrama de despliegue PlantUML.');
      if (nodos < 2) errores.push('La arquitectura del sistema debe incluir al menos dos nodos de infraestructura o despliegue.');
      if (relaciones < 1) errores.push('La arquitectura del sistema debe mostrar conexiones entre sus nodos.');
      if (!/\b(?:node|cloud|database)\b/i.test(trimmed)) errores.push('La arquitectura del sistema debe representar servidores, nube o bases de datos.');
    }

    if ([DIAGRAM_TYPES.DOMAIN_CLASSES, DIAGRAM_TYPES.DESIGN_CLASSES].includes(tipoNormalizado)) {
      const clases = (trimmed.match(/^\s*(?:abstract\s+)?(?:class|interface|enum)\s+/gim) || []).length;
      const relaciones = (trimmed.match(/^\s*[A-Za-z_][\w.]*\s+"[^"]+"\s+[^\n]+\s+"[^"]+"\s+[A-Za-z_][\w.]*/gim) || []).length +
        (trimmed.match(/^\s*[A-Za-z_][\w.]*\s+(?:--|\.\.|<\||\*--|o--)[^\n]+/gim) || []).length;
      Object.assign(metricas, { clases, relaciones });
      const maximo = tipoNormalizado === DIAGRAM_TYPES.DESIGN_CLASSES ? 20 : 12;
      if (clases < 3 || clases > maximo) errores.push(`El diagrama debe contener entre 3 y ${maximo} clases o interfaces legibles.`);
      if (relaciones < 1) errores.push('El diagrama debe incluir relaciones entre sus clases.');
      if (tipoNormalizado === DIAGRAM_TYPES.DESIGN_CLASSES && !/^\s*package\s+/im.test(trimmed)) {
        advertencias.push('Conviene agrupar las clases de diseño por capas o paquetes.');
      }
    }

    if (tipoNormalizado === DIAGRAM_TYPES.NAVIGATION_TREE) {
      const elementos = lineas.filter((linea) => /^\s*\*+\s+\S/.test(linea));
      const niveles = elementos.map((linea) => linea.trimStart().match(/^\*+/)?.[0].length || 0);
      Object.assign(metricas, {
        elementos: elementos.length,
        profundidad: niveles.length ? Math.max(...niveles) : 0
      });
      if (!['startwbs', 'startmindmap'].includes(inicio)) errores.push('El árbol de navegación debe usar @startwbs o @startmindmap.');
      if (elementos.length < 4) errores.push('El árbol de navegación debe incluir el sistema, módulos y pantallas.');
      if (metricas.profundidad < 3) errores.push('El árbol de navegación debe tener al menos tres niveles jerárquicos.');
    }

    return { ...this.resultado([...new Set(errores)], [...new Set(advertencias)], metricas), detalles };
  }

  resultado(errores, advertencias, metricas) {
    return {
      valido: errores.length === 0,
      error: errores[0] || null,
      errores,
      advertencias,
      metricas
    };
  }
}

module.exports = PlantUMLValidatorService;
