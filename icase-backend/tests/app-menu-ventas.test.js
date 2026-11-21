const GenericFrontendGenerator = require('../src/infrastructure/services/GenericFrontendGenerator');
const { transformSync } = require('esbuild');

// Caso Ventas: el árbol trae la pantalla de inicio de sesión (con trazabilidad ruidosa), listados, formularios y detalles.
const pantalla = (nombre, slug, rf) => ({ nombre, slug, plataforma: 'web', roles: ['Vendedor', 'Administrador'], rf_trazabilidad: rf });
const files = new GenericFrontendGenerator().generate({
  proyecto: { nombre: 'Ventas' },
  screens: [
    pantalla('Inicio de sesión', 'inicio-de-sesion', ['RF-04', 'RF-07']),
    pantalla('Listado de ventas', 'listado-de-ventas', ['RF-04']),
    pantalla('Formulario de registro de venta', 'formulario-de-registro-de-venta', ['RF-01']),
    pantalla('Detalle de venta', 'detalle-de-venta', ['RF-04']),
    pantalla('Formulario de edición de cliente', 'formulario-de-edicion-de-cliente', ['RF-07'])
  ],
  requerimientos: [
    { aprobado: true, tipo: 'RF', identificador: 'RF-01', nombre: 'Registrar venta con selección de cliente y productos' },
    { aprobado: true, tipo: 'RF', identificador: 'RF-02', nombre: 'Capturar datos de venta con líneas de producto' },
    { aprobado: true, tipo: 'RF', identificador: 'RF-03', nombre: 'Emitir factura interna con número correlativo' },
    { aprobado: true, tipo: 'RF', identificador: 'RF-04', nombre: 'Consultar ventas' },
    { aprobado: true, tipo: 'RF', identificador: 'RF-07', nombre: 'Gestionar clientes' },
    { aprobado: true, tipo: 'RF', identificador: 'RF-12', nombre: 'Autenticar acceso según rol' }
  ],
  spec: { acciones: [
    { name: 'crearVenta', type: 'crear', capability: 'rf-01', entity: 'venta', entityName: 'Venta', lineas: { capability: 'rf-02', entidadClave: 'lineaventa' } },
    { name: 'consultarLineas', type: 'consulta', capability: 'rf-02', entity: 'lineaventa', entityName: 'LineaVenta' },
    { name: 'emitirFactura', type: 'crear', capability: 'rf-03', entity: 'factura', entityName: 'Factura' },
    { name: 'consultarVentas', type: 'consulta', capability: 'rf-04', entity: 'venta', entityName: 'Venta' }
  ] },
  decisiones: {
    stack_tecnologico: { plataformas: ['web'] },
    control_acceso: { autenticacion: { metodo: 'jwt' }, roles: [{ id: 'vendedor', nombre: 'Vendedor', incluir: true }] }
  }
});
const app = files.find((file) => file.ruta === 'frontend/src/App.jsx').contenido;

describe('menú de la aplicación generada (caso Ventas)', () => {
  test('la pantalla diseñada de inicio de sesión no se genera: la aplicación trae su propio acceso', () => {
    expect(files.map((file) => file.ruta)).not.toContain('frontend/src/pages/inicio-de-sesion.jsx');
    expect(app).not.toContain('/inicio-de-sesion');
  });

  test('detalle y edición no van en el menú (necesitan un registro elegido) pero siguen con ruta', () => {
    const views = JSON.parse(app.match(/const views = (\[.*\]);/)[1]);
    const menu = Object.fromEntries(views.map((view) => [view.name, view.menu !== false]));
    expect(menu).toEqual({ 'Listado de ventas': true, 'Formulario de registro de venta': true, 'Detalle de venta': false, 'Formulario de edición de cliente': false });
    expect(app).toContain('path="/detalle-de-venta"');
  });

  test('«Registros» nombra cada dato por su entidad y marca las líneas para no ofrecerlas aparte', () => {
    const registros = JSON.parse(app.match(/const registryOperations = (\[.*\]);/)[1]);
    expect(registros.find((item) => item.key === 'rf-03')).toEqual({ key: 'rf-03', label: 'Facturas', entity: 'factura' });
    expect(registros.find((item) => item.key === 'rf-02')).toMatchObject({ label: 'Lineas venta', linea: true });
    expect(app).toContain('!(op.entity && listedEntities.has(op.entity))');
    expect(() => transformSync(app, { loader: 'jsx' })).not.toThrow();
  });
});
