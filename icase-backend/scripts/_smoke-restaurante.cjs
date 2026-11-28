// Reglas del insumo «Sistema de gestión para restaurante», comprobadas contra la aplicación generada por su API.
// Uso: node scripts/_smoke-restaurante.cjs [http://localhost:3400]  (ADMIN_EMAIL, ADMIN_PASSWORD y DEMO_PASSWORD como en el .env)
const base = process.argv[2] || 'http://localhost:3400';
const results = [];
const check = (ok, label, detail = '') => results.push([Boolean(ok), label + (ok || detail === '' ? '' : ' -> ' + String(typeof detail === 'string' ? detail : JSON.stringify(detail)).slice(0, 400))]);

async function call(token, method, path, body) {
  const response = await fetch(base + path, {
    method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
    body: body ? JSON.stringify(body) : undefined
  });
  const text = await response.text();
  let data; try { data = JSON.parse(text); } catch { data = text; }
  return { status: response.status, data, message: data?.message || data?.error || '' };
}
const rows = (r) => (Array.isArray(r.data) ? r.data : r.data?.data || []).map((x) => ({ id: x.id, ...(x.data || x) }));
const idOf = (r) => String(r.data?.id ?? r.data?.data?.id);
const kebab = (name) => name.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
const act = (token, method, name, body, id, query = '') => call(token, method, `/api/actions/${kebab(name)}${id ? '/' + id : ''}${query}`, body);

