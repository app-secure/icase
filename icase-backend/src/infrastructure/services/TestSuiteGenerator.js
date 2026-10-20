const crypto = require('crypto');
const IGeneradorArtefacto = require('../../core/services/IGeneradorArtefacto');
const samplePayload = require('./SamplePayload');

class TestSuiteGenerator extends IGeneradorArtefacto {
  async generar({ proyecto, insumos, versionesOrigen }) {
    const { requerimientos, backend, frontend } = insumos;
    const rf = requerimientos.filter((item) => item.aprobado && item.tipo === 'RF');
    const backendRf = new Set(backend.trazabilidad_rf || []);
    const frontendRf = new Set(frontend.trazabilidad_rf || []);
    const routes = this._frontendRoutes(frontend);
    const contract = this._backendContract(backend);
    const auth = this._frontendAuth(frontend);
    const functional = Array.isArray(contract.operations) && contract.operations.length > 0;
    const matrix = rf.map((item) => ({
      requisito: item.identificador,
      nombre: item.nombre,
      backend: backendRf.has(item.identificador),
      frontend: frontendRf.has(item.identificador)
    }));
    const uncovered = matrix.filter((item) => !item.backend && !item.frontend).map((item) => item.requisito);
    const files = [
      { ruta: 'tests/package.json', lenguaje: 'json', contenido: JSON.stringify({ name: `${this._slug(proyecto.nombre)}-tests`, version: '0.1.0', private: true, type: 'module', scripts: { test: 'npm run test:unit && npm run test:integration', 'test:unit': 'node --test unit/*.test.js', 'test:integration': 'node --test integration/*.test.js', 'test:e2e': 'playwright test' }, devDependencies: { '@playwright/test': '1.50.0' } }, null, 2) },
      { ruta: 'tests/.env.example', lenguaje: 'dotenv', contenido: `BASE_API_URL=http://localhost:3000\nBASE_WEB_URL=http://localhost:5173\n${auth.habilitada ? '# Credenciales del administrador inicial del backend (ADMIN_EMAIL y ADMIN_PASSWORD).\nADMIN_EMAIL=admin@example.com\nADMIN_PASSWORD=ChangeMe-123\n' : ''}` },
      { ruta: 'tests/coverage-matrix.json', lenguaje: 'json', contenido: JSON.stringify(matrix, null, 2) },
      { ruta: 'tests/unit/traceability.test.js', lenguaje: 'javascript', contenido: this._unitTest(matrix) },
      { ruta: 'tests/integration/api-health.test.js', lenguaje: 'javascript', contenido: this._integrationTest() },
      ...(functional ? [{ ruta: 'tests/integration/contract-flow.test.js', lenguaje: 'javascript', contenido: this._contractIntegrationTest(contract) }] : []),
      { ruta: 'tests/e2e/navigation.spec.js', lenguaje: 'javascript', contenido: this._e2eTest(routes, auth) },
      ...(functional ? [{ ruta: 'tests/e2e/contract-interaction.spec.js', lenguaje: 'javascript', contenido: this._contractE2eTest(routes, auth) }] : []),
      ...(auth.habilitada ? [{ ruta: 'tests/e2e/auth.spec.js', lenguaje: 'javascript', contenido: this._authE2eTest(routes) }] : []),
      { ruta: 'tests/playwright.config.js', lenguaje: 'javascript', contenido: "import { defineConfig } from '@playwright/test';\nexport default defineConfig({ testDir: './e2e', workers: 1, use: { baseURL: process.env.BASE_WEB_URL || 'http://localhost:5173', trace: 'retain-on-failure' } });\n" },
      { ruta: 'tests/README.md', lenguaje: 'markdown', contenido: this._readme(backend.version, frontend.version) }
    ];
    return {
      archivos: files.map((file) => ({ ...file, huella: crypto.createHash('sha256').update(file.contenido).digest('hex') })),
      dependencias: [{ tipo: 'codigo_backend', version: backend.version }, { tipo: 'codigo_frontend', version: frontend.version }],
      trazabilidad_rf: rf.map((item) => item.identificador),
      advertencias: [...(uncovered.length ? [`RF sin cobertura en backend ni frontend aprobados: ${uncovered.join(', ')}.`] : []), ...(functional ? [] : ['La suite solo cubre salud, navegación y trazabilidad; faltan pruebas funcionales.'])],
      versiones_origen: versionesOrigen,
      generado_por: 'generador_pruebas_determinista_v1'
    };
  }

