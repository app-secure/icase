const { isRequirementNeed } = require('../constants/RequirementAnalysisContract');
const { extraConditions } = require('./RequirementStatement');
const normalize = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/** Diagnóstico explicable, sin reescribir obligaciones ni certificar semántica. */
class RequirementQualityService {
  evaluate(requirements = [], inventory = []) {
    const findings = [], links = [];
    const add = (codigo, req, mensaje, accion, severidad = 'advertencia', necesidad = null) => findings.push({
      codigo, requisito: req?.identificador || null, necesidad, severidad, mensaje, accion_propuesta: accion
    });
    const expected = inventory.filter(isRequirementNeed);
    const objectives = new Set(inventory.filter(n => ['RF', 'RNF'].includes(n.tipo)).map(n => n.objetivo_id).filter(Boolean));
    for (const req of requirements.filter(r => r && typeof r === 'object')) {
      const actors = Array.isArray(req.actores) ? req.actores.filter(a => String(a || '').trim()) : [];
      if (req.tipo === 'RF' && !actors.length) add('ACTOR_AUSENTE', req, 'No se identifica quién inicia o recibe el resultado de la función.', 'Identifica el actor respaldado por el insumo; no lo inventes.');
      else if (req.tipo === 'RF' && actors.every(a => ['usuario', 'usuarios'].includes(normalize(a)))) add('ACTOR_GENERICO', req, 'El actor está indicado solo como Usuario.', 'Comprueba si el insumo permite especificar roles; Usuario puede ser válido para funciones transversales.');
      const pre = normalize(req.precondiciones), post = normalize(req.poscondiciones);
      if (/sesion activa o acceso autorizado/.test(pre)) add('PRECONDICION_GENERICA', req, 'La precondición repite una plantilla de acceso, sin condición específica.', 'Conserva solo condiciones sustentadas y necesarias para esta operación.');
      const title = normalize(`${req.nombre || ''} ${req.descripcion || ''}`);
      const name = normalize(req.nombre);
      const operations = [/consult|visualiz|revisar|ver\b/, /registr|crear|tomar|comprar/, /modific|actualiz|marcar/, /cerrar|cierre/, /validar|escanear/, /cobrar|cobro/].filter(pattern => pattern.test(name));
      if (operations.length >= 3 || (operations.length >= 2 && /cerrar|cierre/.test(name))) add('OBJETIVOS_POSIBLEMENTE_AGRUPADOS', req,
        `El título reúne resultados potencialmente independientes: ${req.nombre}.`,
        'Aplica la prueba de independencia: separa resultados que puedan aceptarse por separado; conserva filtros, medios y validaciones de una misma operación. Esta señal léxica no prueba un error.');
      if (/autentic|iniciar sesion|inicio de sesion|login/.test(title) && /sesion activa|sesion iniciada|haber iniciado sesion/.test(pre)) add('AUTENTICACION_CIRCULAR', req, 'La función de autenticación exige una sesión ya iniciada.', 'Revisa la contradicción; no confundas iniciar sesión con reautenticarse o renovar una sesión.');
      if (/operacion registrada y verificada conforme/.test(post)) add('POSCONDICION_GENERICA', req, 'La poscondición no describe el resultado concreto.', 'Describe el cambio o resultado observable sustentado por el insumo.');
      const refs = Array.isArray(req.necesidades_origen) ? req.necesidades_origen : [];
      const criteria = Array.isArray(req.criterios_aceptacion) ? req.criterios_aceptacion : [];
      if (!criteria.length) add('CRITERIOS_AUSENTES', req, 'No hay criterios de aceptación.', 'Expresa condiciones observables sin inventar reglas ni métricas.');
      else if (criteria.every(c => [normalize(req.nombre), normalize(req.descripcion)].includes(normalize(c?.descripcion)))) {
        const needs = expected.filter(n => refs.includes(n.id));
        const covered = `${req.nombre || ''} ${req.descripcion || ''} ${criteria.map(c => c?.descripcion || '').join(' ')}`;
        if (extraConditions(needs, covered).length) add('CRITERIOS_REPETITIVOS', req, 'Los criterios repiten el título o la declaración.', 'Comprueba resultados, alternativas y restricciones acordadas; no impongas una cantidad mínima de criterios.');
      }
      if (req.tipo === 'RNF' && /por confirmar/.test(normalize(req.metrica_medible))) add('METRICA_PENDIENTE', req, 'La métrica todavía requiere acuerdo.', 'Conserva la cualidad explícita y solicita solo su método o umbral pendiente.');
      const reqObjectives = new Set(expected.filter(n => refs.includes(n.id)).map(n => n.objetivo_id).filter(Boolean));
      const declaredRules = Array.isArray(req.reglas_relacionadas) ? req.reglas_relacionadas : [];
      const related = inventory.filter(n => !isRequirementNeed(n) && (declaredRules.includes(n.id) ||
        (Array.isArray(n.objetivos_relacionados) && n.objetivos_relacionados.some(id => reqObjectives.has(id)))));
      links.push({ requisito: req.identificador, necesidades: refs,
        elementos_relacionados: related.map(n => ({ id: n.id, tipo: n.tipo, estado: n.estado })) });
    }
    for (const item of inventory) {
      if (!Array.isArray(item.objetivos_relacionados)) continue;
      const unknown = item.objetivos_relacionados.filter(id => !objectives.has(id));
      if (unknown.length) add('OBJETIVO_RELACIONADO_INVALIDO', null, `${item.id}: objetivos relacionados inexistentes: ${unknown.join(', ')}.`, 'Corrige las referencias sin inventar objetivos.', 'error', item.id);
      if (item.objetivos_relacionados.length && !links.some(link => link.elementos_relacionados.some(n => n.id === item.id))) {
        add('CONTEXTO_SIN_REQUISITO_VINCULADO', null, `${item.id}: tiene objetivos declarados pero ningún requisito vinculado.`, 'Revisa la cobertura del objetivo; no dupliques la regla como requisito.', 'advertencia', item.id);
      }
    }
    return { version: 1, hallazgos: findings, vinculos: links,
      limites: 'Las advertencias heurísticas requieren revisión; un vínculo no demuestra implementación ni exhaustividad.' };
  }
}
module.exports = RequirementQualityService;
