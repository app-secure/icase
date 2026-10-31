// Almacén en memoria con la misma interfaz que los almacenes generados.
// Se copia como `src/record.store.js` de un backend generado para probarlo sin base de datos.
const { HttpError, split, viewOf, toRecord, tableFor } = require('./data/store-support');
const model = require('./data/model');
const rules = require('./data/rules-engine');

class RecordStore {
  constructor() {
    this.rows = {};
    this.sequence = 1;
    this.users = [];
  }

  async init() {}
  async ping() {}

  _rows(name) { return (this.rows[name] = this.rows[name] || []); }

  _duplicated(table, name, values, ownId) {
    return (table.unique || []).some((unique) => this._rows(name).some((row) => row.id !== ownId
      && unique.columns.every((column) => values[column] !== undefined && values[column] !== null && JSON.stringify(row[column]) === JSON.stringify(values[column]))));
  }

  _dangling(table, values) {
    return (table.references || []).some((ref) => values[ref.column] != null && !this._rows(ref.table).some((row) => String(row.id) === String(values[ref.column])));
  }

  async list(operation) {
    const { name, table } = tableFor(model, operation);
    return this._rows(name).filter((row) => !table.generic || row.capability === operation).map((row) => toRecord(table, operation, row));
  }

  async create(operation, body) {
    const { name, table } = tableFor(model, operation);
    const { values, extra } = split(table, rules.prepare(name, body));
    rules.check(name, 'create', viewOf(table, values, extra), null);
    if (this._duplicated(table, name, values)) throw new HttpError(409, 'Ya existe un registro con esos valores.');
    if (this._dangling(table, values)) throw new HttpError(409, 'El registro referencia un dato inexistente.');
    const row = { id: this.sequence++, ...(table.generic ? { capability: operation } : {}), ...values, extra, created_at: new Date(), updated_at: new Date() };
    this._rows(name).push(row);
    return toRecord(table, operation, row);
  }

  async update(operation, id, body) {
    const { name, table } = tableFor(model, operation);
    const row = this._rows(name).find((item) => String(item.id) === String(id) && (!table.generic || item.capability === operation));
    if (!row) return null;
    const previous = toRecord(table, operation, row).data;
    const { values, extra } = split(table, body);
    rules.check(name, 'update', { ...previous, ...viewOf(table, values, extra) }, previous);
    if (this._duplicated(table, name, values, row.id)) throw new HttpError(409, 'Ya existe un registro con esos valores.');
    Object.assign(row, values, { extra: { ...row.extra, ...extra }, updated_at: new Date() });
    return toRecord(table, operation, row);
  }

  async remove(operation, id) {
    const { name, table } = tableFor(model, operation);
    const list = this._rows(name);
    const row = list.find((item) => String(item.id) === String(id) && (!table.generic || item.capability === operation));
    if (!row) return false;
    const referenced = Object.entries(model.tables).some(([other, definition]) => (definition.references || []).some((ref) => ref.table === name
      && this._rows(other).some((child) => String(child[ref.column]) === String(row.id))));
    if (referenced) throw new HttpError(409, 'El registro es referenciado por otros registros.');
    list.splice(list.indexOf(row), 1);
    return true;
  }

  async findUserByEmail(email) { return this.users.find((user) => user.email === email) || null; }
  async findUserById(id) { return this.users.find((user) => String(user.id) === String(id)) || null; }
  async listUsers() { return [...this.users]; }

  async createUser(user) {
    if (this.users.some((item) => item.email === user.email)) throw new HttpError(409, 'Ya existe un registro con esos valores.');
    const created = { activo: true, ...user, id: String(this.sequence++), created_at: new Date() };
    this.users.push(created);
    return { ...created };
  }

  async updateUser(id, patch) {
    const user = await this.findUserById(id);
    if (patch.email && this.users.some((item) => item.email === patch.email && item !== user)) throw new HttpError(409, 'Ya existe un registro con esos valores.');
    return user ? Object.assign(user, patch) : null;
  }

  async removeUser(id) {
    const user = await this.findUserById(id);
    if (!user) return false;
    this.users.splice(this.users.indexOf(user), 1);
    return true;
  }
}

module.exports = RecordStore;
