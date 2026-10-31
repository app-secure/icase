/**
 * Datos de ejemplo y casos de prueba derivados del esquema y de las reglas de negocio de una operación.
 *
 * `samplePayload` y `exerciseOperation` son autocontenidas: sus fuentes (`Function.prototype.toString`) se
 * incrustan tal cual en el smoke de verificación y en las pruebas generadas, de modo que ambos ejercen
 * exactamente la misma lógica.
 */
function samplePayload(schema, rules, salt) {
  rules = rules || [];
  salt = String(salt || 'a1b2');
  const properties = (schema && schema.properties) || {};
  const day = 86400000;
  const ruleFor = (type, field) => rules.find((rule) => rule.tipo === type && rule.campo === field);
  const defaulted = new Set(rules.filter((rule) => rule.tipo === 'valor_por_defecto').map((rule) => rule.campo));
  const unique = (field) => rules.some((rule) => rule.tipo === 'unico' && rule.campos.includes(field));
  const randomInt = (min, max) => min + Math.floor(Math.random() * (max - min + 1));
  const isDate = (value) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value) && !Number.isNaN(Date.parse(value));
  const shift = (value, steps) => {
    if (typeof value === 'number') return value + steps;
    if (isDate(value)) {
      const moved = new Date(Date.parse(value) + steps * day);
      return value.length === 10 ? moved.toISOString().slice(0, 10) : moved.toISOString();
    }
    return steps === 0 ? value : value + '-x';
  };
  const hex = (size) => Array.from({ length: size }, () => randomInt(0, 15).toString(16)).join('');

  const payload = {};
  const parents = [];
  for (const [name, property] of Object.entries(properties)) {
    if (property.readOnly) continue;
    if (property['x-references']) {
      if (ruleFor('requerido', name)) parents.push({ campo: name, entidad: property['x-references'] });
      continue;
    }
    if (defaulted.has(name)) continue;
    const machine = ruleFor('maquina_estados', name);
    const range = ruleFor('rango', name);
    const length = ruleFor('longitud', name);
    const format = ruleFor('formato', name);
    let value;
    if (machine) value = machine.inicial;
    else if (property.enum && property.enum.length) value = property.enum[0];
    else if (property.type === 'integer' || property.type === 'number') {
      const low = range && range.min !== undefined ? range.min : undefined;
      const high = range && range.max !== undefined ? range.max : undefined;
      const integer = property.type === 'integer';
      if (unique(name)) {
        const from = low !== undefined ? low : 1;
        const to = high !== undefined ? high : from + 1000000;
        value = integer ? randomInt(Math.ceil(from), Math.floor(to)) : Math.round((from + Math.random() * (to - from)) * 100) / 100;
      } else {
        value = integer ? 7 : 1.5;
        if (low !== undefined && value < low) value = integer ? Math.ceil(low) : low;
        if (high !== undefined && value > high) value = integer ? Math.floor(high) : high;
      }
    } else if (property.type === 'boolean') value = true;
    else if (property.type === 'array') value = [];
    else if (property.format === 'date-time') value = new Date(Date.UTC(2030, 0, 2, 3, 4, 5) + (unique(name) ? randomInt(0, 3650) * day : 0)).toISOString();
    else if (property.format === 'date') value = new Date(Date.UTC(2030, 0, 2) + (unique(name) ? randomInt(0, 3650) * day : 0)).toISOString().slice(0, 10);
    else if (property.format === 'time') value = '03:04:05';
    else if (property.format === 'uuid') value = unique(name) ? `${hex(8)}-${hex(4)}-4${hex(3)}-a${hex(3)}-${hex(12)}` : '123e4567-e89b-42d3-a456-426614174000';
    else if (format) value = format.formato === 'email' ? `usuario-${salt}@example.com` : `https://example.com/${salt}`;
    else {
      value = 'valor-' + name + (unique(name) ? '-' + salt : '');
      if (length && length.max !== undefined && value.length > length.max) value = value.slice(value.length - length.max);
      if (length && length.min !== undefined && value.length < length.min) value = 'x'.repeat(length.min - value.length) + value;
    }
    payload[name] = value;
  }

  const relation = (rule, violate) => {
    const right = rule.con_campo !== undefined ? payload[rule.con_campo] : rule.con_valor;
    if (right === undefined || payload[rule.campo] === undefined) return undefined;
    const steps = {
      '<': violate ? 0 : -1, '<=': violate ? 1 : 0, '>': violate ? 0 : 1, '>=': violate ? -1 : 0, '==': violate ? 1 : 0, '!=': violate ? 0 : 1
    }[rule.operador];
    return shift(right, steps);
  };
  for (const rule of rules.filter((item) => item.tipo === 'comparacion')) {
    const adjusted = relation(rule, false);
    if (adjusted !== undefined) payload[rule.campo] = adjusted;
  }

  const typed = Object.entries(payload).map(([name, value]) => ({ name, type: properties[name].type, format: properties[name].format || null, value }));
  const defaults = rules.filter((rule) => rule.tipo === 'valor_por_defecto').map((rule) => ({ campo: rule.campo, valor: rule.valor }));

  const cases = [];
  const last = [];
  for (const rule of rules) {
    const field = rule.campo;
    const base = { regla: rule.id, tipo: rule.tipo };
    if (rule.tipo === 'requerido' && (payload[field] !== undefined || parents.some((parent) => parent.campo === field))) cases.push({ ...base, accion: 'crear', omitir: [field], esperado: 422 });
    if (rule.tipo === 'rango' && payload[field] !== undefined) cases.push({ ...base, accion: 'crear', cuerpo: { [field]: rule.max !== undefined ? rule.max + 1 : rule.min - 1 }, esperado: 422 });
    if (rule.tipo === 'longitud' && payload[field] !== undefined) {
      if (rule.max !== undefined) cases.push({ ...base, accion: 'crear', cuerpo: { [field]: 'x'.repeat(rule.max + 1) }, esperado: 422 });
      else if (rule.min > 1) cases.push({ ...base, accion: 'crear', cuerpo: { [field]: 'x'.repeat(rule.min - 1) }, esperado: 422 });
    }
    if (rule.tipo === 'formato' && payload[field] !== undefined) cases.push({ ...base, accion: 'crear', cuerpo: { [field]: 'no-valido' }, esperado: 422 });
    if (rule.tipo === 'comparacion') {
      const violating = relation(rule, true);
      if (violating !== undefined) cases.push({ ...base, accion: 'crear', cuerpo: { [field]: violating }, esperado: 422 });
    }
    if (rule.tipo === 'unico' && rule.campos.every((item) => payload[item] !== undefined)) cases.push({ ...base, accion: 'duplicar', esperado: 409 });
    if (rule.tipo === 'inmutable' && payload[field] !== undefined && !Array.isArray(payload[field])) {
      const changed = typeof payload[field] === 'boolean' ? !payload[field] : shift(payload[field], 1);
      cases.push({ ...base, accion: 'modificar', cuerpo: { [field]: changed }, esperado: 422 });
    }
    if (rule.tipo === 'maquina_estados') {
      const states = rule.estados || [];
      const other = states.find((state) => state !== rule.inicial);
      if (other !== undefined) cases.push({ ...base, accion: 'crear', cuerpo: { [field]: other }, esperado: 422 });
      const forbidden = states.find((state) => state !== rule.inicial && !rule.transiciones.some((item) => item.de === rule.inicial && item.a === state));
      if (forbidden !== undefined) cases.push({ ...base, accion: 'modificar', cuerpo: { [field]: forbidden }, esperado: 422 });
      const allowed = rule.transiciones.find((item) => item.de === rule.inicial);
      if (allowed) last.push({ ...base, accion: 'modificar', cuerpo: { [field]: allowed.a }, esperado: 200 });
    }
  }
  return { payload, typed, defaults, parents, cases: cases.concat(last) };
}

