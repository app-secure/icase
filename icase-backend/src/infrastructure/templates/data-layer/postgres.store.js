const { Pool, types } = require('pg');
const model = require('./data/model');
const migrations = require('./data/migrations');
const { HttpError, withRetry, split, viewOf, toRecord, tableFor } = require('./data/store-support');
const rules = require('./data/rules-engine');

types.setTypeParser(1082, (value) => value); // DATE como texto AAAA-MM-DD, sin desplazamiento de zona horaria

const LOCK = 727274;
const quote = (name) => `"${String(name).replace(/"/g, '""')}"`;

function translate(error) {
  if (error instanceof HttpError) return error;
  if (error && error.code === '23503') return new HttpError(409, 'El registro referencia un dato inexistente o es referenciado por otros registros.');
  if (error && error.code === '23505') return new HttpError(409, 'Ya existe un registro con esos valores.');
  if (error && ['22P02', '22003', '22007', '22008', '22001'].includes(error.code)) return new HttpError(400, 'Algún valor no tiene un formato válido.');
  return error;
}

class RecordStore {
  constructor() {
    this.pool = new Pool({ connectionString: process.env.DATABASE_URL });
  }

  init() {
    return withRetry(() => this._migrate());
  }

  async _migrate() {
    const client = await this.pool.connect();
    try {
      await client.query('SELECT pg_advisory_lock($1)', [LOCK]);
      await client.query('CREATE TABLE IF NOT EXISTS schema_migrations (id TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())');
      const applied = new Set((await client.query('SELECT id FROM schema_migrations')).rows.map((row) => row.id));
      for (const migration of migrations) {
        if (applied.has(migration.id)) continue;
        await client.query('BEGIN');
        try {
          for (const statement of migration.statements) await client.query(statement);
          await client.query('INSERT INTO schema_migrations (id) VALUES ($1)', [migration.id]);
          await client.query('COMMIT');
        } catch (error) {
          await client.query('ROLLBACK');
          throw error;
        }
      }
    } finally {
      try { await client.query('SELECT pg_advisory_unlock($1)', [LOCK]); } catch { /* la conexión se libera igualmente */ }
      client.release();
    }
  }

  async ping() {
    await this.pool.query('SELECT 1');
  }

  async list(operation) {
    const { name, table } = tableFor(model, operation);
    try {
      const result = table.generic
        ? await this.pool.query(`SELECT * FROM ${quote(name)} WHERE capability = $1 ORDER BY id`, [operation])
        : await this.pool.query(`SELECT * FROM ${quote(name)} ORDER BY id`);
      return result.rows.map((row) => toRecord(table, operation, row));
    } catch (error) { throw translate(error); }
  }

  async create(operation, body) {
    const { name, table } = tableFor(model, operation);
    const { values, extra } = split(table, rules.prepare(name, body));
    rules.check(name, 'create', viewOf(table, values, extra), null);
    if (table.generic) values.capability = operation;
    const columns = Object.keys(values);
    const params = columns.map((column) => this._param(table, column, values[column]));
    const marks = columns.map((_column, index) => `$${index + 1}${this._cast(table, columns[index])}`);
    try {
      const result = await this.pool.query(
        `INSERT INTO ${quote(name)} (${[...columns, 'extra'].map(quote).join(', ')}) VALUES (${[...marks, `$${columns.length + 1}::jsonb`].join(', ')}) RETURNING *`,
        [...params, JSON.stringify(extra)]
      );
      return toRecord(table, operation, result.rows[0]);
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
    const params = columns.map((column) => this._param(table, column, values[column]));
    const sets = columns.map((column, index) => `${quote(column)} = $${index + 1}${this._cast(table, column)}`);
    sets.push(`extra = extra || $${columns.length + 1}::jsonb`, 'updated_at = now()');
    params.push(JSON.stringify(extra), id);
    let sql = `UPDATE ${quote(name)} SET ${sets.join(', ')} WHERE id = $${params.length}`;
    if (table.generic) { params.push(operation); sql += ` AND capability = $${params.length}`; }
    try {
      const result = await this.pool.query(`${sql} RETURNING *`, params);
      return result.rows[0] ? toRecord(table, operation, result.rows[0]) : null;
    } catch (error) { throw translate(error); }
  }

  async remove(operation, id) {
    const { name, table } = tableFor(model, operation);
    if (!/^\d{1,18}$/.test(String(id))) return false;
    try {
      const result = table.generic
        ? await this.pool.query(`DELETE FROM ${quote(name)} WHERE id = $1 AND capability = $2`, [id, operation])
        : await this.pool.query(`DELETE FROM ${quote(name)} WHERE id = $1`, [id]);
      return result.rowCount > 0;
    } catch (error) { throw translate(error); }
  }

  // --- Usuarios del sistema (autenticación) ---
  _user(row) { return row ? { ...row, id: String(row.id) } : null; }

  async findUserByEmail(email) {
    return this._user((await this.pool.query('SELECT * FROM icase_users WHERE email = $1', [email])).rows[0]);
  }

  async findUserById(id) {
    if (!/^\d{1,18}$/.test(String(id))) return null;
    return this._user((await this.pool.query('SELECT * FROM icase_users WHERE id = $1', [id])).rows[0]);
  }

  async listUsers() {
    return (await this.pool.query('SELECT * FROM icase_users ORDER BY id')).rows.map((row) => this._user(row));
  }

  async createUser(user) {
    try {
      const result = await this.pool.query(
        'INSERT INTO icase_users (email, nombre, rol, activo, password_hash) VALUES ($1, $2, $3, $4, $5) RETURNING *',
        [user.email, user.nombre || '', user.rol, user.activo !== false, user.password_hash]
      );
      return this._user(result.rows[0]);
    } catch (error) { throw translate(error); }
  }

  async updateUser(id, patch) {
    const fields = Object.keys(patch).filter((key) => ['email', 'nombre', 'rol', 'activo', 'password_hash'].includes(key));
    if (!fields.length) return this.findUserById(id);
    try {
      const result = await this.pool.query(
        `UPDATE icase_users SET ${fields.map((field, index) => `${field} = $${index + 1}`).join(', ')}, updated_at = now() WHERE id = $${fields.length + 1} RETURNING *`,
        [...fields.map((field) => patch[field]), id]
      );
      return this._user(result.rows[0]);
    } catch (error) { throw translate(error); }
  }

  async removeUser(id) {
    if (!/^\d{1,18}$/.test(String(id))) return false;
    return (await this.pool.query('DELETE FROM icase_users WHERE id = $1', [id])).rowCount > 0;
  }

  async _row(name, table, operation, id) {
    if (!/^\d{1,18}$/.test(String(id))) return null;
    try {
      const result = table.generic
        ? await this.pool.query(`SELECT * FROM ${quote(name)} WHERE id = $1 AND capability = $2`, [id, operation])
        : await this.pool.query(`SELECT * FROM ${quote(name)} WHERE id = $1`, [id]);
      return result.rows[0] || null;
    } catch (error) { throw translate(error); }
  }

  _column(table, column) { return table.columns.find((item) => item.column === column); }
  _cast(table, column) { return this._column(table, column)?.type === 'json' ? '::jsonb' : ''; }
  _param(table, column, value) { return this._column(table, column)?.type === 'json' && value !== null ? JSON.stringify(value) : value; }
}

module.exports = RecordStore;
