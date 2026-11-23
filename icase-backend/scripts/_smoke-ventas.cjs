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
  // Anular: un alta de anulación vinculada a la venta (anula) o la transición de la factura que anula su venta (cascada).
  const anular = actions.find((action) => action.anula) || actions.find((action) => action.type === 'transicion' && action.cascada);
  const productos = find('consulta', 'producto', (action) => !(action.filters || []).some((filter) => filter.operador === '<'));
  const stockBajo = find('consulta', 'producto', (action) => (action.filters || []).some((filter) => filter.operador === '<'));
  const editarProducto = find('actualizar', 'producto');
  const reportes = actions.filter((action) => action.type === 'resumen');
  for (const [name, action] of Object.entries({ crearProducto, crearCliente, crearVenta, emitir, anular, productos, stockBajo, editarProducto })) check(Boolean(action), 'existe la acción ' + name);
  if (results.some(([ok]) => !ok)) return finish();

  const sufijo = Date.now().toString(36);
  // El cuerpo con los nombres reales de los campos de cada operación (precioVenta o precio_venta, medioPago o medio_pago…).
  const key = (name) => String(name).toLowerCase().replace(/[^a-z0-9]/g, '');
  const body = (action, values) => Object.fromEntries((action.inputs || []).map((name) => {
    const found = Object.entries(values).find(([pattern]) => new RegExp(pattern).test(key(name)));
    return [name, found ? found[1] : 'Dato ' + sufijo];
  }));
  const productoBody = (codigo, nombre, precio, stock) => body(crearProducto, { '^codigo': codigo + '-' + sufijo, '^nombre': nombre + ' ' + sufijo, categoria: 'Ropa', precio: precio, stock: stock, estado: 'activo', activo: true });
  const producto = (await call(admin, 'POST', crearProducto.path, productoBody('P', 'Polo', 50, 6))).data;
  check(Boolean(producto.id), 'el administrador crea un producto', JSON.stringify(producto));
  const otro = (await call(admin, 'POST', crearProducto.path, productoBody('G', 'Gorra', 20, 10))).data;
  const cliente = (await call(admin, 'POST', crearCliente.path, body(crearCliente, { nombre: 'Cliente ' + sufijo, tipo: 'DNI', numero: String(Date.now()).slice(-8), correo: sufijo + '@cliente.pe', email: sufijo + '@cliente.pe', telefono: '999888777' }))).data;
  check(Boolean(cliente.id), 'el administrador crea un cliente', JSON.stringify(cliente));
  const ventaBody = (lineas) => ({ ...body(crearVenta, { cliente: cliente.id, medio: 'efectivo' }), lineas: lineas.map(([id, cantidad]) => ({ [crearVenta.lineas.referencia]: id, [crearVenta.lineas.cantidad]: cantidad })) });

  const venta = await call(vendedor, 'POST', crearVenta.path, ventaBody([[producto.id, 2], [otro.id, 1]]));
  check(venta.status === 201 && venta.data.total === 120, 'el vendedor registra una venta de 2 líneas con total 120', venta.status + ' ' + JSON.stringify(venta.data));
  const misVentas = find('consulta', 'venta', (action) => (action.filters || []).some((filter) => filter.origen === 'sesion'));
  if (misVentas) {
    const vistas = rows((await call(admin, 'GET', misVentas.path)).data);
    check(vistas.some((row) => String(row.id) === String(venta.data.id)), 'el administrador ve en el listado las ventas del vendedor');
    const propias = rows((await call(vendedor, 'GET', misVentas.path)).data);
    check(propias.some((row) => String(row.id) === String(venta.data.id)), 'el vendedor ve su propia venta');
  }
  const stockDe = async (id) => rows((await call(admin, 'GET', productos.path)).data).find((row) => String(row.id) === String(id))?.stock;
  check(await stockDe(producto.id) === 4, 'el stock baja de 6 a 4', String(await stockDe(producto.id)));
  const sinStock = await call(vendedor, 'POST', crearVenta.path, ventaBody([[producto.id, 50]]));
  check(sinStock.status >= 400 && sinStock.status < 500, 'vender más que el stock se rechaza (4xx)', String(sinStock.status));

  const factura = await call(vendedor, 'POST', emitir.path, { [emitir.vincula.parametro]: venta.data.id });
  // El número va en «numero» o en «numero_factura», según el modelo.
  const numero = Object.entries(factura.data || {}).find(([campo]) => /^(numero|nro|correlativo)/i.test(campo))?.[1];
  check(factura.status === 201 && /^F001-\d{5}$/.test(String(numero)), 'la factura sale con número F001-00000', factura.status + ' ' + JSON.stringify(factura.data));
  check(factura.data.igv === 21.6 && factura.data.total === 141.6, 'IGV 18 % (21.6) y total 141.6 sobre 120', JSON.stringify(factura.data));
  const repetida = await call(vendedor, 'POST', emitir.path, { [emitir.vincula.parametro]: venta.data.id });
  check(repetida.status === 409, 'una venta no se factura dos veces (409)', String(repetida.status));

  const precio = await call(vendedor, 'PATCH', editarProducto.path.replace(':id', producto.id), body(editarProducto, { precio: 1 }));
  check(precio.status === 403, 'el vendedor no puede cambiar precios (403)', String(precio.status));
  // Con alta de anulación se indica la venta; con la transición de la factura, la ruta lleva el id de esa factura.
  const anularComo = (token, motivo) => (anular.anula
    ? call(token, 'POST', anular.path, { [anular.vincula.parametro]: venta.data.id, motivo })
    : call(token, 'POST', anular.path.replace(':id', factura.data.id), {}));
  const anulaVendedor = await anularComo(vendedor, 'prueba');
  check(anulaVendedor.status === 403, 'el vendedor no puede anular (403)', String(anulaVendedor.status));
  const anulacion = await anularComo(admin, 'Error de cobro');
  check([200, 201].includes(anulacion.status), 'el administrador anula (la venta queda anulada)', anulacion.status + ' ' + JSON.stringify(anulacion.data));
  const ventaAnulada = rows((await call(admin, 'GET', contract.operations.find((operation) => operation.entity === 'venta').collectionPath + '?limit=500')).data).find((row) => String(row.id) === String(venta.data.id));
  check(/^(anul|cancel)/i.test(String(ventaAnulada?.estado || '')) || ventaAnulada?.modificable === false, 'la venta queda anulada (o bloqueada si el modelo no le dio estado)', JSON.stringify(ventaAnulada));
  check(await stockDe(producto.id) === 6, 'al anular, el stock vuelve a 6', String(await stockDe(producto.id)));
  const facturas = rows((await call(admin, 'GET', contract.operations.find((operation) => operation.entity === 'factura').collectionPath + '?limit=500')).data);
  check(facturas.find((row) => String(row.id) === String(factura.data.id))?.estado === 'anulada', 'la factura queda anulada');

  const segunda = await call(vendedor, 'POST', crearVenta.path, ventaBody([[producto.id, 3]]));
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