function salted() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

/** Crea un registro válido, junto con los padres que sus reglas declaran obligatorios. */
async function createValidRecord(api, operations, target, cleanups, depth) {
  const fail = (message) => { throw new Error(target.id + ': ' + message); };
  if (depth > 3) fail('las referencias obligatorias son circulares');
  const sample = samplePayload(target.schema, target.rules, salted());
  const body = { ...sample.payload };
  for (const parent of sample.parents) {
    const parentOperation = operations.find((item) => item.schema && item.schema.title === parent.entidad);
    if (!parentOperation) fail('no existe una operación para la entidad referenciada ' + parent.entidad);
    body[parent.campo] = (await createValidRecord(api, operations, parentOperation, cleanups, depth + 1)).id;
  }
  const response = await api(target.collectionPath, 'POST', { ...body, verification: 'isolated' });
  if (response.status !== 201) fail('crear respondió ' + response.status + ' (se esperaba 201): ' + JSON.stringify(response.data));
  const id = response.data.id || response.data._id;
  if (!id) fail('la creación no devolvió identificador');
  cleanups.unshift(() => api(target.collectionPath + '/' + id, 'DELETE'));
  return { sample, body, response, id };
}

/**
 * Ejerce una operación completa: CRUD tipado, valores por defecto y un caso por regla de negocio.
 * `api(path, method, body)` debe devolver `{ status, data }`; cualquier discrepancia lanza un Error.
 */
