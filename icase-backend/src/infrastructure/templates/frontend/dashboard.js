// Tablero del diseño con datos reales: cada cifra se calcula a partir de los registros que el rol puede leer, según lo que dice su
// etiqueta («Total vendido hoy», «Facturas emitidas», «Facturas pendientes», «Anuladas»). Lo que no se puede calcular muestra «—»:
// el tablero nunca enseña las cifras inventadas del diseño.
const plain = (value) => String(value ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9%]+/g, ' ').trim();
const NUMBER = /(S\/\s?|\$\s?|€\s?)?(?<![\d.,])-?(?:\d{1,3}(?:[.,]\d{3})+|\d+)(?:[.,]\d{1,2})?(?![\d])\s?%?/;
const stem = (word) => plain(word).replace(/(es|s)$/, '').slice(0, 5);
const SYNONYMS = { transaccion: 'principal', operacion: 'principal', registro: 'principal' };
const today = () => new Date().toISOString().slice(0, 10);
const isToday = (value) => typeof value === 'string' && value.slice(0, 10) === today();
const annulled = (row) => /^(anul|cancel)/i.test(String(row.estado || ''));

/** Registros de cada entidad que el rol puede leer (la primera operación con GET), cargados una sola vez. */
function loader(api, can, registries) {
  const cache = new Map();
  return (entity) => {
    if (!cache.has(entity)) {
      const op = registries.find((item) => item.entity === entity && (!can || can(item.key, 'GET')));
      cache.set(entity, op ? Promise.resolve(api(`/api/operations/${encodeURIComponent(op.key)}?limit=1000`)).then((listed) => (Array.isArray(listed) ? listed : (listed && listed.data) || []).map((row) => ({ id: row.id, ...(row.data || row) }))).catch(() => null) : Promise.resolve(null));
    }
    return cache.get(entity);
  };
}

/** La entidad principal: la que tiene importe (total) y no es el documento de otra (la factura que referencia una venta). */
async function mainEntity(entities, load) {
  const withTotal = [];
  for (const entity of entities) { const rows = await load(entity); if (rows && rows.some((row) => typeof row.total === 'number')) withTotal.push({ entity, rows }); }
  const documents = new Set();
  for (const { rows } of withTotal) for (const other of entities) if (rows.some((row) => row[`${other}_id`] !== undefined)) documents.add(other);
  return withTotal.find((item) => !documents.has(item.entity)) || withTotal[0] || null;
}

/** Calcula la cifra de una etiqueta; null si no se reconoce. */
export async function metricFor(label, { entities, load, main }) {
  const text = plain(label);
  const words = text.split(' ');
  const daily = /\b(hoy|dia|diari)/.test(text);
  const named = entities.find((entity) => words.some((word) => stem(word) === stem(entity))) || (words.some((word) => SYNONYMS[word.replace(/(es|s)$/, '')]) ? main && main.entity : null);
  const entity = named || (main && main.entity);
  if (!entity) return null;
  let rows = await load(entity);
  if (!rows) return null;
  if (daily && rows.some((row) => row.fecha !== undefined)) rows = rows.filter((row) => isToday(row.fecha));
  if (/\b(total|vendid|monto|ingres|importe|recaud|factur(ado|acion))/.test(text) && !/\b(emitid|pendient|anulad|cantidad|numero|n)\b/.test(text)) {
    return rows.some((row) => typeof row.total === 'number') ? { money: rows.filter((row) => !annulled(row)).reduce((sum, row) => sum + (Number(row.total) || 0), 0) } : null;
  }
  if (/\bpendient/.test(text) && named && main && main.entity !== named) {
    // «Facturas pendientes»: registros principales activos que aún no tienen ese documento.
    let base = main.rows.filter((row) => !annulled(row));
    if (daily) base = base.filter((row) => isToday(row.fecha));
    return base.some((row) => row[`${named}_id`] !== undefined) || base.length ? { count: base.filter((row) => !row[`${named}_id`]).length } : null;
  }
  if (/\banulad|cancelad/.test(text)) return { count: rows.filter(annulled).length };
  if (/\bactiv|vigent|emitid/.test(text)) return { count: rows.filter((row) => !annulled(row)).length };
  return named || words.some((word) => SYNONYMS[word.replace(/(es|s)$/, '')]) ? { count: rows.length } : null;
}

