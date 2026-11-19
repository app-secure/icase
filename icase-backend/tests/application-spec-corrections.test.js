const fs = require('node:fs');
const path = require('node:path');
const ApplicationSpecService = require('../src/infrastructure/services/ApplicationSpecService');
const DomainModelExtractor = require('../src/infrastructure/services/DomainModelExtractor');

const PLANTUML = `@startuml
enum EstadoPedido {
  PENDIENTE
  SERVIDO
}
class Usuario {
  +String id
  +String correo
  +String passwordHash
  +String rol
}
class Reserva {
  +String id
  +String codigoQr
  +String fechaHoraLlegadaPrevista
  +String mesa
}
class Pedido {
  +String id
  +String fechaHora
  +EstadoPedido estado
  +float total
  +String mesa
}
class SesionCaja {
  +String id
  +String fechaCierre
  +float fondoInicial
}
class Cliente {
  +String id
  +String nombre
}
class PaquetePrepagado {
  +String id
  +int usosTotales
  +int usosRestantes
  +String fechaAdquisicion
  +String inicioVigencia
  +String finVigencia
}
Cliente "1" --> "0..*" PaquetePrepagado
Usuario "1" --> "0..*" Pedido
Usuario "1" --> "0..*" SesionCaja
@enduml`;

const dominio = { tipo: 'clases_dominio', aprobado: true, estado: 'aprobado', desactualizado: false, codigo_plantuml: PLANTUML };
const rf = [
  { aprobado: true, tipo: 'RF', identificador: 'RF-05', nombre: 'Validación de reserva mediante QR', descripcion: 'El mesero valida la reserva con el código QR.', actores: ['Mesero'] },
  { aprobado: true, tipo: 'RF', identificador: 'RF-06', nombre: 'Visualización de comandas en KDS', descripcion: 'La cocina ve las comandas.', actores: ['Cocinero'] },
  { aprobado: true, tipo: 'RF', identificador: 'RF-14', nombre: 'Gestión de usuarios', descripcion: 'El administrador registra usuarios.', actores: ['Administrador'] },
  { aprobado: true, tipo: 'RF', identificador: 'RF-15', nombre: 'Registro de pedidos', descripcion: 'El mesero registra pedidos.', actores: ['Mesero'] },
  { aprobado: true, tipo: 'RF', identificador: 'RF-03', nombre: 'Compra de paquetes semanales', descripcion: 'El cliente compra paquetes.', actores: ['Cliente'] },
  { aprobado: true, tipo: 'RF', identificador: 'RF-08', nombre: 'Cierre de sesión de caja', descripcion: 'El cajero cierra la caja.', actores: ['Cajero'] }
];
const pantallas = [
  { pantalla_id: 'validacion-qr', nombre: 'Validación QR' }, { pantalla_id: 'pedido', nombre: 'Pedido' },
  { pantalla_id: 'usuarios', nombre: 'Usuarios' }, { pantalla_id: 'kds', nombre: 'KDS' }, { pantalla_id: 'paquetes', nombre: 'Paquetes' }
];
const modelo = new DomainModelExtractor().fromDiagrams([dominio]);
const depurar = (propuesta) => new ApplicationSpecService({}).depurar(propuesta, { modelo, rf, pantallas });
const crearPedido = { nombre: 'registrarPedido', rf: 'RF-15', tipo: 'crear', entidad: 'Pedido', actores: ['Mesero'], entradas: ['fechaHora', 'estado', 'total', 'usuario_id', 'mesa'] };

