const { isLoginRequirement, isUsersRequirement, hasCredentials } = require('./IdentityRequirements');
const { SYNONYMS } = require('./DomainSynonyms');
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
  .split(/[^a-z0-9]+/).filter((token) => token.length > 1 && !STOPWORDS.has(token)).map(stem).map((token) => SYNONYMS.get(token) || token);
// "OrdenCompra" -> ["orden", "compra"]
const entityTokens = (name) => [...new Set(tokens(String(name).replace(/([a-z0-9])([A-Z])/g, '$1 $2')))];

const ALL_METHODS = ['GET', 'POST', 'PATCH', 'DELETE'];
const VERB_METHOD = { consultar: 'GET', crear: 'POST', editar: 'PATCH', eliminar: 'DELETE' };

class ApplicationContractBuilder {
  /**
   * `verbosPorRf` ({ 'RF-01': ['consultar', 'crear'] }) son los verbos válidos que declaran los mockups para cada RF.
   * Sin ellos, o para un RF que no aparece, la operación mantiene el CRUD completo.
   */
  build({ proyecto, requerimientos = [], screens = [], domainModel = null, rules = [], verbosPorRf = null, spec = null }) {
    const approved = requerimientos.filter((item) => item.aprobado === true && item.tipo === 'RF');
    const entities = domainModel?.entities || [];
    const warnings = [];
    if ((domainModel?.relations || []).some((r) => r.cardinalidad === 'muchos_a_muchos')) warnings.push('Relaciones N:M: API y panel web generados; MongoDB requiere replica set transaccional. Requiere verificación integral con base real antes de certificar la entrega completa.');
    const operations = approved.map((item, index) => {
      const key = this._uniqueKey(slug(item.identificador || item.nombre), approved, index);
      const id = item.identificador || `RF-${String(index + 1).padStart(2, '0')}`;
      const specOps = (spec?.operaciones || []).filter((op) => String(op.rf).toUpperCase() === String(id).toUpperCase());
      // La especificación aprobada manda sobre la heurística: la entidad la fija la operación, no el parecido de nombres.
      const specEntity = specOps.length ? entities.find((entity) => entity.name === specOps[0].entidad) : null;
      const match = specEntity
        ? { primary: specEntity, inName: true, related: entities.filter((entity) => specOps.some((op) => op.entidad === entity.name) && entity !== specEntity) }
        : this._entityFor(item, entities);
      if (entities.length && !match) warnings.push(`${id} no se asoció a ninguna entidad del modelo de dominio; usa un esquema genérico.`);
      else if (match && !match.inName) warnings.push(`${id} se asoció a ${match.primary.name} solo por su descripción o por coincidencia parcial; revisa que sea la entidad correcta.`);
      // Identidad: el acceso lo resuelve la sesión de la aplicación y las cuentas viven en /api/users, no en una tabla de datos.
      const identity = isLoginRequirement(item) ? 'login' : (isUsersRequirement(item) && match && hasCredentials(match.primary.schema) ? 'usuarios' : null);
      return {
        id,
        ...(identity ? { identity } : {}),
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
        schema: match ? match.primary.schema : { ...GENERIC_SCHEMA },
        ...(specOps.length ? { actions: specOps.map((op) => this._action(op, entities)) } : {})
      };
    });
    // Las líneas de un pedido se guardan en su propia entidad: si ningún requisito la gestiona, se le crea un almacén de soporte
    // (sin permisos para nadie salvo el administrador; las escribe el servidor al crear el pedido).
    for (const operation of [...operations]) {
      for (const action of operation.actions || []) {
        const hijos = [action.lineas, ...(action.relacionadas || []).map((rel) => rel.items)].filter(Boolean).map((linea) => entities.find((entity) => entity.key === linea.entidadClave)).filter(Boolean);
        const hijo = hijos.find((item) => !operations.some((other) => other.entity === item.key));
        if (!hijo) continue;
        const lineas = action.lineas?.entidadClave === hijo.key ? action.lineas : (action.relacionadas || []).map((rel) => rel.items).find((item) => item?.entidadClave === hijo.key);
        let key = `op-${slug(hijo.name)}`;
        for (let n = 2; operations.some((item) => item.key === key); n += 1) key = `op-${slug(hijo.name)}-${n}`;
        operations.push({
          id: `OP-${slug(hijo.name).toUpperCase()}`, key, name: `Líneas de ${lineas.entidad}`, description: `Almacén de soporte de ${hijo.name}`, actors: [],
          collectionPath: `/api/operations/${key}`, itemPath: `/api/operations/${key}/:id`, methods: [...ALL_METHODS], entity: hijo.key, relatedEntities: [],
          rules: rules.filter((rule) => rule.entidad === hijo.name), schema: hijo.schema, support: true
        });
      }
    }
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
    // Campos que referencian a otra entidad (mesa_id): su select se llena con los registros de la operación de esa entidad.
    const operationOf = new Map();
    for (const operation of operations) if (operation.entity && !operationOf.has(operation.entity)) operationOf.set(operation.entity, operation.key);
    const references = {};
    const ambiguous = new Set();
    for (const entity of entities) {
      for (const reference of entity.references || []) {
        const target = operationOf.get(keyOf.get(reference.entity));
        if (!target) continue;
        if (references[reference.field] && references[reference.field] !== target) ambiguous.add(reference.field);
        else references[reference.field] = target;
      }
    }
    for (const field of ambiguous) delete references[field];
    // Las operaciones de negocio de la especificación se atan a la operación (almacén) de su entidad.
    for (const operation of operations) {
      if (!operation.actions) continue;
      operation.actions = operation.actions
        .map((action) => this._bindAction(action, { operation, operationOf, operations, entities, warnings }))
        .filter(Boolean);
      if (!operation.actions.length) delete operation.actions;
    }
    const byRequirement = new Map(operations.map((item) => [item.id, item]));
    const views = screens.map((screen) => {
      const rf = screen.rf_trazabilidad || screen.mockup?.rf_trazabilidad || [];
      const linked = rf.map((id) => byRequirement.get(id)).filter(Boolean);
      const viewId = screen.pantalla_id || slug(screen.slug || screen.nombre);
      const specView = (spec?.pantallas || []).find((item) => item.id === viewId);
      return {
        id: viewId,
        name: screen.nombre || screen.nombre_visible || screen.slug || 'Pantalla',
        route: this._route(screen),
        roles: screen.roles || [],
        requirements: rf,
        operations: linked.map((item) => item.key),
        ...(specView ? { components: specView.componentes } : {})
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
      references,
      identity: {
        login: operations.filter((operation) => operation.identity === 'login').map((operation) => operation.id),
        usuarios: operations.filter((operation) => operation.identity === 'usuarios').map((operation) => operation.id)
      },
      views,
      ...(spec ? { spec: { version: spec.version || 1, actions: operations.reduce((total, operation) => total + (operation.actions?.length || 0), 0) } } : {}),
      warnings,
      health: '/health'
    };
  }

  /** Tipo y opciones de cada campo que la operación lee, escribe o filtra: el frontend arma sus controles con esto. */
  _fieldMeta(op, entities) {
    const entity = entities.find((item) => item.name === op.entidad);
    const names = [...new Set([...(op.entradas || []), ...(op.salida || []), ...(op.filtros || []).map((filter) => filter.campo), ...(op.transicion ? [op.transicion.campo] : [])])];
    return Object.fromEntries(names.filter((name) => entity?.schema?.properties?.[name]).map((name) => {
      const property = entity.schema.properties[name];
      return [name, { type: property.type, ...(property.format ? { format: property.format } : {}), ...(property.enum ? { enum: property.enum } : {}), ...(property['x-references'] ? { entidad: property['x-references'] } : {}) }];
    }));
  }

  /** Operación de negocio con nombre: método y ruta propios (`/api/actions/...`), separados del CRUD genérico. */
  _action(op, entities = []) {
    const kebab = String(op.nombre).replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
    const byId = ['actualizar', 'eliminar', 'transicion'].includes(op.tipo);
    return {
      id: op.id || null,
      name: op.nombre,
      type: op.tipo,
      method: { consulta: 'GET', crear: 'POST', actualizar: 'PATCH', eliminar: 'DELETE', transicion: 'POST' }[op.tipo],
      path: `/api/actions/${kebab}${byId ? '/:id' : ''}`,
      byId,
      // El permiso es el del requisito de la operación: la lista de recompensas del cliente (RF-18) se guarda en el almacén de RF-19, que es del administrador.
      permission: slug(op.rf),
      entity: op.entidadClave || entities.find((item) => item.name === op.entidad)?.key || null,
      actors: op.actores || [],
      filters: op.filtros || [],
      fields: this._fieldMeta(op, entities),
      inputs: op.entradas || [],
      ...(op.sesionEntradas?.length ? { sessionInputs: op.sesionEntradas } : {}),
      ...(op.autoEntradas?.length ? { autoInputs: op.autoEntradas } : {}),
      ...(op.lineas ? { lineas: op.lineas } : {}),
      ...(op.relacionadas?.length ? { relacionadas: op.relacionadas } : {}),
      ...(op.sobre ? { sobre: op.sobre } : {}),
      output: op.salida || [],
      ...(op.transicion ? { transition: op.transicion } : {}),
      description: op.descripcion || ''
    };
  }

  /**
   * Fija la capacidad (almacén) que ejecuta la acción y, en los filtros de sesión, cómo reconocer a la persona:
   * si el campo apunta a una entidad con correo, se busca su registro por el correo de la sesión; si apunta a la
   * entidad de cuentas (identidad), se compara con el id de la cuenta.
   */
  _bindAction(action, { operation, operationOf, operations, entities, warnings }) {
    const capability = action.entity === operation.entity ? operation.key : operationOf.get(action.entity);
    if (!capability) {
      warnings.push(`La operación «${action.name}» usa la entidad ${action.entity}, que no tiene almacén en el contrato; no se generó.`);
      return null;
    }
    const entity = entities.find((item) => item.key === action.entity);
    const filters = action.filters.map((filter) => {
      if (filter.origen !== 'sesion' || filter.valor !== 'usuario.id') return filter;
      const target = entities.find((item) => item.name === entity?.schema?.properties?.[filter.campo]?.['x-references']);
      if (!target) return filter;
      const store = operations.find((item) => item.entity === target.key);
      const email = ['email', 'correo'].find((name) => target.schema?.properties?.[name]);
      if (!store || store.identity || !email) return filter;
      return { ...filter, via: { capability: store.key, campo: email } };
    });
    const fields = Object.fromEntries(Object.entries(action.fields || {}).map(([name, meta]) => {
      const target = meta.entidad ? entities.find((item) => item.name === meta.entidad) : null;
      const reference = target ? operationOf.get(target.key) : null;
      return [name, reference ? { ...meta, referencia: reference } : meta];
    }));
    // Líneas del alta: el almacén donde se guardan y el del dato del que sale el precio.
    let lineas;
    if (action.lineas) {
      const hijo = operationOf.get(action.lineas.entidadClave);
      const destino = operationOf.get(action.lineas.destinoClave);
      if (hijo && destino) lineas = { ...action.lineas, capability: hijo, destinoCapability: destino };
      else warnings.push(`«${action.name}»: no se pudo guardar las líneas (${action.lineas.entidad}); se crea sin ellas.`);
    }
    // Datos del registro relacionado que acompañan a las filas: sus almacenes y el de cada referencia (para mostrar nombres y no ids).
    let relacionadas;
    if (action.relacionadas?.length) {
      relacionadas = action.relacionadas.map((rel) => {
        const store = operationOf.get(rel.entidadClave);
        const related = entities.find((item) => item.key === rel.entidadClave);
        if (!store || !related) return null;
        const referencias = Object.fromEntries(rel.campos.map((campo) => {
          const target = entities.find((item) => item.name === related.schema?.properties?.[campo]?.['x-references']);
          return [campo, target ? operationOf.get(target.key) : null];
        }).filter(([, target]) => target));
        const items = rel.items && operationOf.get(rel.items.entidadClave) && operationOf.get(rel.items.destinoClave)
          ? { ...rel.items, capability: operationOf.get(rel.items.entidadClave), destinoCapability: operationOf.get(rel.items.destinoClave) } : null;
        return { ...rel, capability: store, referencias, items };
      }).filter(Boolean);
    }
    return { ...action, capability, filters, fields, lineas, relacionadas };
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
    return { primary: scored[0].entity, inName: scored[0].inName, related: scored.slice(1).map((item) => item.entity) };
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
