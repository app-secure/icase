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

  async inferir({ requerimientos = [], diagramas = [], retroalimentacion = '', analisis = null }) {
    const rf = requerimientos.filter((item) => item.aprobado && item.tipo === 'RF');
    const modelo = this.extractor.fromDiagrams(diagramas);
    if (!modelo || !modelo.entities.length) {
      return { reglas: [], advertencias: ['No hay un diagrama de clases de dominio aprobado y vigente; sin él no pueden proponerse reglas sobre los datos.'] };
    }
    if (!rf.length) return { reglas: [], advertencias: ['No hay requisitos funcionales aprobados.'] };
    if (!this.modelosIa || typeof this.modelosIa.generarJson !== 'function') {
      return { reglas: [], advertencias: ['El servicio de IA no está configurado; las reglas deben redactarse manualmente.'] };
    }

    const respuesta = await this.modelosIa.generarJson(this.construirPrompt({ rf, modelo, retroalimentacion, analisis }));
    if (!respuesta) {
      return { reglas: [], advertencias: ['Ningún modelo de IA devolvió una respuesta; las reglas deben redactarse manualmente.'] };
    }
    return this.depurar(respuesta.reglas, { modelo, rf });
  }

  construirPrompt({ rf, modelo, retroalimentacion, analisis }) {
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
      analisis ? `# REGLAS, RESTRICCIONES, EXCLUSIONES Y PREGUNTAS DEL ANÁLISIS\n${JSON.stringify(analisis)}\nRespeta estados y exclusiones. No conviertas preguntas pendientes en reglas confirmadas ni inventes fórmulas.` : '',
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
    const conImpuestos = this.completarImpuestos(aceptadas, { modelo, rf });
    aceptadas.splice(0, aceptadas.length, ...conImpuestos.reglas);
    advertencias.push(...conImpuestos.advertencias);
    const { reglas, advertencias: avisos } = this.ruleService.validar(aceptadas, contexto);
    advertencias.push(...avisos);
    return {
      reglas: reglas.map((regla) => ({ ...regla, estado_decision: regla.origen === 'explicito' && regla.evidencia_literal ? 'confirmado' : 'pendiente' })),
      advertencias
    };
  }
}

/**
 * «total = subtotal + igv» sin una regla que calcule el IGV deja la factura sin IGV ni total. Si un requisito dice el porcentaje
 * («aplicar IGV del 18%»), el impuesto es ese porcentaje de la base (subtotal), con la frase del requisito como evidencia literal.
 */
BusinessRuleInferenceService.prototype._impuestosDelRequisito = function _impuestosDelRequisito(reglas, { modelo, rf }) {
  const operandos = (nodo) => (!nodo || typeof nodo !== 'object' ? [] : nodo.campo ? [nodo.campo] : [...operandos(nodo.izquierda), ...operandos(nodo.derecha)]);
  const calculados = new Set(reglas.filter((regla) => regla.tipo === 'calculo').map((regla) => `${regla.entidad}.${regla.campo}`));
  const derivadas = [];
  for (const regla of reglas.filter((item) => item.tipo === 'calculo')) {
    const entidad = modelo.entities.find((item) => item.name === regla.entidad);
    const props = entidad?.schema?.properties || {};
    for (const campo of operandos(regla.expresion)) {
      if (!/^(igv|iva|impuesto|isv|itbis)$/i.test(campo) || calculados.has(`${regla.entidad}.${campo}`)) continue;
      const base = Object.keys(props).find((nombre) => /^(subtotal|baseimponible|base_imponible|valorventa|valor_venta)$/i.test(nombre));
      if (!base) continue;
      for (const requisito of rf) {
        const texto = String(requisito.descripcion || requisito.nombre || '');
        const encontrado = new RegExp(`[^.;]{0,40}\\b${campo}\\b[^.;%]{0,25}?(\\d{1,2}(?:[.,]\\d+)?)\\s*%`, 'i').exec(texto);
        if (!encontrado) continue;
        const porcentaje = Number(encontrado[1].replace(',', '.'));
        derivadas.push({
          tipo: 'calculo', entidad: regla.entidad, campo, decimales: 2,
          expresion: { op: '*', izquierda: { campo: base }, derecha: porcentaje / 100 },
          mensaje: `El ${campo.toUpperCase()} es el ${porcentaje}% del ${base}.`, rf: [requisito.identificador],
          origen: 'explicito', evidencia: encontrado[0].trim(), estado_decision: 'pendiente'
        });
        calculados.add(`${regla.entidad}.${campo}`);
        break;
      }
    }
  }
  return derivadas;
};

/**
 * Añade el cálculo del impuesto que dicen los requisitos y lo sustituye dentro de las demás fórmulas (las reglas de cálculo no
 * dependen de otro campo calculado): «total = subtotal + igv» pasa a «total = subtotal + subtotal × 0,18». Sirve al proponer las
 * reglas y al generar con reglas ya aprobadas. `confirmar` marca la regla deducida como confirmada (evidencia literal del requisito).
 */
BusinessRuleInferenceService.prototype.completarImpuestos = function completarImpuestos(reglas, { modelo, rf, confirmar = false }) {
  const contexto = { entidades: modelo.entities, requerimientos: rf };
  let actuales = [...reglas];
  const advertencias = [];
  for (const derivada of this._impuestosDelRequisito(actuales, { modelo, rf })) {
    const sustituir = (nodo) => (!nodo || typeof nodo !== 'object' ? nodo : nodo.campo === derivada.campo ? derivada.expresion
      : nodo.op ? { ...nodo, izquierda: sustituir(nodo.izquierda), derecha: sustituir(nodo.derecha) } : nodo);
    const ajustadas = actuales.map((regla) => (regla.tipo === 'calculo' && regla.entidad === derivada.entidad ? { ...regla, expresion: sustituir(regla.expresion) } : regla));
    const regla = { ...derivada, id: `RN-${String(actuales.length + 1).padStart(2, '0')}`, ...(confirmar ? { estado_decision: 'confirmado' } : {}) };
    if (this.ruleService.validar([...ajustadas, regla], contexto).errores.length) continue;
    actuales = [...ajustadas, regla];
    advertencias.push(`${regla.id}: «${regla.mensaje}» se dedujo del requisito («${regla.evidencia}»).`);
  }
  return { reglas: actuales, advertencias };
};

module.exports = BusinessRuleInferenceService;