describe('correcciones de la especificación propuesta', () => {
  test('quien crea (la cuenta de la sesión) lo completa el servidor y no se pregunta en el formulario', () => {
    const { especificacion } = depurar({
      operaciones: [crearPedido],
      pantallas: [{ id: 'pedido', componentes: [{ tipo: 'formulario', operacion: 'registrarPedido', campos: ['fechaHora', 'estado', 'total', 'usuario_id', 'mesa'], acciones: [{ etiqueta: 'Registrar', operacion: 'registrarPedido' }] }] }]
    });
    const operacion = especificacion.operaciones.find((item) => item.nombre === 'registrarPedido');
    expect(operacion.sesionEntradas).toEqual([{ campo: 'usuario_id', valor: 'usuario.id' }]);
    expect(operacion.entradas).not.toContain('usuario_id');
    expect(especificacion.pantallas[0].componentes[0].campos).toEqual(['fechaHora', 'mesa']);
  });

  test('el estado inicial y los totales no se piden en pantalla, aunque la operación los acepte', () => {
    const { especificacion } = depurar({ operaciones: [crearPedido], pantallas: [{ id: 'pedido', componentes: [{ tipo: 'formulario', operacion: 'registrarPedido', campos: ['estado', 'total', 'mesa'] }] }] });
    expect(especificacion.pantallas[0].componentes[0].campos).toEqual(['mesa']);
    const operacion = especificacion.operaciones.find((item) => item.nombre === 'registrarPedido');
    expect(operacion.entradas).toContain('total');
    // El estado inicial lo fija el servidor (el primero del dominio); sin él las reglas que exigen el estado rechazarían el alta.
    expect(operacion.autoEntradas).toEqual(expect.arrayContaining([{ campo: 'estado', valor: 'inicial', opciones: ['PENDIENTE', 'SERVIDO'] }]));
  });

  test('un código que genera el sistema (el QR de una reserva) lo crea el servidor', () => {
    const { especificacion } = depurar({ operaciones: [{ nombre: 'crearReserva', rf: 'RF-05', tipo: 'crear', entidad: 'Reserva', actores: ['Cliente'], entradas: ['fechaHoraLlegadaPrevista', 'codigoQr', 'mesa'] }] });
    const operacion = especificacion.operaciones.find((item) => item.nombre === 'crearReserva');
    expect(operacion.autoEntradas).toEqual([{ campo: 'codigoQr', valor: 'generado' }]);
    expect(operacion.entradas).toEqual(['fechaHoraLlegadaPrevista', 'mesa']);
  });

  test('la marca de tiempo del propio registro la pone el servidor', () => {
    const { especificacion } = depurar({ operaciones: [{ nombre: 'registrarCierreCaja', rf: 'RF-08', tipo: 'crear', entidad: 'SesionCaja', actores: ['Cajero'], entradas: ['fechaCierre', 'fondoInicial', 'usuario_id'] }] });
    const operacion = especificacion.operaciones.find((item) => item.nombre === 'registrarCierreCaja');
    expect(operacion.autoEntradas).toEqual([{ campo: 'fechaCierre', valor: 'ahora' }]);
    expect(operacion.entradas).toEqual(['fondoInicial']);
  });

  test('en la gestión de usuarios la contraseña y el rol sí los escribe la persona al crear', () => {
    const { especificacion } = depurar({ operaciones: [{ nombre: 'gestionarUsuario', rf: 'RF-14', tipo: 'crear', entidad: 'Usuario', actores: ['Administrador'], entradas: ['correo', 'passwordHash', 'rol'] }] });
    expect(especificacion.operaciones.find((item) => item.nombre === 'gestionarUsuario').entradas).toEqual(['correo', 'passwordHash', 'rol']);
  });

  test('un requisito de gestión que solo traía crear recibe listar y editar, sin exponer ni editar la contraseña', () => {
    const { especificacion, advertencias } = depurar({
      operaciones: [{ nombre: 'gestionarUsuario', rf: 'RF-14', tipo: 'crear', entidad: 'Usuario', actores: ['Administrador'], entradas: ['correo', 'passwordHash', 'rol'] }],
      pantallas: [{ id: 'usuarios', componentes: [{ tipo: 'formulario', operacion: 'gestionarUsuario', campos: ['correo', 'passwordHash', 'rol'], acciones: [{ etiqueta: 'Guardar usuario', operacion: 'gestionarUsuario' }] }] }]
    });
    const listar = especificacion.operaciones.find((item) => item.nombre === 'listarUsuario');
    const actualizar = especificacion.operaciones.find((item) => item.nombre === 'actualizarUsuario');
    expect(listar).toMatchObject({ tipo: 'consulta', rf: 'RF-14', origen: 'derivado', estado_decision: 'pendiente' });
    expect(listar.salida).toEqual(['correo', 'rol']);
    expect(actualizar).toMatchObject({ tipo: 'actualizar', entradas: ['correo', 'rol'], origen: 'derivado', estado_decision: 'pendiente' });
    const componente = especificacion.pantallas[0].componentes[0];
    expect(componente).toMatchObject({ tipo: 'tabla', operacion: 'listarUsuario', campos: ['correo', 'rol'] });
    expect(componente.acciones).toEqual([{ etiqueta: 'Nuevo usuario', operacion: 'gestionarUsuario' }, { etiqueta: 'Editar', operacion: 'actualizarUsuario' }]);
    expect(advertencias.join(' ')).toContain('solo traía crear');
  });

  test('no añade nada si el requisito no es de gestión o si la IA ya propuso editar', () => {
    const sinGestion = depurar({ operaciones: [crearPedido] }).especificacion;
    expect(sinGestion.operaciones.map((item) => item.nombre)).toEqual(expect.not.arrayContaining(['listarPedido', 'actualizarPedido']));
    const completa = depurar({ operaciones: [
      { nombre: 'gestionarUsuario', rf: 'RF-14', tipo: 'crear', entidad: 'Usuario', actores: ['Administrador'], entradas: ['correo', 'rol'] },
      { nombre: 'editarUsuario', rf: 'RF-14', tipo: 'actualizar', entidad: 'Usuario', actores: ['Administrador'], entradas: ['rol'] }
    ] }).especificacion;
    expect(completa.operaciones.filter((item) => item.rf === 'RF-14')).toHaveLength(2);
  });

  test('validar un QR no modifica el código: se convierte en una consulta por ese campo y su pantalla en tarjetas', () => {
    const { especificacion, advertencias } = depurar({
      operaciones: [{ nombre: 'validarReservaQr', rf: 'RF-05', tipo: 'actualizar', entidad: 'Reserva', actores: ['Mesero'], entradas: ['codigoQr'] }],
      pantallas: [{ id: 'validacion-qr', componentes: [{ tipo: 'formulario', operacion: 'validarReservaQr', campos: ['codigoQr'] }] }]
    });
    const operacion = especificacion.operaciones.find((item) => item.nombre === 'validarReservaQr');
    expect(operacion.tipo).toBe('consulta');
    expect(operacion.filtros).toEqual([{ campo: 'codigoQr', operador: '==', origen: 'parametro', valor: 'codigoQr' }]);
    expect(operacion.salida).toEqual(expect.arrayContaining(['codigoQr', 'fechaHoraLlegadaPrevista']));
    expect(especificacion.pantallas[0].componentes[0].tipo).toBe('tarjetas');
    expect(advertencias.join(' ')).toContain('se convirtió en una consulta');
  });

  test('una consulta de un solo campo avisa de que la pantalla saldrá casi vacía', () => {
    const { advertencias } = depurar({ operaciones: [{ nombre: 'listarComandasPendientes', rf: 'RF-06', tipo: 'consulta', entidad: 'Pedido', actores: ['Cocinero'], salida: ['fechaHora'] }] });
    expect(advertencias.join(' ')).toContain('devuelve un solo campo');
  });

  test('una operación ya guardada conserva lo que completa el sistema al revalidarse', () => {
    const { especificacion } = depurar({ operaciones: [crearPedido] });
    const revisada = new ApplicationSpecService({}).validar(especificacion, { modelo, rf, pantallas });
    expect(revisada.errores).toEqual([]);
    expect(revisada.operaciones[0].sesionEntradas).toEqual([{ campo: 'usuario_id', valor: 'usuario.id' }]);
  });
});