async function exerciseOperation(api, operations, operation) {
  const fail = (message) => { throw new Error(operation.id + ': ' + message); };
  const expectStatus = (response, status, label) => {
    if (response.status !== status) fail(label + ' respondió ' + response.status + ' (se esperaba ' + status + '): ' + JSON.stringify(response.data));
    return response;
  };
  const same = (expected, actual, format) => (format === 'date-time' ? Date.parse(expected) === Date.parse(actual) : JSON.stringify(expected) === JSON.stringify(actual));
  const cleanups = [];

  try {
    const main = await createValidRecord(api, operations, operation, cleanups, 0);
    const stored = main.response.data.data;
    for (const field of main.sample.typed) {
      if (!same(field.value, stored[field.name], field.format)) fail('el campo ' + field.name + ' no conservó su tipo (' + JSON.stringify(stored[field.name]) + ')');
    }
    for (const item of main.sample.defaults) {
      if (!same(item.valor, stored[item.campo])) fail('el valor por defecto de ' + item.campo + ' no se aplicó');
    }
    const listed = expectStatus(await api(operation.collectionPath), 200, 'listar');
    const records = Array.isArray(listed.data) ? listed.data : (listed.data.data || []);
    if (!records.some((item) => String(item.id || item._id) === String(main.id))) fail('el registro no fue persistido');

    // Ejercitar paginación y búsqueda
    const paged = await api(operation.collectionPath + '?page=1&limit=1');
    if (paged.status === 200) {
      const pagedRecords = Array.isArray(paged.data) ? paged.data : (paged.data.data || []);
      if (pagedRecords.length > 1) fail('la paginación con limit=1 devolvió más de un registro');
    }
    const textField = main.sample.typed.find((field) => ['string', 'date'].includes(field.type) && field.value);
    if (textField) {
      const term = String(textField.value).slice(0, 4);
      if (term) {
        const searched = await api(operation.collectionPath + '?search=' + encodeURIComponent(term));
        if (searched.status === 200) {
          const searchRecords = Array.isArray(searched.data) ? searched.data : (searched.data.data || []);
          if (!searchRecords.some((item) => String(item.id || item._id) === String(main.id))) fail('la búsqueda por texto no encontró el registro');
        }
      }
    }

    const updated = expectStatus(await api(operation.collectionPath + '/' + main.id, 'PATCH', { verification: 'updated' }), 200, 'modificar');
    if (updated.data.data.verification !== 'updated') fail('la modificación no se aplicó');
    if (Object.keys(stored).some((key) => updated.data.data[key] === undefined)) fail('la modificación parcial perdió datos');

    const wrong = main.sample.typed.find((field) => ['integer', 'number', 'boolean'].includes(field.type));
    if (wrong) expectStatus(await api(operation.collectionPath, 'POST', { ...main.body, [wrong.name]: 'valor-que-no-corresponde' }), 400, 'rechazar un tipo incorrecto');

    for (const item of main.sample.cases) {
      const label = item.regla + ' (' + item.tipo + ')';
      let response;
      if (item.accion === 'modificar') {
        response = await api(operation.collectionPath + '/' + main.id, 'PATCH', item.cuerpo);
      } else {
        const body = item.accion === 'duplicar' ? { ...main.body } : { ...main.body, ...(item.cuerpo || {}) };
        for (const field of item.omitir || []) delete body[field];
        response = await api(operation.collectionPath, 'POST', body);
        if (response.status === 201) cleanups.unshift(() => api(operation.collectionPath + '/' + (response.data.id || response.data._id), 'DELETE'));
      }
      if (response.status !== item.esperado) fail('regla ' + label + ' respondió ' + response.status + ' (se esperaba ' + item.esperado + '): ' + JSON.stringify(response.data));
      if (item.esperado === 422 && !(response.data.details || []).some((detail) => detail.regla === item.regla)) fail('regla ' + label + ' fue rechazada por otra causa: ' + JSON.stringify(response.data));
    }

    expectStatus(await api(operation.collectionPath + '/' + main.id, 'DELETE'), 200, 'eliminar');
    expectStatus(await api(operation.collectionPath + '/' + main.id, 'DELETE'), 404, 'eliminar dos veces');
  } finally {
    for (const cleanup of cleanups) { try { await cleanup(); } catch (error) { /* limpieza de mejor esfuerzo */ } }
  }
}

