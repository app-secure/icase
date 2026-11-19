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
Usuario "1" --> "0..*" Pedido
Usuario "1" --> "0..*" SesionCaja
@enduml`;

const dominio = { tipo: 'clases_dominio', aprobado: true, estado: 'aprobado', desactualizado: false, codigo_plantuml: PLANTUML };
const rf = [
  { aprobado: true, tipo: 'RF', identificador: 'RF-05', nombre: 'Validación de reserva mediante QR', descripcion: 'El mesero valida la reserva con el código QR.', actores: ['Mesero'] },
  { aprobado: true, tipo: 'RF', identificador: 'RF-06', nombre: 'Visualización de comandas en KDS', descripcion: 'La cocina ve las comandas.', actores: ['Cocinero'] },
  { aprobado: true, tipo: 'RF', identificador: 'RF-14', nombre: 'Gestión de usuarios', descripcion: 'El administrador registra usuarios.', actores: ['Administrador'] },
  { aprobado: true, tipo: 'RF', identificador: 'RF-15', nombre: 'Registro de pedidos', descripcion: 'El mesero registra pedidos.', actores: ['Mesero'] },
  { aprobado: true, tipo: 'RF', identificador: 'RF-08', nombre: 'Cierre de sesión de caja', descripcion: 'El cajero cierra la caja.', actores: ['Cajero'] }
];
const pantallas = [
  { pantalla_id: 'validacion-qr', nombre: 'Validación QR' }, { pantalla_id: 'pedido', nombre: 'Pedido' },
  { pantalla_id: 'usuarios', nombre: 'Usuarios' }, { pantalla_id: 'kds', nombre: 'KDS' }
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
    expect(especificacion.operaciones.find((item) => item.nombre === 'registrarPedido').entradas).toEqual(expect.arrayContaining(['estado', 'total']));
  });

  test('la marca de tiempo del propio registro la pone el servidor', () => {
    const { especificacion } = depurar({ operaciones: [{ nombre: 'registrarCierreCaja', rf: 'RF-08', tipo: 'crear', entidad: 'SesionCaja', actores: ['Cajero'], entradas: ['fechaCierre', 'fondoInicial', 'usuario_id'] }] });
    const operacion = especificacion.operaciones.find((item) => item.nombre === 'registrarCierreCaja');
    expect(operacion.autoEntradas).toEqual([{ campo: 'fechaCierre', valor: 'ahora' }]);
    expect(operacion.entradas).toEqual(['fondoInicial']);
  });

  test('en la gestión de usuarios la contraseña y el rol sí los escribe la persona', () => {
    const { especificacion } = depurar({
      operaciones: [{ nombre: 'gestionarUsuario', rf: 'RF-14', tipo: 'crear', entidad: 'Usuario', actores: ['Administrador'], entradas: ['correo', 'passwordHash', 'rol'] }],
      pantallas: [{ id: 'usuarios', componentes: [{ tipo: 'formulario', operacion: 'gestionarUsuario', campos: ['correo', 'passwordHash', 'rol'] }] }]
    });
    expect(especificacion.pantallas[0].componentes[0].campos).toEqual(['correo', 'passwordHash', 'rol']);
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

  test('sin sesión no se crea nada', async () => {
    const { run } = cargar([definicion]);
    await expect(run({ create: jest.fn() }, definicion, { body: { mesa: 'm1' } })).rejects.toMatchObject({ status: 401 });
  });
});