  _frontendRoutes(frontend) {
    const manifest = frontend.archivos?.find((file) => file.ruta === 'frontend/icase.manifest.json');
    try { return JSON.parse(manifest?.contenido || '{}').pantallas?.map((item) => item.route || item.ruta).filter(Boolean) || []; }
    catch { return []; }
  }

  _frontendAuth(frontend) {
    const manifest = frontend.archivos?.find((file) => file.ruta === 'frontend/icase.manifest.json');
    try { return JSON.parse(manifest?.contenido || '{}').auth || { habilitada: false }; }
    catch { return { habilitada: false }; }
  }

  /** Cabecera de las pruebas de navegador cuando la aplicación exige sesión: reutiliza la del administrador. */
  _e2eSession(auth) {
    if (!auth.habilitada) return '';
    return `
const apiBase = process.env.BASE_API_URL || 'http://localhost:3000';
let token = '';
test.beforeAll(async () => {
  const response = await fetch(apiBase + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD }) });
  expect(response.ok, 'No se pudo iniciar sesión con ADMIN_EMAIL y ADMIN_PASSWORD').toBeTruthy();
  token = (await response.json()).token;
});
test.beforeEach(async ({ page }) => {
  await page.addInitScript((value) => window.localStorage.setItem('icase_token', value), token);
});
`;
  }

  _backendContract(backend) {
    const manifest = backend.archivos?.find((file) => file.ruta === 'backend/icase.manifest.json');
    try { return JSON.parse(manifest?.contenido || '{}'); }
    catch { return {}; }
  }

  _unitTest(matrix) {
    return `import test from 'node:test';\nimport assert from 'node:assert/strict';\nimport fs from 'node:fs';\n\nconst expected = ${JSON.stringify(matrix.map((item) => item.requisito))};\n\ntest('los manifiestos generados mantienen trazabilidad RF', () => {\n  const backend = JSON.parse(fs.readFileSync('../backend/icase.manifest.json', 'utf8'));\n  const frontend = JSON.parse(fs.readFileSync('../frontend/icase.manifest.json', 'utf8'));\n  const actual = new Set([...(backend.requisitos || []).map((item) => item.id), ...(frontend.pantallas || []).flatMap((item) => item.requirements || item.rf || [])]);\n  for (const id of expected) assert.ok(actual.has(id), \`Falta trazabilidad para \${id}\`);\n});\n`;
  }

  _integrationTest() {
    return `import test from 'node:test';\nimport assert from 'node:assert/strict';\n\ntest('el backend responde su comprobación de salud', async () => {\n  const base = process.env.BASE_API_URL || 'http://localhost:3000';\n  const response = await fetch(\`${'${base}'}/health\`);\n  assert.equal(response.status, 200);\n  const body = await response.json();\n  assert.equal(body.status, 'ok');\n});\n`;
  }

  _e2eTest(routes, auth = { habilitada: false }) {
    return `import { test, expect } from '@playwright/test';
${this._e2eSession(auth)}
const routes = ${JSON.stringify(routes)};
for (const route of routes) {
  test(\`renderiza \${route}\`, async ({ page }) => {
    const response = await page.goto(route);
    expect(response?.ok()).toBeTruthy();
    await expect(page.locator('[data-screen]')).toBeVisible();
  });
}
`;
  }