/** Cliente HTTP mínimo; con token envía la cabecera Authorization. */
function makeApi(base, token) {
  return async (path, method, body) => {
    const response = await fetch(base + path, {
      method: method || 'GET',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
      body: body ? JSON.stringify(body) : undefined
    });
    return { status: response.status, data: await response.json().catch(() => ({})) };
  };
}

/** Inicia sesión como administrador y crea un usuario de prueba por cada rol de la política. */
async function setupAccess(base, config) {
  const anonymous = makeApi(base, null);
  const salt = salted();
  const login = await anonymous('/api/auth/login', 'POST', { email: config.adminEmail, password: config.adminPassword });
  if (login.status !== 200 || !login.data.token) throw new Error('No se pudo iniciar sesión con el administrador inicial: ' + login.status + ' ' + JSON.stringify(login.data));
  const [header, payload, signature] = login.data.token.split('.');
  const tampered = [header, payload, signature.slice(0, 4) + (signature[4] === 'A' ? 'B' : 'A') + signature.slice(5)].join('.');
  const admin = makeApi(base, login.data.token);
  const roles = {};
  for (const role of config.roles) {
    const email = 'rol-' + role.id + '-' + salt + '@example.test';
    const password = 'Passw0rd-' + salt;
    const created = await admin('/api/users', 'POST', { email, password, nombre: 'Prueba ' + role.id, rol: role.id });
    if (created.status !== 201) throw new Error('No se pudo crear el usuario del rol ' + role.id + ': ' + created.status + ' ' + JSON.stringify(created.data));
    const session = await anonymous('/api/auth/login', 'POST', { email, password });
    if (session.status !== 200) throw new Error('El usuario del rol ' + role.id + ' no pudo iniciar sesión: ' + session.status);
    roles[role.id] = { api: makeApi(base, session.data.token), userId: created.data.id };
  }
  return {
    anonymous, admin, salt, roles, invalid: makeApi(base, tampered), adminId: login.data.usuario.id,
    cleanup: async () => { for (const role of Object.values(roles)) { try { await admin('/api/users/' + role.userId, 'DELETE'); } catch (error) { /* mejor esfuerzo */ } } }
  };
}

/** Comprueba la matriz de permisos de una operación para cada rol, además del acceso sin sesión. */
async function exerciseAccess(access, operations, operation, matrix) {
  const fail = (message) => { throw new Error(operation.id + ' (acceso): ' + message); };
  const status = (response, expected, label) => {
    if (response.status !== expected) fail(label + ' respondió ' + response.status + ' (se esperaba ' + expected + '): ' + JSON.stringify(response.data));
  };
  const permitted = (response, label) => {
    if (response.status === 401 || response.status === 403) fail(label + ' fue rechazado con ' + response.status + ' pese a estar permitido');
  };
  const cleanups = [];
  try {
    const path = operation.collectionPath;
    status(await access.anonymous(path), 401, 'listar sin sesión');
    status(await access.anonymous(path, 'POST', {}), 401, 'crear sin sesión');
    status(await access.invalid(path), 401, 'listar con un token alterado');
    const record = await createValidRecord(access.admin, operations, operation, cleanups, 0);
    for (const [role, session] of Object.entries(access.roles)) {
      const allowed = matrix[role] || [];
      const label = 'rol ' + role;
      const check = (response, method, text) => (allowed.includes(method) ? permitted(response, label + ' ' + text) : status(response, 403, label + ' ' + text + ' sin permiso'));
      check(await session.api(path), 'GET', 'listar');
      const created = await session.api(path, 'POST', record.body);
      if (created.status === 201) cleanups.unshift(() => access.admin(path + '/' + (created.data.id || created.data._id), 'DELETE'));
      check(created, 'POST', 'crear');
      check(await session.api(path + '/' + record.id, 'PATCH', { verification: 'acceso' }), 'PATCH', 'modificar');
      // Cada eliminación permitida consume un registro propio para no afectar a los demás roles.
      const disposable = allowed.includes('DELETE') ? await createValidRecord(access.admin, operations, operation, cleanups, 0) : record;
      check(await session.api(path + '/' + disposable.id, 'DELETE'), 'DELETE', 'eliminar');
    }
  } finally {
    for (const cleanup of cleanups) { try { await cleanup(); } catch (error) { /* mejor esfuerzo */ } }
  }
}

