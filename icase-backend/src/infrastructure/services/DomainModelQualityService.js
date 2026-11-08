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
    return { errores, advertencias, metricas: { entidades_extraibles: model.entities.length, relaciones_extraibles: model.relations.length } };
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
