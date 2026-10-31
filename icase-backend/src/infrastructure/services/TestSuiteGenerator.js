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
    const typedForms = this._frontendModules(frontend).formularios_tipados === true;
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
      ...(functional && !typedForms ? [{ ruta: 'tests/e2e/contract-interaction.spec.js', lenguaje: 'javascript', contenido: this._contractE2eTest(routes, auth) }] : []),
      ...(functional && typedForms ? [{ ruta: 'tests/e2e/typed-forms.spec.js', lenguaje: 'javascript', contenido: this._typedFormsE2eTest({ screens: this._frontendScreens(frontend), contract, auth }) }] : []),
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

  _frontendModules(frontend) {
    const manifest = frontend.archivos?.find((file) => file.ruta === 'frontend/icase.manifest.json');
    try { return JSON.parse(manifest?.contenido || '{}').modulos || {}; }
    catch { return {}; }
  }

  _frontendScreens(frontend) {
    const manifest = frontend.archivos?.find((file) => file.ruta === 'frontend/icase.manifest.json');
    try { return JSON.parse(manifest?.contenido || '{}').pantallas || []; }
    catch { return []; }
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

  /**
   * Prueba de navegador del módulo de formularios por campo: usa el formulario (no la API) para crear, listar, editar
   * y eliminar un registro de la primera pantalla, y comprueba que una regla incumplida se marca junto a su campo.
   */
  _typedFormsE2eTest({ screens, contract, auth }) {
    const operations = contract.operations || [];
    const screen = screens.find((item) => (item.operations || []).some((key) => operations.some((operation) => operation.key === key)));
    const operation = screen && operations.find((item) => item.key === screen.operations.find((key) => operations.some((candidate) => candidate.key === key)));
    if (!operation) return "import { test } from '@playwright/test';\ntest.skip('el contrato no tiene una pantalla con operación', () => {});\n";
    const strict = screens.map((item) => ({ route: item.route, operation: operations.find((candidate) => candidate.key === (item.operations || [])[0]) }))
      .find((item) => item.operation && (item.operation.rules || []).some((rule) => rule.tipo === 'requerido' && (item.operation.schema?.properties || {})[rule.campo]));
    const session = auth.habilitada ? this._e2eSession(auth) : "const apiBase = process.env.BASE_API_URL || 'http://localhost:3000';\nconst token = '';\n";
    return [
      "import { test, expect } from '@playwright/test';",
      session,
      samplePayload.runtimeSource(),
      '',
      'const route = ' + JSON.stringify(screen.route) + ';',
      'const operation = ' + JSON.stringify(operation) + ';',
      'const operations = ' + JSON.stringify(operations) + ';',
      "const properties = operation.schema.properties || {};",
      '',
      '// Rellena un control según el tipo del campo, como lo haría una persona.',
      'async function fillField(page, form, name, value) {',
      "  const property = properties[name];",
      "  const control = form.locator('[name=\"' + name + '\"]');",
      "  if (property.type === 'boolean') { await control.setChecked(Boolean(value)); return; }",
      "  if (property.enum || property['x-references']) {",
      "    if ((await control.evaluate((element) => element.tagName)) === 'SELECT') { await control.selectOption(String(value)); return; }",
      '  }',
      "  if (property.format === 'date-time') {",
      "    const local = await page.evaluate((iso) => { const d = new Date(iso); const p = (n) => String(n).padStart(2, '0'); return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + 'T' + p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds()); }, value);",
      '    await control.fill(local);',
      '    return;',
      '  }',
      '  await control.fill(String(value));',
      '}',
      '',
      "test('el formulario por campo crea, lista, edita y elimina un registro', async ({ page }) => {",
      "  const api = makeApi(apiBase, token || null);",
      '  const cleanups = [];',
      '  const sample = samplePayload(operation.schema, operation.rules, salted());',
      '  const body = { ...sample.payload };',
      '  for (const parent of sample.parents) {',
      "    const parentOperation = operations.find((item) => item.schema && item.schema.title === parent.entidad);",
      "    body[parent.campo] = (await createValidRecord(api, operations, parentOperation, cleanups, 1)).id;",
      '  }',
      '  try {',
      '    const before = new Set(((await api(operation.collectionPath)).data || []).map((item) => item.id || item._id));',
      '    await page.goto(route);',
      "    const form = page.getByRole('form', { name: 'Formulario de registro' });",
      '    await expect(form).toBeVisible();',
      '    for (const [name, value] of Object.entries(body)) {',
      "      if (Array.isArray(value) && value.length === 0) continue;",
      '      await fillField(page, form, name, value);',
      '    }',
      "    await form.getByRole('button', { name: 'Crear' }).click();",
      "    await expect(page.getByRole('status')).toContainText('Registro creado');",
      '',
      '    const created = ((await api(operation.collectionPath)).data || []).filter((item) => !before.has(item.id || item._id));',
      "    expect(created, 'el formulario debe crear exactamente un registro').toHaveLength(1);",
      '    for (const [name, value] of Object.entries(body)) {',
      "      if (typeof value === 'number' || typeof value === 'boolean') expect(created[0].data[name], 'campo ' + name).toBe(value);",
      "      if (typeof value === 'string' && !properties[name].format) expect(created[0].data[name], 'campo ' + name).toBe(value);",
      '    }',
      '',
      "    const rows = page.locator('table.records tbody tr');",
      '    await expect(rows).not.toHaveCount(0);',
      "    const marker = Object.entries(body).find(([name, value]) => typeof value === 'string' && !properties[name].format && !properties[name].enum && !properties[name]['x-references']);",
      '    const row = marker ? rows.filter({ hasText: marker[1] }) : rows.last();',
      '    await expect(row).toHaveCount(1);',
      '',
      "    await row.getByRole('button', { name: 'Editar' }).click();",
      "    await expect(form.getByRole('button', { name: 'Guardar cambios' })).toBeVisible();",
      "    await form.getByRole('button', { name: 'Guardar cambios' }).click();",
      "    await expect(page.getByRole('status')).toContainText('Registro actualizado');",
      '',
      "    await (marker ? rows.filter({ hasText: marker[1] }) : rows.last()).getByRole('button', { name: 'Eliminar' }).click();",
      "    await expect(page.getByRole('status')).toContainText('Registro eliminado');",
      '    const after = ((await api(operation.collectionPath)).data || []).map((item) => item.id || item._id);',
      "    expect(after).not.toContain(created[0].id || created[0]._id);",
      '  } finally {',
      '    for (const cleanup of cleanups) { try { await cleanup(); } catch (error) { /* mejor esfuerzo */ } }',
      '  }',
      '});',
      '',
      "// La pantalla de error es la primera cuya operación visible por defecto tiene un campo obligatorio.",
      'const strict = ' + JSON.stringify(strict ? { route: strict.route, operation: strict.operation } : null) + ';',
      "test('una regla incumplida se marca junto a su campo', async ({ page }) => {",
      "  test.skip(!strict, 'ninguna pantalla tiene campos obligatorios');",
      "  const required = strict.operation.rules.find((rule) => rule.tipo === 'requerido' && strict.operation.schema.properties[rule.campo]);",
      '  await page.goto(strict.route);',
      "  const form = page.getByRole('form', { name: 'Formulario de registro' });",
      "  await form.getByRole('button', { name: 'Crear' }).click();",
      "  await expect(page.getByRole('alert')).toContainText('Revisa los campos marcados');",
      "  await expect(form.locator('[name=\"' + required.campo + '\"]')).toHaveAttribute('aria-invalid', 'true');",
      "  await expect(form.locator('.field-error').first()).toBeVisible();",
      '});',
      ''
    ].join('\n');
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
