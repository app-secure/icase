// Prueba de humo del backend generado: se ejecuta dentro de la red aislada de verificación.
// SandboxRuntimeVerifier sustituye los dos marcadores siguientes al preparar el entorno.
const CONFIG = __CONFIG__;
__SAMPLE__

const base = process.env.BASE_API_URL;
const secured = Boolean(CONFIG.auth && CONFIG.auth.habilitada);
const roles = secured ? Object.entries(CONFIG.auth.roles).map(([id, role]) => ({ id, autoregistro: role.autoregistro === true })) : [];
const adminEmail = process.env.ADMIN_EMAIL;

// Con autenticación, todo se ejerce con la sesión del administrador inicial y luego por rol.
const access = secured ? await setupAccess(base, { adminEmail, adminPassword: process.env.ADMIN_PASSWORD, roles }) : null;
const api = secured ? access.admin : makeApi(base, null);

const request = async (path, method = 'GET', body, expected) => {
  const response = await api(path, method, body);
  const accepted = expected ? response.status === expected : response.status >= 200 && response.status < 300;
  if (!accepted) throw new Error(`${method} ${path} respondió ${response.status} (se esperaba ${expected || '2xx'}): ${JSON.stringify(response.data)}`);
  return response.data;
};
const identifier = (record) => record.id || record._id;
const missing = CONFIG.database === 'mongodb' ? '507f1f77bcf86cd799439011' : '999999999';

try {
  if (!CONFIG.operations.length) {
    const body = await request('/health');
    if (body.status !== 'ok') throw new Error('Health check inválido');
    console.log('Health check aislado correcto');
  }

  if (CONFIG.operations.length) {
    await exerciseOpenApi(api, CONFIG.operations, CONFIG.auth);
    console.log('Documentación OpenAPI correcta (' + CONFIG.operations.length + ' operaciones)');
  }

  for (const operation of CONFIG.operations) {
    await exerciseOperation(api, CONFIG.operations, operation);
    console.log('CRUD y reglas de negocio correctos para ' + operation.collectionPath + ` (${(operation.rules || []).length} reglas)`);
    if (secured) {
      await exerciseAccess(access, CONFIG.operations, operation, CONFIG.auth.operaciones[operation.key] || {});
      console.log('Permisos por rol correctos para ' + operation.collectionPath + ` (${roles.length} roles + administrador + anónimo)`);
    }
  }

  if (secured) {
    await exerciseAuth(access, { base, adminEmail, roles });
    console.log('Autenticación, usuarios, bloqueo y registro correctos');
  } else {
    console.log('Sin autenticación (decisión aprobada): la API es pública');
  }

  // Integridad referencial: las claves foráneas declaradas deben respetarse en la base de datos elegida.
  for (const table of CONFIG.tables.filter((item) => item.references.length)) {
    for (const reference of table.references) {
      const child = CONFIG.operations.find((item) => CONFIG.map[item.key] === table.name);
      const parent = CONFIG.operations.find((item) => CONFIG.map[item.key] === reference.table);
      if (!child || !parent) continue;
      const salt = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      const childSample = samplePayload(child.schema, child.rules, salt());
      const parentSample = samplePayload(parent.schema, parent.rules, salt());
      // Con otras referencias obligatorias haría falta una cadena de padres; el ejercicio por operación ya las cubre.
      if (childSample.parents.some((item) => item.campo !== reference.column) || parentSample.parents.length) continue;
      await request(child.collectionPath, 'POST', { ...childSample.payload, [reference.column]: missing }, 409);
      const owner = await request(parent.collectionPath, 'POST', { ...parentSample.payload, verification: 'parent' }, 201);
      const dependent = await request(child.collectionPath, 'POST', { ...childSample.payload, [reference.column]: identifier(owner) }, 201);
      if (String(dependent.data[reference.column]) !== String(identifier(owner))) throw new Error(`${table.name}.${reference.column} no conservó la referencia`);
      await request(`${parent.collectionPath}/${identifier(owner)}`, 'DELETE', undefined, 409);
      await request(`${child.collectionPath}/${identifier(dependent)}`, 'DELETE');
      await request(`${parent.collectionPath}/${identifier(owner)}`, 'DELETE');
      console.log(`Integridad referencial correcta: ${table.name}.${reference.column} -> ${reference.table}`);
    }
  }
} finally {
  if (access) await access.cleanup();
}
