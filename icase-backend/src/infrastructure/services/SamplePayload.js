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
    else if (property.enum && property.enum.length) value = property.enum.find((item) => !/^(?:anul|cancel|elimin|inactiv|rechaz|cerrad|finaliz)/i.test(String(item).normalize('NFD').replace(/[\u0300-\u036f]/g, ''))) ?? property.enum[0]; // un registro nuevo no nace anulado ni cerrado
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

  // Los campos de secretos se guardan como hash y no se devuelven: no se comparan con lo enviado.
  const typed = Object.entries(payload).filter(([name]) => !properties[name]['x-sensitive']).map(([name, value]) => ({ name, type: properties[name].type, format: properties[name].format || null, value }));
  const defaults = rules.filter((rule) => rule.tipo === 'valor_por_defecto').map((rule) => ({ campo: rule.campo, valor: rule.valor }));

  const cases = [];
  const last = [];
  for (const rule of rules) {
    const field = rule.campo;
    const base = { regla: rule.id, tipo: rule.tipo };
    if (rule.tipo === 'requerido' && !defaulted.has(field) && !ruleFor('maquina_estados', field) && !ruleFor('calculo', field)
      && (payload[field] !== undefined || parents.some((parent) => parent.campo === field))) {
      cases.push({ ...base, accion: 'crear', omitir: [field], esperado: 422 });
    }
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
    // Una referencia a la entidad de cuentas (el vendedor de una venta) apunta a una cuenta real: la de quien actúa. Crear un
    // «usuario» como dato no es posible (lo resuelve /api/users) y su perfil comparte el id de la cuenta.
    if (operations.some((item) => item.identity && item.schema && item.schema.title === parent.entidad)) {
      const me = await api('/api/auth/me', 'GET');
      const own = me && me.data && (me.data.usuario || me.data.user || me.data);
      if (own && own.id !== undefined) { body[parent.campo] = String(own.id); continue; }
    }
    body[parent.campo] = parentOperation
      ? (await createValidRecord(api, operations, parentOperation, cleanups, depth + 1)).id
      : '1';
  }
  const response = await api(target.collectionPath, 'POST', { ...body, verification: 'isolated' });
  if (response.status !== 201) fail('crear respondió ' + response.status + ' (se esperaba 201): ' + JSON.stringify(response.data));
  const id = response.data.id || response.data._id;
  if (!id) fail('la creación no devolvió identificador');
  if (!target.methods || target.methods.includes('DELETE')) cleanups.unshift(() => api(target.collectionPath + '/' + id, 'DELETE'));
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
  // Solo se ejercen los métodos que la operación declara; sin `methods` se ejerce el ciclo completo.
  const declared = (method) => !operation.methods || operation.methods.includes(method);

  try {
    if (!declared('POST')) {
      const listing = expectStatus(await api(operation.collectionPath), 200, 'listar');
      if (!Array.isArray(listing.data) && !Array.isArray((listing.data || {}).data)) fail('el listado no devolvió una colección');
      const limited = await api(operation.collectionPath + '?page=1&limit=1');
      if (limited.status === 200) {
        const limitedRecords = Array.isArray(limited.data) ? limited.data : (limited.data.data || []);
        if (limitedRecords.length > 1) fail('la paginación con limit=1 devolvió más de un registro');
      }
      return;
    }
    const main = await createValidRecord(api, operations, operation, cleanups, 0);
    const stored = main.response.data.data;
    for (const name of Object.keys(operation.schema.properties || {}).filter((key) => operation.schema.properties[key]['x-sensitive'])) {
      if (stored[name] !== undefined) fail('el campo ' + name + ' es un secreto y no debe devolverse');
    }
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
    const textField = main.sample.typed.find((field) => field.type === 'string' && !['date-time', 'date', 'time'].includes(field.format) && field.value)
      || main.sample.typed.find((field) => ['string', 'date'].includes(field.type) && field.value);
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

    if (declared('PATCH')) {
      const updated = expectStatus(await api(operation.collectionPath + '/' + main.id, 'PATCH', { verification: 'updated' }), 200, 'modificar');
      if (updated.data.data.verification !== 'updated') fail('la modificación no se aplicó');
      if (Object.keys(stored).some((key) => updated.data.data[key] === undefined)) fail('la modificación parcial perdió datos');
    }

    const wrong = main.sample.typed.find((field) => ['integer', 'number', 'boolean'].includes(field.type));
    if (wrong) expectStatus(await api(operation.collectionPath, 'POST', { ...main.body, [wrong.name]: 'valor-que-no-corresponde' }), 400, 'rechazar un tipo incorrecto');

    for (const item of main.sample.cases) {
      if (item.accion === 'modificar' && !declared('PATCH')) continue;
      const label = item.regla + ' (' + item.tipo + ')';
      let response;
      if (item.accion === 'modificar') {
        response = await api(operation.collectionPath + '/' + main.id, 'PATCH', item.cuerpo);
      } else {
        const body = item.accion === 'duplicar' ? { ...main.body } : { ...main.body, ...(item.cuerpo || {}) };
        for (const field of item.omitir || []) delete body[field];
        response = await api(operation.collectionPath, 'POST', body);
        if (response.status === 201 && declared('DELETE')) cleanups.unshift(() => api(operation.collectionPath + '/' + (response.data.id || response.data._id), 'DELETE'));
      }
      if (response.status !== item.esperado) fail('regla ' + label + ' respondió ' + response.status + ' (se esperaba ' + item.esperado + '): ' + JSON.stringify(response.data));
      if (item.esperado === 422 && !(response.data.details || []).some((detail) => detail.regla === item.regla)) fail('regla ' + label + ' fue rechazada por otra causa: ' + JSON.stringify(response.data));
    }

    if (declared('DELETE')) {
      expectStatus(await api(operation.collectionPath + '/' + main.id, 'DELETE'), 200, 'eliminar');
      expectStatus(await api(operation.collectionPath + '/' + main.id, 'DELETE'), 404, 'eliminar dos veces');
    }
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

function permissionMethods(entry) {
  if (!entry) return [];
  return Array.isArray(entry) ? entry : (Array.isArray(entry.metodos) ? entry.metodos : []);
}

function permissionScope(entry) {
  if (!entry || Array.isArray(entry)) return 'todos';
  return entry.alcance === 'propios' ? 'propios' : 'todos';
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
      const allowed = permissionMethods(matrix[role]);
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
    // Se exige documentar exactamente los métodos que la operación declara (sin `methods`, el CRUD completo).
    const declared = (method) => !operation.methods || operation.methods.includes(method);
    if (!collection || !collection.get) fail('falta documentar listar en ' + operation.collectionPath);
    if (declared('POST') !== Boolean(collection.post)) fail(declared('POST') ? 'falta documentar crear en ' + operation.collectionPath : 'se documenta crear en ' + operation.collectionPath + ' pero la operación no lo declara');
    if (declared('PATCH') !== Boolean(item && item.patch)) fail(declared('PATCH') ? 'falta documentar modificar en ' + operation.collectionPath + '/{id}' : 'se documenta modificar en ' + operation.collectionPath + '/{id} pero la operación no lo declara');
    if (declared('DELETE') !== Boolean(item && item.delete)) fail(declared('DELETE') ? 'falta documentar eliminar en ' + operation.collectionPath + '/{id}' : 'se documenta eliminar en ' + operation.collectionPath + '/{id} pero la operación no lo declara');
    const required = collection.post ? ((((collection.post.requestBody || {}).content || {})['application/json'] || {}).schema || {}).$ref : undefined;
    const schema = required ? doc.components.schemas[required.split('/').pop()] : null;
    const defaulted = new Set((operation.rules || []).filter((rule) => ['valor_por_defecto', 'maquina_estados'].includes(rule.tipo)).map((rule) => rule.campo));
    for (const rule of operation.rules || []) {
      if (rule.tipo === 'requerido' && schema && !defaulted.has(rule.campo) && !(schema.required || []).includes(rule.campo)) fail(operation.id + ': la regla ' + rule.id + ' no figura como campo obligatorio');
      if (rule.tipo === 'rango' && schema && schema.properties[rule.campo].maximum !== rule.max) fail(operation.id + ': la regla ' + rule.id + ' no figura como máximo');
    }
  }
  const secured = Boolean(auth && auth.habilitada);
  if (secured !== Boolean(doc.components.securitySchemes && doc.components.securitySchemes.bearerAuth)) fail('el esquema de seguridad no coincide con la política aprobada');
  if (secured !== Boolean(doc.paths['/api/auth/login'])) fail('la ruta de inicio de sesión debe documentarse solo con autenticación');
}

