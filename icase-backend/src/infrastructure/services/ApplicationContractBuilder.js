const slug = (value) => String(value || '')
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'operacion';

const GENERIC_SCHEMA = Object.freeze({ type: 'object', additionalProperties: true });

// Verbos y conectores que no identifican un concepto del dominio.
const STOPWORDS = new Set(['de', 'del', 'la', 'el', 'los', 'las', 'un', 'una', 'y', 'o', 'en', 'por', 'para', 'con', 'a', 'al', 'mediante',
  'gestion', 'gestionar', 'registrar', 'consultar', 'crear', 'editar', 'eliminar', 'actualizar', 'visualizar', 'listar', 'ver', 'control',
  'modulo', 'sistema', 'permitir', 'poder', 'debe']);

const stem = (token) => {
  if (/ciones$/.test(token)) return token.replace(/ciones$/, 'cion');
  if (token.length > 4 && /[nrldz]es$/.test(token)) return token.slice(0, -2);
  if (token.length > 3 && /[^s]s$/.test(token)) return token.slice(0, -1);
  return token;
};
const tokens = (value) => String(value || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .split(/[^a-z0-9]+/).filter((token) => token.length > 1 && !STOPWORDS.has(token)).map(stem);
// "OrdenCompra" -> ["orden", "compra"]
const entityTokens = (name) => tokens(String(name).replace(/([a-z0-9])([A-Z])/g, '$1 $2'));

const ALL_METHODS = ['GET', 'POST', 'PATCH', 'DELETE'];
const VERB_METHOD = { consultar: 'GET', crear: 'POST', editar: 'PATCH', eliminar: 'DELETE' };

class ApplicationContractBuilder {
  /**
   * `verbosPorRf` ({ 'RF-01': ['consultar', 'crear'] }) son los verbos válidos que declaran los mockups para cada RF.
   * Sin ellos, o para un RF que no aparece, la operación mantiene el CRUD completo.
   */
  build({ proyecto, requerimientos = [], screens = [], domainModel = null, rules = [], verbosPorRf = null }) {
    const approved = requerimientos.filter((item) => item.aprobado === true && item.tipo === 'RF');
    const entities = domainModel?.entities || [];
    const warnings = [];
    if ((domainModel?.relations || []).some((r) => r.cardinalidad === 'muchos_a_muchos')) warnings.push('Relaciones N:M: API y panel web generados; MongoDB requiere replica set transaccional. Requiere verificación integral con base real antes de certificar la entrega completa.');
    const operations = approved.map((item, index) => {
      const key = this._uniqueKey(slug(item.identificador || item.nombre), approved, index);
      const id = item.identificador || `RF-${String(index + 1).padStart(2, '0')}`;
      const match = this._entityFor(item, entities);
      if (entities.length && !match) warnings.push(`${id} no se asoció a ninguna entidad del modelo de dominio; usa un esquema genérico.`);
      return {
        id,
        key,
        name: item.nombre || `Operación ${index + 1}`,
        description: item.descripcion || '',
        actors: Array.isArray(item.actores) ? item.actores : [],
        collectionPath: `/api/operations/${key}`,
        itemPath: `/api/operations/${key}/:id`,
        methods: this._methods(id, verbosPorRf),
        entity: match?.primary.key || null,
        relatedEntities: match?.related.map((entity) => entity.key) || [],
        rules: match ? rules.filter((rule) => rule.entidad === match.primary.name) : [],
        schema: match ? match.primary.schema : { ...GENERIC_SCHEMA }
      };
    });
    const used = new Set(operations.map((operation) => operation.entity).filter(Boolean));
    // Las relaciones del modelo aprobado se conservan tal cual: si un extremo no tiene RF propio,
    // el generador del backend le crea una operación de soporte en lugar de cambiar el significado de la relación.
    const relations = domainModel?.relations || [];
    // Siguen con CRUD completo los extremos de una N:M (vinculan con GET y PATCH) y las entidades padre de otra
    // (las pruebas y los vínculos las crean y las borran).
    const keyOf = new Map(entities.map((entity) => [entity.name, entity.key]));
    const fullCrud = new Set([
      ...relations.filter((rel) => rel.cardinalidad === 'muchos_a_muchos').flatMap((rel) => [rel.from, rel.to]),
      ...entities.flatMap((entity) => (entity.references || []).map((reference) => reference.entity))
    ].map((name) => keyOf.get(name)).filter(Boolean));
    for (const operation of operations) if (fullCrud.has(operation.entity)) operation.methods = [...ALL_METHODS];
    const byRequirement = new Map(operations.map((item) => [item.id, item]));
    const views = screens.map((screen) => {
      const rf = screen.rf_trazabilidad || screen.mockup?.rf_trazabilidad || [];
      const linked = rf.map((id) => byRequirement.get(id)).filter(Boolean);
      return {
        id: screen.pantalla_id || slug(screen.slug || screen.nombre),
        name: screen.nombre || screen.nombre_visible || screen.slug || 'Pantalla',
        route: this._route(screen),
        roles: screen.roles || [],
        requirements: rf,
        operations: linked.map((item) => item.key)
      };
    });
    return {
      version: 1,
      project: proyecto?.nombre || 'Proyecto',
      model: { source: entities.length ? 'clases_dominio' : 'none', entities: entities.length, unmapped: entities.filter((entity) => !used.has(entity.key)).map((entity) => entity.name) },
      entities: entities.map(({ name, key, attributes, references, schema }) => ({ name, key, attributes, references, schema })),
      relations,
      rules,
      operations,
      views,
      warnings,
      health: '/health'
    };
  }

  /** GET más los métodos de los verbos válidos declarados, en orden canónico; sin verbos, CRUD completo. */
  _methods(id, verbosPorRf) {
    const wanted = (verbosPorRf?.[String(id).toUpperCase()] || []).map((verb) => VERB_METHOD[verb]).filter(Boolean);
    if (!wanted.length) return [...ALL_METHODS];
    return ALL_METHODS.filter((method) => method === 'GET' || wanted.includes(method));
  }

  /** Asocia un RF a la entidad cuyo nombre aparece primero y con más peso en su nombre o descripción. */
  _entityFor(requirement, entities) {
    if (!entities.length) return null;
    const nameTokens = tokens(requirement.nombre);
    const descriptionTokens = new Set(tokens(requirement.descripcion));
    const scored = entities.map((entity) => {
      const parts = entityTokens(entity.name);
      if (!parts.length) return null;
      const positions = parts.map((part) => nameTokens.indexOf(part));
      const inName = positions.every((position) => position >= 0);
      const inDescription = parts.every((part) => descriptionTokens.has(part));
      if (!inName && !inDescription) return null;
      return { entity, inName, parts: parts.length, score: (inName ? 10 : 0) + (inDescription ? 2 : 0) + parts.length, position: inName ? Math.min(...positions) : Infinity };
    }).filter(Boolean).sort((a, b) => (b.inName !== a.inName ? (b.inName ? 1 : -1) : 0) || (a.inName && b.parts !== a.parts ? b.parts - a.parts : 0) || (a.inName && a.position !== b.position ? a.position - b.position : 0) || b.score - a.score || a.position - b.position);
    if (!scored.length) {
      const partial = entities.map((entity) => {
        const parts = entityTokens(entity.name);
        if (parts.length < 2) return null;
        const matched = parts.filter((part) => nameTokens.includes(part));
        if (!matched.length) return null;
        return { entity, score: matched.length, position: Math.min(...matched.map((part) => nameTokens.indexOf(part))) };
      }).filter(Boolean).sort((a, b) => b.score - a.score || a.position - b.position);
      if (!partial.length) return null;
      return { primary: partial[0].entity, related: partial.slice(1).map((item) => item.entity) };
    }
    return { primary: scored[0].entity, related: scored.slice(1).map((item) => item.entity) };
  }

  _uniqueKey(base, requirements, index) {
    const previous = requirements.slice(0, index).filter((item) => slug(item.identificador || item.nombre) === base).length;
    return previous ? `${base}-${previous + 1}` : base;
  }

  _route(screen) {
    const route = String(screen.ruta || '').trim();
    return route.startsWith('/') ? route : `/${route || slug(screen.slug || screen.nombre)}`;
  }
}

module.exports = ApplicationContractBuilder;
