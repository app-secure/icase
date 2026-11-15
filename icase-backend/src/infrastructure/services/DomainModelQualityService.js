const Extractor = require('./DomainModelExtractor');

class DomainModelQualityService {
  validar(code) {
    const model = new Extractor().extract(code);
    const errores = [], advertencias = [];
    const names = model.entities.map(entity => entity.name);
    const repeated = [...new Set(names.filter((name, i) => names.indexOf(name) !== i))];
    if (repeated.length) errores.push(`Clases de dominio duplicadas: ${repeated.join(', ')}. Usa una identidad inequívoca para cada concepto.`);
    for (const entity of model.entities) {
      const fields = entity.attributes.map(attribute => attribute.name);
      if (new Set(fields).size !== fields.length) errores.push(`Atributos duplicados en ${entity.name}.`);
    }
    const shells = model.entities.filter(entity => !entity.attributes.some(attribute => !/^(?:id|estado)$/i.test(attribute.name)));
    if (shells.length && shells.length >= model.entities.length / 2) {
      advertencias.push(`Modelo de dominio por verificar: ${shells.map(entity => entity.name).join(', ')} solo declaran id/estado o ningún atributo. Revisa los datos y estados exigidos por los RF y criterios aprobados; no inventes campos si el concepto es legítimamente mínimo.`);
    }
    advertencias.push(...this._relacionesSospechosas(model));
    advertencias.push(...this._cardinalidadesRevisables(model));
    advertencias.push(...this._tiposRevisables(code));
    return { errores, advertencias, metricas: { entidades_extraibles: model.entities.length, relaciones_extraibles: model.relations.length } };
  }

  _cardinalidadesRevisables(model) {
    const avisos = [];
    const oneToOne = model.relations.filter(r => r.kind === 'asociacion' && r.fromCardinality === '1' && r.toCardinality === '1');
    for (const entity of model.entities) {
      const links = oneToOne.filter(r => r.from === entity.name || r.to === entity.name);
      const targets = [...new Set(links.map(r => r.from === entity.name ? r.to : r.from))];
      const isAccount = entity.attributes.some(a => require('./IdentityRequirements').isSensitiveField(a.name)) &&
        entity.attributes.some(a => /^(?:rol|role|roles|perfil)$/i.test(a.name));
      if (isAccount && targets.length >= 2) {
        avisos.push(`Modelo de dominio por verificar: ${entity.name} exige simultáneamente una instancia de cada perfil (${targets.join(', ')}) mediante relaciones 1–1 obligatorias. Contrasta opcionalidad y reglas de roles aprobadas; no conviertas automáticamente todos los actores en perfiles obligatorios ni impongas herencia.`);
      } else if (targets.length >= 3) {
        avisos.push(`Modelo de dominio por verificar: ${entity.name} tiene asociaciones 1–1 obligatorias con ${targets.join(', ')}. Comprueba ambos extremos, reutilización e historial según los RF; una restricción simultánea no limita necesariamente toda la historia. Es una señal orientativa, no un defecto confirmado.`);
      }
    }
    return avisos;
  }