/** Flujos de autenticación y gestión de usuarios: sesión, bloqueo, revocación, último administrador y registro. */
async function exerciseAuth(access, config) {
  const fail = (message) => { throw new Error('autenticación: ' + message); };
  const status = (response, expected, label) => {
    if (response.status !== expected) fail(label + ' respondió ' + response.status + ' (se esperaba ' + expected + '): ' + JSON.stringify(response.data));
    return response;
  };
  const { anonymous, admin, salt } = access;
  const password = 'Passw0rd-1234';
  const role = config.roles.length ? config.roles[0].id : 'administrador';
  const mail = (name) => name + '-' + salt + '@example.test';
  const login = (email, secret) => anonymous('/api/auth/login', 'POST', { email, password: secret });

  status(await anonymous('/health'), 200, 'comprobación de salud pública');
  status(await anonymous('/api/contract'), 401, 'contrato sin sesión');
  status(await anonymous('/api/openapi.json'), 401, 'documentación OpenAPI sin sesión');
  status(await anonymous('/api/auth/me'), 401, 'perfil sin sesión');
  status(await login(config.adminEmail, 'contraseña-incorrecta'), 401, 'inicio de sesión con contraseña incorrecta');
  status(await anonymous('/api/auth/login', 'POST', {}), 400, 'inicio de sesión sin datos');
  const me = status(await admin('/api/auth/me'), 200, 'perfil del administrador');
  if (!me.data.permisos || me.data.permisos.administrador !== true) fail('el administrador no figura como tal en su perfil');

  const created = status(await admin('/api/users', 'POST', { email: mail('usuario'), password, nombre: 'Usuario', rol: role }), 201, 'crear usuario');
  if ('password' in created.data || 'password_hash' in created.data) fail('la respuesta expone la contraseña');
  status(await admin('/api/users', 'POST', { email: mail('usuario'), password, rol: role }), 409, 'crear un correo repetido');
  status(await admin('/api/users', 'POST', { email: mail('debil'), password: '123', rol: role }), 400, 'contraseña débil');
  status(await admin('/api/users', 'POST', { email: 'no-es-correo', password, rol: role }), 400, 'correo inválido');
  status(await admin('/api/users', 'POST', { email: mail('sinrol'), password, rol: 'rol-inexistente' }), 400, 'rol inexistente');
  const listed = status(await admin('/api/users'), 200, 'listar usuarios');
  if (listed.data.some((user) => 'password_hash' in user)) fail('el listado expone hashes de contraseña');

  // Desactivar un usuario revoca sus sesiones al instante; reactivarlo las restablece.
  const session = status(await login(mail('usuario'), password), 200, 'inicio de sesión del usuario nuevo');
  const own = makeApi(config.base, session.data.token);
  status(await own('/api/auth/me'), 200, 'sesión del usuario nuevo');
  status(await admin('/api/users/' + created.data.id, 'PATCH', { activo: false }), 200, 'desactivar usuario');
  status(await own('/api/auth/me'), 401, 'sesión de un usuario desactivado');
  status(await login(mail('usuario'), password), 401, 'inicio de sesión de un usuario desactivado');
  status(await admin('/api/users/' + created.data.id, 'PATCH', { activo: true }), 200, 'reactivar usuario');
  status(await login(mail('usuario'), password), 200, 'inicio de sesión tras reactivar');
  status(await admin('/api/users/' + created.data.id, 'DELETE'), 200, 'eliminar usuario');
  status(await admin('/api/users/' + created.data.id, 'DELETE'), 404, 'eliminar usuario dos veces');

  // Protecciones del administrador.
  status(await admin('/api/users/' + access.adminId, 'PATCH', { activo: false }), 409, 'desactivar al único administrador');
  status(await admin('/api/users/' + access.adminId, 'DELETE'), 400, 'eliminar al propio administrador');
  const firstRole = Object.values(access.roles)[0];
  if (firstRole) status(await firstRole.api('/api/users'), 403, 'gestionar usuarios sin ser administrador');

  // Bloqueo por intentos fallidos.
  const target = status(await admin('/api/users', 'POST', { email: mail('bloqueo'), password, rol: role }), 201, 'crear usuario de bloqueo');
  for (let attempt = 0; attempt < 5; attempt += 1) status(await login(mail('bloqueo'), 'incorrecta-' + attempt), 401, 'intento fallido ' + (attempt + 1));
  status(await login(mail('bloqueo'), password), 429, 'inicio de sesión tras exceder los intentos');
  await admin('/api/users/' + target.data.id, 'DELETE');

  // Registro abierto: solo para los roles que lo permiten.
  const open = config.roles.filter((item) => item.autoregistro);
  if (!open.length) {
    status(await anonymous('/api/auth/register', 'POST', { email: mail('registro'), password, rol: role }), 403, 'registro con el registro cerrado');
  } else {
    status(await anonymous('/api/auth/register', 'POST', { email: mail('registro'), password, rol: 'administrador' }), 400, 'registro como administrador');
    const registered = status(await anonymous('/api/auth/register', 'POST', { email: mail('registro'), password, rol: open[0].id }), 201, 'registro abierto');
    if (registered.data.usuario.rol !== open[0].id) fail('el registro asignó un rol distinto al solicitado');
    status(await login(mail('registro'), password), 200, 'inicio de sesión del usuario registrado');
    await admin('/api/users/' + registered.data.usuario.id, 'DELETE');
  }
}

