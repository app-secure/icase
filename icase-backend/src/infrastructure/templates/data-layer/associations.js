const model = require('./model');
const { HttpError } = require('./store-support');

const id = (value) => {
  if (typeof value !== 'string' || !/^[1-9]\d{0,18}$/.test(value) || BigInt(value) > 9223372036854775807n) throw new HttpError(400, 'Identificador inválido. Usa una cadena de entero positivo.');
  return value;
};

async function visible(store, operationKey, recordId, scope) {
  if (!operationKey) return true;
  return Boolean(await store.getRecord(operationKey, String(recordId), scope || null));
}

async function assertVisible(store, operationKey, recordId, scope) {
  if (!(await visible(store, operationKey, recordId, scope))) {
    throw new HttpError(404, 'Uno de los extremos del vínculo no existe.');
  }
}

async function memoryAssociations(store, action, relation, input, scopes = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some((k) => !(action === 'list' ? ['source_id', 'limit', 'after_target_id'] : ['source_id', 'target_id']).includes(k))) {
    throw new HttpError(400, 'Datos de vínculo inválidos.');
  }
  const source = id(input.source_id);
  const target = action === 'list' ? null : id(input.target_id);
  const after = action === 'list' && input.after_target_id !== undefined ? id(input.after_target_id) : null;
  const limit = input.limit === undefined ? 50 : Number(input.limit);
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new HttpError(400, 'Límite inválido (1 a 100).');
  store._links = store._links || {};
  const bucket = (store._links[relation.table] = store._links[relation.table] || []);
  await assertVisible(store, scopes.sourceKey, source, scopes.sourceScope);
  if (target) await assertVisible(store, scopes.targetKey, target, scopes.targetScope);
  if (action === 'list') {
    const rows = bucket
      .filter((row) => String(row.source_id) === source && (!after || BigInt(row.target_id) > BigInt(after)))
      .sort((a, b) => (BigInt(a.target_id) < BigInt(b.target_id) ? -1 : 1));
    const data = [];
    for (const row of rows) {
      if (!(await visible(store, scopes.targetKey, row.target_id, scopes.targetScope))) continue;
      data.push({ source_id: String(row.source_id), target_id: String(row.target_id) });
      if (data.length === limit) break;
    }
    return { data, has_more: data.length === limit && rows.length > data.length };
  }
  if (action === 'link') {
    if (!bucket.some((row) => String(row.source_id) === source && String(row.target_id) === target)) bucket.push({ source_id: source, target_id: target });
    return { source_id: source, target_id: target, associated: true };
  }
  if (action === 'unlink') {
    const index = bucket.findIndex((row) => String(row.source_id) === source && String(row.target_id) === target);
    if (index >= 0) bucket.splice(index, 1);
    return { source_id: source, target_id: target, associated: false };
  }
  throw new HttpError(400, 'Acción de vínculo inválida.');
}

