const fs = require('node:fs');
const path = require('node:path');

const TEMPLATES = path.join(__dirname, '..', 'templates', 'data-layer');
const MIGRATION_ID = '0001_init';
const AUTH_MIGRATION_ID = '0002_auth';
const GENERIC_TABLE = 'icase_records';
const RESERVED_TABLES = ['icase_users', 'schema_migrations'];
const SYSTEM_COLUMNS = new Set(['id', 'extra', 'created_at', 'updated_at', 'capability']);

const identifier = (value, fallback) => {
  const text = String(value || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 48);
  return !text ? fallback : /^\d/.test(text) ? `t_${text}` : text;
};

const SQL_TYPES = {
  postgres: { string: 'TEXT', integer: 'BIGINT', number: 'DOUBLE PRECISION', boolean: 'BOOLEAN', datetime: 'TIMESTAMPTZ', date: 'DATE', time: 'TIME', uuid: 'UUID', json: 'JSONB', id: 'BIGINT' },
  mysql: { string: 'TEXT', integer: 'BIGINT', number: 'DOUBLE', boolean: 'TINYINT(1)', datetime: 'DATETIME(3)', date: 'DATE', time: 'TIME', uuid: 'CHAR(36)', json: 'JSON', id: 'BIGINT' }
};

class BackendDataLayerGenerator {
  /**
   * Deriva el modelo físico (una tabla o colección por entidad) y sus migraciones desde el contrato.
   * Las operaciones sin entidad usan la tabla genérica `icase_records`.
   */
  build({ contract, database, policy = null }) {
    const model = this._model(contract, database);
    const rules = this._rules(contract.rules || [], model);
    this._applyUniques(model, contract.rules || []);
    const migration = database === 'mongodb' ? this._mongoMigration(model) : this._sqlMigration(model, database);
    const migrations = [migration, ...(policy && policy.habilitada ? [this._authMigration(database)] : [])];
    return { model, rules, migration, migrations, files: this._files(model, rules, migrations, database) };
  }

  _model(contract, database) {
    const reachable = new Set(contract.operations.map((operation) => operation.entity).filter(Boolean));
    const tables = {};
    const byEntity = new Map();
    const taken = new Set([GENERIC_TABLE, ...RESERVED_TABLES]);
    for (const entity of contract.entities || []) {
      let name = identifier(entity.name, 'entidad');
      while (taken.has(name)) name += '_t';
      taken.add(name);
      byEntity.set(entity.name, name);
      byEntity.set(entity.key, name);
    }
    for (const entity of contract.entities || []) {
      const name = byEntity.get(entity.name);
      const used = new Set(SYSTEM_COLUMNS);
      const columns = [];
      for (const [property, schema] of Object.entries(entity.schema?.properties || {})) {
        if (property === 'id') continue;
        let column = identifier(property, 'campo');
        while (used.has(column)) column += '_campo';
        used.add(column);
        const target = schema['x-references'];
        if (target) {
          const targetTable = byEntity.get(target);
          columns.push({ name: property, column, type: 'id', references: targetTable, enforced: reachable.has(this._key(contract, target)) });
        } else {
          columns.push({ name: property, column, type: this._type(schema), ...(schema.enum ? { enum: schema.enum } : {}) });
        }
      }
      tables[name] = {
        entity: entity.name,
        columns,
        references: columns.filter((column) => column.references && column.enforced).map(({ column, references }) => ({ column, table: references }))
      };
    }
    const operations = {};
    for (const operation of contract.operations) {
      const entity = (contract.entities || []).find((item) => item.key === operation.entity);
      operations[operation.key] = entity ? byEntity.get(entity.name) : GENERIC_TABLE;
    }
    if (Object.values(operations).includes(GENERIC_TABLE)) tables[GENERIC_TABLE] = { entity: null, generic: true, columns: [], references: [] };
    return { database, tables, operations };
  }

  /** Reglas confirmadas por tabla, sin metadatos de revisión: es lo único que el motor del backend necesita. */
  _rules(confirmed, model) {
    const tableOf = new Map(Object.entries(model.tables).filter(([, table]) => table.entity).map(([name, table]) => [table.entity, name]));
    const result = {};
    for (const rule of confirmed) {
      const table = tableOf.get(rule.entidad);
      if (!table) continue;
      const { entidad, estado_decision, origen, evidencia, evidencia_literal, justificacion, estados, tipo, ...rest } = rule;
      (result[table] = result[table] || []).push({ tipo, ...rest });
    }
    return result;
  }

