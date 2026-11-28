const { isLoginRequirement, isUsersRequirement, hasCredentials, isSensitiveField } = require('./IdentityRequirements');
const Behaviors = require('./BusinessBehaviors');
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
    // Los roles del proyecto: un campo «mesero_id» solo pide una cuenta de mesero si «Mesero» es un actor.
    this._actors = [...new Set(approved.flatMap((item) => (Array.isArray(item.actores) ? item.actores : [])))];
    const entities = domainModel?.entities || [];
    const warnings = [];
    // Una regla «X es obligatorio» sobre un dato que el alta no pide ni el sistema completa (el motivo de anulación al registrar una venta,
    // el subtotal que nadie calcula, la factura que se emite después) impediría crear cualquier registro: no se aplica al alta.
    const norm = (value) => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/_id$/, '').replace(/[^a-z0-9]/g, '');
    // La entidad de la regla: la suya o, si solo trae su RF, la de las operaciones de ese RF.
    const entidadDe = (rule) => rule.entidad || (spec?.operaciones || []).find((op) => (Array.isArray(rule.rf) ? rule.rf : [rule.rf]).map((id) => String(id || '').toUpperCase()).includes(String(op.rf || '').toUpperCase()))?.entidad;
    rules = (rules || []).filter((rule) => {
      // La contraseña (o su hash) la guarda la cuenta de acceso (/api/users), nunca una operación de datos: una regla sobre ella no se puede cumplir.
      if (rule.campo && isSensitiveField(rule.campo)) { warnings.push(`${rule.id}: «${rule.mensaje}» la cumple la cuenta de acceso (contraseña cifrada), no las operaciones de datos.`); return false; }
      if (rule.tipo !== 'requerido' || rule.estado_decision === 'rechazado') return true;
      const altas = (spec?.operaciones || []).filter((op) => op.tipo === 'crear' && op.entidad === entidadDe(rule) && op.estado_decision !== 'rechazado');
      if (!altas.length) return true;
      const provee = (op) => [...(op.entradas || []), ...(op.autoEntradas || []).map((item) => item.campo), ...(op.sesionEntradas || []).map((item) => item.campo), op.lineas?.total,
        ...(op.rolEntradas || []).map((item) => item.campo), ...(op.periodo ? [op.periodo.inicio, op.periodo.fin, op.periodo.saldo] : []), op.liquida?.monto, ...Object.keys(op.liquida?.fijo || {})].filter(Boolean).some((campo) => norm(campo) === norm(rule.campo));
      if (altas.some(provee)) return true;
      warnings.push(`${rule.id}: «${rule.mensaje}» no se aplica al alta de ${entidadDe(rule)}: el dato no se pide ni lo completa el sistema.`);
      return false;
    });
    if ((domainModel?.relations || []).some((r) => r.cardinalidad === 'muchos_a_muchos')) warnings.push('Relaciones N:M: API y panel web generados; MongoDB requiere replica set transaccional. Requiere verificación integral con base real antes de certificar la entrega completa.');
    // Lo cobrado, los cobros y los cierres no se modifican ni se eliminan; un documento se cobra una sola vez (unicidad en la base de datos).
    const locks = spec ? Behaviors.locks(spec.operaciones || [], new Map(entities.map((entity) => [entity.name, entity]))) : [];
    rules = [...rules, ...locks];
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
        ...(specOps.length ? { actions: specOps.map((op) => this._account(this._action(op, entities), identity, match?.primary)) } : {})
      };
    });
    // Las líneas de un pedido se guardan en su propia entidad: si ningún requisito la gestiona, se le crea un almacén de soporte
    // (sin permisos para nadie salvo el administrador; las escribe el servidor al crear el pedido).
    const referenced = (value, found = []) => {
      if (!value || typeof value !== 'object') return found;
      for (const key of ['entidadClave', 'destinoClave']) if (typeof value[key] === 'string') found.push(value[key]);
      for (const child of Object.values(value)) referenced(child, found);
      return found;
    };
    const needed = new Set(operations.flatMap((operation) => (operation.actions || []).flatMap((action) => referenced([action.rolInputs, action.liquida, action.cupo, action.detalle]))));
    for (const entityKey of needed) {
      const entity = entities.find((item) => item.key === entityKey);
      if (!entity || operations.some((item) => item.entity === entityKey)) continue;
      operations.push(this._supportStore(entity, operations, rules, `Datos de ${entity.name}`));
    }
    for (const operation of [...operations]) {
      for (const action of operation.actions || []) {
        const hijos = [action.lineas, ...(action.relacionadas || []).map((rel) => rel.items)].filter(Boolean).map((linea) => entities.find((entity) => entity.key === linea.entidadClave)).filter(Boolean);
        const hijo = hijos.find((item) => !operations.some((other) => other.entity === item.key));
        if (!hijo) continue;
        const lineas = action.lineas?.entidadClave === hijo.key ? action.lineas : (action.relacionadas || []).map((rel) => rel.items).find((item) => item?.entidadClave === hijo.key);
        operations.push(this._supportStore(hijo, operations, rules, `Líneas de ${lineas.entidad}`));
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

  /**
   * «Crear usuario» es crear una cuenta (con su contraseña cifrada), no una fila en una tabla: una fila no puede iniciar sesión.
   * Las operaciones del requisito de usuarios sobre la entidad de cuentas se ejecutan con las cuentas de la aplicación.
   */
  _account(action, identity, entity) {
    if (identity !== 'usuarios' || !entity || action.entityName !== entity.name) return action;
    const names = Object.keys(entity.schema?.properties || {});
    const pick = (pattern) => names.find((name) => pattern.test(name));
    const cuenta = { email: pick(/^(correo|email|mail)/i), password: names.find((name) => isSensitiveField(name)), nombre: pick(/^(nombre|name)$/i), rol: pick(/^rol$/i) };
    return cuenta.email && cuenta.password ? { ...action, cuenta } : action;
  }

  /** Almacén de una entidad que ningún requisito gestiona: solo lo escribe el servidor (y el administrador). */
  _supportStore(entity, operations, rules, name) {
    let key = `op-${slug(entity.name)}`;
    for (let n = 2; operations.some((item) => item.key === key); n += 1) key = `op-${slug(entity.name)}-${n}`;
    return {
      id: `OP-${slug(entity.name).toUpperCase()}`, key, name, description: `Almacén de soporte de ${entity.name}`, actors: [],
      collectionPath: `/api/operations/${key}`, itemPath: `/api/operations/${key}/:id`, methods: [...ALL_METHODS], entity: entity.key, relatedEntities: [],
      rules: rules.filter((rule) => rule.entidad === entity.name), schema: entity.schema, support: true
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
      method: { consulta: 'GET', resumen: 'GET', crear: 'POST', actualizar: 'PATCH', eliminar: 'DELETE', transicion: 'POST' }[op.tipo],
      path: `/api/actions/${kebab}${byId ? '/:id' : ''}`,
      byId,
      // El permiso es el del requisito de la operación: la lista de recompensas del cliente (RF-18) se guarda en el almacén de RF-19, que es del administrador.
      permission: slug(op.rf),
      entity: op.entidadClave || entities.find((item) => item.name === op.entidad)?.key || null,
      ...(op.entidad ? { entityName: op.entidad } : {}),
      actors: op.actores || [],
      filters: op.filtros || [],
      fields: this._fieldMeta(op, entities),
      inputs: op.entradas || [],
      ...(op.sesionEntradas?.length ? { sessionInputs: op.sesionEntradas } : {}),
      ...(op.autoEntradas?.length ? { autoInputs: op.autoEntradas } : {}),
      ...(op.lineas ? { lineas: op.lineas } : {}),
      ...(op.reponer ? { reponer: op.reponer } : {}),
      ...(op.cascada ? { cascada: op.cascada } : {}),
      ...(op.vincula ? { vincula: op.vincula } : {}),
      ...(op.anula ? { anula: op.anula } : {}),
      ...(op.resumen ? { resumen: op.resumen } : {}),
      ...(op.relacionadas?.length ? { relacionadas: op.relacionadas } : {}),
      ...(op.sobre ? { sobre: op.sobre } : {}),
      ...(op.rolEntradas?.length ? { rolInputs: op.rolEntradas } : {}),
      ...(op.liquida ? { liquida: op.liquida } : {}),
      ...(op.periodo ? { periodo: op.periodo } : {}),
      ...(op.alCambiar ? { alCambiar: op.alCambiar } : {}),
      ...(op.cupo ? { cupo: op.cupo } : {}),
      ...(op.detalle ? { detalle: op.detalle } : {}),
      ...(op.exigeParametro ? { exigeParametro: true } : {}),
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
    // Anular devuelve existencias: los almacenes de las líneas y del producto cuyo stock se repone.
    let reponer;
    if (action.reponer) {
      const hijo = operationOf.get(action.reponer.entidadClave);
      const destino = operationOf.get(action.reponer.destinoClave);
      if (hijo && destino) reponer = { ...action.reponer, capability: hijo, destinoCapability: destino };
    }
    // Anular la factura anula su venta y devuelve el stock de las líneas de esa venta.
    let cascada;
    if (action.cascada) {
      const cabecera = operationOf.get(action.cascada.entidadClave);
      const lineasCabecera = action.cascada.reponer;
      const hijo = lineasCabecera && operationOf.get(lineasCabecera.entidadClave);
      const destino = lineasCabecera && operationOf.get(lineasCabecera.destinoClave);
      const { reponer: omitida, ...resto } = action.cascada;
      if (cabecera) cascada = { ...resto, capability: cabecera, ...(hijo && destino ? { reponer: { ...lineasCabecera, capability: hijo, destinoCapability: destino } } : {}) };
      else warnings.push(`«${action.name}»: no se pudo anular en cascada ${action.cascada.entidad} (sin almacén en el contrato).`);
      void omitida;
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
    // Emitir para un registro existente: el almacén del registro al que queda vinculado (la venta de la factura).
    const vincula = action.vincula && operationOf.get(action.vincula.entidadClave) ? { ...action.vincula, capability: operationOf.get(action.vincula.entidadClave) } : undefined;
    // Anular con motivo: almacenes del stock que se devuelve y de los documentos (factura) que se anulan.
    let anula;
    if (action.anula && vincula) {
      const lineasAnula = action.anula.reponer && operationOf.get(action.anula.reponer.entidadClave) && operationOf.get(action.anula.reponer.destinoClave)
        ? { ...action.anula.reponer, capability: operationOf.get(action.anula.reponer.entidadClave), destinoCapability: operationOf.get(action.anula.reponer.destinoClave) } : null;
      const documentos = (action.anula.documentos || []).filter((doc) => operationOf.get(doc.entidadClave)).map((doc) => ({ ...doc, capability: operationOf.get(doc.entidadClave) }));
      anula = { estado: action.anula.estado, valor: action.anula.valor, ...(lineasAnula ? { reponer: lineasAnula } : {}), ...(documentos.length ? { documentos } : {}) };
    }
    // Reporte: el almacén de la cabecera (la fecha de la venta) y el del registro agrupado (para mostrar su nombre).
    let resumen;
    if (action.resumen) {
      const agrupado = action.resumen.agruparPor && entity?.schema?.properties?.[action.resumen.agruparPor]?.['x-references'];
      const objetivo = agrupado ? entities.find((item) => item.name === agrupado) : null;
      resumen = {
        ...action.resumen,
        ...(action.resumen.via && operationOf.get(action.resumen.via.entidadClave) ? { via: { ...action.resumen.via, capability: operationOf.get(action.resumen.via.entidadClave) } } : {}),
        ...(objetivo && operationOf.get(objetivo.key) ? { agrupadoCapability: operationOf.get(objetivo.key) } : {})
      };
    }
    // Comportamientos de negocio: cada entidad que usan se resuelve a su almacén.
    const bound = (value) => {
      if (Array.isArray(value)) return value.map(bound);
      if (!value || typeof value !== 'object') return value;
      const result = Object.fromEntries(Object.entries(value).map(([name, child]) => [name, bound(child)]));
      if (typeof value.entidadClave === 'string') result.capability = operationOf.get(value.entidadClave);
      if (typeof value.destinoClave === 'string') result.destinoCapability = operationOf.get(value.destinoClave);
      return result;
    };
    const behaviors = Object.fromEntries(['rolInputs', 'liquida', 'cupo', 'detalle'].filter((name) => action[name]).map((name) => [name, bound(action[name])]));
    const choices = this._choices(action, { entity, entities, operationOf });
    return { ...action, ...behaviors, ...choices, capability, filters, fields, lineas, relacionadas, ...(reponer ? { reponer } : {}), ...(cascada ? { cascada } : {}), ...(vincula ? { vincula } : {}), ...(anula ? { anula } : {}), ...(resumen ? { resumen } : {}) };
  }

  /**
   * Lo que la persona elige de una lista (mesa, cliente, mesero, pedido por cobrar) y las cuentas que debe tener cada rol elegido.
   * La aplicación pide estas opciones con el permiso de la propia operación: no necesita acceso a las tablas completas.
   */
  _choices(action, { entity, entities, operationOf }) {
    if (!['crear', 'actualizar'].includes(action.type) || !entity) return {};
    const options = {};
    const roles = {};
    for (const field of action.inputs || []) {
      const definition = entity.schema?.properties?.[field];
      const targetName = definition?.['x-references'];
      if (!targetName) continue;
      if (Behaviors.ACCOUNT.test(targetName)) {
        const role = Behaviors.roleOfField(field, definition, this._actors || []);
        options[field] = { cuentas: true, ...(role ? { rol: Behaviors.roleId(role) } : {}) };
        if (role) roles[field] = { rol: Behaviors.roleId(role), nombre: role };
        continue;
      }
      const target = entities.find((item) => item.name === targetName);
      const capability = target && operationOf.get(target.key);
      if (!capability) continue;
      const settle = action.liquida?.documento.campo === field ? action.liquida.documento : null;
      const references = settle ? Object.fromEntries(Object.entries(target.schema?.properties || {})
        .map(([name, property]) => [name, entities.find((item) => item.name === property['x-references'])])
        .filter(([, other]) => other && !Behaviors.ACCOUNT.test(other.name) && operationOf.get(other.key))
        .map(([name, other]) => [name, operationOf.get(other.key)])) : null;
      options[field] = { capability, entidad: target.name, ...(settle ? { estado: { campo: settle.estado, valor: settle.de }, total: settle.total, referencias: references } : {}) };
    }
    return { ...(Object.keys(options).length ? { opciones: options } : {}), ...(Object.keys(roles).length ? { roles } : {}) };
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
