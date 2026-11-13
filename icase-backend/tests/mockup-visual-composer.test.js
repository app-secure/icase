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