describe('compra de un paquete: lo que decide la persona y lo que no', () => {
  const compra = { nombre: 'comprarPaquete', rf: 'RF-03', tipo: 'crear', entidad: 'PaquetePrepagado', actores: ['Cliente'], entradas: ['usosTotales', 'usosRestantes', 'fechaAdquisicion', 'inicioVigencia', 'finVigencia'] };
  const pantalla = { id: 'paquetes', componentes: [{ tipo: 'formulario', operacion: 'comprarPaquete', campos: ['usosTotales', 'usosRestantes', 'fechaAdquisicion', 'inicioVigencia', 'finVigencia'] }] };

  test('el tamaño del paquete y la vigencia se piden; solo la fecha de adquisición la pone el servidor', () => {
    const { especificacion } = depurar({ operaciones: [compra], pantallas: [pantalla] });
    const operacion = especificacion.operaciones.find((item) => item.nombre === 'comprarPaquete');
    expect(operacion.autoEntradas).toEqual([{ campo: 'fechaAdquisicion', valor: 'ahora' }]);
    expect(operacion.entradas).toEqual(expect.arrayContaining(['usosTotales', 'inicioVigencia', 'finVigencia']));
    expect(especificacion.pantallas[0].componentes[0].campos).toEqual(['usosTotales', 'inicioVigencia', 'finVigencia']);
  });

  test('el cliente de una compra no se pierde si la IA lo omitió', () => {
    const { especificacion } = depurar({ operaciones: [{ ...compra, entradas: ['usosTotales'] }] });
    expect(especificacion.operaciones.find((item) => item.nombre === 'comprarPaquete').entradas).toEqual(['usosTotales', 'cliente_id']);
  });

  test('un formulario nunca queda vacío por haber ocultado todo', () => {
    const { especificacion, advertencias } = depurar({
      operaciones: [{ ...compra, entradas: ['usosRestantes'] }],
      pantallas: [{ id: 'paquetes', componentes: [{ tipo: 'formulario', operacion: 'comprarPaquete', campos: ['usosRestantes'] }] }]
    });
    expect(especificacion.pantallas[0].componentes[0].campos).toEqual(['usosRestantes']);
    expect(advertencias.join(' ')).toContain('no quede vacío');
  });
});

