const { compose, kindOf } = require('../src/infrastructure/services/MockupVisualComposer');
const MockupLayoutLinter = require('../src/infrastructure/services/MockupLayoutLinter');

const manifest = [
  { slug: 'login', nombre: 'Iniciar sesión', shell: 'auth-mobile', plataforma: 'mobile' },
  { slug: 'registro', nombre: 'Registro de usuario', shell: 'auth-mobile', plataforma: 'mobile' },
  ...['menu', 'reservas', 'pedidos', 'puntos', 'perfil', 'ayuda'].map((slug) => ({ slug, nombre: slug[0].toUpperCase() + slug.slice(1), shell: 'cliente-mobile', plataforma: 'mobile' })),
  { slug: 'mesas', nombre: 'Mesas', shell: 'operaciones-web', plataforma: 'web' },
  { slug: 'caja', nombre: 'Caja', shell: 'operaciones-web', plataforma: 'web' },
  { slug: 'mesero', nombre: 'Salón', shell: 'mesero-tablet', plataforma: 'tablet' }
];
const screenOf = (slug) => manifest.find((item) => item.slug === slug);
const body = '<main><h1>Contenido</h1><form><input name="correo"><button data-accion="ui">Entrar</button></form></main>';

describe('estructura por tipo de pantalla', () => {
  test('reconoce acceso, móvil, tableta y web; el acceso gana sobre la plataforma', () => {
    expect(kindOf(screenOf('login'))).toBe('auth');
    expect(kindOf(screenOf('registro'))).toBe('auth');
    expect(kindOf(screenOf('menu'))).toBe('mobile');
    expect(kindOf(screenOf('mesero'))).toBe('tablet');
    expect(kindOf(screenOf('mesas'))).toBe('web');
    expect(kindOf({ nombre: 'Gestión de usuarios' })).toBe('web');
  });

  test('el login no lleva menú ni navegación y conserva el formulario', () => {
    const html = compose(body, { screen: screenOf('login'), manifest, name: 'Demo' });
    expect(html).toContain('data-icase-kind="auth"');
    expect(html).not.toMatch(/<nav\b/);
    expect(html).not.toContain('class="icase-menu"');
    expect(html).not.toContain('icase-tabbar"');
    expect(html).toContain('name="correo"');
    expect(html.match(/<header>/g)).toHaveLength(1);
  });

  test('las pantallas móviles usan barra inferior con hasta cinco destinos de primer nivel y sin las de acceso', () => {
    const html = compose(body, { screen: screenOf('reservas'), manifest, name: 'Demo' });
    expect(html).toContain('data-icase-kind="mobile"');
    expect(html).toContain('icase-mobile');
    expect(html.match(/<nav /g)).toHaveLength(1);
    expect(html).toMatch(/aria-current="page"[^>]*>Reservas/);
    expect(html).not.toContain('Iniciar sesión');
    // Seis pantallas en el flujo: la barra no las lista todas ni agrega un menú «Más».
    expect(html).not.toContain('Más');
    expect(html.match(/<nav class="icase-tabbar"[\s\S]*?<\/nav>/)[0].match(/<a /g)).toHaveLength(5);
  });

  test('la pantalla actual sigue visible aunque sea de las últimas', () => {
    const html = compose(body, { screen: screenOf('ayuda'), manifest, name: 'Demo' });
    expect(html.match(/<nav class="icase-tabbar"[\s\S]*?<\/nav>/)[0]).toMatch(/aria-current="page"[^>]*>Ayuda/);
  });

  test('web usa barra lateral y tableta menú desplegable, solo con pantallas de su flujo', () => {
    const web = compose(body, { screen: screenOf('mesas'), manifest });
    expect(web).toContain('data-icase-kind="web"');
    expect(web).toMatch(/<nav class="icase-nav">.*Caja/s);
    expect(web).not.toContain('Reservas');
    const tablet = compose(body, { screen: screenOf('mesero'), manifest });
    expect(tablet).toContain('icase-menu');
  });

  test('recomponer no duplica estructura ni estilos del shell', () => {
    const first = compose(body, { screen: screenOf('reservas'), manifest, name: 'A' });
    const next = compose(first, { screen: screenOf('reservas'), manifest, name: 'B' });
    expect(next.match(/<header>/g)).toHaveLength(1);
    expect(next.match(/data-icase-shell>/g)).toHaveLength(1);
    expect(next.match(/<nav /g)).toHaveLength(1);
    expect(next).toContain('name="correo"');
  });
});

describe('revisión de diseño del mockup', () => {
  const linter = new MockupLayoutLinter();
  const codigos = (html, screen) => linter.analizar(html, { screen }).map((item) => item.codigo);

  test('un mockup compuesto correctamente no tiene avisos', () => {
    for (const slug of ['login', 'reservas', 'mesas', 'mesero']) expect(codigos(compose(body, { screen: screenOf(slug), manifest }), screenOf(slug))).toEqual([]);
  });

  test('detecta un menú en el login (por ejemplo, en un mockup antiguo)', () => {
    const antiguo = '<html><body><div class="icase-shell"><header>X</header><details class="icase-menu"><nav class="icase-nav"><a>Otra</a></nav></details><main><form></form></main></div></body></html>';
    expect(codigos(antiguo, screenOf('login'))).toContain('menu_en_login');
  });

  test('detecta anchos fijos que desbordan según el tipo de pantalla', () => {
    const html = compose('<main><div class="w-[640px]"><img src="qr.png" width="800"></div><div style="width: 500px"></div></main>', { screen: screenOf('reservas'), manifest });
    const avisos = linter.analizar(html, { screen: screenOf('reservas') });
    expect(avisos.find((item) => item.codigo === 'ancho_fijo').mensaje).toMatch(/500px, 640px, 800px.*390px/);
    expect(codigos(compose('<main><div class="w-[640px]"></div></main>', { screen: screenOf('mesas'), manifest }), screenOf('mesas'))).toEqual([]);
  });

  test('en móvil avisa de cuadrículas de 3 columnas y tablas anchas, pero no si es responsiva', () => {
    const malo = compose('<main><div class="grid grid-cols-3"></div><table><tr><th>a</th><th>b</th><th>c</th><th>d</th><th>e</th></tr></table></main>', { screen: screenOf('reservas'), manifest });
    expect(codigos(malo, screenOf('reservas'))).toEqual(expect.arrayContaining(['columnas_en_movil', 'tabla_ancha_movil']));
    const bueno = compose('<main><div class="grid grid-cols-1 md:grid-cols-3"></div></main>', { screen: screenOf('reservas'), manifest });
    expect(codigos(bueno, screenOf('reservas'))).toEqual([]);
  });

  test('detecta cabeceras y menús duplicados', () => {
    const doble = '<html><body><header>1</header><header>2</header><nav>a</nav><nav>b</nav><main></main></body></html>';
    expect(codigos(doble, screenOf('mesas'))).toEqual(expect.arrayContaining(['cabecera_duplicada', 'navegacion_duplicada']));
  });

  test('los mensajes salen listos para mostrarse y vacío no produce nada', () => {
    expect(linter.mensajes('<main class="w-[2000px]"></main>', { screen: screenOf('mesas') })[0]).toMatch(/^Diseño: /);
    expect(linter.analizar('')).toEqual([]);
  });
});