  /** Las reglas de unicidad se garantizan en la base de datos, no en memoria. */
  _applyUniques(model, confirmed) {
    for (const rule of confirmed.filter((item) => item.tipo === 'unico')) {
      const [, table] = Object.entries(model.tables).find(([, candidate]) => candidate.entity === rule.entidad) || [];
      if (!table) continue;
      const columns = rule.campos.map((field) => table.columns.find((column) => column.name === field)).filter(Boolean);
      if (columns.length !== rule.campos.length) continue;
      columns.forEach((column) => { column.unique = true; });
      table.unique = [...(table.unique || []), { rule: rule.id, columns: columns.map((column) => column.column), types: columns.map((column) => column.type) }];
    }
  }

  _key(contract, entityName) {
    return (contract.entities || []).find((item) => item.name === entityName)?.key;
  }

  _type(schema) {
    if (schema.type === 'integer') return 'integer';
    if (schema.type === 'number') return 'number';
    if (schema.type === 'boolean') return 'boolean';
    if (schema.type === 'array') return 'json';
    if (schema.format === 'date-time') return 'datetime';
    if (schema.format === 'date') return 'date';
    if (schema.format === 'time') return 'time';
    if (schema.format === 'uuid') return 'uuid';
    return 'string';
  }

  _sqlMigration(model, database) {
    const pg = database === 'postgres';
    const q = (name) => (pg ? `"${name}"` : `\`${name}\``);
    const types = SQL_TYPES[database];
    const statements = [];
    const constraints = [];
    for (const [name, table] of Object.entries(model.tables)) {
      const columns = [
        pg ? `${q('id')} BIGSERIAL PRIMARY KEY` : `${q('id')} BIGINT AUTO_INCREMENT PRIMARY KEY`,
        ...(table.generic ? [`${q('capability')} ${pg ? 'TEXT' : 'VARCHAR(191)'} NOT NULL`] : []),
        ...table.columns.map((column) => `${q(column.column)} ${!pg && column.unique && column.type === 'string' ? 'VARCHAR(255)' : types[column.type]}`),
        pg ? `${q('extra')} JSONB NOT NULL DEFAULT '{}'::jsonb` : `${q('extra')} JSON NOT NULL`,
        pg ? `${q('created_at')} TIMESTAMPTZ NOT NULL DEFAULT now()` : `${q('created_at')} DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)`,
        pg ? `${q('updated_at')} TIMESTAMPTZ NOT NULL DEFAULT now()` : `${q('updated_at')} DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)`
      ];
      statements.push(`CREATE TABLE IF NOT EXISTS ${q(name)} (\n  ${columns.join(',\n  ')}\n)`);
      if (table.generic) statements.push(`CREATE INDEX ${pg ? 'IF NOT EXISTS ' : ''}${q(`idx_${name}_capability`)} ON ${q(name)} (${q('capability')})`);
      for (const column of table.columns.filter((item) => item.references)) {
        const index = `idx_${name}_${column.column}`.slice(0, 60);
        statements.push(`CREATE INDEX ${pg ? 'IF NOT EXISTS ' : ''}${q(index)} ON ${q(name)} (${q(column.column)})`);
        if (column.enforced) {
          constraints.push(`ALTER TABLE ${q(name)} ADD CONSTRAINT ${q(`fk_${name}_${column.column}`.slice(0, 60))} FOREIGN KEY (${q(column.column)}) REFERENCES ${q(column.references)} (${q('id')})`);
        }
      }
    }
    for (const [name, table] of Object.entries(model.tables)) {
      for (const unique of table.unique || []) {
        const index = `uq_${name}_${unique.columns.join('_')}`.slice(0, 60);
        statements.push(`CREATE UNIQUE INDEX ${pg ? 'IF NOT EXISTS ' : ''}${q(index)} ON ${q(name)} (${unique.columns.map(q).join(', ')})`);
      }
    }
    // Las claves foráneas se añaden al final: admiten referencias circulares entre entidades.
    return { id: MIGRATION_ID, statements: [...statements, ...constraints] };
  }

