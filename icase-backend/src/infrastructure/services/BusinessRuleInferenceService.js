const fs = require('node:fs');
const path = require('node:path');
const BusinessRuleService = require('../../core/services/BusinessRuleService');
const DomainModelExtractor = require('./DomainModelExtractor');

const MAX_RULES = 60;
const PROMPT = path.join(__dirname, '..', 'prompts', 'analista_reglas_negocio.md');

/**
 * Propone reglas de negocio con IA y las somete a validación determinista.
 * La IA nunca decide qué se confirma: solo las reglas explícitas con evidencia literal nacen confirmadas;
 * el resto queda pendiente hasta que una persona las resuelva.
 */
class BusinessRuleInferenceService {
  constructor({ modelosIa, ruleService = new BusinessRuleService(), extractor = new DomainModelExtractor() } = {}) {
    this.modelosIa = modelosIa;
    this.ruleService = ruleService;
    this.extractor = extractor;
  }

  async inferir({ requerimientos = [], diagramas = [], retroalimentacion = '' }) {
    const rf = requerimientos.filter((item) => item.aprobado && item.tipo === 'RF');
    const modelo = this.extractor.fromDiagrams(diagramas);
    if (!modelo || !modelo.entities.length) {
      return { reglas: [], advertencias: ['No hay un diagrama de clases de dominio aprobado y vigente; sin él no pueden proponerse reglas sobre los datos.'] };
    }
    if (!rf.length) return { reglas: [], advertencias: ['No hay requisitos funcionales aprobados.'] };
    if (!this.modelosIa || typeof this.modelosIa.generarJson !== 'function') {
      return { reglas: [], advertencias: ['El servicio de IA no está configurado; las reglas deben redactarse manualmente.'] };
    }

    const respuesta = await this.modelosIa.generarJson(this.construirPrompt({ rf, modelo, retroalimentacion }));
    if (!respuesta) {
      return { reglas: [], advertencias: ['Ningún modelo de IA devolvió una respuesta; las reglas deben redactarse manualmente.'] };
    }
    return this.depurar(respuesta.reglas, { modelo, rf });
  }

  construirPrompt({ rf, modelo, retroalimentacion }) {
    const requisitos = rf.map((item) => [
      `- [${item.identificador}] ${item.nombre}`,
      item.descripcion ? `  Declaración: ${item.descripcion}` : '',
      item.precondiciones ? `  Precondición: ${item.precondiciones}` : '',
      item.poscondiciones ? `  Poscondición: ${item.poscondiciones}` : ''
    ].filter(Boolean).join('\n')).join('\n');
    const entidades = modelo.entities.map((entity) => {
      const campos = Object.entries(entity.schema.properties).filter(([name]) => name !== 'id').map(([name, property]) => {
        const tipo = property['x-references'] ? `referencia a ${property['x-references']}` : property.enum ? `enum(${property.enum.join('|')})` : `${property.type}${property.format ? `:${property.format}` : ''}`;
        return `${name}: ${tipo}`;
      });
      return `- ${entity.name}: ${campos.join(', ')}`;
    }).join('\n');
    return [
      fs.readFileSync(PROMPT, 'utf8'),
      `# MODELO DE DOMINIO APROBADO\n${entidades}`,
      `# REQUISITOS FUNCIONALES APROBADOS\n${requisitos}`,
      retroalimentacion ? `# OBSERVACIONES DE LA REVISIÓN ANTERIOR\n${retroalimentacion}` : ''
    ].filter(Boolean).join('\n\n');
  }

  /** Conserva las reglas válidas, descarta las demás informando por qué y fija la decisión inicial. */
  depurar(candidatas, { modelo, rf }) {
    const contexto = { entidades: modelo.entities, requerimientos: rf };
    const advertencias = [];
    const aceptadas = [];
    const lista = Array.isArray(candidatas) ? candidatas.slice(0, MAX_RULES) : [];
    if (Array.isArray(candidatas) && candidatas.length > MAX_RULES) advertencias.push(`La IA propuso ${candidatas.length} reglas; se conservaron las primeras ${MAX_RULES}.`);
    lista.forEach((candidata, index) => {
      const regla = { ...candidata, id: `RN-${String(aceptadas.length + 1).padStart(2, '0')}`, estado_decision: 'pendiente' };
      const resultado = this.ruleService.validar([...aceptadas, regla], contexto);
      if (resultado.errores.length) advertencias.push(`Se descartó la propuesta #${index + 1} (${candidata?.tipo || 'sin tipo'} en ${candidata?.entidad || '?'}): ${resultado.errores.join(' ')}`);
      else aceptadas.push(regla);
    });
    const { reglas, advertencias: avisos } = this.ruleService.validar(aceptadas, contexto);
    advertencias.push(...avisos);
    return {
      reglas: reglas.map((regla) => ({ ...regla, estado_decision: regla.origen === 'explicito' && regla.evidencia_literal ? 'confirmado' : 'pendiente' })),
      advertencias
    };
  }
}

module.exports = BusinessRuleInferenceService;