(async () => {
  const login = async (email, password) => (await call(null, 'POST', '/api/auth/login', { email, password })).data.token;
  const demo = process.env.DEMO_PASSWORD || 'Demo-2026-icase';
  const run = Date.now().toString().slice(-7);
  const admin = await login(process.env.ADMIN_EMAIL || 'admin@example.com', process.env.ADMIN_PASSWORD || 'ChangeMe-123');
  check(admin, 'el administrador inicia sesión');
  const me = async (token) => (await call(token, 'GET', '/api/auth/me')).data.usuario;

  // 1. Usuarios: el administrador los crea con su rol; el cliente crea su propia cuenta.
  const newUser = async (rol, tag) => {
    const email = `${tag}-${run}@ejemplo.test`;
    const created = await act(admin, 'POST', 'crearUsuario', { nombre: tag, correo: email, passwordHash: demo, rol });
    const viaAccounts = created.status === 201 ? null : await call(admin, 'POST', '/api/users', { email, password: demo, nombre: tag, rol });
    const token = await login(email, demo);
    check(token, `el administrador crea un ${rol} (${tag}) y este inicia sesión`, viaAccounts || created);
    return { token, id: token ? String((await me(token)).id) : null };
  };
  const meseroA = await newUser('mesero', 'meseroa');
  const meseroB = await newUser('mesero', 'meserob');
  const cocinero = await newUser('cocinero', 'cocinero');
  const cajero = await newUser('cajero', 'cajero');
  const register = async (tag) => {
    const email = `${tag}-${run}@ejemplo.test`;
    const response = await call(null, 'POST', '/api/auth/register', { email, password: demo, nombre: tag });
    const token = await login(email, demo);
    check(response.status === 201 && token, `${tag} crea su propia cuenta de cliente`, response);
    return { token, id: token ? String((await me(token)).id) : null };
  };
  const clienteA = await register('clientea');
  const clienteB = await register('clienteb');
  check((await call(null, 'POST', '/api/auth/register', { email: `x-${run}@ejemplo.test`, password: demo, rol: 'administrador' })).status >= 400, 'nadie se registra como administrador');

  // 2-3. Platos y mesas: solo el administrador.
  const plato = async (nombre, categoria, precio) => {
    const r = await act(admin, 'POST', 'crearPlato', { nombre: `${nombre} ${run}`, categoria, precio });
    check(r.status === 201, `el administrador crea el plato ${nombre}`, r);
    return idOf(r);
  };
  const almuerzo = await plato('Seco de pollo', 'ALMUERZO', 4.5);
  const bebida = await plato('Jugo', 'BEBIDA', 1.25);
  const postre = await plato('Flan', 'POSTRE', 2);
  const mesa = async (numero, sillas, mesero) => {
    const r = await act(admin, 'POST', 'crearMesa', { numero, cantidadSillas: sillas, ...(mesero ? { mesero_id: mesero } : {}) });
    check(r.status === 201, `el administrador crea la mesa ${numero}`, r);
    return idOf(r);
  };
  const n = Number(run.slice(-5));
  const mesa1 = await mesa(n, 2, meseroA.id);
  const mesa2 = await mesa(n + 1, 4, meseroB.id);
  const mesaSin = await mesa(n + 2, 4, null);
  check((await act(admin, 'PATCH', 'asignarMeseroAMesa', { mesero_id: cajero.id }, mesaSin)).status === 400, 'a una mesa solo se le asigna una cuenta de mesero');
  for (const [rol, token] of [['mesero', meseroA.token], ['cajero', cajero.token], ['cliente', clienteA.token], ['cocinero', cocinero.token]]) {
    const r = await act(token, 'PATCH', 'actualizarPrecioPlatoExistente', { precio: 0.01 }, almuerzo);
    check(r.status === 403, `el ${rol} no cambia precios`, r.status);
  }

  // 4-5. Menú y disponibilidad.
  for (const [rol, token] of [['cliente', clienteA.token], ['mesero', meseroA.token]]) {
    const r = await act(token, 'GET', 'consultarMenuDisponibilidad');
    const dish = rows(r).find((x) => String(x.id) === almuerzo);
    check(dish && Number(dish.precio) === 4.5 && dish.disponibilidad === 'DISPONIBLE', `el ${rol} ve el menú con precio y disponibilidad`, r);
  }
  check((await act(cocinero.token, 'POST', 'marcarPlatoAgotado', {}, postre)).status < 300, 'el cocinero marca un plato como agotado');
  check((await act(meseroA.token, 'POST', 'marcarPlatoDisponible', {}, postre)).status === 403, 'el mesero no cambia la disponibilidad');

  // 6-7. Reservas con cupo y código.
  const when = (days, hour) => { const d = new Date(Date.now() + days * 864e5 + (Number(run) % 500) * 60000); d.setUTCHours(hour, Number(run) % 60, 0, 0); return d.toISOString(); };
  const t1 = when(3, 18);
  const options = await act(clienteA.token, 'GET', 'crearReserva', null, null, '?opciones=mesa_id');
  check(options.status === 200 && rows(options).some((x) => String(x.id) === mesa1), 'el cliente puede elegir la mesa al reservar', options);
  const reservar = (cliente, mesaId, tipo, at = t1) => act(cliente.token, 'POST', 'crearReserva', { mesa_id: mesaId, tipo, fechaHora: at });
  const r1 = await reservar(clienteA, mesa1, 'SILLA');
  check(r1.status === 201 && (r1.data.codigoReserva || r1.data.data?.codigoReserva), 'reserva de una silla con código asignado', r1);
  const codigo = r1.data.codigoReserva || r1.data.data?.codigoReserva;
  check(String(r1.data.cliente_id) === clienteA.id, 'la reserva queda a nombre del cliente que la hace', r1);
  check((await reservar(clienteB, mesa1, 'MESA_COMPLETA')).status === 409, 'no se reserva completa una mesa con una silla ocupada');
  check((await reservar(clienteB, mesa1, 'SILLA')).status === 201, 'segunda silla de una mesa de dos');
  const full = await reservar(clienteA, mesa1, 'SILLA');
  check(full.status === 409, 'no quedan sillas libres', full);
  check((await reservar(clienteA, mesa2, 'MESA_COMPLETA')).status === 201, 'reserva de mesa completa');
  check((await reservar(clienteB, mesa2, 'SILLA')).status === 409, 'no se reserva una silla de una mesa reservada completa');
  check((await reservar(clienteB, mesa2, 'SILLA', when(4, 18))).status === 201, 'la misma mesa se reserva en otra fecha');
  const mine = await act(clienteB.token, 'GET', 'listarReservaPropios');
  check(rows(mine).length === 2 && rows(mine).every((x) => String(x.cliente_id ?? clienteB.id) === clienteB.id), 'el cliente ve solo sus reservas', mine);
  const none = await act(meseroA.token, 'GET', 'buscarReservaPorCodigo');
  check(none.status === 200 && rows(none).length === 0, 'sin código no se listan reservas', none);
  const found = await act(meseroA.token, 'GET', 'buscarReservaPorCodigo', null, null, `?codigo_reserva=${encodeURIComponent(codigo)}`);
  const foundAlt = rows(found).length ? found : await act(meseroA.token, 'GET', 'buscarReservaPorCodigo', null, null, `?codigoReserva=${encodeURIComponent(codigo)}`);
  check(rows(foundAlt).length === 1, 'el mesero encuentra la reserva por su código', foundAlt);
  const reservaId = rows(foundAlt)[0]?.id;
  check((await act(meseroA.token, 'POST', 'validarReservaPorCodigo', {}, reservaId)).status < 300, 'el mesero valida la reserva');
  check((await act(meseroA.token, 'POST', 'validarReservaPorCodigo', {}, reservaId)).status === 409, 'una reserva validada no se valida dos veces');

  // 8. Mis mesas.
  const mesasA = await act(meseroA.token, 'GET', 'consultarMesasAsignadas');
  check(rows(mesasA).some((x) => String(x.id) === mesa1) && !rows(mesasA).some((x) => String(x.id) === mesa2), 'el mesero ve solo sus mesas', mesasA);
  check((await act(meseroA.token, 'POST', 'marcarMesaOcupada', {}, mesa1)).status < 300, 'el mesero marca su mesa ocupada');
  const ajena = await act(meseroA.token, 'POST', 'marcarMesaOcupada', {}, mesa2);
  check(ajena.status === 404 || ajena.status === 403, 'el mesero no modifica la mesa de otro', ajena);

  // 9. Pedidos.
  const lineas = (pairs) => pairs.map(([plato_id, cantidad]) => ({ plato_id, cantidad }));
  const dishes = await act(clienteA.token, 'GET', 'crearPedidoCliente');
  check(rows(dishes).some((x) => String(x.id) === almuerzo) && !rows(dishes).some((x) => String(x.id) === postre), 'solo se ofrecen los platos disponibles', dishes);
  const agotado = await act(clienteA.token, 'POST', 'crearPedidoCliente', { mesa_id: mesa1, lineas: lineas([[postre, 1]]) });
  check(agotado.status === 409, 'no se puede pedir un plato agotado', agotado);
  const sinMesero = await act(clienteA.token, 'POST', 'crearPedidoCliente', { mesa_id: mesaSin, lineas: lineas([[bebida, 1]]) });
  check(sinMesero.status === 409, 'una mesa sin mesero no recibe pedidos del cliente', sinMesero);
  const p1 = await act(clienteA.token, 'POST', 'crearPedidoCliente', { mesa_id: mesa1, lineas: lineas([[almuerzo, 2], [bebida, 1]]), total: 0.01, estado: 'PAGADO', mesero_id: meseroB.id, cliente_id: clienteB.id });
  check(p1.status === 201, 'el cliente registra un pedido', p1);
  const pedido1 = idOf(p1);
  check(Number(p1.data.total) === 10.25 && p1.data.estado === 'PENDIENTE', 'el sistema calcula el total y queda pendiente (ignora lo que envíe el cliente)', p1);
  check(String(p1.data.mesero_id) === meseroA.id && String(p1.data.cliente_id) === clienteA.id, 'el pedido del cliente es del mesero de la mesa', p1);
  const foreignTable = await act(meseroB.token, 'POST', 'crearPedidoMesero', { mesa_id: mesa1, lineas: lineas([[bebida, 1]]) });
  check([403, 404, 409].includes(foreignTable.status), 'un mesero no pide para la mesa de otro', foreignTable);
  const tables = await act(meseroB.token, 'GET', 'crearPedidoMesero', null, null, '?opciones=mesa_id');
  check(rows(tables).length >= 1 && !rows(tables).some((x) => String(x.id) === mesa1), 'el mesero solo elige sus mesas', tables);
  const p2 = await act(meseroB.token, 'POST', 'crearPedidoMesero', { mesa_id: mesa2, lineas: lineas([[bebida, 2]]) });
  check(p2.status === 201 && String(p2.data.mesero_id) === meseroB.id && !p2.data.cliente_id, 'el mesero registra un pedido sin cliente', p2);
  const pedido2 = idOf(p2);
  const deA = rows(await act(meseroA.token, 'GET', 'listarPedido'));
  check(deA.some((x) => String(x.id) === pedido1) && !deA.some((x) => String(x.id) === pedido2), 'el mesero no ve pedidos de otro mesero', deA);
  const deClienteB = await act(clienteB.token, 'GET', 'consultarPedidosCliente');
  check(deClienteB.status === 200 && !rows(deClienteB).some((x) => String(x.id) === pedido1), 'un cliente no ve pedidos ajenos', deClienteB);

  // 10. Comandas.
  const comandas = await act(cocinero.token, 'GET', 'consultarComandasPendientes');
  const comanda = rows(comandas).find((x) => String(x.id) === pedido1);
  check(comanda && comanda.fechaHora && /2× Seco de pollo/.test(comanda.platos || ''), 'la comanda muestra hora y platos', comanda || comandas);
  const early = await act(cajero.token, 'POST', 'registrarCobroPedido', { pedido_id: pedido1, metodo: 'EFECTIVO' });
  check(early.status === 409, 'no se cobra un pedido que no está listo', early);
  check((await act(cocinero.token, 'POST', 'marcarPedidoListo', {}, pedido1)).status < 300, 'el cocinero marca el pedido listo');
  check((await act(cocinero.token, 'POST', 'marcarPedidoListo', {}, pedido2)).status < 300, 'segundo pedido listo');
  check(!rows(await act(cocinero.token, 'GET', 'consultarComandasPendientes')).some((x) => String(x.id) === pedido1), 'el pedido listo sale de las comandas');

  // 12-13. Paquete semanal.
  const solicitud = await act(clienteA.token, 'POST', 'solicitarPaquetePrepagado', { montoPagado: 8, saldo: 999, estado: 'ACTIVO' });
  const paquete = idOf(solicitud);
  const days = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 864e5);
  check(solicitud.status === 201 && solicitud.data.estado === 'SOLICITADO' && Number(solicitud.data.saldo) === 0 && days(solicitud.data.fechaInicio, solicitud.data.fechaFin) === 7, 'paquete semanal solicitado: 7 días, sin saldo', solicitud);
  const sinPaquete = await act(cajero.token, 'POST', 'registrarCobroPedido', { pedido_id: pedido1, metodo: 'SALDO_PREPAGADO' });
  check(sinPaquete.status === 409 && /activo/i.test(sinPaquete.message), 'sin paquete activo no se paga con saldo', sinPaquete);
  const porActivar = await act(cajero.token, 'GET', 'listarPaquetePrepagadoSolicitado');
  check(rows(porActivar).some((x) => String(x.id) === paquete), 'el cajero ve los paquetes por activar', porActivar);
  check((await act(cajero.token, 'POST', 'activarPaquetePrepagado', {}, paquete)).status === 400, 'activar exige el monto pagado');
  const activado = await act(cajero.token, 'POST', 'activarPaquetePrepagado', { montoPagado: 8 }, paquete);
  check(activado.status < 300 && activado.data.estado === 'ACTIVO' && Number(activado.data.saldo) === 8, 'el cajero activa el paquete con su saldo', activado);
  check((await act(cajero.token, 'POST', 'activarPaquetePrepagado', { montoPagado: 500 }, paquete)).status === 409, 'un paquete no se activa dos veces');
  const insuficiente = await act(cajero.token, 'POST', 'registrarCobroPedido', { pedido_id: pedido1, metodo: 'SALDO_PREPAGADO' });
  check(insuficiente.status === 409 && /insuficiente/i.test(insuficiente.message), 'saldo insuficiente no cobra', insuficiente);
  const p3 = await act(clienteA.token, 'POST', 'crearPedidoCliente', { mesa_id: mesa1, lineas: lineas([[almuerzo, 1], [bebida, 2]]) });
  const pedido3 = idOf(p3);
  await act(cocinero.token, 'POST', 'marcarPedidoListo', {}, pedido3);
  const listos = await act(cajero.token, 'GET', 'listarPedidoListo');
  check(rows(listos).some((x) => String(x.id) === pedido3) && rows(listos).every((x) => x.estado === 'LISTO' || x.estado === undefined), 'la caja ve los pedidos listos', listos);
  const choices = await act(cajero.token, 'GET', 'registrarCobroPedido', null, null, '?opciones=pedido_id');
  check(rows(choices).some((x) => String(x.id) === pedido3 && /USD/.test(x.etiqueta)), 'el cobro ofrece los pedidos listos con su total', choices);

  // 11. Cobro: por el total, una sola vez, y con puntos.
  const puntosDe = async (token) => Number(rows(await act(token, 'GET', 'consultarPuntosCliente'))[0]?.puntos || 0);
  const antes = await puntosDe(clienteA.token);
  const [c1, c2] = await Promise.all([1, 2].map(() => act(cajero.token, 'POST', 'registrarCobroPedido', { pedido_id: pedido1, metodo: 'EFECTIVO', monto: 0.01 })));
  check([c1, c2].filter((c) => c.status === 201).length === 1 && [c1, c2].filter((c) => c.status === 409).length === 1, 'dos cobros simultáneos: solo uno entra', [c1, c2]);
  const cobro = [c1, c2].find((c) => c.status === 201);
  check(cobro && Number(cobro.data.monto) === 10.25, 'el monto es el total del pedido', cobro);
  check((await puntosDe(clienteA.token)) === antes + 2, 'dos almuerzos pagados suman 2 puntos', await puntosDe(clienteA.token));
  const prepagado = await act(cajero.token, 'POST', 'registrarCobroPedido', { pedido_id: pedido3, metodo: 'SALDO_PREPAGADO' });
  check(prepagado.status === 201, 'cobro con saldo prepagado', prepagado);
  const saldo = rows(await act(clienteA.token, 'GET', 'consultarSaldoPaquetePrepagado'))[0];
  check(Number(saldo?.saldo) === 1, 'el saldo baja en el monto cobrado (8 - 7 = 1)', saldo);
  check((await puntosDe(clienteA.token)) === antes + 3, 'el tercer almuerzo suma otro punto', await puntosDe(clienteA.token));
  check((await puntosDe(clienteB.token)) === 0, 'otro cliente no gana puntos ajenos');
  const sinCliente = await act(cajero.token, 'POST', 'registrarCobroPedido', { pedido_id: pedido2, metodo: 'SALDO_PREPAGADO' });
  check(sinCliente.status === 409, 'un pedido sin cliente no se paga con saldo', sinCliente);
  check((await act(cajero.token, 'POST', 'registrarCobroPedido', { pedido_id: pedido2, metodo: 'TRANSFERENCIA' })).status === 201, 'cobro por transferencia');
  const estados = rows(await act(clienteA.token, 'GET', 'consultarPedidosCliente'));
  check(estados.find((x) => String(x.id) === pedido1)?.estado === 'PAGADO', 'el cliente ve su pedido pagado', estados);

  // Atajos por el CRUD genérico: ningún rol se salta las reglas.
  const doc = (await call(admin, 'GET', '/api/openapi.json')).data;
  const generic = Object.keys(doc.paths).filter((p) => /^\/api\/operations\/[^/{]+$/.test(p));
  let escrituras = [];
  for (const token of [clienteA.token, meseroA.token, cocinero.token, cajero.token]) {
    for (const path of ['rf-09', 'rf-13', 'rf-15', 'rf-16', 'rf-18', 'rf-19', 'rf-20'].map((k) => '/api/operations/' + k)) {
      if (!generic.includes(path)) continue;
      const r = await call(token, 'POST', path, { total: 0, monto: 0, saldo: 100, estado: 'PAGADO' });
      if (r.status < 400) escrituras.push(path);
    }
  }
  check(!escrituras.length, 'ningún rol escribe pedidos, cobros ni saldos por el CRUD genérico', escrituras);
  const patched = await call(admin, 'PATCH', '/api/operations/rf-13/' + pedido1, { total: 1 });
  check(patched.status === 409, 'ni el administrador modifica un pedido pagado', patched);
  const removed = await call(admin, 'DELETE', '/api/operations/rf-13/' + pedido1);
  check(removed.status === 409, 'ni el administrador elimina un pedido pagado', removed);

  // 14. Cierre de caja.
  const cierre = await act(cajero.token, 'POST', 'registrarCierreCaja', { montoEfectivo: 10.25, montoTransferencia: 2.5 });
  check(cierre.status === 201 && String(cierre.data.cajero_id) === cajero.id && cierre.data.fecha, 'cierre de caja con efectivo y transferencia', cierre);
  const cierreId = idOf(cierre);
  check((await call(admin, 'PATCH', '/api/operations/rf-20/' + cierreId, { montoEfectivo: 0 })).status === 409, 'un cierre no se modifica');
  check((await call(admin, 'DELETE', '/api/operations/rf-20/' + cierreId)).status === 409, 'un cierre no se elimina');

  // 16. Reportes: solo el administrador y solo ventas pagadas.
  const today = new Date().toISOString().slice(0, 10);
  const rango = `?desde=2000-01-01&hasta=2100-01-01`;
  const antesPendiente = rows(await act(admin, 'GET', 'consultaDeReportesDeVentasPorRangoDeFech', null, null, rango))[0];
  await act(clienteB.token, 'POST', 'crearPedidoCliente', { mesa_id: mesa1, lineas: lineas([[almuerzo, 5]]) });
  const ventas = rows(await act(admin, 'GET', 'consultaDeReportesDeVentasPorRangoDeFech', null, null, rango))[0];
  check(ventas && Number(ventas.totalVendido) === Number(antesPendiente?.totalVendido) && Number(ventas.totalVendido) >= 19.75, 'las ventas suman solo pedidos pagados', ventas);
  const vacio = rows(await act(admin, 'GET', 'consultaDeReportesDeVentasPorRangoDeFech', null, null, '?desde=2000-01-01&hasta=2000-01-02'))[0];
  check(Number(vacio?.totalVendido || 0) === 0, 'un rango sin ventas da cero', vacio);
  const ranking = rows(await act(admin, 'GET', 'reportePlatosMasVendidos', null, null, rango));
  const rankAlmuerzo = ranking.find((x) => String(x.plato_id ?? x.id) === almuerzo);
  check(rankAlmuerzo && Number(rankAlmuerzo.cantidadVendida) === 3 && /Seco/.test(rankAlmuerzo.plato_id__etiqueta || ''), 'platos más vendidos con nombre y solo lo pagado', ranking.slice(0, 5));
  for (const [rol, token] of [['mesero', meseroA.token], ['cajero', cajero.token], ['cliente', clienteA.token], ['cocinero', cocinero.token]]) {
    const a = await act(token, 'GET', 'consultaDeReportesDeVentasPorRangoDeFech', null, null, rango);
    const b = await act(token, 'GET', 'reportePlatosMasVendidos', null, null, rango);
    check(a.status === 403 && b.status === 403, `el ${rol} no consulta reportes`, [a.status, b.status]);
  }
  void today;

  const failed = results.filter(([ok]) => !ok);
  for (const [ok, label] of results) console.log(`${ok ? 'OK ' : 'XX '} ${label}`);
  console.log(`\n${results.length - failed.length}/${results.length} comprobaciones correctas`);
  process.exit(failed.length ? 1 : 0);
})().catch((error) => { console.error(error); process.exit(1); });