async function exerciseAssociation(api, operations, association, access, auth) {
  const fail = (message) => { throw new Error('N:M ' + association.table + ': ' + message); };
  const expectStatus = (response, expected, label) => {
    if (response.status !== expected) fail(label + ' respondió ' + response.status + ' (se esperaba ' + expected + ')');
    return response.data;
  };
  if (!association.endpoints_generated) fail('no hay API generada');
  const endpoints = (association.operations || []).map((keys) => operations.find((operation) => keys.includes(operation.key)));
  if (endpoints.length !== 2 || endpoints.some((endpoint) => !endpoint)) fail('faltan operaciones para crear ambos extremos');
  const cleanups = [];
  const path = '/api/associations/' + encodeURIComponent(association.table);
  try {
    const source = await createValidRecord(api, operations, endpoints[0], cleanups, 0);
    const targets = [await createValidRecord(api, operations, endpoints[1], cleanups, 0), await createValidRecord(api, operations, endpoints[1], cleanups, 0)];
    const pair = (target) => ({ source_id: String(source.id), target_id: String(target.id) });
    const listPath = path + '?source_id=' + encodeURIComponent(source.id);
    const absent = await createValidRecord(api, operations, endpoints[1], cleanups, 0);
    expectStatus(await api(endpoints[1].collectionPath + '/' + absent.id, 'DELETE'), 200, 'preparar extremo inexistente');
    expectStatus(await api(path, 'POST', pair(absent)), 404, 'rechazar extremo inexistente');
    expectStatus(await api(path, 'POST', { source_id: String(source.id), target_id: 'no-es-un-id' }), 400, 'rechazar ID inválido');
    for (const target of targets) {
      cleanups.unshift(() => api(path, 'DELETE', pair(target)));
      expectStatus(await api(path, 'POST', pair(target)), 200, 'asociar');
      expectStatus(await api(path, 'POST', pair(target)), 200, 'repetir asociación idempotente');
    }
    const first = expectStatus(await api(listPath + '&limit=1'), 200, 'primera página');
    if (!Array.isArray(first.data) || first.data.length !== 1 || first.has_more !== true) fail('primera página o has_more incorrectos');
    const second = expectStatus(await api(listPath + '&limit=1&after_target_id=' + encodeURIComponent(first.data[0].target_id)), 200, 'segunda página');
    if (!Array.isArray(second.data) || second.data.length !== 1 || second.has_more !== false) fail('segunda página o cursor incorrectos');
    const rows = [...first.data, ...second.data];
    if (new Set(rows.map((row) => String(row.target_id))).size !== 2 || targets.some((target) => !rows.some((row) => String(row.target_id) === String(target.id))) || rows.some((row) => String(row.source_id) !== String(source.id))) fail('vínculos duplicados, omitidos o asociados a otro origen');
    expectStatus(await api(endpoints[0].collectionPath + '/' + source.id, 'DELETE'), 409, 'proteger origen vinculado');
    expectStatus(await api(endpoints[1].collectionPath + '/' + targets[0].id, 'DELETE'), 409, 'proteger destino vinculado');
    if (access) {
      expectStatus(await access.anonymous(listPath), 401, 'consulta anónima');
      expectStatus(await access.invalid(path, 'POST', pair(targets[0])), 401, 'token inválido');
      for (const [role, session] of Object.entries(access.roles)) {
        const permitted = (verbs) => association.operations.every((keys) => keys.some((key) => verbs.every((verb) => permissionMethods(auth.operaciones?.[key]?.[role]).includes(verb))));
        expectStatus(await session.api(listPath), permitted(['GET']) ? 200 : 403, 'lectura del rol ' + role);
        const write = permitted(['GET', 'PATCH']);
        // Usar un vínculo ya existente para no alterar el caso de otros roles.
        expectStatus(await session.api(path, 'POST', pair(targets[0])), write ? 200 : 403, 'asociación del rol ' + role);
        expectStatus(await session.api(path, 'DELETE', pair(targets[0])), write ? 200 : 403, 'desasociación del rol ' + role);
        if (write) expectStatus(await session.api(path, 'POST', pair(targets[0])), 200, 'restaurar vínculo del rol ' + role);
      }
    }
    for (const target of targets) {
      expectStatus(await api(path, 'DELETE', pair(target)), 200, 'desasociar');
      expectStatus(await api(path, 'DELETE', pair(target)), 200, 'repetir desasociación idempotente');
      const records = expectStatus(await api(endpoints[1].collectionPath), 200, 'conservar destino');
      const data = Array.isArray(records) ? records : records.data;
      if (!data?.some((record) => String(record.id || record._id) === String(target.id))) fail('desasociar borró el destino');
    }
    const empty = expectStatus(await api(listPath), 200, 'lista vacía');
    if (!Array.isArray(empty.data) || empty.data.length || empty.has_more !== false) fail('desasociación no persistida');
    expectStatus(await api(endpoints[0].collectionPath + '/' + source.id, 'DELETE'), 200, 'eliminar origen después de desasociar');
    return { table: association.table, estado: 'correcta' };
  } finally {
    for (const cleanup of cleanups) { try { await cleanup(); } catch { /* Solo datos creados por esta prueba, mejor esfuerzo. */ } }
  }
}