/** Cada cifra suelta del diseño con la etiqueta más cercana de su tarjeta. */
function figures(root) {
  const leaves = Array.from(root.querySelectorAll('*')).filter((element) => !element.children.length && element.textContent.trim() && !element.closest('table, button, select, option, nav'));
  const found = [];
  for (const leaf of leaves) {
    const value = leaf.textContent.trim();
    if (!NUMBER.test(value) || value.replace(NUMBER, '').replace(/[^a-záéíóúñ]/gi, '').length > 3) continue;
    let card = leaf.parentElement;
    let label = '';
    for (let depth = 0; card && card !== root && depth < 4 && !label; depth += 1, card = card.parentElement) {
      label = Array.from(card.querySelectorAll('*')).filter((element) => element !== leaf && !element.children.length && /[a-záéíóúñ]{4,}/i.test(element.textContent) && !NUMBER.test(element.textContent)).map((element) => element.textContent.trim())[0] || '';
    }
    found.push({ leaf, value, label });
  }
  return found;
}

/** Rellena el tablero con datos reales. `registries`: [{ key, entity }] de las operaciones de la aplicación. */
export async function bindDashboard(root, { api, can, registries = [] }) {
  if (!root || root.__dashboard) return;
  root.__dashboard = true;
  const entities = [...new Set(registries.map((item) => item.entity).filter(Boolean))];
  const load = loader(api, can, registries);
  const main = await mainEntity(entities, load);
  for (const { leaf, value, label } of figures(root)) {
    const currency = (value.match(/^(S\/\s?|\$\s?|€\s?)/) || [''])[0];
    const metric = /%/.test(value) ? null : await metricFor(label, { entities, load, main });
    if (!leaf.isConnected) return;
    if (metric && metric.money !== undefined) leaf.textContent = `${currency || 'S/ '}${metric.money.toFixed(2)}`;
    else if (metric && metric.count !== undefined) leaf.textContent = String(metric.count);
    else leaf.textContent = '—';
  }
  // Textos de apoyo con cifras de ejemplo («88.9% de las ventas activas», «11 transacciones · 77%»): sin la cifra inventada.
  for (const element of root.querySelectorAll('p, span, small')) {
    if (!element.children.length && !element.closest('table') && /\d/.test(element.textContent) && /[a-záéíóúñ]{4,}/i.test(element.textContent) && /%|·/.test(element.textContent)) element.textContent = element.textContent.replace(/\d+(?:[.,]\d+)?\s?%/g, '—').replace(/(^|\s)\d+(\s+[a-záéíóúñ]+)/gi, '$1—$2');
  }
  // La tabla de recientes del diseño muestra los últimos registros reales de la entidad principal.
  const table = root.querySelector('table');
  if (table && table.tBodies[0] && main) {
    const rows = [...main.rows].sort((a, b) => String(b.fecha || b.id).localeCompare(String(a.fecha || a.id))).slice(0, Math.max(1, table.tBodies[0].rows.length));
    const body = table.tBodies[0];
    const headers = Array.from(table.tHead?.rows[0]?.cells || []).map((cell) => plain(cell.textContent));
    body.replaceChildren();
    for (const row of rows) {
      const tr = root.ownerDocument.createElement('tr');
      tr.setAttribute('data-id', String(row.id));
      for (const header of headers.length ? headers : ['fecha', 'total', 'estado']) {
        const td = root.ownerDocument.createElement('td');
        td.style.padding = '0.6rem 1rem';
        const key = Object.keys(row).find((name) => header.split(' ').some((word) => word.length >= 4 && plain(name).replace(/ id$/, '').includes(word.slice(0, 5))));
        const raw = key ? row[`${key}__etiqueta`] ?? row[key] : '';
        td.textContent = raw === '' || raw === undefined || raw === null ? '—' : typeof raw === 'number' && /total|importe|monto/.test(header) ? `S/ ${raw.toFixed(2)}` : typeof raw === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(raw) ? new Date(raw).toLocaleString('es') : String(raw);
        tr.append(td);
      }
      body.append(tr);
    }
    if (!rows.length) { const tr = root.ownerDocument.createElement('tr'); const td = root.ownerDocument.createElement('td'); td.colSpan = Math.max(1, headers.length); td.textContent = 'Aún no hay registros.'; tr.append(td); body.append(tr); }
  }
}
