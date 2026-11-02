const { ObjectId } = require('mongodb');
const { randomUUID } = require('node:crypto');
const model = require('./model');
const { HttpError } = require('./store-support');

const objectId = (value) => {
  if (typeof value !== 'string' || !/^[a-f0-9]{24}$/i.test(value)) throw new HttpError(400, 'Identificador ObjectId inválido.');
  return new ObjectId(value);
};

async function transaction(store, work) {
  if (!store._icaseTransactionsChecked) {
    const hello = await store.db.admin().command({ hello: 1 });
    if (!hello.setName && hello.msg !== 'isdbgrid') throw new HttpError(503, 'Los vínculos N:M requieren MongoDB con replica set o clúster transaccional. No se modificaron datos.');
    store._icaseTransactionsChecked = true;
  }
  const session = store.client.startSession();
  try {
    return await session.withTransaction(() => work(session), { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' }, readPreference: 'primary', maxCommitTimeMS: 10000 });
  } catch (error) {
    if ([20, 263].includes(error.code)) throw new HttpError(503, 'MongoDB no permite las transacciones requeridas para N:M.');
    if (error.code === 11000) throw new HttpError(409, 'Conflicto de vínculo concurrente. Puedes reintentar la operación.');
    throw error;
  } finally { await session.endSession(); }
}

async function lock(store, table, id, session) {
  // Debe cambiar el documento: un no-op no evita lecturas obsoletas ni conflictos de borrado.
  const result = await store.db.collection(table).updateOne({ _id: id }, { $set: { _icase_link_lock: randomUUID() } }, { session });
  if (!result.matchedCount) throw new HttpError(404, 'Uno de los extremos del vínculo no existe.');
}

async function execute(store, action, relation, input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new HttpError(400, 'Datos de vínculo inválidos.');
  const list = action === 'list';
  if (!list && !['link', 'unlink'].includes(action)) throw new HttpError(400, 'Acción inválida.');
  const allowed = list ? ['source_id', 'limit', 'after_target_id'] : ['source_id', 'target_id'];
  if (Object.keys(input).some((key) => !allowed.includes(key))) throw new HttpError(400, 'Campo de vínculo inválido.');
  const source = objectId(input.source_id);
  const target = list ? null : objectId(input.target_id);
  const after = list && input.after_target_id !== undefined ? objectId(input.after_target_id) : null;
  const limit = input.limit === undefined ? 50 : Number(input.limit);
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new HttpError(400, 'Límite inválido (1 a 100).');
  const columns = model.tables[relation.table].columns;
  return transaction(store, async (session) => {
    if (list) {
      if (!(await store.db.collection(columns[0].references).findOne({ _id: source }, { session, projection: { _id: 1 } }))) throw new HttpError(404, 'El registro de origen no existe.');
      const rows = await store.db.collection(relation.table).find({ source_id: source, ...(after ? { target_id: { $gt: after } } : {}) }, { session })
        .sort({ target_id: 1 }).limit(limit + 1).toArray();
      return { data: rows.slice(0, limit).map((row) => ({ source_id: String(row.source_id), target_id: String(row.target_id) })), has_more: rows.length > limit };
    }
    const endpoints = [{ table: columns[0].references, id: source }, { table: columns[1].references, id: target }]
      .sort((a, b) => a.table.localeCompare(b.table) || String(a.id).localeCompare(String(b.id)));
    for (const endpoint of endpoints) await lock(store, endpoint.table, endpoint.id, session);
    const pair = { source_id: source, target_id: target };
    if (action === 'link') await store.db.collection(relation.table).updateOne(pair, { $setOnInsert: { ...pair, extra: {}, created_at: new Date(), updated_at: new Date() } }, { session, upsert: true });
    else await store.db.collection(relation.table).deleteOne(pair, { session });
    return { source_id: String(source), target_id: String(target), associated: action === 'link' };
  });
}

// El borrado de extremos usa el mismo bloqueo que la creación de vínculos, para evitar write skew.
async function remove(store, name, id) {
  const value = objectId(id);
  return transaction(store, async (session) => {
    if (!(await store.db.collection(name).findOne({ _id: value }, { session }))) return false;
    await lock(store, name, value, session);
    for (const reference of store.inbound.filter((item) => item.target === name)) {
      if (await store.db.collection(reference.collection).countDocuments({ [reference.column]: value }, { session, limit: 1 })) throw new HttpError(409, 'El registro es referenciado por otros registros.');
    }
    return (await store.db.collection(name).deleteOne({ _id: value }, { session })).deletedCount > 0;
  });
}

module.exports = { execute, remove };
