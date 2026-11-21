// Prueba de negocio del proyecto de Ventas (GUIA_PRUEBA_VENTAS.md §2.10) contra la aplicación generada en marcha.
// Uso: node scripts/_smoke-ventas.cjs [http://localhost:3300]
// Busca las acciones por su tipo y entidad en /api/contract, no por nombres fijos: sirve tras regenerar.
const base = process.argv[2] || 'http://localhost:3300';
const results = [];
const check = (ok, label, detail = '') => results.push([ok, label + (ok || !detail ? '' : ' → ' + detail)]);

async function call(token, method, path, body) {
  const response = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const text = await response.text();
  let data; try { data = JSON.parse(text); } catch { data = text; }
  return { status: response.status, data };
}
const login = async (email, password) => (await call(null, 'POST', '/api/auth/login', { email, password })).data.token;
const rows = (data) => (Array.isArray(data) ? data : data?.data || []).map((row) => ({ id: row.id, ...(row.data || row) }));

(async () => {
  const admin = await login(process.env.ADMIN_EMAIL || 'admin@example.com', process.env.ADMIN_PASSWORD || 'Admin-Prueba-2026');
  const vendedor = await login('vendedor@ejemplo.test', process.env.DEMO_PASSWORD || 'Demo-2026-icase');
  check(Boolean(admin), 'el administrador inicia sesión');
  check(Boolean(vendedor), 'el vendedor inicia sesión (cuenta de ejemplo)');
  const contract = (await call(admin, 'GET', '/api/contract')).data;
  const actions = contract.operations.flatMap((operation) => operation.actions || []);
  const find = (type, entity, test = () => true) => actions.find((action) => action.type === type && action.entity === entity && test(action));
  const crearProducto = find('crear', 'producto');
  const crearCliente = find('crear', 'cliente');
  const crearVenta = find('crear', 'venta', (action) => action.lineas);
  const emitir = find('crear', 'factura', (action) => action.vincula);
  const anular = actions.find((action) => action.anula);
  const productos = find('consulta', 'producto', (action) => !(action.filters || []).some((filter) => filter.operador === '<'));
  const stockBajo = find('consulta', 'producto', (action) => (action.filters || []).some((filter) => filter.operador === '<'));
  const editarProducto = find('actualizar', 'producto');
  const reportes = actions.filter((action) => action.type === 'resumen');
  for (const [name, action] of Object.entries({ crearProducto, crearCliente, crearVenta, emitir, anular, productos, stockBajo, editarProducto })) check(Boolean(action), 'existe la acción ' + name);
  if (results.some(([ok]) => !ok)) return finish();

  const sufijo = Date.now().toString(36);
  const producto = (await call(admin, 'POST', crearProducto.path, { codigo: 'P-' + sufijo, nombre: 'Polo ' + sufijo, categoria: 'Ropa', precioVenta: 50, stock: 6 })).data;
  check(Boolean(producto.id), 'el administrador crea un producto', JSON.stringify(producto));
  const otro = (await call(admin, 'POST', crearProducto.path, { codigo: 'G-' + sufijo, nombre: 'Gorra ' + sufijo, categoria: 'Accesorios', precioVenta: 20, stock: 10 })).data;
  const cliente = (await call(admin, 'POST', crearCliente.path, { nombre: 'Cliente ' + sufijo, tipoDocumento: 'DNI', numeroDocumento: String(Date.now()).slice(-8), correo: sufijo + '@cliente.pe', telefono: '999888777' })).data;
  check(Boolean(cliente.id), 'el administrador crea un cliente', JSON.stringify(cliente));

  const venta = await call(vendedor, 'POST', crearVenta.path, { cliente_id: cliente.id, medioPago: 'efectivo', lineas: [{ producto_id: producto.id, cantidad: 2 }, { producto_id: otro.id, cantidad: 1 }] });
  check(venta.status === 201 && venta.data.total === 120, 'el vendedor registra una venta de 2 líneas con total 120', venta.status + ' ' + JSON.stringify(venta.data));
  const stockDe = async (id) => rows((await call(admin, 'GET', productos.path)).data).find((row) => String(row.id) === String(id))?.stock;
  check(await stockDe(producto.id) === 4, 'el stock baja de 6 a 4', String(await stockDe(producto.id)));
  const sinStock = await call(vendedor, 'POST', crearVenta.path, { cliente_id: cliente.id, medioPago: 'efectivo', lineas: [{ producto_id: producto.id, cantidad: 50 }] });
  check(sinStock.status >= 400 && sinStock.status < 500, 'vender más que el stock se rechaza (4xx)', String(sinStock.status));

  const factura = await call(vendedor, 'POST', emitir.path, { [emitir.vincula.parametro]: venta.data.id });
  check(factura.status === 201 && /^F001-\d{5}$/.test(factura.data.numero), 'la factura sale con número F001-00000', factura.status + ' ' + JSON.stringify(factura.data));
  check(factura.data.igv === 21.6 && factura.data.total === 141.6, 'IGV 18 % (21.6) y total 141.6 sobre 120', JSON.stringify(factura.data));
  const repetida = await call(vendedor, 'POST', emitir.path, { [emitir.vincula.parametro]: venta.data.id });
  check(repetida.status === 409, 'una venta no se factura dos veces (409)', String(repetida.status));

  const precio = await call(vendedor, 'PATCH', editarProducto.path.replace(':id', producto.id), { precioVenta: 1 });
  check(precio.status === 403, 'el vendedor no puede cambiar precios (403)', String(precio.status));
  const anulaVendedor = await call(vendedor, 'POST', anular.path, { [anular.vincula.parametro]: venta.data.id, motivo: 'prueba' });
  check(anulaVendedor.status === 403, 'el vendedor no puede anular (403)', String(anulaVendedor.status));
  const anulacion = await call(admin, 'POST', anular.path, { [anular.vincula.parametro]: venta.data.id, motivo: 'Error de cobro' });
  check(anulacion.status === 201, 'el administrador anula la venta', anulacion.status + ' ' + JSON.stringify(anulacion.data));
  check(await stockDe(producto.id) === 6, 'al anular, el stock vuelve a 6', String(await stockDe(producto.id)));
  const facturas = rows((await call(admin, 'GET', contract.operations.find((operation) => operation.entity === 'factura').collectionPath + '?limit=500')).data);
  check(facturas.find((row) => String(row.id) === String(factura.data.id))?.estado === 'anulada', 'la factura queda anulada');

  const segunda = await call(vendedor, 'POST', crearVenta.path, { cliente_id: cliente.id, medioPago: 'tarjeta', lineas: [{ producto_id: producto.id, cantidad: 3 }] });
  check(segunda.status === 201, 'el vendedor registra otra venta');
  const hoy = new Date().toISOString().slice(0, 10);
  for (const reporte of reportes) {
    const params = (reporte.filters || []).filter((filter) => filter.origen === 'parametro').map((filter) => filter.valor + '=' + hoy).join('&');
    const respuesta = await call(admin, 'GET', reporte.path + (params ? '?' + params : ''));
    check(respuesta.status === 200 && Array.isArray(respuesta.data) && respuesta.data.length > 0, 'reporte ' + reporte.name + ' responde con datos de hoy', respuesta.status + ' ' + JSON.stringify(respuesta.data).slice(0, 200));
    const masVendidos = respuesta.data.find?.((row) => String(row.producto_id) === String(producto.id));
    if (reporte.resumen?.agruparPor) check(masVendidos && masVendidos.cantidadVendida === 3 && /Polo/.test(masVendidos.producto_id__etiqueta || ''), 'más vendidos: 3 polos (la venta anulada no cuenta) y su nombre', JSON.stringify(masVendidos));
  }
  const bajo = rows((await call(admin, 'GET', stockBajo.path)).data);
  check(bajo.some((row) => String(row.id) === String(producto.id)), 'el polo con stock 3 aparece en stock bajo');
  const docs = await call(admin, 'GET', '/api/docs/');
  check(docs.status === 200, '/api/docs responde', String(docs.status));
  finish();
})().catch((error) => { console.error(error); process.exit(1); });

function finish() {
  for (const [ok, label] of results) console.log(ok ? '  ok   ' : 'FALLA  ', label);
  console.log(results.some(([ok]) => !ok) ? 'HAY FALLAS' : 'TODO OK');
}
