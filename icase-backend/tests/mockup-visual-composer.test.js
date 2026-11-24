const { compose, interfaceContext } = require('../src/infrastructure/services/MockupVisualComposer');
describe('Estructura visual común de mockups', () => {
  const screen = { plataforma: 'mobile', shell: 'cliente', slug: 'reserva' };
  const manifest = [{ ...screen, nombre: 'Reserva' }];
  test('recupera cierres y conserva campos, acciones y contenido', () => {
    const html = compose('<main><h1>Reservar</h1><form><label>Fecha<input name="fecha"><button data-accion="RF-01.crear">Guardar', { screen, manifest, name: 'Aplicación' });
    expect(html).toContain('name="fecha"');
    expect(html).toContain('RF-01.crear');
    expect(html).toContain('Aplicación');
    expect(html).toContain('</html>');
    expect(html.match(/<header>/g)).toHaveLength(1);
    expect(html.match(/<nav /g)).toHaveLength(1);
  });
  test('no duplica navegación ni pierde contenido al recomponer', () => {
    const first = compose('<main><header>Duplicado</header><nav>Otro</nav><p>Contenido</p></main>', { screen, manifest });
    const next = compose(first, { screen, manifest, identity: { nombre_aplicacion: 'Nuevo' } });
    expect(next).toContain('Contenido');
    expect(next).not.toContain('Duplicado');
    expect(next.match(/<header>/g)).toHaveLength(1);
    expect(next).toContain('Nuevo');
  });
  test('no convierte salida vacía en una maqueta aparentemente válida', () => expect(compose('')).toBe(''));
  test('selecciona RNF de interfaz por actor y mantiene su referencia', () => {
    const req = { tipo: 'RNF', identificador: 'RNF-01', nombre: 'Usabilidad de pantallas', actores: ['Mesero'] };
    expect(interfaceContext([req], { roles: ['Mesero'] })).toContain('RNF-01');
    expect(interfaceContext([req], { roles: ['Cliente'] })).toBe('');
  });
});

describe('menú lateral web', () => {
  test('lista los destinos de primer nivel (sin formularios ni detalles) y en un detalle se resalta la lista de la que se llega', () => {
    const mk = (slug, nombre) => ({ slug, nombre, shell: 'operaciones-web', plataforma: 'web', roles: ['Administrador'] });
    const manifest = [mk('ventas', 'Ventas'), mk('formulario-de-venta', 'Formulario de venta'), mk('detalle-de-venta', 'Detalle de venta'), mk('reporte', 'Reporte de ventas')];
    const enLista = compose('<main><h1>Ventas</h1><p>x</p></main>', { screen: manifest[0], manifest, name: 'App' });
    expect(enLista).toContain('>Ventas</a>');
    expect(enLista).toContain('>Reporte de ventas</a>');
    expect(enLista).not.toContain('>Formulario de venta</a>');
    expect(enLista).not.toContain('>Detalle de venta</a>');
    const enDetalle = compose('<main><h1>Detalle</h1><p>x</p></main>', { screen: manifest[2], manifest, name: 'App' });
    expect(enDetalle).not.toContain('>Detalle de venta</a>');
    expect(enDetalle).not.toContain('>Formulario de venta</a>');
    expect(enDetalle).toMatch(/aria-current="page">Ventas<\/a>/);
  });
});

describe('papel de la pantalla', () => {
  const MockupScreenRole = require('../src/core/services/MockupScreenRole');
  const all = [{ nombre: 'Formulario de venta', slug: 'f' }];
  test('solo el listado de la entidad recibe el botón Nuevo; consultas, anulaciones y reportes no', () => {
    expect(MockupScreenRole.of({ nombre: 'Ventas', slug: 'v' }, all).formularioHermano).toBe('Formulario de venta');
    for (const nombre of ['Anulación de venta', 'Reporte de ventas por rango de fechas', 'Ventas por vendedor']) {
      expect(MockupScreenRole.of({ nombre, slug: nombre }, all).formularioHermano).toBeNull();
    }
  });
});