  _tiposRevisables(code) {
    const avisos = [];
    let entity = null;
    for (const line of String(code || '').split(/\r?\n/)) {
      const declaration = line.match(/^\s*(?:abstract\s+)?class\s+(?:"[^"]+"\s+as\s+)?([\w.]+)(?:\s*<<[^>]*>>)?\s*\{/i);
      if (declaration) { entity = declaration[1]; continue; }
      if (/^\s*}/.test(line)) { entity = null; continue; }
      if (!entity || line.includes('(')) continue;
      const field = line.replace(/^\s*[+\-#~]?\s*/, '').trim();
      const colon = field.match(/^(\w+)\s*:\s*([\w.]+)/);
      const spaced = field.match(/^([\w.]+)\s+(\w+)\s*$/);
      if (!colon && !spaced) continue;
      const name = colon ? colon[1] : spaced[2];
      const type = colon ? colon[2] : spaced[1];
      const key = name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
      if (/^(?:float|double|real)$/i.test(type) && /(?:precio|importe|monto|saldo|efectivo|ingreso|egreso|costo|coste|price|amount|money|balance|cash)/.test(key)) {
        avisos.push(`Modelo de dominio por verificar: ${entity}.${name} usa ${type} para un valor aparentemente monetario. Si representa dinero, usa Decimal o un valor monetario exacto sin cambiar la unidad ni las reglas aprobadas.`);
      }
      if (/^(?:datetime|timestamp|instant|localdatetime)$/i.test(type) && /(?:transcurrid|duracion|elapsed|duration)/.test(key)) {
        avisos.push(`Modelo de dominio por verificar: ${entity}.${name} usa ${type} para una duración aparente. Representa duración con unidad o derívala del instante de inicio; no confundas un intervalo con una fecha/hora.`);
      }
    }
    return avisos;
  }

  /**
   * Relaciones que casi siempre son un error de modelado (no se corrigen solas, se avisan):
   * una herencia de una entidad de cuentas hacia algo que no es una persona, y una "parte" con dos dueños.
   */
  _relacionesSospechosas(model) {
    const avisos = [];
    const byName = new Map(model.entities.map((entity) => [entity.name, entity]));
    const names = (entity) => (entity?.attributes || []).map((attribute) => attribute.name);
    const PERSON = /^(?:nombre|nombres|apellido|apellidos|correo|email|telefono|celular|documento|cedula|dni|rol)$/i;
    for (const relation of model.relations.filter((item) => item.kind === 'herencia')) {
      const parent = byName.get(relation.from);
      const child = byName.get(relation.to);
      if (!parent || !child || !names(parent).some((field) => require('./IdentityRequirements').isSensitiveField(field))) continue;
      if (!names(child).some((field) => PERSON.test(field.normalize('NFD').replace(/[\u0300-\u036f]/g, '')))) {
        avisos.push(`Modelo de dominio por verificar: ${child.name} hereda de ${parent.name} (entidad de cuentas con contraseña) pero no parece una persona; revisa que sea un tipo de usuario real y no una relación distinta.`);
      }
    }
    const owners = new Map();
    for (const relation of model.relations.filter((item) => item.kind === 'composicion')) {
      owners.set(relation.to, [...new Set([...(owners.get(relation.to) || []), relation.from])]);
    }
    for (const [part, wholes] of owners) {
      if (wholes.length > 1) avisos.push(`Modelo de dominio por verificar: ${part} es parte de ${wholes.join(' y de ')} a la vez; una composición no puede tener dos dueños. Probablemente es una relación muchos a muchos (por ejemplo con una entidad intermedia).`);
    }
    return avisos;
  }

  comparar(domainCode, designCode) {
    const extractor = new Extractor();
    const source = extractor.extract(domainCode), target = extractor.extract(designCode);
    const advertencias = [];
    for (const entity of source.entities) {
      const realization = target.entities.find(item => item.name === entity.name || item.name === `${entity.name}Entity`);
      if (!realization) {
        advertencias.push(`Diseño por verificar: falta una realización explícita de la entidad aprobada ${entity.name}. Declárala con sus atributos y relaciones o documenta su correspondencia técnica; un DTO con nombre parecido no sustituye a la entidad.`);
        continue;
      }
      const missing = entity.attributes.filter(attribute => !realization.attributes.some(item => item.name === attribute.name));
      if (missing.length) advertencias.push(`Diseño por verificar: ${entity.name} perdió atributos del dominio aprobado: ${missing.map(item => item.name).join(', ')}. Consérvalos en la entidad o representa explícitamente su realización, sin reemplazarlos por id/estado genéricos.`);
    }
    const canonical = name => source.entities.some(entity => `${entity.name}Entity` === name) ? name.slice(0, -6) : name;
    for (const relation of source.relations) {
      const targetRelation = target.relations.find(item =>
        (canonical(item.from) === relation.from && canonical(item.to) === relation.to) ||
        (canonical(item.from) === relation.to && canonical(item.to) === relation.from));
      // Comparación usando los nombres del extractor, sin inferir relaciones nuevas.
      if (!targetRelation) advertencias.push(`Diseño por verificar: no se reconoce la relación aprobada ${relation.from} — ${relation.to}. Conserva su significado y cardinalidades o documenta su realización técnica.`);
    }
    return advertencias;
  }
}
module.exports = DomainModelQualityService;
