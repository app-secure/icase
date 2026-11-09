const { transformSync } = require('esbuild');
const HtmlToJsxTransformer = require('../src/infrastructure/services/HtmlToJsxTransformer');
const Frontend = require('../src/infrastructure/services/GenericFrontendGenerator');

const compiles = (jsx) => transformSync(`const x = (<div>${jsx}</div>);`, { loader: 'jsx' });
const body = (html) => `<!DOCTYPE html><html><body>${html}</body></html>`;
const operaciones = new Set(['rf-03']);

describe('HtmlToJsxTransformer: enlaces data-accion', () => {
  test('un enlace válido a una operación permitida recibe su manejador y conserva el atributo', () => {
    const jsx = HtmlToJsxTransformer.transform(body('<form><input name="sala"><button data-accion="RF-03.crear">Confirmar reserva</button></form>'), { operaciones });
    expect(jsx).toContain('data-accion="RF-03.crear"');
    expect(jsx).toContain('onClick={(event) => handleAction(event, "rf-03", "crear")}');
    expect(() => compiles(jsx)).not.toThrow();
  });

  test('un enlace en <a> también se cablea y el RF no distingue mayúsculas', () => {
    const jsx = HtmlToJsxTransformer.transform(body('<a href="#" data-accion="rf-03.CONSULTAR">Ver</a>'), { operaciones });
    expect(jsx).toContain('handleAction(event, "rf-03", "consultar")');
  });

  test.each([
    ['RF fuera de las operaciones', 'RF-99.crear'],
    ['control visual', 'ui'],
    ['verbo inválido', 'RF-03.reservar'],
    ['formato inválido', 'crear-reserva']
  ])('no cablea: %s', (_name, value) => {
    const jsx = HtmlToJsxTransformer.transform(body(`<button data-accion="${value}">X</button>`), { operaciones });
    expect(jsx).not.toContain('handleAction');
  });

  test('comportamiento previo: sin opciones o sin data-accion nada se cablea y los eventos on* siguen eliminados', () => {
    expect(HtmlToJsxTransformer.transform(body('<button data-accion="RF-03.crear">X</button>'))).not.toContain('handleAction');
    const jsx = HtmlToJsxTransformer.transform(body('<button onclick="reservar()">X</button>'), { operaciones });
    expect(jsx).not.toContain('onclick');
    expect(jsx).not.toContain('handleAction');
  });
});

describe('GenericFrontendGenerator: páginas con enlaces', () => {
  const requerimientos = [{ identificador: 'RF-03', tipo: 'RF', aprobado: true, nombre: 'Reservar sala' }];
  const generate = (html, extra = {}) => new Frontend().generate({
    proyecto: { nombre: 'Salas' },
    screens: [{ nombre: 'Reservas', slug: 'reservas', rf_trazabilidad: ['RF-03'], mockup: { preview_code: html } }],
    decisiones: {}, requerimientos, ...extra
  });
  const file = (files, ruta) => files.find((item) => item.ruta === ruta);
  const linked = body('<main><form><input name="sala"><button data-accion="RF-03.crear">Confirmar reserva</button></form></main>');

  test('la página del mockup importa el runtime, cablea el botón y muestra el resultado', () => {
    const files = generate(linked);
    const pageCode = file(files, 'frontend/src/pages/reservas.jsx').contenido;
    expect(pageCode).toContain("from '../mockupActions'");
    expect(pageCode).toContain("import MockupResult from '../MockupResult'");
    expect(pageCode).toContain('const { api, can } = useSession()');
    expect(pageCode).toContain('handleAction(event, "rf-03", "crear")');
    expect(pageCode).toContain('<MockupResult result={result} selected={selected} onSelect={setSelected} />');
    expect(pageCode).toContain('const [selected, setSelected] = useState(null);');
    expect(pageCode).toContain('selected, onSelect: setSelected');
    expect(() => transformSync(pageCode, { loader: 'jsx' })).not.toThrow();
    expect(file(files, 'frontend/src/mockupActions.js')).toBeTruthy();
    expect(file(files, 'frontend/src/MockupResult.jsx')).toBeTruthy();
  });

  test('un RF aprobado distinto del de la pantalla también se cablea; uno no aprobado no', () => {
    const html = body('<main><button data-accion="RF-03.consultar">A</button><button data-accion="RF-07.consultar">B</button></main>');
    const pageCode = file(generate(html, { screens: [{ nombre: 'Reservas', slug: 'reservas', rf_trazabilidad: ['RF-01'], mockup: { preview_code: html } }], requerimientos: [...requerimientos, { identificador: 'RF-07', tipo: 'RF', aprobado: false }] }), 'frontend/src/pages/reservas.jsx').contenido;
    expect(pageCode).toContain('"rf-03", "consultar"');
    expect(pageCode).not.toContain('"rf-07"');
  });

  test('un mockup sin enlaces válidos no cambia: ni importa el runtime ni añade archivos', () => {
    const files = generate(body('<main><button>Confirmar reserva</button><button data-accion="ui">Cerrar</button></main>'));
    expect(file(files, 'frontend/src/pages/reservas.jsx').contenido).not.toContain('mockupActions');
    expect(file(files, 'frontend/src/mockupActions.js')).toBeUndefined();
    expect(file(files, 'frontend/src/MockupResult.jsx')).toBeUndefined();
  });

  test('comportamiento previo: el panel Gestión de Datos y el interruptor de vista se conservan', () => {
    const pageCode = file(generate(linked), 'frontend/src/pages/reservas.jsx').contenido;
    expect(pageCode).toContain('Gestión de Datos (API)');
    expect(pageCode).toContain('<OperationScreen');
  });

  test('con autenticación el runtime recibe `can` de la sesión', () => {
    const files = generate(linked, { decisiones: { control_acceso: { autenticacion: { metodo: 'jwt' } } } });
    expect(file(files, 'frontend/src/pages/reservas.jsx').contenido).toContain('const { api, can } = useSession()');
  });
});
