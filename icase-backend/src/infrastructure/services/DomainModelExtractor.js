const normalize = (value) => String(value || '').normalize('NFD').replace(/[̀-ͯ]/g, '');
const slug = (value) => normalize(value).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const snake = (value) => slug(value).replace(/-/g, '_');

const SCALARS = [
  [/^(?:uuid|guid)$/i, { type: 'string', format: 'uuid' }],
  [/^(?:datetime|localdatetime|timestamp|instant|zoneddatetime|offsetdatetime)$/i, { type: 'string', format: 'date-time' }],
  [/^(?:date|localdate)$/i, { type: 'string', format: 'date' }],
  [/^(?:time|localtime)$/i, { type: 'string', format: 'time' }],
  [/^(?:int|integer|long|short|bigint|smallint|byte)$/i, { type: 'integer' }],
  [/^(?:float|double|decimal|bigdecimal|number|real|money|numeric)$/i, { type: 'number' }],
  [/^(?:bool|boolean)$/i, { type: 'boolean' }],
  [/^(?:string|text|char|varchar|url|email)$/i, { type: 'string' }]
];

class DomainModelExtractor {
  /**
   * Convierte el PlantUML del diagrama de clases de dominio en un modelo estructurado.
   * Solo describe lo que el diagrama declara: no inventa campos obligatorios ni reglas.
   */
  extract(plantuml) {
    const lines = String(plantuml || '').split(/\r?\n/);
    const declared = this._declarations(lines);
    const enums = new Map(declared.filter((item) => item.kind === 'enum').map((item) => [item.name, item.values]));
    const entities = declared.filter((item) => item.kind !== 'enum').map((item) => this._entity(item, enums));
    const names = new Set(entities.map((item) => item.name));
    const relations = this._relations(lines, names);
    this._references(entities, relations);
    for (const entity of entities) entity.schema = this._schema(entity);
    return { entities, relations, enums: [...enums.keys()] };
  }

  /** Modelo del diagrama de clases de dominio aprobado y vigente, o null si no existe. */
  fromDiagrams(diagramas = []) {
    const dominio = (diagramas || []).find((item) => ['clases_dominio', 'clases'].includes(item.tipo) && item.aprobado && item.estado === 'aprobado' && !item.desactualizado);
    return dominio?.codigo_plantuml ? this.extract(dominio.codigo_plantuml) : null;
  }