module.exports = async function associations(store, action, key, input = {}, scopes = {}) {
  const relation = (model.associations || []).find((item) => item.table === key);
  if (!relation) throw new HttpError(404, 'Relación inexistente.');
  if (model.database === 'mongodb') {
    const result = await require('./mongo-associations').execute(store, action, relation, input, scopes);
    if (action !== 'list') try { store.notifyAssociationChange?.(key, action); } catch { /* El commit ya ocurrió. */ }
    return result;
  }
  // Almacén sin pool (pruebas en memoria): mismos chequeos de visibilidad sin SQL.
  if (!store.pool) return memoryAssociations(store, action, relation, input, scopes);
  if (!['postgres', 'mysql'].includes(model.database)) throw new HttpError(501, 'API de vínculos no disponible para este motor.');
  if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some((k) => !(action === 'list' ? ['source_id', 'limit', 'after_target_id'] : ['source_id', 'target_id']).includes(k))) throw new HttpError(400, 'Datos de vínculo inválidos.');
  const source = id(input.source_id);
  const target = action === 'list' ? null : id(input.target_id);
  const after = action === 'list' && input.after_target_id !== undefined ? id(input.after_target_id) : null;
  const limit = input.limit === undefined ? 50 : Number(input.limit);
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new HttpError(400, 'Límite inválido (1 a 100).');
  const pg = model.database === 'postgres';
  // Los identificadores proceden exclusivamente del modelo generado, nunca del cuerpo o URL.
  const quote = (name) => pg ? '"' + name.replace(/"/g, '""') + '"' : '`' + name.replace(/`/g, '``') + '`';
  const table = model.tables[relation.table];
  const connection = pg ? await store.pool.connect() : await store.pool.getConnection();
  const query = async (sql, params = []) => {
    const result = await connection.query(sql, params);
    return pg ? result.rows : result[0];
  };
  const mark = (position) => pg ? '$' + position : '?';
  try {
    await query('BEGIN');
    // Bloqueos de lectura impiden borrar los extremos mientras se modifica el vínculo.
    const endpoints = [{ table: table.columns[0].references, value: source }, ...(target ? [{ table: table.columns[1].references, value: target }] : [])]
      .sort((a, b) => a.table.localeCompare(b.table) || (BigInt(a.value) < BigInt(b.value) ? -1 : BigInt(a.value) > BigInt(b.value) ? 1 : 0));
    for (const endpoint of endpoints) {
      const rows = await query(`SELECT id FROM ${quote(endpoint.table)} WHERE id = ${mark(1)} ${pg ? 'FOR SHARE' : 'LOCK IN SHARE MODE'}`, [endpoint.value]);
      if (!rows.length) throw new HttpError(404, 'Uno de los extremos del vínculo no existe.');
    }
    await assertVisible(store, scopes.sourceKey, source, scopes.sourceScope);
    if (target) await assertVisible(store, scopes.targetKey, target, scopes.targetScope);
    let result;
    if (action === 'list') {
      const data = [];
      let cursor = after;
      let hasMore = false;
      while (data.length < limit) {
        const batch = Math.min(100, limit - data.length + 1);
        const params = cursor ? [source, cursor, batch] : [source, batch];
        const rows = await query(`SELECT source_id, target_id FROM ${quote(relation.table)} WHERE source_id = ${mark(1)}${cursor ? ` AND target_id > ${mark(2)}` : ''} ORDER BY target_id LIMIT ${mark(params.length)}`, params);
        if (!rows.length) break;
        for (const row of rows) {
          if (!(await visible(store, scopes.targetKey, row.target_id, scopes.targetScope))) continue;
          data.push({ source_id: String(row.source_id), target_id: String(row.target_id) });
          if (data.length === limit) {
            hasMore = true;
            break;
          }
        }
        cursor = String(rows[rows.length - 1].target_id);
        if (rows.length < batch) { hasMore = false; break; }
        if (data.length === limit) break;
      }
      // Si llenamos el cupo con el último lote completo, puede haber más; si el lote fue corto, no.
      result = { data, has_more: hasMore };
    } else if (action === 'link') {
      await query(`INSERT INTO ${quote(relation.table)} (source_id, target_id, extra) VALUES (${mark(1)}, ${mark(2)}, ${pg ? "'{}'::jsonb" : "'{}'"}) ${pg ? 'ON CONFLICT (source_id, target_id) DO NOTHING' : 'ON DUPLICATE KEY UPDATE source_id = VALUES(source_id)'}`, [source, target]);
      result = { source_id: source, target_id: target, associated: true };
    } else if (action === 'unlink') {
      await query(`DELETE FROM ${quote(relation.table)} WHERE source_id = ${mark(1)} AND target_id = ${mark(2)}`, [source, target]);
      result = { source_id: source, target_id: target, associated: false };
    } else throw new HttpError(400, 'Acción de vínculo inválida.');
    await query('COMMIT');
    if (action !== 'list') try { store.notifyAssociationChange?.(key, action); } catch { /* El aviso no modifica el resultado de la transacción. */ }
    return result;
  } catch (error) {
    await query('ROLLBACK').catch(() => {});
    if (error.code === '23503' || [1451, 1452].includes(error.errno)) throw new HttpError(409, 'El vínculo referencia un registro inexistente.');
    throw error;
  } finally { connection.release(); }
};