  _contractIntegrationTest(contract) {
    const auth = contract.auth && contract.auth.habilitada ? contract.auth : { habilitada: false };
    return `import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';

const base = process.env.BASE_API_URL || 'http://localhost:3000';

${samplePayload.runtimeSource()}

const operations = ${JSON.stringify(contract.operations || [])};
const auth = ${JSON.stringify(auth)};
const roles = Object.entries(auth.roles || {}).map(([id, role]) => ({ id, autoregistro: role.autoregistro === true }));
let access = null;
let api = makeApi(base, null);

before(async () => {
  if (!auth.habilitada) return;
  access = await setupAccess(base, { adminEmail: process.env.ADMIN_EMAIL, adminPassword: process.env.ADMIN_PASSWORD, roles });
  api = access.admin;
});
after(async () => { if (access) await access.cleanup(); });

test('el contrato declara operaciones', () => {
  assert.ok(operations.length > 0, 'El contrato no contiene operaciones');
});

test('la documentación OpenAPI describe todas las operaciones y la seguridad aprobada', async () => {
  await exerciseOpenApi(api, operations, auth);
});

for (const operation of operations) {
  test(operation.id + ': CRUD tipado y reglas de negocio (' + (operation.rules || []).length + ')', async () => {
    await exerciseOperation(api, operations, operation);
  });
  if (auth.habilitada) {
    test(operation.id + ': permisos por rol, sin sesión y con token alterado', async () => {
      await exerciseAccess(access, operations, operation, (auth.operaciones || {})[operation.key] || {});
    });
  }
}

if (auth.habilitada) {
  test('autenticación: sesión, usuarios, revocación, bloqueo y registro', async () => {
    await exerciseAuth(access, { base, adminEmail: process.env.ADMIN_EMAIL, roles });
  });
}
`;
  }

  _contractE2eTest(routes, auth = { habilitada: false }) {
    const firstRoute = routes[0] || '/';
    return `import { test, expect } from '@playwright/test';
${this._e2eSession(auth)}
test('una pantalla ejecuta una operación declarada en el contrato', async ({ page }) => {
  await page.goto(${JSON.stringify(firstRoute)});
  const editor = page.getByLabel('Datos JSON');
  if (await editor.count()) {
    await editor.fill('{"origen":"prueba-e2e"}');
    await page.getByRole('button', { name: 'Crear' }).click();
    await expect(page.getByRole('status')).toContainText('Registro creado');
  }
});
`;
  }

  _authE2eTest(routes) {
    const firstRoute = routes[0] || '/';
    return `import { test, expect } from '@playwright/test';

const credentials = { email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD };
const heading = (page) => page.getByRole('heading', { name: 'Iniciar sesión' });
async function signIn(page, password = credentials.password) {
  await page.goto(${JSON.stringify(firstRoute)});
  await page.getByLabel('Correo electrónico').fill(credentials.email);
  await page.getByLabel('Contraseña').fill(password);
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();
}

test('sin sesión se pide iniciar sesión y las credenciales incorrectas se rechazan', async ({ page }) => {
  await signIn(page, 'contraseña-incorrecta');
  await expect(heading(page)).toBeVisible();
  await expect(page.getByRole('alert')).toContainText(/credenciales/i);
});

test('iniciar y cerrar sesión desde la interfaz', async ({ page }) => {
  await signIn(page);
  await expect(page.locator('[data-screen]')).toBeVisible();
  await page.getByRole('button', { name: 'Cerrar sesión' }).click();
  await expect(heading(page)).toBeVisible();
  expect(await page.evaluate(() => window.localStorage.getItem('icase_token'))).toBeNull();
});

test('el administrador accede a la gestión de usuarios', async ({ page }) => {
  await signIn(page);
  await page.getByRole('link', { name: 'Usuarios' }).click();
  await expect(page.locator('[data-screen="usuarios"]')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Usuarios', exact: true })).toBeVisible();
});
`;
  }

  _readme(backendVersion, frontendVersion) {
    return `# Pruebas generadas\n\nDependencias: backend v${backendVersion} y frontend v${frontendVersion}.\n\n1. Levanta backend y frontend.\n2. Copia \`.env.example\` a \`.env\` si necesitas otras URLs.\n3. Ejecuta \`npm install\`, \`npx playwright install\` y \`npm test\`.\n4. Ejecuta \`npm run test:e2e\` para las pruebas de navegador.\n`;
  }

  _slug(value) {
    return String(value || 'proyecto').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  }
}

module.exports = TestSuiteGenerator;
