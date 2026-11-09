const { MongoClient, ObjectId } = require('mongodb');
const model = require('./data/model');
const migrations = require('./data/migrations');
const { HttpError, withRetry, split, viewOf, toRecord, tableFor, publicColumns, ownerWhere, assignOwner } = require('./data/store-support');
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
      if (migration.collections) {
        for (const collection of migration.collections) if (!existing.has(collection)) await this.db.createCollection(collection);
      }
      if (migration.indexes) {
        for (const index of migration.indexes) await this.db.collection(index.collection).createIndex(index.keys, index.options || {});
      }
      if (migration.seeds) {
        for (const seed of migration.seeds) {
          const count = await this.db.collection(seed.collection).countDocuments({});
          if (count === 0 && seed.documents && seed.documents.length) {
            const docs = seed.documents.map((d) => ({
              ...d,
              _id: new ObjectId(d._id),
              created_at: new Date(d.created_at),
              updated_at: new Date(d.updated_at)
            }));
            await this.db.collection(seed.collection).insertMany(docs);
          }
        }
      }
      await this.db.collection('schema_migrations').updateOne({ _id: migration.id }, { $setOnInsert: { applied_at: new Date() } }, { upsert: true });
    }
  }

  async ping() {
    await this.db.command({ ping: 1 });
  }

  async list(operation, query = {}, scope = null) {
    const { name, table } = tableFor(model, operation);
    const hasPaging = query && (query.page !== undefined || query.limit !== undefined || query.search !== undefined || query.envelope === 'true');
    const page = Math.max(1, parseInt(query?.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(query?.limit, 10) || 20));
    const offset = (page - 1) * limit;

    const filter = {};
    if (table.generic) filter.capability = operation;
    this._applyOwnerFilter(filter, table, scope);

    if (query && typeof query === 'object') {
      for (const column of publicColumns(table)) {
        if (query[column.name] !== undefined && query[column.name] !== '') {
          filter[column.column] = column.type === 'id' && ObjectId.isValid(query[column.name])
            ? new ObjectId(query[column.name])
            : query[column.name];
        }
      }
      if (query.search && typeof query.search === 'string' && query.search.trim()) {
        const regex = new RegExp(query.search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
        const orClauses = publicColumns(table)
          .filter((col) => ['string', 'uuid'].includes(col.type))
          .map((col) => ({ [col.column]: regex }));
        for (const col of publicColumns(table).filter((col) => ['date', 'datetime'].includes(col.type))) {
          orClauses.push({
            $expr: {
              $regexMatch: {
                input: { $dateToString: { date: `$${col.column}`, onError: '', onNull: '' } },
                regex: query.search.trim(),
                options: 'i'
              }
            }
          });
        }
        orClauses.push({ extra: regex });
        if (filter.$or) filter.$and = [{ $or: filter.$or }, { $or: orClauses }];
        else filter.$or = orClauses;
      }
    }

    if (!hasPaging) {
      const rows = await this.db.collection(name).find(filter).sort({ _id: 1 }).toArray();
      return rows.map((row) => toRecord(table, operation, row));
    }

    const total = await this.db.collection(name).countDocuments(filter);
    const rows = await this.db.collection(name).find(filter).sort({ _id: 1 }).skip(offset).limit(limit).toArray();
    const records = rows.map((row) => toRecord(table, operation, row));
    return {
      data: records,
      pagination: { page, limit, total, total_pages: Math.max(1, Math.ceil(total / limit)) }
    };
  }

  async create(operation, body, scope = null) {
    const { name, table } = tableFor(model, operation);
    const { values, extra } = split(table, rules.prepare(name, body), OPTIONS);
    assignOwner(table, values, extra, scope);
    this._checkExtra(extra);
    rules.check(name, 'create', viewOf(table, values, extra), null);
    await this._checkReferences(table, values);
    await this._assertOwnedReferences(table, values, scope);
    const now = new Date();
    const document = { ...(table.generic ? { capability: operation } : {}), ...this._stored(table, values), extra, created_at: now, updated_at: now };
    const result = await this._write(() => this.db.collection(name).insertOne(document));
    return toRecord(table, operation, { ...document, _id: result.insertedId });
  }

  async getRecord(operation,id,scope=null) {
    const {name,table}=tableFor(model,operation);
    if (!/^[a-f0-9]{24}$/i.test(String(id))) return null;
    const filter={_id:new ObjectId(id),...(table.generic?{capability:operation}:{})};
    this._applyOwnerFilter(filter,table,scope);
    const row=await this.db.collection(name).findOne(filter);
    return row ? toRecord(table,operation,row) : null;
  }

  async replacePassword(id,previous,password_hash) {
    const result=await this.db.collection('icase_users').updateOne({_id:new ObjectId(id),password_hash:previous,activo:true},{$set:{password_hash,updated_at:new Date()}});
    return result.modifiedCount===1;
  }

  async update(operation, id, body, scope = null) {
    const { name, table } = tableFor(model, operation);
    if (!ObjectId.isValid(id)) return null;
    const filter = { _id: new ObjectId(id), ...(table.generic ? { capability: operation } : {}) };
    this._applyOwnerFilter(filter, table, scope);
    const current = await this.db.collection(name).findOne(filter);
    if (!current) return null;
    const previous = toRecord(table, operation, current).data;
    const { values, extra } = split(table, rules.derive(name,body,previous), OPTIONS);
    assignOwner(table, values, extra, null);
    this._checkExtra(extra);
    rules.check(name, 'update', { ...previous, ...viewOf(table, values, extra) }, previous);
    await this._checkReferences(table, values);
    await this._assertOwnedReferences(table, values, scope);
    const set = { ...this._stored(table, values), updated_at: new Date() };
    for (const [key, value] of Object.entries(extra)) set[`extra.${key}`] = value;
    const updated = await this._write(() => this.db.collection(name).findOneAndUpdate(filter, { $set: set }, { returnDocument: 'after' }));
    const row = updated && updated.value !== undefined ? updated.value : updated;
    return row ? toRecord(table, operation, row) : null;
  }

  async remove(operation, id, scope = null) {
    const { name, table } = tableFor(model, operation);
    if (!ObjectId.isValid(id)) return false;
    const filter = { _id: new ObjectId(id) };
    this._applyOwnerFilter(filter, table, scope);
    if (scope?.ownerId && !(await this.db.collection(name).findOne(filter))) return false;
    const endpoint = (model.associations || []).some((relation) => model.tables[relation.table].columns.some((column) => column.references === name));
    if (endpoint) return require('./data/mongo-associations').remove(this, name, id);
    for (const reference of this.inbound.filter((item) => item.target === name)) {
      if (await this.db.collection(reference.collection).countDocuments({ [reference.column]: new ObjectId(id) }, { limit: 1 })) {
        throw new HttpError(409, 'El registro es referenciado por otros registros.');
      }
    }
    const result = await this.db.collection(name).deleteOne(filter);
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

  _applyOwnerFilter(filter, table, scope) {
    const owner = ownerWhere(table, scope);
    if (!owner) return;
    filter.owner_id = ObjectId.isValid(owner) ? new ObjectId(owner) : owner;
  }

  async _assertOwnedReferences(table, values, scope) {
    const owner = ownerWhere(table, scope);
    if (!owner) return;
    for (const reference of table.references || []) {
      const id = values[reference.column];
      if (id == null) continue;
      const target = model.tables[reference.table];
      if (!target || !target.columns.some((column) => column.column === 'owner_id')) throw new HttpError(409, 'El registro referencia un dato ajeno.');
      const row = await this.db.collection(reference.table).findOne({ _id: new ObjectId(id) });
      if (!row || row.owner_id == null || String(row.owner_id) !== owner) throw new HttpError(409, 'El registro referencia un dato ajeno.');
    }
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
