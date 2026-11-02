const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const Generator = require('../src/infrastructure/services/GenericBackendGenerator');

test('Spring exporta controles HTTP y pruebas Java ejecutables sin base de datos', () => {
  const files = new Generator().generate({ proyecto: { nombre: 'Seguridad genérica' }, requirements: [], stack: { backend: 'Spring Boot', base_datos: 'PostgreSQL' } });
  const file = (name) => files.find((f) => f.ruta === `backend/${name}`)?.contenido;
  expect(file('src/main/java/app/HttpSecurityFilter.java')).toContain('@Order(Ordered.HIGHEST_PRECEDENCE + 10)');
  expect(file('src/main/java/app/HttpSecurityFilter.java')).toContain('req.getRemoteAddr()');
  expect(file('src/main/resources/application.properties')).toContain('server.forward-headers-strategy=none');
  expect(file('.env.example')).toContain('HTTP_RATE_MAX=300');
  expect(file('pom.xml')).toContain('spring-boot-starter-test');
  expect(file('src/test/java/app/HttpSecurityFilterTest.java')).toContain('internalErrorsAreSanitized');
  if (process.env.RUN_GENERATED_JAVA_TESTS !== 'true') return;
  const root = fs.mkdtempSync(path.join(__dirname, '.generated-spring-security-'));
  try {
    for (const item of files) {
      if (!item.ruta.startsWith('backend/')) continue;
      const target = path.join(root, item.ruta.slice(8));
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, item.contenido);
    }
    // Comando fijo, sin interpolar entradas del proyecto en el shell de Windows.
    const offline = process.env.JAVA_TEST_OFFLINE === 'true';
    const result = process.platform === 'win32'
      ? spawnSync('cmd.exe', ['/d', '/s', '/c', offline ? 'mvn.cmd -B -o test' : 'mvn.cmd -B test'], { cwd: root, encoding: 'utf8', timeout: 120000 })
      : spawnSync('mvn', ['-B', ...(offline ? ['-o'] : []), 'test'], { cwd: root, encoding: 'utf8', timeout: 120000 });
    if (result.status !== 0) throw new Error(`Maven: ${result.error || ''}\n${result.stdout}\n${result.stderr}`);
    expect(result.stdout).toContain('Tests run: 6, Failures: 0, Errors: 0');
    expect(result.stdout).toContain('Tests run: 12, Failures: 0, Errors: 0');
  } finally {
    if (path.dirname(root) !== __dirname || !path.basename(root).startsWith('.generated-spring-security-')) throw new Error('Ruta temporal no segura');
    fs.rmSync(root, { recursive: true, force: true });
  }
}, 150000);