describe('edición que ninguna pantalla usaba', () => {
  const ia = {
    operaciones: [
      { nombre: 'listarUsuarios', rf: 'RF-14', tipo: 'consulta', entidad: 'Usuario', actores: ['Administrador'], salida: ['correo', 'rol'] },
      { nombre: 'crearUsuario', rf: 'RF-14', tipo: 'crear', entidad: 'Usuario', actores: ['Administrador'], entradas: ['correo', 'passwordHash', 'rol'] },
      { nombre: 'actualizarUsuario', rf: 'RF-14', tipo: 'actualizar', entidad: 'Usuario', actores: ['Administrador'], entradas: ['correo', 'rol'] }
    ],
    pantallas: [{ id: 'usuarios', componentes: [
      { tipo: 'tabla', operacion: 'listarUsuarios', campos: ['correo', 'rol'] },
      { tipo: 'formulario', operacion: 'crearUsuario', campos: ['correo', 'passwordHash', 'rol'], acciones: [{ etiqueta: 'Crear usuario', operacion: 'crearUsuario' }] }
    ] }]
  };

  test('la actualización propuesta por la IA se añade como «Editar» a la lista de la misma entidad', () => {
    const { especificacion, advertencias } = depurar(ia);
    const tabla = especificacion.pantallas[0].componentes[0];
    expect(tabla.acciones).toEqual([{ etiqueta: 'Editar', operacion: 'actualizarUsuario' }]);
    expect(advertencias.join(' ')).toContain('se añadió «Editar»');
  });

  test('al guardar la propuesta ya revisada se cablea igual, sin volver a llamar a la IA', () => {
    const { especificacion } = depurar(ia);
    const sinEditar = { ...especificacion, pantallas: especificacion.pantallas.map((p) => ({ ...p, componentes: p.componentes.map((c) => ({ ...c, acciones: c.acciones.filter((a) => a.etiqueta !== 'Editar') })) })) };
    const revisada = new ApplicationSpecService({}).validar(sinEditar, { modelo, rf, pantallas });
    expect(revisada.pantallas[0].componentes[0].acciones).toEqual([{ etiqueta: 'Editar', operacion: 'actualizarUsuario' }]);
  });

  test('no se añade a una lista que pertenece a un rol que no puede ejecutarla', () => {
    const conRoles = [{ pantalla_id: 'pedido', nombre: 'Pedido', roles: ['Mesero'] }];
    const { especificacion } = new ApplicationSpecService({}).depurar({
      operaciones: [
        { nombre: 'listarPedidos', rf: 'RF-15', tipo: 'consulta', entidad: 'Pedido', actores: ['Mesero'], salida: ['fechaHora'] },
        { nombre: 'marcarPedido', rf: 'RF-06', tipo: 'actualizar', entidad: 'Pedido', actores: ['Cocinero'], entradas: ['estado'] }
      ],
      pantallas: [{ id: 'pedido', componentes: [{ tipo: 'tabla', operacion: 'listarPedidos', campos: ['fechaHora'] }] }]
    }, { modelo, rf, pantallas: conRoles });
    expect(especificacion.pantallas[0].componentes[0].acciones).toEqual([]);
  });

  test('un «Editar» que quedó en la pantalla de otro rol se retira y se vuelve a ubicar en la del rol correcto', () => {
    const operaciones = [
      { nombre: 'listarPedidos', rf: 'RF-15', tipo: 'consulta', entidad: 'Pedido', actores: ['Mesero'], salida: ['fechaHora'] },
      { nombre: 'marcarPedido', rf: 'RF-06', tipo: 'actualizar', entidad: 'Pedido', actores: ['Cocinero'], entradas: ['estado'] }
    ];
    const conRoles = [{ pantalla_id: 'pedidos-mesero', nombre: 'A', roles: ['Mesero'] }, { pantalla_id: 'pedidos-cocina', nombre: 'B', roles: ['Personal de Cocina'] }];
    const guardada = { operaciones: operaciones.map((op) => ({ ...op, estado_decision: 'confirmado' })), pantallas: [
      { id: 'pedidos-mesero', componentes: [{ tipo: 'tabla', operacion: 'listarPedidos', campos: ['fechaHora'], acciones: [{ etiqueta: 'Editar', operacion: 'marcarPedido' }] }] },
      { id: 'pedidos-cocina', componentes: [{ tipo: 'tabla', operacion: 'listarPedidos', campos: ['fechaHora'], acciones: [] }] }
    ] };
    const revisada = new ApplicationSpecService({}).validar(guardada, { modelo, rf, pantallas: conRoles });
    const acciones = (id) => revisada.pantallas.find((p) => p.id === id).componentes[0].acciones;
    expect(acciones('pedidos-mesero')).toEqual([]);
    expect(acciones('pedidos-cocina')).toEqual([{ etiqueta: 'Editar', operacion: 'marcarPedido' }]);
    expect(revisada.avisos.join(' ')).toContain('se retiró «Editar»');
  });

  test('la fecha del canje la pone el servidor', () => {
    const plantuml = `@startuml
class Canje {
  +String id
  +String fechaCanje
  +int puntos
}
@enduml`;
    const dominioCanje = new DomainModelExtractor().fromDiagrams([{ ...dominio, codigo_plantuml: plantuml }]);
    const reqs = [{ aprobado: true, tipo: 'RF', identificador: 'RF-18', nombre: 'Canje de puntos', descripcion: 'x', actores: ['Cliente'] }];
    const { especificacion } = new ApplicationSpecService({}).depurar({ operaciones: [{ nombre: 'canjear', rf: 'RF-18', tipo: 'crear', entidad: 'Canje', actores: ['Cliente'], entradas: ['fechaCanje', 'puntos'] }] }, { modelo: dominioCanje, rf: reqs, pantallas: [] });
    expect(especificacion.operaciones[0].autoEntradas).toEqual([{ campo: 'fechaCanje', valor: 'ahora' }]);
    expect(especificacion.operaciones[0].entradas).toEqual(['puntos']);
  });
});