/** Dos usuarios del mismo rol con alcance «propios»: aislamiento, 404 cruzado y propietario no falsificable. */
async function exerciseOwnership(access, operations, operation, matrix, config = {}) {
  const fail = (message) => { throw new Error(operation.id + ' (propiedad): ' + message); };
  const status = (response, expected, label) => {
    if (response.status !== expected) fail(label + ' respondió ' + response.status + ' (se esperaba ' + expected + '): ' + JSON.stringify(response.data));
    return response;
  };
  const limited = Object.entries(matrix || {}).find(([, entry]) => permissionScope(entry) === 'propios' && permissionMethods(entry).includes('POST') && permissionMethods(entry).includes('GET'));
  if (!limited) return;
  const role = limited[0];
  const first = access.roles[role];
  if (!first) fail('falta el usuario del rol ' + role);
  const base = config.base;
  const email = 'own-peer-' + access.salt + '-' + operation.key + '@example.test';
  const password = 'Passw0rd-' + access.salt;
  const createdUser = status(await access.admin('/api/users', 'POST', { email, password, nombre: 'Par', rol: role }), 201, 'crear segundo usuario');
  const session = status(await access.anonymous('/api/auth/login', 'POST', { email, password }), 200, 'sesión del segundo usuario');
  const second = { api: makeApi(base, session.data.token), userId: createdUser.data.id };
  const cleanups = [() => access.admin('/api/users/' + second.userId, 'DELETE')];
  try {
    const mine = await createValidRecord(first.api, operations, operation, cleanups, 0);
    const theirs = await createValidRecord(second.api, operations, operation, cleanups, 1);
    const listed = status(await first.api(operation.collectionPath), 200, 'listar propios');
    const rows = Array.isArray(listed.data) ? listed.data : listed.data.data;
    if (!rows.some((row) => String(row.id) === String(mine.id))) fail('el listado omitió el registro propio');
    if (rows.some((row) => String(row.id) === String(theirs.id))) fail('el listado expuso un registro ajeno');
    // Un registro ajeno no existe para quien solo ve lo suyo (404). Si el rol ni siquiera puede usar ese método, la política lo
    // rechaza antes (403): el permiso se comprueba primero, y ese es el comportamiento correcto, no un fallo de aislamiento.
    const allowed = permissionMethods(limited[1]);
    status(await first.api(operation.collectionPath + '/' + theirs.id, 'PATCH', { verification: 'ajeno' }), allowed.includes('PATCH') ? 404 : 403, 'modificar ajeno');
    status(await first.api(operation.collectionPath + '/' + theirs.id, 'DELETE'), allowed.includes('DELETE') ? 404 : 403, 'borrar ajeno');
    const forged = await first.api(operation.collectionPath, 'POST', { ...(await createValidRecord(first.api, operations, operation, cleanups, 2)).body, owner_id: second.userId, __owner: second.userId });
    if (forged.status === 201) {
      cleanups.unshift(() => first.api(operation.collectionPath + '/' + forged.data.id, 'DELETE'));
      const seen = status(await second.api(operation.collectionPath), 200, 'listar tras falsificar propietario');
      const data = Array.isArray(seen.data) ? seen.data : seen.data.data;
      if (data.some((row) => String(row.id) === String(forged.data.id))) fail('el cliente pudo asignar un propietario ajeno');
      if (JSON.stringify(forged.data).includes(String(second.userId)) && /owner/.test(JSON.stringify(forged.data))) fail('la API expuso el propietario');
    }
    const filtered = await first.api(operation.collectionPath + '?owner_id=' + second.userId + '&__owner=' + second.userId);
    if (filtered.status === 200) {
      const data = Array.isArray(filtered.data) ? filtered.data : filtered.data.data;
      if (data.some((row) => String(row.id) === String(theirs.id))) fail('el filtro de consulta reveló registros ajenos');
    }
    for (const candidate of operations) {
      // Sin la entidad de la operación no se sabe qué campos la referencian: comparar «nada» con «nada» daba falsos candidatos (`id`).
      if (!operation.entity) break;
      const keyOf = (value) => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      const reference = Object.entries(candidate.schema?.properties || {}).find(([, schema]) => schema && schema['x-references'] && keyOf(schema['x-references']) === String(operation.entity));
      if (!reference) continue;
      const candidateEntry = (config.auth?.operaciones || {})[candidate.key]?.[role];
      if (permissionScope(candidateEntry) !== 'propios') continue;
      // Una operación reducida pierde POST en la política: el rol recibiría 403 al crear.
      if (!permissionMethods(candidateEntry).includes('POST') || (candidate.methods && !candidate.methods.includes('POST'))) continue;
      const payload = await createValidRecord(first.api, operations, candidate, cleanups, 0);
      const conflict = await first.api(candidate.collectionPath, 'POST', { ...payload.body, [reference[0]]: theirs.id });
      if (conflict.status !== 409) fail('referencia cruzada en ' + candidate.id + '.' + reference[0] + ' (rol ' + role + ') respondió ' + conflict.status + ': ' + JSON.stringify(conflict.data).slice(0, 300));
    }
    for (const association of config.associations || []) {
      const ends = association.operations || [];
      const sourceKeys = Array.isArray(ends[0]) ? ends[0] : [];
      const targetKeys = Array.isArray(ends[1]) ? ends[1] : [];
      // Solo cuando la operación actual es el extremo source: source_id = registro propio.
      if (!sourceKeys.includes(operation.key)) continue;
      const targetOp = operations.find((item) => targetKeys.includes(item.key));
      if (!targetOp) continue;
      const targetEntry = (config.auth?.operaciones || {})[targetOp.key]?.[role];
      if (permissionScope(targetEntry) !== 'propios') continue;
      if (!permissionMethods(targetEntry).includes('POST') || (targetOp.methods && !targetOp.methods.includes('POST'))) continue;
      const myTarget = await createValidRecord(first.api, operations, targetOp, cleanups, 0);
      const theirTarget = await createValidRecord(second.api, operations, targetOp, cleanups, 0);
      // Extremo ajeno: 404 (mismo contrato CRUD), nunca 403 de “N:M prohibido”.
      const foreign = await first.api('/api/associations/' + encodeURIComponent(association.table), 'POST', { source_id: String(mine.id), target_id: String(theirTarget.id) });
      if (foreign.status !== 404) fail('N:M con extremo ajeno respondió ' + foreign.status);
      const linked = status(await first.api('/api/associations/' + encodeURIComponent(association.table), 'POST', { source_id: String(mine.id), target_id: String(myTarget.id) }), 200, 'vincular extremos propios');
      if (!linked.data?.associated) fail('N:M no asoció extremos propios');
      // Sin filtro de targets, el listado incluiría el vínculo ajeno si alguien lo hubiera creado; comprobamos que el 404 se mantuvo.
      const listed = status(await first.api('/api/associations/' + encodeURIComponent(association.table) + '?source_id=' + encodeURIComponent(String(mine.id))), 200, 'listar vínculos propios');
      const linkRows = Array.isArray(listed.data?.data) ? listed.data.data : [];
      if (!linkRows.some((row) => String(row.target_id) === String(myTarget.id))) fail('N:M omitió el vínculo propio');
      if (linkRows.some((row) => String(row.target_id) === String(theirTarget.id))) fail('N:M listó un extremo ajeno');
    }
  } finally {
    for (const cleanup of cleanups) { try { await cleanup(); } catch { /* mejor esfuerzo */ } }
  }
}

