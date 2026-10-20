const mysql = require('mysql2/promise');
const model = require('./data/model');
const migrations = require('./data/migrations');
const { HttpError, withRetry, split, viewOf, toRecord, tableFor } = require('./data/store-support');
const rules = require('./data/rules-engine');

const LOCK = 'icase_migrations';
const quote = (name) => `\`${String(name).replace(/`/g, '``')}\``;

function translate(error) {
  if (error instanceof HttpError) return error;
  if (error && [1451, 1452].includes(error.errno)) return new HttpError(409, 'El registro referencia un dato inexistente o es referenciado por otros registros.');
  if (error && error.errno === 1062) return new HttpError(409, 'Ya existe un registro con esos valores.');
  if (error && [1264, 1292, 1366, 1406, 1411].includes(error.errno)) return new HttpError(400, 'Algún valor no tiene un formato válido.');
  return error;
}

class RecordStore {
  constructor() {
    this.pool = mysql.createPool({ uri: process.env.DATABASE_URL || '', timezone: 'Z', dateStrings: ['DATE'] });
    this.pool.pool.on('connection', (connection) => connection.query("SET time_zone = '+00:00'"));
  }

  init() {
    return withRetry(() => this._migrate());
  }

  async _migrate() {
    const connection = await this.pool.getConnection();
    try {
      await connection.query('SELECT GET_LOCK(?, 60)', [LOCK]);
      await connection.query('CREATE TABLE IF NOT EXISTS schema_migrations (id VARCHAR(191) PRIMARY KEY, applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP)');
      const [rows] = await connection.query('SELECT id FROM schema_migrations');
      const applied = new Set(rows.map((row) => row.id));
      for (const migration of migrations) {
        if (applied.has(migration.id)) continue;
        // MySQL confirma implícitamente las sentencias DDL: la migración se aplica en orden, sin transacción.
        for (const statement of migration.statements) await connection.query(statement);
        await connection.query('INSERT INTO schema_migrations (id) VALUES (?)', [migration.id]);
      }
    } finally {
      try { await connection.query('SELECT RELEASE_LOCK(?)', [LOCK]); } catch { /* la conexión se libera igualmente */ }
      connection.release();
    }
  }

  async ping() {
    await this.pool.query('SELECT 1');
  }

  async list(operation) {
    const { name, table } = tableFor(model, operation);
    try {
      const [rows] = table.generic
        ? await this.pool.query(`SELECT * FROM ${quote(name)} WHERE capability = ? ORDER BY id`, [operation])
        : await this.pool.query(`SELECT * FROM ${quote(name)} ORDER BY id`);
      return rows.map((row) => toRecord(table, operation, row));
    } catch (error) { throw translate(error); }
  }

  async create(operation, body) {
    const { name, table } = tableFor(model, operation);
    const { values, extra } = split(table, rules.prepare(name, body));
    rules.check(name, 'create', viewOf(table, values, extra), null);
    if (table.generic) values.capability = operation;
    const columns = Object.keys(values);
    try {
      const [result] = await this.pool.query(
        `INSERT INTO ${quote(name)} (${[...columns, 'extra'].map(quote).join(', ')}) VALUES (${[...columns, 'extra'].map(() => '?').join(', ')})`,
        [...columns.map((column) => this._param(table, column, values[column])), JSON.stringify(extra)]
      );
      return this._find(name, table, operation, result.insertId);
    } catch (error) { throw translate(error); }
  }

  async update(operation, id, body) {
    const { name, table } = tableFor(model, operation);
    const row = await this._row(name, table, operation, id);
    if (!row) return null;
    const previous = toRecord(table, operation, row).data;
    const { values, extra } = split(table, body);
    rules.check(name, 'update', { ...previous, ...viewOf(table, values, extra) }, previous);
    const columns = Object.keys(values);
    const sets = [...columns.map((column) => `${quote(column)} = ?`), 'extra = JSON_MERGE_PATCH(extra, ?)'];
    const params = [...columns.map((column) => this._param(table, column, values[column])), JSON.stringify(extra), id];
    let sql = `UPDATE ${quote(name)} SET ${sets.join(', ')} WHERE id = ?`;
    if (table.generic) { params.push(operation); sql += ' AND capability = ?'; }
    try {
      const [result] = await this.pool.query(sql, params);
      return result.affectedRows ? this._find(name, table, operation, id) : null;
    } catch (error) { throw translate(error); }
  }

  async remove(operation, id) {
    const { name, table } = tableFor(model, operation);
    if (!/^\d{1,18}$/.test(String(id))) return false;
    try {
      const [result] = table.generic
        ? await this.pool.query(`DELETE FROM ${quote(name)} WHERE id = ? AND capability = ?`, [id, operation])
        : await this.pool.query(`DELETE FROM ${quote(name)} WHERE id = ?`, [id]);
      return result.affectedRows > 0;
    } catch (error) { throw translate(error); }
  }

  // --- Usuarios del sistema (autenticación) ---
  _user(row) { return row ? { ...row, id: String(row.id), activo: Boolean(row.activo) } : null; }

  async findUserByEmail(email) {
    const [rows] = await this.pool.query('SELECT * FROM icase_users WHERE email = ?', [email]);
    return this._user(rows[0]);
  }

  async findUserById(id) {
    if (!/^\d{1,18}$/.test(String(id))) return null;
    const [rows] = await this.pool.query('SELECT * FROM icase_users WHERE id = ?', [id]);
    return this._user(rows[0]);
  }

  async listUsers() {
    const [rows] = await this.pool.query('SELECT * FROM icase_users ORDER BY id');
    return rows.map((row) => this._user(row));
  }

  async createUser(user) {
    try {
      const [result] = await this.pool.query(
        'INSERT INTO icase_users (email, nombre, rol, activo, password_hash) VALUES (?, ?, ?, ?, ?)',
        [user.email, user.nombre || '', user.rol, user.activo !== false, user.password_hash]
      );
      return this.findUserById(result.insertId);
    } catch (error) { throw translate(error); }
  }

  async updateUser(id, patch) {
    const fields = Object.keys(patch).filter((key) => ['email', 'nombre', 'rol', 'activo', 'password_hash'].includes(key));
    try {
      if (fields.length) await this.pool.query(`UPDATE icase_users SET ${fields.map((field) => `${field} = ?`).join(', ')} WHERE id = ?`, [...fields.map((field) => patch[field]), id]);
      return this.findUserById(id);
    } catch (error) { throw translate(error); }
  }

  async removeUser(id) {
    if (!/^\d{1,18}$/.test(String(id))) return false;
    const [result] = await this.pool.query('DELETE FROM icase_users WHERE id = ?', [id]);
    return result.affectedRows > 0;
  }

  async _row(name, table, operation, id) {
    if (!/^\d{1,18}$/.test(String(id))) return null;
    try {
      const [rows] = table.generic
        ? await this.pool.query(`SELECT * FROM ${quote(name)} WHERE id = ? AND capability = ?`, [id, operation])
        : await this.pool.query(`SELECT * FROM ${quote(name)} WHERE id = ?`, [id]);
      return rows[0] || null;
    } catch (error) { throw translate(error); }
  }

  async _find(name, table, operation, id) {
    const row = await this._row(name, table, operation, id);
    return row ? toRecord(table, operation, row) : null;
  }

  _param(table, column, value) {
    return table.columns.find((item) => item.column === column)?.type === 'json' && value !== null ? JSON.stringify(value) : value;
  }
}

module.exports = RecordStore;