  _declarations(lines) {
    const found = [];
    let current = null;
    for (const raw of lines) {
      const line = raw.trim();
      if (!current) {
        const match = line.match(/^(?:abstract\s+)?(class|entity|enum|interface)\s+(?:"([^"]+)"\s+as\s+(\w+)|([\w.]+))(?:\s*<<[^>]*>>)?\s*(\{)?\s*$/i);
        if (!match) continue;
        const kind = match[1].toLowerCase();
        const item = { kind: kind === 'enum' ? 'enum' : 'class', name: match[3] || match[4], label: match[2] || null, body: [], values: [] };
        if (kind === 'interface') continue;
        found.push(item);
        if (match[5]) current = item;
        continue;
      }
      if (line === '}') { current = null; continue; }
      if (!line || /^(?:--|==|\.\.|__|'|note\b)/.test(line)) continue;
      if (current.kind === 'enum') current.values.push(line.replace(/[,;]+$/, '').split(/\s+/)[0]);
      else current.body.push(line);
    }
    return found.filter((item) => !/(?:controller|dto|repository|service|usecase|gateway|adapter)$/i.test(item.name));
  }

  _entity(item, enums) {
    const attributes = [];
    for (const line of item.body) {
      if (line.includes('(')) continue; // métodos
      const attribute = this._attribute(line, enums);
      if (attribute) attributes.push(attribute);
    }
    return { name: item.name, key: slug(item.name), attributes, references: [] };
  }

  _attribute(line, enums) {
    const cleaned = line.replace(/\{(?:static|abstract|field)\}/gi, '').replace(/^[+\-#~]\s*/, '').trim();
    if (!cleaned) return null;
    let name; let type;
    const colon = cleaned.match(/^(\w+)\s*:\s*(.+)$/);
    if (colon) { name = colon[1]; type = colon[2]; }
    else {
      const spaced = cleaned.match(/^(.+?)\s+(\w+)$/);
      if (!spaced) return null;
      type = spaced[1]; name = spaced[2];
    }
    type = type.replace(/\s*=.*$/, '').trim();
    const optional = /\?$/.test(type);
    type = type.replace(/\?$/, '');
    return { name, ...this._type(type, enums), nullable: optional };
  }

  _type(rawType, enums) {
    const array = rawType.match(/^(?:List|Set|Array|Collection)<(.+)>$/i) || rawType.match(/^(.+)\[\]$/);
    if (array) return { ...this._type(array[1].trim(), enums), collection: true };
    const base = rawType.replace(/<.*>$/, '').trim();
    if (enums.has(base)) return { type: 'string', enum: enums.get(base), dominio: base };
    for (const [pattern, schema] of SCALARS) if (pattern.test(base)) return { ...schema };
    return { type: 'string', referencia: base };
  }

  _relations(lines, names) {
    const relations = [];
    const pattern = /^(\w+)\s*(?:"([^"]*)")?\s*([<|*o#}{+.\-]*[-.]+[>|*o#}{+.\-]*)\s*(?:"([^"]*)")?\s*(\w+)\s*(?::\s*(.*))?$/;
    for (const raw of lines) {
      const match = raw.trim().match(pattern);
      if (!match || !names.has(match[1]) || !names.has(match[5])) continue;
      const arrow = match[3];
      const kind = /<\||\|>/.test(arrow) ? 'herencia' : arrow.includes('*') ? 'composicion' : /^o|o$/.test(arrow) ? 'agregacion' : 'asociacion';
      relations.push({ from: match[1], to: match[5], kind, fromCardinality: match[2] || null, toCardinality: match[4] || null, label: (match[6] || '').trim() || null, arrow });
    }
    return relations;
  }

  _many(cardinality) { return /\*|\b[nm]\b|\.\.(?:[2-9]|\d{2,})/i.test(cardinality || ''); }

  /** Una relación uno-a-muchos deja la clave foránea en el lado "muchos". */
  _references(entities, relations) {
    const byName = new Map(entities.map((item) => [item.name, item]));
    for (const relation of relations) {
      if (relation.kind === 'herencia') continue;
      const from = byName.get(relation.from); const to = byName.get(relation.to);
      const fromMany = this._many(relation.fromCardinality); const toMany = this._many(relation.toCardinality);
      const whole = relation.kind === 'composicion' || relation.kind === 'agregacion';
      let holder; let target; let cardinality;
      if (fromMany && toMany) { relation.cardinalidad = 'muchos_a_muchos'; continue; }
      if (toMany) { holder = to; target = from; cardinality = 'uno_a_muchos'; }
      else if (fromMany) { holder = from; target = to; cardinality = 'uno_a_muchos'; }
      else if (whole) { holder = to; target = from; cardinality = 'uno_a_uno'; }
      else { holder = from; target = to; cardinality = 'muchos_a_uno'; }
      relation.cardinalidad = cardinality;
      const field = `${snake(target.name)}_id`;
      if (holder.attributes.some((item) => item.name === field) || holder.references.some((item) => item.field === field)) continue;
      holder.references.push({ field, entity: target.name, relation: relation.kind, cardinality, label: relation.label });
    }
    for (const entity of entities) {
      for (const attribute of entity.attributes) {
        if (!attribute.referencia || !byName.has(attribute.referencia)) continue;
        const field = `${snake(attribute.referencia)}_id`;
        if (!entity.references.some((item) => item.field === field)) {
          entity.references.push({ field, entity: attribute.referencia, relation: 'atributo', cardinality: attribute.collection ? 'uno_a_muchos' : 'muchos_a_uno', label: attribute.name });
        }
      }
    }
  }

  /** JSON Schema informativo: las propiedades se describen, nada se declara obligatorio. */
  _schema(entity) {
    const properties = {};
    for (const attribute of entity.attributes) {
      if (attribute.referencia && !attribute.enum) continue; // se expresa como clave foránea
      const { name, nullable, collection, dominio, referencia, ...schema } = attribute;
      const value = collection ? { type: 'array', items: schema } : schema;
      properties[name] = name === 'id' ? { ...value, readOnly: true } : value;
    }
    for (const reference of entity.references) {
      properties[reference.field] = { type: 'string', 'x-references': reference.entity };
    }
    return { type: 'object', title: entity.name, properties, required: [], additionalProperties: true };
  }
}

module.exports = DomainModelExtractor;
