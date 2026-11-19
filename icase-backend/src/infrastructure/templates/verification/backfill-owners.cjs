// Opt-in: asigna owner_id a filas históricas. Vista previa por defecto; --apply exige --approve HASH.
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { createRequire } = require('node:module');

function pgClient(root) {
  const requireFrom = createRequire(path.join(root, 'backend', 'package.json'));
  return requireFrom('pg').Client;
}

const STRATEGIES = Object.freeze(['asignar_a_usuario', 'asignar_por_campo_email', 'dejar_null']);

function digest(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function quote(name) {
  return '"' + String(name).replace(/"/g, '""') + '"';
}

function parseArgs(argv) {
  const get = (flag) => {
    const index = argv.indexOf(flag);
    return index >= 0 ? argv[index + 1] : undefined;
  };
  return {
    strategy: get('--strategy') || 'dejar_null',
    userId: get('--user-id'),
    emailField: get('--email-field'),
    table: get('--table'),
    databaseUrl: get('--database-url') || process.env.DATABASE_URL,
    apply: argv.includes('--apply'),
    approve: get('--approve')
  };
}

function loadModel(root) {
  const file = path.join(root, 'backend', 'src', 'data', 'model.js');
  delete require.cache[file];
  return require(file);
}

async function planBackfill(root, options) {
  if (!STRATEGIES.includes(options.strategy)) throw new Error('Estrategia inválida: ' + STRATEGIES.join(', '));
  if (!options.databaseUrl) throw new Error('Indica --database-url o DATABASE_URL');
  if (options.strategy === 'asignar_a_usuario' && !/^\d{1,18}$/.test(String(options.userId || ''))) {
    throw new Error('--user-id numérico obligatorio para asignar_a_usuario');
  }
  if (options.strategy === 'asignar_por_campo_email' && !options.emailField) {
    throw new Error('--email-field obligatorio para asignar_por_campo_email');
  }
  const model = await loadModel(root);
  const tables = Object.entries(model.tables || {})
    .filter(([, table]) => (table.columns || []).some((column) => column.column === 'owner_id'))
    .filter(([name]) => !options.table || options.table === name)
    .map(([name, table]) => ({ name, table }));
  if (!tables.length) throw new Error('No hay tablas con owner_id' + (options.table ? ' coincidentes' : ''));

  const Client = pgClient(root);
  const client = new Client({ connectionString: options.databaseUrl });
  await client.connect();
  const preview = [];
  try {
    for (const { name, table } of tables) {
      const nulls = await client.query(`SELECT COUNT(*)::int AS total FROM ${quote(name)} WHERE ${quote('owner_id')} IS NULL`);
      const sample = await client.query(`SELECT id FROM ${quote(name)} WHERE ${quote('owner_id')} IS NULL ORDER BY id LIMIT 20`);
      let matched = 0;
      if (options.strategy === 'asignar_por_campo_email') {
        const column = (table.columns || []).find((item) => item.name === options.emailField || item.column === options.emailField);
        if (!column) throw new Error(`Campo ${options.emailField} inexistente en ${name}`);
        const join = await client.query(
          `SELECT COUNT(*)::int AS total FROM ${quote(name)} t JOIN icase_users u ON lower(u.email)=lower(t.${quote(column.column)}::text) WHERE t.${quote('owner_id')} IS NULL`
        );
        matched = join.rows[0].total;
      } else if (options.strategy === 'asignar_a_usuario') {
        matched = nulls.rows[0].total;
      }
      preview.push({
        table: name,
        null_owners: nulls.rows[0].total,
        would_assign: options.strategy === 'dejar_null' ? 0 : matched,
        leave_null: options.strategy === 'dejar_null' ? nulls.rows[0].total : nulls.rows[0].total - matched,
        sample_ids: sample.rows.map((row) => String(row.id))
      });
    }
  } finally {
    await client.end();
  }
  const plan = {
    strategy: options.strategy,
    userId: options.userId || null,
    emailField: options.emailField || null,
    table: options.table || null,
    preview
  };
  return { ...plan, approval: digest(plan) };
}

async function applyBackfill(root, options, approval) {
  const current = await planBackfill(root, options);
  if (approval !== current.approval) throw new Error('La aprobación no coincide con la vista previa vigente');
  if (options.strategy === 'dejar_null') return { applied: false, reason: 'dejar_null no modifica filas', approval: current.approval, preview: current.preview };

  const Client = pgClient(root);
  const client = new Client({ connectionString: options.databaseUrl });
  await client.connect();
  const results = [];
  try {
    await client.query('BEGIN');
    for (const item of current.preview) {
      if (item.would_assign === 0) { results.push({ table: item.table, updated: 0 }); continue; }
      let result;
      if (options.strategy === 'asignar_a_usuario') {
        result = await client.query(
          `UPDATE ${quote(item.table)} SET ${quote('owner_id')} = $1 WHERE ${quote('owner_id')} IS NULL`,
          [options.userId]
        );
      } else {
        const model = await loadModel(root);
        const table = model.tables[item.table];
        const column = (table.columns || []).find((col) => col.name === options.emailField || col.column === options.emailField);
        result = await client.query(
          `UPDATE ${quote(item.table)} t SET ${quote('owner_id')} = u.id FROM icase_users u WHERE t.${quote('owner_id')} IS NULL AND lower(u.email)=lower(t.${quote(column.column)}::text)`
        );
      }
      results.push({ table: item.table, updated: result.rowCount });
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    await client.end();
  }
  return { applied: true, approval: current.approval, results };
}

module.exports = { planBackfill, applyBackfill, STRATEGIES };

if (require.main === module) {
  (async () => {
    const options = parseArgs(process.argv.slice(2));
    const root = process.cwd();
    if (options.apply) {
      console.log(JSON.stringify(await applyBackfill(root, options, options.approve), null, 2));
    } else {
      const plan = await planBackfill(root, options);
      console.log(JSON.stringify({ strategy: plan.strategy, preview: plan.preview, approval: plan.approval }, null, 2));
    }
  })().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
