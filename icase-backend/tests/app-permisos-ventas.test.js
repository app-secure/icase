const GenericFrontendGenerator = require('../src/infrastructure/services/GenericFrontendGenerator');
const { transformSync } = require('esbuild');

// Caso Ventas: el vendedor solo consulta productos; el administrador gestiona productos y usuarios.
const pantalla = (nombre, slug, rf) => ({ nombre, slug, plataforma: 'web', roles: ['Vendedor', 'Administrador'], rf_trazabilidad: rf });
const generar = (screens) => new GenericFrontendGenerator().generate({
  proyecto: { nombre: 'Ventas' },
  screens,
  requerimientos: [
    { aprobado: true, tipo: 'RF', identificador: 'RF-05', nombre: 'Gestionar productos' },
    { aprobado: true, tipo: 'RF', identificador: 'RF-10', nombre: 'Gestionar usuarios' }
  ],
  identidad: { usuarios: ['RF-10'] },
  decisiones: {
    stack_tecnologico: { plataformas: ['web'] },
    control_acceso: { autenticacion: { metodo: 'jwt' }, roles: [{ id: 'vendedor', nombre: 'Vendedor', incluir: true }] }
  }
}).find((file) => file.ruta === 'frontend/src/App.jsx').contenido;

const conUsuarios = generar([
  pantalla('Listado de productos', 'listado-de-productos', ['RF-05']),
  pantalla('Formulario de creación de producto', 'formulario-de-creacion-de-producto', ['RF-05']),
  pantalla('Formulario de registro de producto', 'formulario-de-registro-de-producto', ['RF-05']),
  pantalla('Formulario de edición de producto', 'formulario-de-edicion-de-producto', ['RF-05']),
  pantalla('Detalle de producto', 'detalle-de-producto', ['RF-05']),
  pantalla('Listado de usuarios', 'listado-de-usuarios', ['RF-10'])
]);
const sinUsuarios = generar([pantalla('Listado de productos', 'listado-de-productos', ['RF-05'])]);

// Las funciones de permiso del App.jsx generado, evaluadas tal cual.
const funciones = (app) => {
  const fuente = `${app.match(/const entityOf = .*;/)[0]}\n${app.match(/const normalizarRol = [\s\S]*?(?=\nexport default function App)/)[0]}`;
  return new Function(`${fuente}\nreturn { puedeAbrirPantalla, esListadoUsuarios };`)();
};
const views = JSON.parse(conUsuarios.match(/const views = (\[.*\]);/)[1]);
const vista = (name) => views.find((view) => view.name === name);
const { puedeAbrirPantalla, esListadoUsuarios } = funciones(conUsuarios);

const vendedor = { rol: 'vendedor' };
const soloConsulta = (operation, method) => method === 'GET';
const todo = () => true;

