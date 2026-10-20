/**
 * Reglas de negocio declarativas.
 *
 * La IA solo propone reglas en este DSL; nunca código ejecutable. El motor generado las aplica de forma
 * determinista. Este servicio valida que cada regla sea coherente con el modelo de dominio y los RF
 * aprobados, y decide cuáles pueden llegar al código (únicamente las `confirmado`).
 */
const RULE_TYPES = Object.freeze(['requerido', 'unico', 'rango', 'longitud', 'formato', 'comparacion', 'maquina_estados', 'inmutable', 'valor_por_defecto']);
const DECISIONS = Object.freeze(['confirmado', 'pendiente', 'rechazado']);
const OPERATORS = Object.freeze(['<', '<=', '>', '>=', '==', '!=']);
const FORMATS = Object.freeze(['email', 'url']);

const strip = (value) => String(value || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const squash = (value) => strip(value).replace(/[^a-z0-9]+/g, ' ').trim();
const isNumber = (value) => typeof value === 'number' && Number.isFinite(value);

/** Familia de comparación de una propiedad del esquema de la entidad. */
function kindOf(property) {
  if (!property) return null;
  if (property['x-references']) return 'referencia';
  if (property.type === 'integer' || property.type === 'number') return 'numerico';
  if (property.type === 'boolean') return 'booleano';
  if (property.type === 'array') return 'lista';
  if (['date-time', 'date'].includes(property.format)) return 'temporal';
  if (property.format === 'time' || property.format === 'uuid') return 'texto_formato';
  return 'texto';
}

class BusinessRuleService {
  /**
   * @param {Array} reglas propuestas (cualquier estado de decisión)
   * @param {{ entidades: Array, requerimientos: Array }} contexto entidades del modelo de dominio y RF aprobados
   * @returns {{ reglas: Array, errores: string[], advertencias: string[] }}
   */
  validar(reglas, { entidades = [], requerimientos = [] } = {}) {
    const errores = [];
    const advertencias = [];
    if (!Array.isArray(reglas)) return { reglas: [], errores: ['Las reglas deben enviarse como una lista.'], advertencias };
    const rf = new Map(requerimientos.filter((item) => item.tipo === 'RF').map((item) => [String(item.identificador).toUpperCase(), item]));
    const ids = new Set();
    const machines = new Set();
    const normalizadas = [];

    reglas.forEach((raw, index) => {
      const etiqueta = raw && raw.id ? String(raw.id) : `regla #${index + 1}`;
      const fallos = [];
      const fail = (message) => fallos.push(`${etiqueta}: ${message}`);
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) { errores.push(`${etiqueta}: debe ser un objeto.`); return; }

      const regla = { ...raw, id: String(raw.id || `RN-${String(index + 1).padStart(2, '0')}`) };
      if (ids.has(regla.id)) fail('el identificador está repetido.');
      ids.add(regla.id);
      if (!RULE_TYPES.includes(regla.tipo)) fail(`el tipo "${regla.tipo}" no existe (${RULE_TYPES.join(', ')}).`);

      const entidad = entidades.find((item) => strip(item.name) === strip(regla.entidad) || item.key === strip(regla.entidad));
      if (!entidad) fail(`la entidad "${regla.entidad}" no existe en el modelo de dominio.`);
      else regla.entidad = entidad.name;

      regla.mensaje = String(regla.mensaje || '').trim();
      if (!regla.mensaje) fail('debe incluir un mensaje comprensible para el usuario.');
      if (regla.mensaje.length > 240) fail('el mensaje supera 240 caracteres.');

      regla.rf = [...new Set((Array.isArray(regla.rf) ? regla.rf : [regla.rf]).filter(Boolean).map((item) => String(item).toUpperCase()))];
      if (!regla.rf.length) fail('debe citar al menos un RF que la origine.');
      const desconocidos = regla.rf.filter((item) => !rf.has(item));
      if (desconocidos.length) fail(`cita RF inexistentes o no aprobados: ${desconocidos.join(', ')}.`);

      regla.estado_decision = DECISIONS.includes(regla.estado_decision) ? regla.estado_decision : 'pendiente';
      regla.evidencia = String(regla.evidencia || '').trim();
      regla.evidencia_literal = this._esLiteral(regla.evidencia, regla.rf.map((item) => rf.get(item)).filter(Boolean));
      regla.origen = ['explicito', 'inferido', 'manual'].includes(regla.origen) ? regla.origen : 'inferido';
      if (regla.origen === 'explicito' && !regla.evidencia_literal) {
        regla.origen = 'inferido';
        advertencias.push(`${regla.id}: la evidencia no aparece literalmente en los RF citados; se clasifica como inferida.`);
      }

      if (entidad && RULE_TYPES.includes(regla.tipo)) this._parametros(regla, entidad, fail, machines);
      if (fallos.length) errores.push(...fallos);
      else normalizadas.push(regla);
    });

    return { reglas: errores.length ? [] : normalizadas, errores, advertencias };
  }

  pendientes(reglas) {
    return (reglas || []).filter((item) => item.estado_decision === 'pendiente').map((item) => item.id);
  }

  confirmadas(reglas) {
    return (reglas || []).filter((item) => item.estado_decision === 'confirmado');
  }

  _esLiteral(evidencia, requisitos) {
    const needle = squash(evidencia);
    if (needle.length < 8) return false;
    return requisitos.some((item) => squash([item.nombre, item.descripcion, item.precondiciones, item.poscondiciones, item.evidencia].filter(Boolean).join(' ')).includes(needle));
  }

  _campo(entidad, nombre, { permitirReferencia = false } = {}) {
    const properties = entidad.schema?.properties || {};
    const key = Object.keys(properties).find((item) => item !== 'id' && strip(item) === strip(nombre));
    if (!key) return { error: `el campo "${nombre}" no existe en ${entidad.name}.` };
    const kind = kindOf(properties[key]);
    if (kind === 'referencia' && !permitirReferencia) return { error: `el campo "${key}" es una referencia a otra entidad; esta regla no la admite.` };
    return { nombre: key, propiedad: properties[key], kind };
  }

  _parametros(regla, entidad, fail, machines) {
    const campo = (nombre, opciones) => {
      const resultado = this._campo(entidad, nombre, opciones);
      if (resultado.error) { fail(resultado.error); return null; }
      return resultado;
    };
    const exigirNumero = (clave) => {
      if (regla[clave] !== undefined && !isNumber(regla[clave])) fail(`"${clave}" debe ser un número.`);
    };
    switch (regla.tipo) {
      case 'requerido': case 'inmutable': {
        const found = campo(regla.campo, { permitirReferencia: regla.tipo === 'requerido' });
        if (found) regla.campo = found.nombre;
        break;
      }
      case 'unico': {
        const lista = (Array.isArray(regla.campos) ? regla.campos : [regla.campo]).filter(Boolean);
        if (!lista.length || lista.length > 3) { fail('"campos" debe contener entre 1 y 3 campos.'); break; }
        const resueltos = lista.map((nombre) => campo(nombre));
        if (resueltos.some((item) => !item)) break;
        if (resueltos.some((item) => ['lista', 'booleano'].includes(item.kind))) fail('no se puede exigir unicidad sobre listas o booleanos.');
        regla.campos = resueltos.map((item) => item.nombre);
        delete regla.campo;
        break;
      }
      case 'rango': {
        const found = campo(regla.campo);
        if (!found) break;
        regla.campo = found.nombre;
        if (found.kind !== 'numerico') fail(`"${found.nombre}" no es numérico.`);
        exigirNumero('min'); exigirNumero('max');
        if (regla.min === undefined && regla.max === undefined) fail('debe indicar "min", "max" o ambos.');
        if (isNumber(regla.min) && isNumber(regla.max) && regla.min > regla.max) fail('"min" no puede superar a "max".');
        break;
      }
      case 'longitud': {
        const found = campo(regla.campo);
        if (!found) break;
        regla.campo = found.nombre;
        if (found.kind !== 'texto') fail(`"${found.nombre}" no es un texto libre.`);
        exigirNumero('min'); exigirNumero('max');
        if (regla.min === undefined && regla.max === undefined) fail('debe indicar "min", "max" o ambos.');
        if ([regla.min, regla.max].some((item) => item !== undefined && (!Number.isInteger(item) || item < 0))) fail('la longitud debe ser un entero no negativo.');
        if (isNumber(regla.min) && isNumber(regla.max) && regla.min > regla.max) fail('"min" no puede superar a "max".');
        break;
      }
      case 'formato': {
        const found = campo(regla.campo);
        if (!found) break;
        regla.campo = found.nombre;
        if (found.kind !== 'texto') fail(`"${found.nombre}" no es un texto libre.`);
        if (!FORMATS.includes(regla.formato)) fail(`el formato debe ser uno de: ${FORMATS.join(', ')}.`);
        break;
      }
      case 'comparacion': {
        const izquierda = campo(regla.campo);
        if (!izquierda) break;
        regla.campo = izquierda.nombre;
        if (!OPERATORS.includes(regla.operador)) { fail(`el operador debe ser uno de: ${OPERATORS.join(' ')}.`); break; }
        if (!['numerico', 'temporal', 'texto'].includes(izquierda.kind)) { fail(`"${izquierda.nombre}" no admite comparaciones.`); break; }
        const ordenados = !['==', '!='].includes(regla.operador);
        if (ordenados && izquierda.kind === 'texto') fail('los textos solo admiten == y !=.');
        if ((regla.con_campo === undefined) === (regla.con_valor === undefined)) { fail('debe indicar exactamente uno de "con_campo" o "con_valor".'); break; }
        if (regla.con_campo !== undefined) {
          const derecha = campo(regla.con_campo);
          if (!derecha) break;
          regla.con_campo = derecha.nombre;
          if (derecha.nombre === izquierda.nombre) fail('no puede compararse un campo consigo mismo.');
          if (derecha.kind !== izquierda.kind) fail(`"${izquierda.nombre}" y "${derecha.nombre}" no son del mismo tipo.`);
        } else if (izquierda.kind === 'numerico' && !isNumber(regla.con_valor)) fail('"con_valor" debe ser numérico.');
        else if (izquierda.kind === 'temporal' && Number.isNaN(Date.parse(regla.con_valor))) fail('"con_valor" debe ser una fecha ISO 8601.');
        break;
      }
      case 'maquina_estados': {
        const found = campo(regla.campo);
        if (!found) break;
        regla.campo = found.nombre;
        if (found.kind !== 'texto') fail(`"${found.nombre}" no es un texto.`);
        const clave = `${entidad.name}.${found.nombre}`;
        if (machines.has(clave)) fail(`ya existe una máquina de estados para ${clave}.`);
        machines.add(clave);
        const transiciones = Array.isArray(regla.transiciones) ? regla.transiciones : [];
        if (!transiciones.length) { fail('debe declarar al menos una transición.'); break; }
        if (transiciones.some((item) => !item || typeof item.de !== 'string' || typeof item.a !== 'string')) { fail('cada transición necesita "de" y "a".'); break; }
        const estados = found.propiedad.enum || [...new Set([regla.inicial, ...transiciones.flatMap((item) => [item.de, item.a])])];
        const fuera = [regla.inicial, ...transiciones.flatMap((item) => [item.de, item.a])].filter((item) => !estados.includes(item));
        if (fuera.length) fail(`usa estados que no pertenecen a ${found.nombre}: ${[...new Set(fuera)].join(', ')}.`);
        if (!estados.includes(regla.inicial)) fail('"inicial" debe ser uno de los estados.');
        regla.estados = estados;
        break;
      }
      case 'valor_por_defecto': {
        const found = campo(regla.campo);
        if (!found) break;
        regla.campo = found.nombre;
        if (regla.valor === undefined || regla.valor === null) { fail('debe indicar "valor".'); break; }
        const { propiedad, kind } = found;
        const valido = propiedad.enum ? propiedad.enum.includes(regla.valor)
          : kind === 'numerico' ? isNumber(regla.valor) && (propiedad.type !== 'integer' || Number.isInteger(regla.valor))
            : kind === 'booleano' ? typeof regla.valor === 'boolean'
              : kind === 'texto' ? typeof regla.valor === 'string' : false;
        if (!valido) fail(`"valor" no es compatible con el tipo de ${found.nombre}.`);
        break;
      }
      default:
        break;
    }
  }
}

BusinessRuleService.RULE_TYPES = RULE_TYPES;
BusinessRuleService.OPERATORS = OPERATORS;
module.exports = BusinessRuleService;