/**
 * Ejerce una operación de negocio de la especificación sobre el backend en marcha: consulta, creación, actualización,
 * baja o cambio de estado. Crea sus propios datos y los limpia; cualquier discrepancia lanza un Error.
 */
async function exerciseAction(api, operations, action) {
  const fail = (message) => { throw new Error(action.name + ': ' + message); };
  const expectStatus = (response, status, label) => {
    if (response.status !== status) fail(label + ' respondió ' + response.status + ' (se esperaba ' + status + '): ' + JSON.stringify(response.data));
    return response;
  };
  const target = operations.find((item) => item.key === action.capability);
  if (!target) fail('no tiene operación de almacén (' + action.capability + ')');
  const pick = (source, names) => Object.fromEntries((names || []).filter((name) => source[name] !== undefined).map((name) => [name, source[name]]));
  const cleanups = [];
  // Una entrada que es una relación opcional (la persona asignada a una mesa) no viene en el registro de ejemplo: se crea el
  // registro relacionado y se usa su id, como lo haría quien elige uno en la lista.
  const bodyFor = async (seed) => {
    const body = pick(seed.body, action.inputs);
    for (const name of action.inputs || []) {
      if (body[name] !== undefined) continue;
      const reference = target.schema?.properties?.[name]?.['x-references'];
      const parent = reference ? operations.find((item) => item.schema && item.schema.title === reference) : null;
      if (parent) body[name] = (await createValidRecord(api, operations, parent, cleanups, 1)).id;
    }
    return body;
  };
  const itemPath = (id) => target.itemPath.replace(':id', id);
  const route = (id) => action.path.replace(':id', id);
  try {
    if (action.type === 'consulta') {
      const created = await createValidRecord(api, operations, target, cleanups, 0);
      const rows = expectStatus(await api(action.path, 'GET'), 200, 'consultar').data;
      if (!Array.isArray(rows)) fail('la consulta debe devolver una lista');
      const allowed = new Set(['id', ...(action.output || []), ...(action.output || []).map((name) => name + '__etiqueta')]); // la etiqueta legible de una referencia acompaña a su campo
      for (const row of rows) {
        if (row.id === undefined) fail('cada fila debe traer su id');
        if ((action.output || []).length) for (const key of Object.keys(row)) if (!allowed.has(key)) fail('devolvió el campo no declarado «' + key + '»');
      }
      // Sin filtros, el registro recién creado debe aparecer: comprueba que la consulta lee datos reales.
      if (!(action.filters || []).length && !rows.some((row) => String(row.id) === String(created.id))) fail('el registro creado no aparece en la consulta');
    } else if (action.type === 'crear') {
      const seed = await createValidRecord(api, operations, target, cleanups, 0);
      await api(itemPath(seed.id), 'DELETE');
      const body = await bodyFor(seed);
      // Si el servidor pone la fecha del registro («ahora»), las demás fechas del ejemplo deben ser anteriores: un cierre no es
      // anterior a su apertura. Los datos de ejemplo usan 2030, que en un alta real sería una apertura en el futuro.
      if ((action.autoInputs || []).some((item) => ['ahora', 'hoy'].includes(item.valor))) {
        for (const [name, value] of Object.entries(body)) if (typeof value === 'string' && /^2030-/.test(value)) body[name] = value.replace(/^2030/, '2020');
      }
      // Un alta con líneas (pedido + platos): sin ellas el servidor responde 400; se elige un registro real y se retiran las líneas al limpiar.
      if (action.lineas) {
        const destino = operations.find((item) => item.key === action.lineas.destinoCapability);
        if (!destino) fail('no tiene operación para ' + action.lineas.destino);
        const choice = await createValidRecord(api, operations, destino, cleanups, 1);
        body.lineas = [{ [action.lineas.referencia]: choice.id, [action.lineas.cantidad]: 2 }];
      }
      // Emitir o anular para un registro existente (la factura de una venta): se crea ese registro y se indica su id.
      let owner = null;
      if (action.vincula) {
        const source = operations.find((item) => item.key === action.vincula.capability);
        if (!source) fail('no tiene operación para ' + action.vincula.entidad);
        owner = await createValidRecord(api, operations, source, cleanups, 1);
        body[action.vincula.parametro] = owner.id;
      }
      const response = expectStatus(await api(action.path, 'POST', body), 201, 'crear');
      if (owner) {
        // Se lee por una operación de esa entidad que permita consultar (la de registrar ventas puede ser solo POST).
        const reader = operations.find((item) => item.entity === action.vincula.entidadClave && (item.methods || []).includes('GET'));
        if (reader) {
          const listed = expectStatus(await api(reader.collectionPath + '?limit=200', 'GET'), 200, 'leer el registro vinculado').data;
          const row = (Array.isArray(listed) ? listed : (listed.data || [])).find((item) => String(item.id) === String(owner.id));
          const linked = row ? (row.data || row) : null;
          if (!linked || String(linked[action.vincula.campo]) !== String(response.data.id)) fail('no quedó vinculado a ' + action.vincula.entidad);
          if (action.anula && linked[action.anula.estado] !== action.anula.valor) fail(action.vincula.entidad + ' no quedó ' + action.anula.valor);
        }
        expectStatus(await api(action.path, 'POST', body), 409, 'repetir sobre el mismo registro');
      }
      if (!response.data.id) fail('la creación no devolvió id');
      if (action.lineas && !(response.data.lineas >= 1)) fail('el alta con líneas no confirmó haberlas guardado');
      cleanups.unshift(async () => {
        if (action.lineas) {
          const child = operations.find((item) => item.key === action.lineas.capability);
          const listed = child ? await api(child.collectionPath + '?limit=200', 'GET') : null;
          const rows = Array.isArray(listed?.data) ? listed.data : (listed?.data?.data || []);
          for (const row of rows) if (String((row.data || row)[action.lineas.fk]) === String(response.data.id)) await api(child.itemPath.replace(':id', row.id), 'DELETE');
        }
        return api(itemPath(response.data.id), 'DELETE');
      });
    } else if (action.type === 'actualizar') {
      const seed = await createValidRecord(api, operations, target, cleanups, 0);
      const body = await bodyFor(seed);
      const response = expectStatus(await api(route(seed.id), 'PATCH', body), 200, 'actualizar');
      if (String(response.data.id) !== String(seed.id)) fail('devolvió otro registro');
      expectStatus(await api(route('no-existe-0'), 'PATCH', body), 404, 'actualizar un registro inexistente');
    } else if (action.type === 'eliminar') {
      const seed = await createValidRecord(api, operations, target, cleanups, 0);
      expectStatus(await api(route(seed.id), 'DELETE'), 200, 'eliminar');
      expectStatus(await api(itemPath(seed.id), 'GET'), 404, 'leer el registro eliminado');
    } else if (action.type === 'transicion') {
      const { campo, de = [], a } = action.transition;
      const seed = await createValidRecord(api, operations, target, cleanups, 0);
      // La transición sobre el registro relacionado (marcar lista una comanda) se invoca con el id del registro de origen.
      let routeId = seed.id;
      if (action.sobre) {
        const source = operations.find((item) => item.entity === action.sobre.entidadClave);
        if (!source) fail('no tiene operación para ' + action.sobre.entidad);
        routeId = (await createValidRecord(api, operations, source, cleanups, 0)).id;
        expectStatus(await api(itemPath(seed.id), 'PATCH', { [action.sobre.via]: routeId }), 200, 'vincular el registro relacionado');
      }
      if (de.length) expectStatus(await api(itemPath(seed.id), 'PATCH', { [campo]: de[0] }), 200, 'preparar el estado de origen');
      const response = expectStatus(await api(route(routeId), 'POST', {}), 200, 'cambiar de estado');
      if (response.data[campo] !== a) fail('el estado quedó en ' + response.data[campo] + ' (se esperaba ' + a + ')');
      if (de.length && !de.includes(a)) expectStatus(await api(route(routeId), 'POST', {}), 409, 'repetir una transición no permitida');
    } else if (action.type === 'resumen') {
      // Un reporte agregado: con el rango de fechas abierto debe responder una lista con las columnas declaradas.
      const params = (action.filters || []).filter((item) => item.origen === 'parametro').map((item) => item.valor + '=' + (/hasta|fin/i.test(item.valor) ? '2099-12-31' : '2000-01-01'));
      const rows = expectStatus(await api(action.path + (params.length ? '?' + params.join('&') : ''), 'GET'), 200, 'consultar el resumen').data;
      if (!Array.isArray(rows)) fail('el resumen debe devolver una lista');
      const allowed = new Set(['id', ...(action.output || []), ...(action.output || []).map((name) => name + '__etiqueta')]);
      for (const row of rows) for (const key of Object.keys(row)) if (!allowed.has(key)) fail('devolvió la columna no declarada «' + key + '»');
    } else fail('tipo de operación desconocido: ' + action.type);
  } finally {
    for (const cleanup of cleanups) await Promise.resolve(cleanup()).catch(() => {});
  }
}

function runtimeSource() {
  return [salted, samplePayload, createValidRecord, exerciseOperation, exerciseAction, makeApi, setupAccess, permissionMethods, permissionScope, exerciseAccess, exerciseOwnership, exerciseAuth, exerciseOpenApi, exerciseAssociation].map((fn) => fn.toString()).join('\n\n');
}

samplePayload.exerciseOperation = exerciseOperation;
samplePayload.exerciseAccess = exerciseAccess;
samplePayload.exerciseAction = exerciseAction;
samplePayload.exerciseOwnership = exerciseOwnership;
samplePayload.exerciseAuth = exerciseAuth;
samplePayload.exerciseOpenApi = exerciseOpenApi;
samplePayload.exerciseAssociation = exerciseAssociation;
samplePayload.setupAccess = setupAccess;
samplePayload.makeApi = makeApi;
samplePayload.runtimeSource = runtimeSource;
module.exports = samplePayload;
