// Recorrido de negocio de una aplicación de ventas generada, por API y sin nombres fijos de operaciones: se localizan en
// /api/openapi.json por ruta. Uso: node scripts/_business-flow.cjs [http://localhost:3300]  (ADMIN_EMAIL/ADMIN_PASSWORD/DEMO_PASSWORD del .env)
const base = process.argv[2] || 'http://localhost:3300';
const results = [];
const check = (ok, label, detail = '') => results.push([ok, label + (ok || !detail ? '' : ' -> ' + String(detail).slice(0, 300))]);

async function call(token, method, path, body) {
  const response = await fetch(base + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
    body: body ? JSON.stringify(body) : undefined
  });
  const text = await response.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  return { status: response.status, data };
}
const rows = (d) => (Array.isArray(d) ? d : d?.data || []).map((r) => ({ id: r.id, ...(r.data || r) }));
const idOf = (r) => r.data.id || (r.data.data && r.data.data.id);

(async () => {
  const login = async (email, password) => (await call(null, 'POST', '/api/auth/login', { email, password })).data.token;
  const admin = await login(process.env.ADMIN_EMAIL || 'admin@example.com', process.env.ADMIN_PASSWORD);
  const vend = await login('vendedor@ejemplo.test', process.env.DEMO_PASSWORD || 'Demo-2026-icase');
  check(Boolean(admin), 'el administrador inicia sesion');
  check(Boolean(vend), 'el vendedor inicia sesion');
  const doc = (await call(admin, 'GET', '/api/openapi.json')).data;
  const path = (method, re) => { const f = Object.entries(doc.paths).find(([p, v]) => re.test(p) && v[method]); return f ? f[0] : null; };
  const ops = {
    crearProducto: path('post', /actions\/crear-producto$/),
    crearCliente: path('post', /actions\/crear-cliente$/),
    crearVenta: path('post', /actions\/crear-venta$/),
    emitir: path('post', /actions\/emitir-factura$/),
    anular: path('patch', /actions\/anular-venta/),
    productos: path('get', /actions\/listar-productos$/),
    stockBajo: path('get', /stock-bajo$/),
    ventasVend: path('get', /listar-ventas/),
    reporteFechas: path('get', /reporte-de-ventas/),
    masVendidos: path('get', /mas-vendidos/)
  };
  for (const [n, v] of Object.entries(ops)) check(Boolean(v), 'existe la operacion ' + n);
  if (!ops.crearProducto || !ops.crearCliente || !ops.crearVenta) return;

  const suffix = Date.now().toString().slice(-6);
  const schemaOf = (p, m) => {
    const s = doc.paths[p][m].requestBody && doc.paths[p][m].requestBody.content['application/json'].schema;
    return s && s.$ref ? doc.components.schemas[s.$ref.split('/').pop()] : s;
  };
  const sample = (p, extra = {}) => {
    const s = schemaOf(p, 'post') || {};
    const out = {};
    for (const [k, def] of Object.entries(s.properties || {})) {
      if (extra[k] !== undefined) out[k] = extra[k];
      else if (def.type === 'integer' || def.type === 'number') out[k] = 5;
      else if (def.enum) out[k] = def.enum[0];
      else if (def.format === 'email') out[k] = 'x' + suffix + '@ejemplo.test';
      else if (def.type === 'string') out[k] = k + ' ' + suffix;
    }
    return out;
  };

  const productBody = sample(ops.crearProducto, { stock: 10, codigo: 'P' + suffix });
  const p1 = await call(admin, 'POST', ops.crearProducto, productBody);
  check(p1.status === 201, 'el administrador crea un producto', JSON.stringify(p1.data));
  const productoId = idOf(p1);
  const c1 = await call(admin, 'POST', ops.crearCliente, sample(ops.crearCliente));
  check(c1.status === 201, 'el administrador crea un cliente', JSON.stringify(c1.data));
  const clienteId = idOf(c1);
  const pv = await call(vend, 'POST', ops.crearProducto, productBody);
  check([401, 403].includes(pv.status), 'el vendedor NO puede crear productos', pv.status);

  const clienteKey = Object.keys((schemaOf(ops.crearVenta, 'post') || {}).properties || {}).find((k) => /cliente/i.test(k)) || 'cliente_id';
  const venta = (n) => ({ [clienteKey]: clienteId, lineas: [{ producto_id: productoId, cantidad: n }] });
  const v1 = await call(vend, 'POST', ops.crearVenta, venta(3));
  check(v1.status === 201, 'el vendedor registra una venta con una linea', JSON.stringify(v1.data));
  const ventaId = idOf(v1);
  const stockOf = async () => {
    const list = rows((await call(admin, 'GET', ops.productos)).data);
    return Number((list.find((r) => String(r.id) === String(productoId)) || {}).stock);
  };
  check((await stockOf()) === 7, 'el stock bajo de 10 a 7', 'stock=' + (await stockOf()));
  const sinStock = await call(vend, 'POST', ops.crearVenta, venta(99));
  check(sinStock.status >= 400 && sinStock.status < 500, 'vender mas del stock se rechaza', sinStock.status);

  if (ops.emitir) {
    const f = await call(vend, 'POST', ops.emitir, { venta_id: ventaId });
    check(f.status === 201, 'el vendedor emite la factura', JSON.stringify(f.data));
    const numero = Object.values(f.data.data || f.data).find((v) => typeof v === 'string' && /^F\d{3}-\d{5}$/.test(v));
    check(Boolean(numero), 'la factura tiene numero correlativo F001-00001', JSON.stringify(f.data));
    const f2 = await call(vend, 'POST', ops.emitir, { venta_id: ventaId });
    check(f2.status === 409, 'una venta no admite una segunda factura', f2.status);
  }
  if (ops.anular) {
    const url = ops.anular.replace('{id}', ventaId);
    const a1 = await call(vend, 'PATCH', url, { motivo_anulacion: 'prueba' });
    check([401, 403].includes(a1.status), 'el vendedor NO puede anular', a1.status);
    const a2 = await call(admin, 'PATCH', url, { motivo_anulacion: 'Error de digitacion', motivo: 'Error de digitacion' });
    check(a2.status === 200, 'el administrador anula la venta', JSON.stringify(a2.data));
    check((await stockOf()) === 10, 'al anular, el stock vuelve a 10', 'stock=' + (await stockOf()));
  }
  const hoy = new Date().toISOString().slice(0, 10);
  const range = '?desde=' + hoy + '&hasta=' + hoy + '&fechaInicio=' + hoy + '&fechaFin=' + hoy;
  if (ops.stockBajo) check((await call(admin, 'GET', ops.stockBajo)).status === 200, 'el administrador consulta el stock bajo');
  if (ops.ventasVend) check((await call(vend, 'GET', ops.ventasVend)).status === 200, 'el vendedor consulta sus ventas');
  if (ops.reporteFechas) {
    const r = await call(admin, 'GET', ops.reporteFechas + range);
    check(r.status === 200, 'reporte de ventas por fechas', JSON.stringify(r.data));
    const rv = await call(vend, 'GET', ops.reporteFechas + range);
    check([401, 403].includes(rv.status), 'el vendedor NO ve el reporte', rv.status);
  }
  if (ops.masVendidos) check((await call(admin, 'GET', ops.masVendidos + range)).status === 200, 'reporte de mas vendidos');
})().catch((e) => check(false, 'error inesperado', e.message)).finally(() => {
  for (const [ok, label] of results) console.log(ok ? '  ok   ' : 'FALLA  ', label);
  const bad = results.filter(([ok]) => !ok).length;
  console.log(bad ? '\n' + bad + ' FALLA(S)' : '\nTODO BIEN');
  process.exit(bad ? 1 : 0);
});
