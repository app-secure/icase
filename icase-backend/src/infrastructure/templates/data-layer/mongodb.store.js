const { MongoClient, ObjectId } = require('mongodb');
const model = require('./data/model');
const migrations = require('./data/migrations');
const { HttpError, withRetry, split, viewOf, toRecord, tableFor } = require('./data/store-support');
const rules = require('./data/rules-engine');

const OPTIONS = { idKind: 'objectid' };
const FIELD = /^[^.$][^.]*$/;

class RecordStore {
  constructor() {
    this.client = new MongoClient(process.env.DATABASE_URL || 'mongodb://database:27017');
    this.db = this.client.db(process.env.DB_NAME || 'app');
    // Colecciones que declaran una referencia obligatoria hacia otra: [{ collection, column, target }]
    this.inbound = Object.entries(model.tables).flatMap(([collection, table]) =>
      (table.references || []).map((reference) => ({ collection, column: reference.column, target: reference.table })));
  }

  init() {
    return withRetry(() => this._migrate());
  }

  async _migrate() {
    await this.client.connect();
    const applied = new Set((await this.db.collection('schema_migrations').find().toArray()).map((item) => item._id));
    const existing = new Set((await this.db.listCollections().toArray()).map((item) => item.name));
    for (const migration of migrations) {
      if (applied.has(migration.id)) continue;
      for (const collection of migration.collections) if (!existing.has(collection)) await this.db.createCollection(collection);
      for (const index of migration.indexes) await this.db.collection(index.collection).createIndex(index.keys, index.options || {});
      await this.db.collection('schema_migrations').updateOne({ _id: migration.id }, { $setOnInsert: { applied_at: new Date() } }, { upsert: true });
    }
  }

  async ping() {
    await this.db.command({ ping: 1 });
  }

  async list(operation) {
    const { name, table } = tableFor(model, operation);
    const rows = await this.db.collection(name).find(table.generic ? { capability: operation } : {}).sort({ _id: 1 }).toArray();
    return rows.map((row) => toRecord(table, operation, row));
  }

  async create(operation, body) {
    const { name, table } = tableFor(model, operation);
    const { values, extra } = split(table, rules.prepare(name, body), OPTIONS);
    this._checkExtra(extra);
    rules.check(name, 'create', viewOf(table, values, extra), null);
    await this._checkReferences(table, values);
    const now = new Date();
    const document = { ...(table.generic ? { capability: operation } : {}), ...this._stored(table, values), extra, created_at: now, updated_at: now };
    const result = await this._write(() => this.db.collection(name).insertOne(document));
    return toRecord(table, operation, { ...document, _id: result.insertedId });
  }

  async update(operation, id, body) {
    const { name, table } = tableFor(model, operation);
    if (!ObjectId.isValid(id)) return null;
    const filter = { _id: new ObjectId(id), ...(table.generic ? { capability: operation } : {}) };
    const current = await this.db.collection(name).findOne(filter);
    if (!current) return null;
    const previous = toRecord(table, operation, current).data;
    const { values, extra } = split(table, body, OPTIONS);
    this._checkExtra(extra);
    rules.check(name, 'update', { ...previous, ...viewOf(table, values, extra) }, previous);
    await this._checkReferences(table, values);
    const set = { ...this._stored(table, values), updated_at: new Date() };
    for (const [key, value] of Object.entries(extra)) set[`extra.${key}`] = value;
    const updated = await this._write(() => this.db.collection(name).findOneAndUpdate(filter, { $set: set }, { returnDocument: 'after' }));
    const row = updated && updated.value !== undefined ? updated.value : updated;
    return row ? toRecord(table, operation, row) : null;
  }

  async remove(operation, id) {
    const { name } = tableFor(model, operation);
    if (!ObjectId.isValid(id)) return false;
    for (const reference of this.inbound.filter((item) => item.target === name)) {
      if (await this.db.collection(reference.collection).countDocuments({ [reference.column]: new ObjectId(id) }, { limit: 1 })) {
        throw new HttpError(409, 'El registro es referenciado por otros registros.');
      }
    }
    const result = await this.db.collection(name).deleteOne({ _id: new ObjectId(id) });
    return result.deletedCount > 0;
  }

  // --- Usuarios del sistema (autenticación) ---
  _user(document) {
    if (!document) return null;
    const { _id, ...rest } = document;
    return { ...rest, id: String(_id) };
  }

  async findUserByEmail(email) {
    return this._user(await this.db.collection('icase_users').findOne({ email }));
  }

  async findUserById(id) {
    if (!ObjectId.isValid(id)) return null;
    return this._user(await this.db.collection('icase_users').findOne({ _id: new ObjectId(id) }));
  }

  async listUsers() {
    return (await this.db.collection('icase_users').find().sort({ _id: 1 }).toArray()).map((document) => this._user(document));
  }

  async createUser(user) {
    const now = new Date();
    const document = { email: user.email, nombre: user.nombre || '', rol: user.rol, activo: user.activo !== false, password_hash: user.password_hash, created_at: now, updated_at: now };
    const result = await this._write(() => this.db.collection('icase_users').insertOne(document));
    return this._user({ ...document, _id: result.insertedId });
  }

  async updateUser(id, patch) {
    if (!ObjectId.isValid(id)) return null;
    const set = Object.fromEntries(Object.entries(patch).filter(([key]) => ['email', 'nombre', 'rol', 'activo', 'password_hash'].includes(key)));
    await this._write(() => this.db.collection('icase_users').updateOne({ _id: new ObjectId(id) }, { $set: { ...set, updated_at: new Date() } }));
    return this.findUserById(id);
  }

  async removeUser(id) {
    if (!ObjectId.isValid(id)) return false;
    return (await this.db.collection('icase_users').deleteOne({ _id: new ObjectId(id) })).deletedCount > 0;
  }

  async _write(operation) {
    try { return await operation(); } catch (error) {
      if (error && error.code === 11000) throw new HttpError(409, 'Ya existe un registro con esos valores.');
      throw error;
    }
  }

  _stored(table, values) {
    const ids = new Set(table.columns.filter((column) => column.type === 'id').map((column) => column.column));
    return Object.fromEntries(Object.entries(values).map(([column, value]) => [column, ids.has(column) && value !== null ? new ObjectId(value) : value]));
  }

  _checkExtra(extra) {
    for (const key of Object.keys(extra)) if (!FIELD.test(key)) throw new HttpError(400, `El nombre de campo "${key}" no es válido.`);
  }

  /** Equivale a la restricción de clave foránea de las bases relacionales. */
  async _checkReferences(table, values) {
    for (const reference of table.references || []) {
      const value = values[reference.column];
      if (value === undefined || value === null) continue;
      if (!(await this.db.collection(reference.table).countDocuments({ _id: new ObjectId(value) }, { limit: 1 }))) {
        throw new HttpError(409, 'El registro referencia un dato inexistente.');
      }
    }
  }
}

module.exports = RecordStore;
