const { markSensitive } = require('./IdentityRequirements');
const normalize = (value) => String(value || '').normalize('NFD').replace(/[̀-ͯ]/g, '');
const slug = (value) => normalize(value).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const snake = (value) => slug(value).replace(/-/g, '_');

// La entidad de cuentas: una referencia a ella se nombra por el papel que cumple («+Usuario mesero» → mesero_id).
const ACCOUNT = /^(?:usuario|cuenta|cuentausuario)$/i;

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
      if (attribute) attributes.push(this._enumGenerico(attribute, item.name, enums));
    }
    return { name: item.name, key: slug(item.name), attributes, references: [] };
  }

  /**
   * «+Enum estado» con el enum declarado aparte (EstadoVenta): el tipo genérico «Enum» no nombra cuál. Se toma el enum cuyo nombre junta el
   * del atributo y el de la entidad (EstadoVenta, VentaEstado) o, si solo uno contiene el atributo, ese. Sin esto el atributo se tomaba por
   * una referencia, desaparecía del modelo y la entidad se quedaba sin estado (no se podía anular una venta).
   */
  _enumGenerico(attribute, entityName, enums) {
    if (attribute.referencia === undefined || !/^enum(?:erado)?$/i.test(attribute.referencia)) return attribute;
    const norm = (value) => String(value || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const attr = norm(attribute.name);
    const entity = norm(entityName);
    const names = [...enums.keys()];
    const found = names.find((name) => norm(name) === attr + entity || norm(name) === entity + attr)
      || names.find((name) => norm(name).includes(attr) && norm(name).includes(entity))
      || (names.filter((name) => norm(name).includes(attr)).length === 1 ? names.find((name) => norm(name).includes(attr)) : null);
    if (!found) return { ...attribute, type: 'string', referencia: undefined };
    const { referencia, ...rest } = attribute;
    return { ...rest, type: 'string', enum: enums.get(found), dominio: found };
  }

  _attribute(line, enums) {
    const cleaned = line.replace(/\{(?:static|abstract|field)\}/gi, '').replace(/^[+\-#~]\s*/, '').trim();
    if (!cleaned) return null;
    // «+Enum estado {REGISTRADA, ANULADA}»: el enum viene en la propia línea.
    const inline = cleaned.match(/^enum(?:erado)?\s+(\w+)\s*\{([^}]*)\}\s*$/i);
    if (inline) {
      const values = inline[2].split(/[,;\s]+/).map((item) => item.trim()).filter(Boolean);
      if (values.length) return { name: inline[1], type: 'string', enum: values, nullable: false };
    }
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

  _many(cardinality) { return /\*|\b[nm]\b|\.\.(?:[2-9]|\d{2,})/i.test(cardinality || '') || /^\d+$/.test(cardinality || '') && Number(cardinality) > 1; }

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
      // Los atributos que apuntan a la cuenta ya dicen quién es quién (cliente, mesero): la línea no añade otra clave sin papel.
      if (ACCOUNT.test(target.name) && holder.attributes.some((item) => item.referencia === target.name && !item.collection)) continue;
      // Si el otro extremo ya declara el atributo que apunta a este («Factura» con «+Venta venta»), la clave vive allí: una segunda
      // clave en sentido contrario crearía una referencia circular que no permite sembrar ni insertar datos.
      if (cardinality !== 'uno_a_muchos' && target.attributes.some((item) => item.referencia === holder.name && !item.collection)) continue;
      const field = `${snake(target.name)}_id`;
      if (holder.attributes.some((item) => item.name === field) || holder.references.some((item) => item.field === field)) continue;
      holder.references.push({ field, entity: target.name, relation: relation.kind, cardinality, label: relation.label });
    }
    for (const entity of entities) {
      for (const attribute of entity.attributes) {
        if (!attribute.referencia || !byName.has(attribute.referencia)) continue;
        // Una colección respaldada por N:M no es una FK escalar del propietario.
        if (attribute.collection && relations.some((r) => r.cardinalidad === 'muchos_a_muchos' &&
          ((r.from === entity.name && r.to === attribute.referencia) || (r.to === entity.name && r.from === attribute.referencia)))) continue;
        // Dos papeles sobre la misma cuenta (el mesero y el cliente de un pedido) son dos claves, no una.
        const byRole = ACCOUNT.test(attribute.referencia) && !attribute.collection;
        const field = `${snake(byRole ? attribute.name.replace(/(?:_?[Ii]d)$/, '') || attribute.referencia : attribute.referencia)}_id`;
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
    return markSensitive({ type: 'object', title: entity.name, properties, required: [], additionalProperties: true });
  }
}

module.exports = DomainModelExtractor;