  /** Usuarios del sistema: independientes del modelo de dominio, por eso viven en su propia migración. */
  _authMigration(database) {
    if (database === 'mongodb') {
      return { id: AUTH_MIGRATION_ID, collections: ['icase_users'], indexes: [{ collection: 'icase_users', keys: { email: 1 }, options: { unique: true, name: 'uq_icase_users_email' } }] };
    }
    const pg = database === 'postgres';
    const q = (name) => (pg ? `"${name}"` : `\`${name}\``);
    return {
      id: AUTH_MIGRATION_ID,
      statements: [
        `CREATE TABLE IF NOT EXISTS ${q('icase_users')} (\n  ${[
          pg ? `${q('id')} BIGSERIAL PRIMARY KEY` : `${q('id')} BIGINT AUTO_INCREMENT PRIMARY KEY`,
          `${q('email')} ${pg ? 'TEXT' : 'VARCHAR(255)'} NOT NULL`,
          `${q('nombre')} ${pg ? 'TEXT' : 'VARCHAR(255)'} NOT NULL DEFAULT ''`,
          `${q('rol')} ${pg ? 'TEXT' : 'VARCHAR(191)'} NOT NULL`,
          pg ? `${q('activo')} BOOLEAN NOT NULL DEFAULT true` : `${q('activo')} TINYINT(1) NOT NULL DEFAULT 1`,
          `${q('password_hash')} ${pg ? 'TEXT' : 'VARCHAR(512)'} NOT NULL`,
          pg ? `${q('created_at')} TIMESTAMPTZ NOT NULL DEFAULT now()` : `${q('created_at')} DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)`,
          pg ? `${q('updated_at')} TIMESTAMPTZ NOT NULL DEFAULT now()` : `${q('updated_at')} DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)`
        ].join(',\n  ')}\n)`,
        `CREATE UNIQUE INDEX ${pg ? 'IF NOT EXISTS ' : ''}${q('uq_icase_users_email')} ON ${q('icase_users')} (${q('email')})`
      ]
    };
  }

  _mongoMigration(model) {
    const collections = Object.keys(model.tables);
    const indexes = [];
    for (const [name, table] of Object.entries(model.tables)) {
      if (table.generic) indexes.push({ collection: name, keys: { capability: 1 } });
      for (const column of table.columns.filter((item) => item.references)) indexes.push({ collection: name, keys: { [column.column]: 1 } });
      for (const unique of table.unique || []) {
        // Índice parcial: los documentos sin el campo (o con null) no compiten por la unicidad, igual que NULL en SQL.
        const bson = { string: 'string', uuid: 'string', date: 'string', time: 'string', integer: 'number', number: 'number', boolean: 'bool', datetime: 'date' };
        indexes.push({
          collection: name,
          keys: Object.fromEntries(unique.columns.map((column) => [column, 1])),
          options: { unique: true, name: `uq_${unique.columns.join('_')}`, partialFilterExpression: Object.fromEntries(unique.columns.map((column, position) => [column, { $type: bson[unique.types[position]] || 'string' }])) }
        });
      }
    }
    return { id: MIGRATION_ID, collections, indexes };
  }

  _files(model, rules, migrations, database) {
    const read = (name) => fs.readFileSync(path.join(TEMPLATES, name), 'utf8');
    const modulo = (value) => `module.exports = ${JSON.stringify(value, null, 2)};\n`;
    const store = read(`${database}.store.js`);
    const documentation = migrations.map((migration) => (database === 'mongodb'
      ? { ruta: `backend/db/migrations/${migration.id}.json`, lenguaje: 'json', contenido: `${JSON.stringify(migration, null, 2)}\n` }
      : { ruta: `backend/db/migrations/${migration.id}.sql`, lenguaje: 'sql', contenido: `-- Migración ${migration.id}: generada por I-CASE.\n-- Se aplica automáticamente al iniciar el backend y se registra en schema_migrations.\n\n${migration.statements.map((statement) => `${statement};`).join('\n\n')}\n` }));
    return {
      store,
      shared: [
        { ruta: 'backend/src/data/store-support.js', lenguaje: 'javascript', contenido: read('store-support.js') },
        { ruta: 'backend/src/data/model.js', lenguaje: 'javascript', contenido: modulo(model) },
        { ruta: 'backend/src/data/migrations.js', lenguaje: 'javascript', contenido: modulo(migrations) },
        { ruta: 'backend/src/data/rules.js', lenguaje: 'javascript', contenido: modulo(rules) },
        { ruta: 'backend/src/data/rules-engine.js', lenguaje: 'javascript', contenido: read('rules-engine.js') },
        ...documentation
      ]
    };
  }
}

module.exports = BackendDataLayerGenerator;