describe('ejecución de una operación de alta', () => {
  const cargar = (definiciones) => {
    const fuente = fs.readFileSync(path.resolve(__dirname, '../src/infrastructure/templates/actions/actions-runtime.js'), 'utf8').replace('__DEFINITIONS__', JSON.stringify(definiciones));
    const modulo = { exports: {} };
    new Function('module', 'exports', 'require', fuente)(modulo, modulo.exports, require);
    return modulo.exports;
  };
  const definicion = { name: 'registrarPedido', type: 'crear', method: 'POST', byId: false, capability: 'rf-15', inputs: ['mesa'], sessionInputs: [{ campo: 'usuario_id', valor: 'usuario.id' }], autoInputs: [{ campo: 'fechaHora', valor: 'ahora' }] };

  test('el servidor pone la cuenta de la sesión y la fecha, y no acepta que la petición los falsifique', async () => {
    const guardado = [];
    const { run } = cargar([definicion]);
    const store = { create: async (capability, values) => { guardado.push(values); return { id: '1', data: values }; } };
    await run(store, definicion, { body: { mesa: 'm1', usuario_id: 'falso', fechaHora: '2000' }, user: { id: 'u-7' } });
    expect(guardado[0].usuario_id).toBe('u-7');
    expect(guardado[0].fechaHora).not.toBe('2000');
    expect(guardado[0].mesa).toBe('m1');
  });

  test('el servidor pone el estado inicial y genera el código', async () => {
    const guardado = [];
    const def = { name: 'crearReserva', type: 'crear', method: 'POST', byId: false, capability: 'rf-02', inputs: ['mesa'],
      autoInputs: [{ campo: 'estado', valor: 'inicial', opciones: ['PENDIENTE', 'CONFIRMADA'] }, { campo: 'codigoQr', valor: 'generado' }] };
    const { run } = cargar([def]);
    const store = { create: async (capability, values) => { guardado.push(values); return { id: '1', data: values }; } };
    await run(store, def, { body: { mesa: 'm1', estado: 'CONFIRMADA', codigoQr: 'falso' }, user: { id: 'u-1' } });
    expect(guardado[0].estado).toBe('PENDIENTE');
    expect(guardado[0].codigoQr).toMatch(/^[0-9A-F]{10}$/);
    expect(guardado[0].mesa).toBe('m1');
  });

  test('sin sesión no se crea nada', async () => {
    const { run } = cargar([definicion]);
    await expect(run({ create: jest.fn() }, definicion, { body: { mesa: 'm1' } })).rejects.toMatchObject({ status: 401 });
  });
});
