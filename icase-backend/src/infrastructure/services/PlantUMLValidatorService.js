const ArquitecturaSoftwareValidatorService = require('./ArquitecturaSoftwareValidatorService');
const ArquitecturaSistemaValidatorService = require('./ArquitecturaSistemaValidatorService');
const ClasesDisenoValidatorService = require('./ClasesDisenoValidatorService');
const { DiagramTypes } = require('../../core/constants/DiagramTypes');

class PlantUMLValidatorService {
  constructor() {
    this.softwareValidator = new ArquitecturaSoftwareValidatorService();
    this.sistemaValidator = new ArquitecturaSistemaValidatorService();
    this.disenoValidator = new ClasesDisenoValidatorService();
  }

  validar(codigo, options = {}) {
    if (!codigo || typeof codigo !== 'string' || codigo.trim() === '') {
      return { valido: false, error: 'El código PlantUML está vacío.' };
    }

    const trimmed = codigo.trim();
    const esUml = trimmed.startsWith('@startuml') && trimmed.endsWith('@enduml');
    const esArbol = (trimmed.startsWith('@startwbs') && trimmed.endsWith('@endwbs'))
      || (trimmed.startsWith('@startmindmap') && trimmed.endsWith('@endmindmap'));

    if (!esUml && !esArbol) {
      return {
        valido: false,
        error: 'El código debe iniciar con @startuml o @startwbs y finalizar con @enduml o @endwbs.'
      };
    }

    const opts = typeof options === 'string' ? { tipo: options } : (options || {});
    const tipo = opts.tipo || opts.type || '';
    const tipoNormalizado = String(tipo).toLowerCase();

    if (tipo === DiagramTypes.ARQUITECTURA_SOFTWARE || tipoNormalizado === 'arquitectura_software') {
      const res = this.softwareValidator.validar({
        codigo: trimmed,
        rnfList: opts.rnfList,
        trazabilidad_rnf: opts.trazabilidad_rnf
      });
      return {
        valido: res.valido,
        error: res.errores.length > 0 ? res.errores.join(' | ') : null,
        detalles: res
      };
    }

    if (tipo === DiagramTypes.ARQUITECTURA_SISTEMA || tipoNormalizado === 'arquitectura_sistema') {
      const res = this.sistemaValidator.validar({
        codigo: trimmed,
        rnfList: opts.rnfList,
        trazabilidad_rnf: opts.trazabilidad_rnf
      });
      return {
        valido: res.valido,
        error: res.errores.length > 0 ? res.errores.join(' | ') : null,
        detalles: res
      };
    }

    const lineas = trimmed.split(/\r?\n/);
    if (lineas.some((linea) => linea.length > 320)) {
      return { valido: false, error: 'El diagrama contiene líneas excesivamente largas que afectan su renderizado.' };
    }

    if (!esArbol) {
      const aperturas = (trimmed.match(/\{/g) || []).length;
      const cierres = (trimmed.match(/\}/g) || []).length;
      if (aperturas !== cierres) return { valido: false, error: 'El diagrama contiene bloques con llaves desbalanceadas.' };
    }

    if (tipoNormalizado === 'clases_diseno' || tipoNormalizado.includes('diseno')) {
      const res = this.disenoValidator.validar(codigo, tipo);
      return { valido: res.valido, error: res.error || null, detalles: res };
    }

    if (tipoNormalizado.includes('caso')) {
      const actores = (trimmed.match(/^\s*actor\s+/gim) || []).length;
      const casos = (trimmed.match(/^\s*usecase\s+/gim) || []).length;
      if (actores < 1 || actores > 10) return { valido: false, error: 'Casos de uso debe contener entre 1 y 10 actores.' };
      if (casos < 2 || casos > 14) return { valido: false, error: 'Casos de uso debe contener entre 2 y 14 casos para conservar legibilidad.' };
      if (!/^\s*(?:rectangle|package)\s+/im.test(trimmed)) return { valido: false, error: 'Los casos de uso deben estar delimitados por el sistema o por módulos.' };
    }

    if (tipoNormalizado === 'arquitectura') {
      const personas = (trimmed.match(/^\s*Person\s*\(/gim) || []).length;
      const contenedores = (trimmed.match(/^\s*Container(?:Db)?\s*\(/gim) || []).length;
      const relaciones = (trimmed.match(/^\s*Rel\s*\(/gim) || []).length;
      if (!/!include\s+<C4\/C4_Container>/i.test(trimmed)) return { valido: false, error: 'La arquitectura debe usar C4 Container.' };
      if (!/System_Boundary\s*\(/i.test(trimmed)) return { valido: false, error: 'La arquitectura debe delimitar el sistema con System_Boundary.' };
      if (personas > 6) return { valido: false, error: 'La arquitectura contiene demasiadas personas para una vista C4 legible.' };
      if (contenedores < 2 || contenedores > 10) return { valido: false, error: 'La arquitectura debe contener entre 2 y 10 contenedores.' };
      if (relaciones < 2 || relaciones > 24) return { valido: false, error: 'La arquitectura contiene una cantidad de relaciones no legible.' };
    }

    if (tipoNormalizado.includes('clase')) {
      const clases = (trimmed.match(/^\s*(?:abstract\s+)?class\s+/gim) || []).length;
      const relaciones = (trimmed.match(/^\s*[A-Za-z_][\w.]*\s+"[^"]+"\s+[^\n]+\s+"[^"]+"\s+[A-Za-z_][\w.]*/gim) || []).length +
        (trimmed.match(/^\s*[A-Za-z_][\w.]*\s+(?:--|\.\.|<\||\*--|o--)[^\n]+/gim) || []).length;
      if (clases < 3 || clases > 12) return { valido: false, error: 'El modelo de dominio debe contener entre 3 y 12 clases legibles.' };
      if (relaciones < 1) return { valido: false, error: 'El modelo de dominio debe incluir relaciones entre sus clases.' };
    }

    return { valido: true, error: null };
  }
}

module.exports = PlantUMLValidatorService;
