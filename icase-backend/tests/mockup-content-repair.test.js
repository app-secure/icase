const MockupContentRepair = require('../src/infrastructure/services/MockupContentRepair');
const MockupContentLint = require('../src/infrastructure/services/MockupContentLint');

const repair = (html, options = {}) => new MockupContentRepair().reparar(html, options);
const page = (main, head = '') => `<html><head>${head}</head><body><main>${main}</main></body></html>`;

describe('reparación determinista del contenido de un mockup', () => {
  const loading = page('<h1>Usuarios</h1><table><thead><tr><th>Nombre</th><th>Correo</th><th>Rol</th><th>Acciones</th></tr></thead><tbody id="x"><tr><td colspan="4">Cargando usuarios...</td></tr></tbody></table>');

  test('una tabla con filas «Cargando…» recibe filas de ejemplo coherentes con sus encabezados', () => {
    const { html, cambios } = repair(loading);
    expect(html).not.toMatch(/Cargando/);
    expect(html.match(/<tr class="border-b/g)).toHaveLength(3);
    expect(html).toMatch(/@ejemplo\.com/);
    expect(html).toContain('Mesero');
    expect(html).toContain('>Ver</button>');
    expect(html).toContain('<tbody id="x">');
    expect(cambios).toContain('Filas «Cargando…» sustituidas por filas de ejemplo');
  });

  test('una tabla con filas reales no se toca', () => {
    const real = page('<table><thead><tr><th>Nombre</th></tr></thead><tbody><tr><td>Ana</td></tr></tbody></table>');
    expect(repair(real).html).toBe(real);
  });

  test('define solo las clases comodín que la pantalla usa y no define', () => {
    const { html } = repair(page('<button class="btn-primary">Guardar</button><div class="table-container"></div>', '<style>.table-container{border:1px solid red}</style>'));
    expect(html).toContain('<style id="icase-aliases">');
    expect(html).toContain('.btn-primary{');
    expect(html.match(/\.table-container\{/g)).toHaveLength(1); // ya la definía el propio mockup
    expect(repair(page('<p class="p-4">x</p>')).html).not.toContain('icase-aliases');
  });

  test('los importes usan la moneda del proyecto solo en el texto', () => {
    const { html } = repair(page('<p class="text-[$x]">Total: $45.50 y $ 10.00</p>'), { moneda: 'S/' });
    expect(html).toContain('Total: S/ 45.50 y S/ 10.00');
    expect(html).toContain('text-[$x]');
    expect(repair(page('<p>$5</p>'), { moneda: '$' }).html).toContain('$5');
    expect(repair(page('<p>$5</p>')).html).toContain('$5');
  });

  test('la moneda sale de los requisitos', () => {
    expect(MockupContentRepair.currencyOf({ requerimientos: [{ descripcion: 'Los importes se muestran en soles.' }] })).toBe('S/');
    expect(MockupContentRepair.currencyOf({ requerimientos: [{ descripcion: 'Pago en USD' }] })).toBe('$');
    expect(MockupContentRepair.currencyOf({ requerimientos: [{ descripcion: 'Sin datos' }] })).toBeNull();
  });

  test('restituye la codificación rota y las tildes perdidas', () => {
    expect(repair(page('<p>Sesi\uFFFDn y contrase\uFFFDa de P\uFFFDrez</p>')).html).toContain('Sesión y contraseña de Pérez');
    expect(repair(page('<p>PÃ©rez</p>')).html).toContain('Pérez');
    expect(repair(page('<p>Desconoc\uFFFDda</p>')).html).toContain('Desconoc\uFFFDda'); // sin certeza no se inventa
  });

  test('marca como solo interfaz los controles claramente visuales y deja lo demás', () => {
    const { html } = repair(page('<p><button>Todos</button> o <button>Cerrar</button></p><p>Importe <button>Registrar cobro</button></p>'), { requerimientos: [] });
    expect(html).toContain('<button data-accion="ui">Todos</button>');
    expect(html).toContain('<button data-accion="ui">Cerrar</button>');
    expect(html).toContain('<button>Registrar cobro</button>');
  });
});

describe('linter de contenido', () => {
  const lint = (html, ajustes) => new MockupContentLint().revisar(html, ajustes);
  const rico = page(`<h1>Cobros</h1><p>${'Registro de pagos de la sesión actual con su importe y medio de pago. '.repeat(3)}</p>`);

  test('una pantalla con contenido no tiene defectos', () => {
    expect(lint(rico, [])).toEqual([]);
  });

  test('un script eliminado o filas de carga se rechazan con el motivo exacto', () => {
    expect(lint(rico, ['Script peligroso o no autorizado eliminado'])[0]).toMatch(/incluye un <script>.*HTML estático/);
    expect(lint(page('<h1>X</h1><table><tbody><tr><td colspan="2">Cargando…</td></tr></tbody></table>'), [])).toEqual(expect.arrayContaining([expect.stringMatching(/Cargando/)]));
  });
});

describe('controles de acceso y grupos de botones', () => {
  test('«Iniciar sesión» y similares son solo interfaz: el acceso lo resuelve la sesión', () => {
    const { html } = repair(page('<form><input name="correo"><button type="submit">Iniciar sesión</button></form><button>Recuperar contraseña</button>'));
    expect(html).toContain('<button data-accion="ui" type="submit">Iniciar sesión</button>');
    expect(html).toContain('<button data-accion="ui">Recuperar contraseña</button>');
  });

  test('un grupo de botones hermanos (pestañas de estado, selector) se marca como solo interfaz; un botón suelto no', () => {
    const { html } = repair(page('<div><button>Confirmadas</button><button>Canceladas</button><button>Liberadas</button></div><div><button>Guardar</button><span>x</span></div>'));
    expect(html.match(/data-accion="ui"/g)).toHaveLength(3);
    expect(html).toContain('<button>Guardar</button>');
  });
});

describe('estructura común del mockup', () => {
  const MockupVisualComposer = require('../src/infrastructure/services/MockupVisualComposer');
  const compose = (main, screen = { nombre: 'Pantalla de usuarios', slug: 'usuarios', plataforma: 'web' }) => MockupVisualComposer.compose(`<html><head></head><body><main>${main}</main></body></html>`, { screen, manifest: [screen], identity: {}, name: 'App' });

  test('una pantalla que empieza directamente por la tarjeta recibe su título, sin el prefijo «Pantalla de»', () => {
    const html = compose('<div class="card"><table><tr><td>x</td></tr></table></div>');
    expect(html).toMatch(/<main[^>]*><h1[^>]*>Usuarios<\/h1><div class="card"/);
  });

  test('si ya tiene título no se añade otro, y las tablas no se fuerzan a display:block', () => {
    const html = compose('<h1>Mis usuarios</h1><div><table class="w-full"></table></div>');
    expect(html.match(/<h1/g)).toHaveLength(1);
    expect(html).not.toContain('.icase-content table{display:block');
    expect(html).toContain(':has(>table){overflow-x:auto}');
  });
});

describe('alineación del contenido en la estructura común y en la app', () => {
  test('un contenedor angosto sin mx-auto se centra, y una rejilla con un solo hijo ocupa todo el ancho', () => {
    const MockupVisualComposer = require('../src/infrastructure/services/MockupVisualComposer');
    const html = MockupVisualComposer.compose('<html><head></head><body><main><div class="max-w-2xl p-8"><h1>X</h1></div></main></body></html>', { screen: { nombre: 'Edición', slug: 'edicion', plataforma: 'web' }, manifest: [], identity: {}, name: 'App' });
    expect(html).toContain('.icase-content>[class*="max-w-"]:not([class*="mx-auto"]){margin-left:auto;margin-right:auto}');
    expect(html).toContain('.icase-content .grid:has(>:only-child){grid-template-columns:minmax(0,1fr)!important}');
    const GenericFrontendGenerator = require('../src/infrastructure/services/GenericFrontendGenerator');
    const files = new GenericFrontendGenerator().generate({ proyecto: { nombre: 'App' }, screens: [{ nombre: 'Edición', slug: 'edicion', plataforma: 'web', roles: [], rf_trazabilidad: ['RF-01'] }], decisiones: { stack_tecnologico: { plataformas: ['web'] } } });
    const css = files.find((file) => file.ruta === 'frontend/src/styles.css').contenido;
    expect(css).toContain('.mockup-content>[class*="max-w-"]:not([class*="mx-auto"])');
  });
});

describe('botón «volver» duplicado en pantallas móviles de segundo nivel', () => {
  const MockupVisualComposer = require('../src/infrastructure/services/MockupVisualComposer');
  const screens = [{ nombre: 'Menú', slug: 'menu', plataforma: 'mobile', flujo: 'Menú', modulo: 'Menú' }, { nombre: 'Detalle de Plato', slug: 'detalle-de-plato', plataforma: 'mobile', flujo: 'Menú', modulo: 'Menú' }];
  const compose = (main, screen) => MockupVisualComposer.compose(`<html><head></head><body><main>${main}</main></body></html>`, { screen, manifest: screens, identity: {}, name: 'App' });

  test('se quita el «volver» del modelo y queda el del marco; en una pantalla principal no se toca', () => {
    const detalle = compose('<div><button type="button" aria-label="Volver">←</button><h1>Detalle de Plato</h1></div><button>Agregar al pedido</button>', screens[1]);
    expect(detalle.match(/class="icase-back"/g)).toHaveLength(1);
    expect(detalle).not.toContain('>←<');
    expect(detalle).toContain('Agregar al pedido');
    const menu = compose('<button aria-label="Volver">←</button><h1>Menú</h1>', screens[0]);
    expect(menu).toContain('>←<');
  });

  test('un icono de flecha sin texto también se reconoce, y «Volver al menú» largo no', () => {
    const icono = compose('<button><svg><path d="M15 19l-7-7 7-7"/></svg></button><h1>Detalle</h1>', screens[1]);
    expect(icono).not.toContain('M15 19l-7-7 7-7');
    const largo = compose('<h1>Detalle</h1><button>Volver al menú principal de la aplicación</button>', screens[1]);
    expect(largo).toContain('Volver al menú principal');
  });
});
