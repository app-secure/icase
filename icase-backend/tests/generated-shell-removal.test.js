const HtmlToJsxTransformer = require('../src/infrastructure/services/HtmlToJsxTransformer');
const { compose } = require('../src/infrastructure/services/MockupVisualComposer');
const FrontendScaffoldGenerator = require('../src/infrastructure/services/FrontendScaffoldGenerator');

const manifest = [
  { slug: 'mesas', nombre: 'Mesas', shell: 'operaciones-web', plataforma: 'web' },
  { slug: 'caja', nombre: 'Caja', shell: 'operaciones-web', plataforma: 'web' }
];
const contenido = '<main><style>.tarjeta{color:red}</style><h1>Mesas asignadas</h1><form><input name="numero"><button data-accion="ui">Guardar</button></form></main>';

describe('el frontend generado no repite la cabecera ni el menú del mockup', () => {
  const html = compose(contenido, { screen: manifest[0], manifest, name: 'Demo' });

  test('el mockup compuesto trae cabecera y menú propios', () => {
    expect(html).toContain('<header>');
    expect(html).toContain('class="icase-nav"');
  });

  test('al convertirlo solo se conserva el contenido de la pantalla', () => {
    const analysis = HtmlToJsxTransformer.analyze(html);
    expect(analysis.shellRemoved).toBe(true);
    expect(analysis.jsx).toContain('Mesas asignadas');
    expect(analysis.jsx).toContain('name="numero"');
    expect(analysis.jsx).not.toMatch(/<header/);
    expect(analysis.jsx).not.toMatch(/<nav/);
    expect(analysis.jsx).not.toContain('Caja');
    expect(analysis.css).toContain('.tarjeta');
    expect(analysis.css).not.toContain('.icase-shell');
    expect(analysis.hasShell).toBe(false);
  });

  test('un mockup sin estructura común se convierte como antes', () => {
    const plano = '<html><body><aside><a href="/a">A</a><a href="/b">B</a></aside><main><h1>X</h1></main></body></html>';
    const analysis = HtmlToJsxTransformer.analyze(plano);
    expect(analysis.shellRemoved).toBe(false);
    expect(analysis.jsx).toContain('<aside');
  });

  test('la página generada no lleva el shell del mockup', async () => {
    const { archivos } = await new FrontendScaffoldGenerator().generar({
      proyecto: { nombre: 'Demo' }, versionesOrigen: {},
      insumos: {
        decisiones: { stack_tecnologico: { plataformas: ['web'] } }, requerimientos: [],
        diseno: {
          manifiesto_navegacion: [{ pantalla_id: 'mesas', slug: 'mesas', nombre: 'Mesas', ruta: '/mesas', plataforma: 'web', shell: 'operaciones-web', rf_trazabilidad: [] }],
          mockups: [{ pantalla_id: 'mesas', nombre_pantalla: 'mesas', nombre_visible: 'Mesas', rf_trazabilidad: [], preview_code: html }],
          sistema_diseno: {}
        }
      }
    });
    const pagina = archivos.find((item) => item.ruta === 'frontend/src/pages/mesas.jsx').contenido;
    expect(pagina).toContain('Mesas asignadas');
    expect(pagina).not.toContain('icase-shell');
    expect(pagina).not.toContain('icase-nav');
    expect(archivos.find((item) => item.ruta === 'frontend/src/pages/mesas.css')?.contenido || '').not.toContain('icase-shell');
    // La navegación la aporta la aplicación: la ruta ya no se marca como «con menú propio».
    expect(archivos.find((item) => item.ruta === 'frontend/src/App.jsx').contenido).toContain('const standalone = []');
  });
});
