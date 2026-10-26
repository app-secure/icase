/**
 * Documentación OpenAPI 3.1 del backend generado.
 *
 * Se deriva por completo del contrato aprobado (RF, modelo de dominio, reglas de negocio y política de acceso),
 * de modo que no puede desviarse de lo que el backend hace. Las reglas se expresan como restricciones de JSON Schema
 * cuando existe equivalente y como extensiones `x-*` cuando no.
 */
const METHODS = ['GET', 'POST', 'PATCH', 'DELETE'];
const ADMIN = 'administrador';

const clone = (value) => JSON.parse(JSON.stringify(value));
const json = (schema, description) => ({ description, content: { 'application/json': { schema } } });
const schemaRef = (name) => ({ $ref: `#/components/schemas/${name}` });
const responseRef = (name) => ({ $ref: `#/components/responses/${name}` });
const RESERVED = new Set(['Error', 'RuleViolation', 'Deleted', 'Generico', 'GenericoUpdate', 'GenericoRecord', 'User', 'Permissions', 'Credentials', 'Session', 'Me', 'Registration', 'NewUser', 'UserUpdate']);
const componentName = (value) => String(value || 'Entidad').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '') || 'Entidad';

class OpenApiGenerator {
  /**
   * @param {object} contract contrato del backend (operaciones, entidades, reglas)
   * @param {object} model modelo físico (tablas, referencias) para saber qué respuestas 409 son posibles
   * @param {object} policy política de acceso (`habilitada: false` si la API es pública)
   */
  build({ proyecto, contract, model, policy }) {
    const secured = policy.habilitada === true;
    const schemas = this._baseSchemas();
    // Los esquemas de entidad no pueden pisar los del sistema ni entre sí (p. ej. una entidad «User» o «Error»).
    const used = new Set(RESERVED);
    const entityNames = new Map();
    for (const entity of contract.entities || []) {
      let name = componentName(entity.name);
      while ([name, `${name}Update`, `${name}Record`].some((candidate) => used.has(candidate))) name += 'Entidad';
      [name, `${name}Update`, `${name}Record`].forEach((candidate) => used.add(candidate));
      entityNames.set(entity.key, name);
    }
    const doc = {
      openapi: '3.1.0',
      info: {
        title: `API de ${proyecto?.nombre || 'la aplicación'}`,
        version: '1.0.0',
        description: 'Documentación generada por I-CASE desde los requisitos funcionales, el modelo de dominio, las reglas de negocio y la política de acceso aprobados. Se regenera con el backend: no la edites a mano.'
      },
      servers: [{ url: '/', description: 'Mismo origen que la aplicación' }],
      tags: [{ name: 'Sistema' }, ...contract.operations.map((operation) => ({ name: operation.id, description: [operation.name, operation.description].filter(Boolean).join('. ') }))],
      ...(secured ? { security: [{ bearerAuth: [] }] } : {}),
      paths: {},
      components: { schemas, responses: this._responses(), ...(secured ? { securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT', description: 'Token obtenido en POST /api/auth/login.' } } } : {}) }
    };

    doc.paths['/health'] = { get: { tags: ['Sistema'], summary: 'Comprobación de salud', operationId: 'salud', ...(secured ? { security: [] } : {}), responses: { 200: json({ type: 'object', required: ['status'], properties: { status: { type: 'string', const: 'ok' }, database: { type: 'string' } } }, 'El servicio y su base de datos responden.') } } };
    doc.paths['/api/contract'] = { get: { tags: ['Sistema'], summary: 'Contrato de la aplicación', description: 'Operaciones, entidades, reglas y política de acceso con los que se generó el backend.', operationId: 'contrato', responses: { 200: json({ type: 'object' }, 'Contrato.'), ...(secured ? { 401: responseRef('Unauthorized') } : {}) } } };
    doc.paths['/api/openapi.json'] = { get: { tags: ['Sistema'], summary: 'Esta documentación', operationId: 'openapi', responses: { 200: json({ type: 'object' }, 'Documento OpenAPI 3.1.'), ...(secured ? { 401: responseRef('Unauthorized') } : {}) } } };

    for (const operation of contract.operations) this._operation(doc, operation, { entityNames, contract, model, policy, secured });
    if (secured) this._authentication(doc, policy);
    return doc;
  }

  _operation(doc, operation, { entityNames, contract, model, policy, secured }) {
    const entity = operation.entity ? (contract.entities || []).find((item) => item.key === operation.entity) : null;
    const name = entity ? entityNames.get(entity.key) : 'Generico';
    if (entity && !doc.components.schemas[name]) {
      doc.components.schemas[name] = this._dataSchema(entity, operation.rules || [], false);
      doc.components.schemas[`${name}Update`] = this._dataSchema(entity, operation.rules || [], true);
      doc.components.schemas[`${name}Record`] = this._recordSchema(`${name}Update`, entity.name);
    }
    const table = model.operations[operation.key];
    const definition = model.tables[table] || { references: [], unique: [] };
    const writesConflict = (definition.unique || []).length > 0 || (definition.references || []).length > 0;
    const referenced = Object.values(model.tables).some((other) => (other.references || []).some((reference) => reference.table === table));
    const hasRules = (operation.rules || []).some((rule) => rule.tipo !== 'unico');
    const access = secured ? { 401: responseRef('Unauthorized'), 403: responseRef('Forbidden') } : {};
    const roles = (method) => [ADMIN, ...Object.entries(policy.operaciones?.[operation.key] || {}).filter(([, methods]) => methods.includes(method)).map(([role]) => role)];
    const listDescription = [`Lista los registros (${operation.id}: ${operation.name}).`, operation.description, operation.actors?.length ? `Actores: ${operation.actors.join(', ')}.` : '', secured ? `Roles con permiso: ${roles('GET').join(', ')}.` : ''].filter(Boolean).join(' ');
    const rulesNote = (operation.rules || []).length ? ` Reglas de negocio aplicadas: ${operation.rules.map((rule) => `${rule.id} (${rule.mensaje})`).join('; ')}.` : '';
    const common = (method, extra) => ({ tags: [operation.id], ...extra, ...(secured ? { 'x-roles': roles(method) } : {}) });

    const queryParams = [
      { name: 'page', in: 'query', required: false, schema: { type: 'integer', minimum: 1, default: 1 }, description: 'Número de página.' },
      { name: 'limit', in: 'query', required: false, schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 }, description: 'Límite de registros por página.' },
      { name: 'search', in: 'query', required: false, schema: { type: 'string' }, description: 'Búsqueda por texto en los campos de la entidad.' },
      ...(entity ? Object.entries(entity.schema?.properties || {}).filter(([k]) => k !== 'id').map(([k, s]) => ({
        name: k, in: 'query', required: false, schema: { type: s.type || 'string' }, description: `Filtro por ${k}.`
      })) : [])
    ];

    doc.paths[operation.collectionPath] = {
      get: common('GET', {
        summary: `Listar ${operation.name}`, operationId: `listar_${operation.key.replace(/-/g, '_')}`, description: listDescription,
        parameters: queryParams,
        responses: {
          200: {
            description: 'Registros existentes.',
            headers: {
              'X-Total-Count': { schema: { type: 'integer' }, description: 'Total de registros coincidentes.' },
              'X-Page': { schema: { type: 'integer' }, description: 'Página actual.' },
              'X-Limit': { schema: { type: 'integer' }, description: 'Límite por página.' },
              'X-Total-Pages': { schema: { type: 'integer' }, description: 'Total de páginas.' }
            },
            content: {
              'application/json': {
                schema: {
                  oneOf: [
                    { type: 'array', items: schemaRef(`${name}Record`) },
                    {
                      type: 'object',
                      properties: {
                        data: { type: 'array', items: schemaRef(`${name}Record`) },
                        pagination: {
                          type: 'object',
                          properties: {
                            page: { type: 'integer' },
                            limit: { type: 'integer' },
                            total: { type: 'integer' },
                            total_pages: { type: 'integer' }
                          }
                        }
                      }
                    }
                  ]
                }
              }
            }
          },
          ...access
        }
      }),
      post: common('POST', {
        summary: `Crear ${operation.name}`, operationId: `crear_${operation.key.replace(/-/g, '_')}`,
        description: `Crea un registro.${rulesNote}`,
        requestBody: { required: true, content: { 'application/json': { schema: schemaRef(name) } } },
        responses: {
          201: json(schemaRef(`${name}Record`), 'Registro creado.'), 400: responseRef('BadRequest'), ...access,
          ...(writesConflict ? { 409: responseRef('Conflict') } : {}), ...(hasRules ? { 422: responseRef('Unprocessable') } : {})
        }
      })
    };
    doc.paths[operation.itemPath.replace(':id', '{id}')] = {
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' }, description: 'Identificador del registro.' }],
      patch: common('PATCH', {
        summary: `Modificar ${operation.name}`, operationId: `modificar_${operation.key.replace(/-/g, '_')}`,
        description: `Modificación parcial: solo se cambian los campos enviados.${rulesNote}`,
        requestBody: { required: true, content: { 'application/json': { schema: schemaRef(`${name}Update`) } } },
        responses: {
          200: json(schemaRef(`${name}Record`), 'Registro actualizado.'), 400: responseRef('BadRequest'), ...access, 404: responseRef('NotFound'),
          ...(writesConflict ? { 409: responseRef('Conflict') } : {}), ...(hasRules ? { 422: responseRef('Unprocessable') } : {})
        }
      }),
      delete: common('DELETE', {
        summary: `Eliminar ${operation.name}`, operationId: `eliminar_${operation.key.replace(/-/g, '_')}`,
        responses: { 200: json(schemaRef('Deleted'), 'Registro eliminado.'), ...access, 404: responseRef('NotFound'), ...(referenced ? { 409: responseRef('Conflict') } : {}) }
      })
    };
    if (!entity && !doc.components.schemas.GenericoRecord) {
      doc.components.schemas.Generico = { type: 'object', additionalProperties: true, description: 'Operación sin entidad en el modelo de dominio: acepta cualquier objeto JSON.' };
      doc.components.schemas.GenericoUpdate = { $ref: '#/components/schemas/Generico' };
      doc.components.schemas.GenericoRecord = this._recordSchema('Generico', null);
    }
  }

  /** Esquema de los datos de una entidad, con las reglas traducidas a restricciones cuando es posible. */
  _dataSchema(entity, rules, partial) {
    const properties = {};
    for (const [name, property] of Object.entries(entity.schema?.properties || {})) {
      if (name === 'id') continue;
      properties[name] = property['x-references']
        ? { type: 'string', description: `Identificador de ${property['x-references']} (clave foránea).`, 'x-references': property['x-references'] }
        : clone(property);
    }
    const required = [];
    const note = (field, text) => { if (properties[field]) properties[field].description = [properties[field].description, text].filter(Boolean).join(' '); };
    for (const rule of rules) {
      const field = properties[rule.campo];
      const label = `Regla ${rule.id}: ${rule.mensaje}`;
      switch (rule.tipo) {
        case 'requerido': if (!partial) required.push(rule.campo); note(rule.campo, label); break;
        case 'rango': if (field) { if (rule.min !== undefined) field.minimum = rule.min; if (rule.max !== undefined) field.maximum = rule.max; note(rule.campo, label); } break;
        case 'longitud': if (field) { if (rule.min !== undefined) field.minLength = rule.min; if (rule.max !== undefined) field.maxLength = rule.max; note(rule.campo, label); } break;
        case 'formato': if (field) { field.format = rule.formato === 'email' ? 'email' : 'uri'; note(rule.campo, label); } break;
        case 'valor_por_defecto': if (field) { field.default = rule.valor; note(rule.campo, label); } break;
        case 'maquina_estados': if (field) { field.default = rule.inicial; field['x-transiciones'] = rule.transiciones; note(rule.campo, `${label} Estado inicial: ${rule.inicial}.`); } break;
        case 'inmutable': if (field) { field['x-inmutable'] = true; note(rule.campo, label); } break;
        case 'unico': for (const campo of rule.campos) if (properties[campo]) { properties[campo]['x-unico'] = rule.campos; note(campo, label); } break;
        case 'comparacion': if (field) { field['x-comparacion'] = { operador: rule.operador, ...(rule.con_campo !== undefined ? { con_campo: rule.con_campo } : { con_valor: rule.con_valor }) }; note(rule.campo, label); } break;
        default: break;
      }
    }
    const defaulted = new Set(rules.filter((rule) => ['valor_por_defecto', 'maquina_estados'].includes(rule.tipo)).map((rule) => rule.campo));
    const schema = { type: 'object', title: entity.name, properties, additionalProperties: true };
    const mandatory = [...new Set(required)].filter((field) => !defaulted.has(field));
    if (mandatory.length) schema.required = mandatory;
    if (rules.length) schema['x-reglas'] = rules.map((rule) => ({ id: rule.id, tipo: rule.tipo, mensaje: rule.mensaje, rf: rule.rf }));
    return schema;
  }

  _recordSchema(dataSchemaName, entityName) {
    return {
      type: 'object',
      ...(entityName ? { title: `Registro de ${entityName}` } : {}),
      required: ['id', 'capability', 'data', 'created_at', 'updated_at'],
      properties: {
        id: { type: 'string' },
        capability: { type: 'string', description: 'Clave de la operación que lo gestiona.' },
        data: schemaRef(dataSchemaName),
        created_at: { type: 'string', format: 'date-time' },
        updated_at: { type: 'string', format: 'date-time' }
      }
    };
  }

  _baseSchemas() {
    return {
      Error: { type: 'object', required: ['message'], properties: { message: { type: 'string' } } },
      RuleViolation: {
        type: 'object', required: ['message', 'details'],
        properties: {
          message: { type: 'string' },
          details: { type: 'array', items: { type: 'object', required: ['regla', 'mensaje'], properties: { regla: { type: 'string' }, mensaje: { type: 'string' }, rf: { type: 'array', items: { type: 'string' } } } } }
        }
      },
      Deleted: { type: 'object', required: ['deleted', 'id'], properties: { deleted: { type: 'boolean', const: true }, id: { type: 'string' } } }
    };
  }

  _responses() {
    const error = (description, schema = 'Error') => json(schemaRef(schema), description);
    return {
      BadRequest: error('Datos con formato o tipo incorrecto.'),
      Unauthorized: error('Falta la sesión, está caducada o fue revocada.'),
      Forbidden: error('El rol no tiene permiso para esta operación.'),
      NotFound: error('El registro no existe.'),
      Conflict: error('Valor repetido (unicidad), referencia inexistente o registro referenciado por otros.'),
      Unprocessable: error('Se incumple al menos una regla de negocio; `details` indica cuáles.', 'RuleViolation'),
      TooManyRequests: error('Demasiados intentos; espera antes de reintentar.')
    };
  }

  _authentication(doc, policy) {
    const roles = [ADMIN, ...Object.keys(policy.roles || {})];
    const open = Object.entries(policy.roles || {}).filter(([, role]) => role.autoregistro).map(([id]) => id);
    Object.assign(doc.components.schemas, {
      User: { type: 'object', required: ['id', 'email', 'rol', 'activo'], properties: { id: { type: 'string' }, email: { type: 'string', format: 'email' }, nombre: { type: 'string' }, rol: { type: 'string' }, activo: { type: 'boolean' }, created_at: { type: 'string', format: 'date-time' } } },
      Permissions: { type: 'object', required: ['rol', 'administrador', 'operaciones'], properties: { rol: { type: 'string' }, nombre_rol: { type: 'string' }, administrador: { type: 'boolean' }, operaciones: { type: 'object', description: 'Métodos permitidos por clave de operación.', additionalProperties: { type: 'array', items: { enum: METHODS } } } } },
      Credentials: { type: 'object', required: ['email', 'password'], properties: { email: { type: 'string', format: 'email' }, password: { type: 'string', format: 'password' } } },
      Session: { type: 'object', required: ['token', 'usuario', 'permisos'], properties: { token: { type: 'string' }, usuario: schemaRef('User'), permisos: schemaRef('Permissions') } },
      Me: { type: 'object', required: ['usuario', 'permisos'], properties: { usuario: schemaRef('User'), permisos: schemaRef('Permissions') } },
      Registration: { type: 'object', required: ['email', 'password'], properties: { email: { type: 'string', format: 'email' }, password: { type: 'string', format: 'password', minLength: 8, maxLength: 128 }, nombre: { type: 'string', maxLength: 120 }, rol: { type: 'string', ...(open.length ? { enum: open } : {}), description: 'Solo roles con registro abierto; si hay uno solo, es opcional.' } } },
      NewUser: { type: 'object', required: ['email', 'password', 'rol'], properties: { email: { type: 'string', format: 'email' }, password: { type: 'string', format: 'password', minLength: 8, maxLength: 128 }, nombre: { type: 'string', maxLength: 120 }, rol: { type: 'string', enum: roles }, activo: { type: 'boolean', default: true } } },
      UserUpdate: { type: 'object', properties: { email: { type: 'string', format: 'email' }, password: { type: 'string', format: 'password', minLength: 8, maxLength: 128 }, nombre: { type: 'string', maxLength: 120 }, rol: { type: 'string', enum: roles }, activo: { type: 'boolean' } } }
    });
    const body = (name) => ({ required: true, content: { 'application/json': { schema: schemaRef(name) } } });
    const adminOnly = { 401: responseRef('Unauthorized'), 403: responseRef('Forbidden') };
    doc.paths['/api/auth/login'] = { post: { tags: ['Autenticación'], summary: 'Iniciar sesión', operationId: 'iniciar_sesion', security: [], description: 'Tras 5 intentos fallidos desde una misma dirección y correo se bloquea temporalmente (429).', requestBody: body('Credentials'), responses: { 200: json(schemaRef('Session'), 'Sesión iniciada.'), 400: responseRef('BadRequest'), 401: responseRef('Unauthorized'), 429: responseRef('TooManyRequests') } } };
    doc.paths['/api/auth/register'] = { post: { tags: ['Autenticación'], summary: 'Crear una cuenta', operationId: 'registrar', security: [], description: 'Solo disponible para los roles que permiten registro abierto; en otro caso responde 403.', requestBody: body('Registration'), responses: { 201: json({ type: 'object', required: ['usuario'], properties: { usuario: schemaRef('User') } }, 'Cuenta creada.'), 400: responseRef('BadRequest'), 403: responseRef('Forbidden'), 409: responseRef('Conflict'), 429: responseRef('TooManyRequests') } } };
    doc.paths['/api/auth/me'] = { get: { tags: ['Autenticación'], summary: 'Perfil y permisos de la sesión', operationId: 'perfil', responses: { 200: json(schemaRef('Me'), 'Usuario y permisos vigentes.'), 401: responseRef('Unauthorized') } } };
    doc.paths['/api/users'] = {
      get: { tags: ['Usuarios'], summary: 'Listar usuarios', operationId: 'listar_usuarios', 'x-roles': [ADMIN], responses: { 200: json({ type: 'array', items: schemaRef('User') }, 'Usuarios.'), ...adminOnly } },
      post: { tags: ['Usuarios'], summary: 'Crear un usuario', operationId: 'crear_usuario', 'x-roles': [ADMIN], requestBody: body('NewUser'), responses: { 201: json(schemaRef('User'), 'Usuario creado.'), 400: responseRef('BadRequest'), ...adminOnly, 409: responseRef('Conflict') } }
    };
    doc.paths['/api/users/{id}'] = {
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      patch: { tags: ['Usuarios'], summary: 'Modificar un usuario', operationId: 'modificar_usuario', 'x-roles': [ADMIN], description: 'Desactivar un usuario o cambiarle el rol surte efecto de inmediato. No puede quedarse el sistema sin un administrador activo.', requestBody: body('UserUpdate'), responses: { 200: json(schemaRef('User'), 'Usuario actualizado.'), 400: responseRef('BadRequest'), ...adminOnly, 404: responseRef('NotFound'), 409: responseRef('Conflict') } },
      delete: { tags: ['Usuarios'], summary: 'Eliminar un usuario', operationId: 'eliminar_usuario', 'x-roles': [ADMIN], description: 'No se puede eliminar al propio usuario ni al último administrador activo.', responses: { 200: json(schemaRef('Deleted'), 'Usuario eliminado.'), 400: responseRef('BadRequest'), ...adminOnly, 404: responseRef('NotFound'), 409: responseRef('Conflict') } }
    };
    doc.tags.push({ name: 'Autenticación' }, { name: 'Usuarios' });
  }
}

module.exports = OpenApiGenerator;