describe('permisos de pantallas de la aplicación generada (caso Ventas)', () => {
  test('el vendedor que solo consulta productos ve el listado y el detalle, no el alta ni la edición', () => {
    expect(vista('Listado de productos').operations).toEqual(['rf-05']);
    expect(puedeAbrirPantalla(vista('Listado de productos'), vendedor, soloConsulta)).toBe(true);
    expect(puedeAbrirPantalla(vista('Detalle de producto'), vendedor, soloConsulta)).toBe(true);
    expect(puedeAbrirPantalla(vista('Formulario de creación de producto'), vendedor, soloConsulta)).toBe(false);
    expect(puedeAbrirPantalla(vista('Formulario de registro de producto'), vendedor, soloConsulta)).toBe(false);
    expect(puedeAbrirPantalla(vista('Formulario de edición de producto'), vendedor, soloConsulta)).toBe(false);
  });

  test('el alta exige POST y la edición PATCH en alguna de sus operaciones', () => {
    const pedidos = [];
    const registra = (operation, method) => { pedidos.push(method); return false; };
    puedeAbrirPantalla(vista('Formulario de creación de producto'), vendedor, registra);
    puedeAbrirPantalla(vista('Formulario de edición de producto'), vendedor, registra);
    puedeAbrirPantalla(vista('Listado de productos'), vendedor, registra);
    expect(pedidos).toEqual(['POST', 'PATCH', 'GET']);
    expect(puedeAbrirPantalla(vista('Formulario de creación de producto'), vendedor, (op, method) => method === 'POST')).toBe(true);
    expect(puedeAbrirPantalla(vista('Formulario de edición de producto'), vendedor, (op, method) => method === 'PATCH')).toBe(true);
    expect(puedeAbrirPantalla(vista('Formulario de edición de producto'), vendedor, (op, method) => method === 'POST')).toBe(false);
    expect(puedeAbrirPantalla(vista('Formulario de creación de producto'), { rol: 'administrador' }, todo)).toBe(true);
  });

  test('con un listado de usuarios diseñado, «Administración» no repite el enlace genérico pero conserva su ruta', () => {
    expect(esListadoUsuarios(vista('Listado de usuarios'))).toBe(true);
    expect(esListadoUsuarios(vista('Listado de productos'))).toBe(false);
    expect(conUsuarios).toContain('const usuariosDisenados = menu.some(esListadoUsuarios);');
    expect(conUsuarios).toContain("{!usuariosDisenados && <Link to=\"/usuarios\" {...linkProps('/usuarios')}>Usuarios</Link>}");
    expect(conUsuarios).toContain('{user.administrador && <Route path="/usuarios" element={<UsersScreen />} />}');
    expect(() => transformSync(conUsuarios, { loader: 'jsx' })).not.toThrow();
  });

  test('sin listado de usuarios diseñado, el administrador sigue viendo «Usuarios»', () => {
    const viewsSin = JSON.parse(sinUsuarios.match(/const views = (\[.*\]);/)[1]);
    const { esListadoUsuarios: esListado } = funciones(sinUsuarios);
    expect(viewsSin.some(esListado)).toBe(false);
    expect(() => transformSync(sinUsuarios, { loader: 'jsx' })).not.toThrow();
  });
});

describe('trazabilidad ruidosa en un formulario de alta (caso Ventas real)', () => {
  test('el alta de producto se juzga por la operación de productos, no por la de ventas que también trae', () => {
    const app = new (require('../src/infrastructure/services/GenericFrontendGenerator'))().generate({
      proyecto: { nombre: 'Ventas' },
      screens: [{ nombre: 'Formulario de creación de producto', slug: 'formulario-de-creacion-de-producto', plataforma: 'web', roles: ['Vendedor'], rf_trazabilidad: ['RF-01', 'RF-05'] }],
      requerimientos: [{ aprobado: true, tipo: 'RF', identificador: 'RF-01', nombre: 'Registrar venta' }, { aprobado: true, tipo: 'RF', identificador: 'RF-05', nombre: 'Gestionar productos' }],
      spec: { acciones: [{ name: 'crearVenta', type: 'crear', capability: 'rf-01', entity: 'venta' }, { name: 'crearProducto', type: 'crear', capability: 'rf-05', entity: 'producto' }] },
      decisiones: { stack_tecnologico: { plataformas: ['web'] }, control_acceso: { autenticacion: { metodo: 'jwt' }, roles: [{ id: 'vendedor', nombre: 'Vendedor', incluir: true }] } }
    }).find((file) => file.ruta === 'frontend/src/App.jsx').contenido;
    const { puedeAbrirPantalla } = funciones(app);
    const view = JSON.parse(app.match(/const views = (\[.*\]);/)[1])[0];
    const vende = (operation, method) => operation === 'rf-01' ? ['GET', 'POST'].includes(method) : method === 'GET';
    expect(puedeAbrirPantalla(view, { rol: 'vendedor' }, vende)).toBe(false);
    expect(puedeAbrirPantalla(view, { rol: 'vendedor' }, (operation, method) => method === 'POST')).toBe(true);
  });
});