/** La documentación servida debe describir todas las operaciones del contrato y reflejar la seguridad aprobada. */
async function exerciseOpenApi(api, operations, auth) {
  const fail = (message) => { throw new Error('OpenAPI: ' + message); };
  const response = await api('/api/openapi.json');
  if (response.status !== 200) fail('GET /api/openapi.json respondió ' + response.status);
  const doc = response.data;
  if (!/^3\.1\./.test(String(doc.openapi))) fail('la versión debe ser 3.1.x y es ' + doc.openapi);
  for (const operation of operations) {
    const collection = doc.paths[operation.collectionPath];
    const item = doc.paths[operation.collectionPath + '/{id}'];
    if (!collection || !collection.get || !collection.post) fail('falta documentar listar y crear en ' + operation.collectionPath);
    if (!item || !item.patch || !item.delete) fail('falta documentar modificar y eliminar en ' + operation.collectionPath + '/{id}');
    const required = ((((collection.post.requestBody || {}).content || {})['application/json'] || {}).schema || {}).$ref;
    const schema = required ? doc.components.schemas[required.split('/').pop()] : null;
    for (const rule of operation.rules || []) {
      if (rule.tipo === 'requerido' && schema && !(schema.required || []).includes(rule.campo)) fail(operation.id + ': la regla ' + rule.id + ' no figura como campo obligatorio');
      if (rule.tipo === 'rango' && schema && schema.properties[rule.campo].maximum !== rule.max) fail(operation.id + ': la regla ' + rule.id + ' no figura como máximo');
    }
  }
  const secured = Boolean(auth && auth.habilitada);
  if (secured !== Boolean(doc.components.securitySchemes && doc.components.securitySchemes.bearerAuth)) fail('el esquema de seguridad no coincide con la política aprobada');
  if (secured !== Boolean(doc.paths['/api/auth/login'])) fail('la ruta de inicio de sesión debe documentarse solo con autenticación');
}

function runtimeSource() {
  return [salted, samplePayload, createValidRecord, exerciseOperation, makeApi, setupAccess, exerciseAccess, exerciseAuth, exerciseOpenApi].map((fn) => fn.toString()).join('\n\n');
}

samplePayload.exerciseOperation = exerciseOperation;
samplePayload.exerciseAccess = exerciseAccess;
samplePayload.exerciseAuth = exerciseAuth;
samplePayload.exerciseOpenApi = exerciseOpenApi;
samplePayload.setupAccess = setupAccess;
samplePayload.makeApi = makeApi;
samplePayload.runtimeSource = runtimeSource;
module.exports = samplePayload;
