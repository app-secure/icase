const crypto = require('crypto');
const IGeneradorArtefacto = require('../../core/services/IGeneradorArtefacto');

class TestSuiteGenerator extends IGeneradorArtefacto {
  async generar({ proyecto, insumos, versionesOrigen }) {
    const { requerimientos, backend, frontend } = insumos;
    const rf = requerimientos.filter((item) => item.aprobado && item.tipo === 'RF');
    const backendRf = new Set(backend.trazabilidad_rf || []);
    const frontendRf = new Set(frontend.trazabilidad_rf || []);
    const routes = this._frontendRoutes(frontend);
    const contract = this._backendContract(backend);
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
      { ruta: 'tests/.env.example', lenguaje: 'dotenv', contenido: 'BASE_API_URL=http://localhost:3000\nBASE_WEB_URL=http://localhost:5173\n' },
      { ruta: 'tests/coverage-matrix.json', lenguaje: 'json', contenido: JSON.stringify(matrix, null, 2) },
      { ruta: 'tests/unit/traceability.test.js', lenguaje: 'javascript', contenido: this._unitTest(matrix) },
      { ruta: 'tests/integration/api-health.test.js', lenguaje: 'javascript', contenido: this._integrationTest() },
      ...(functional ? [{ ruta: 'tests/integration/contract-flow.test.js', lenguaje: 'javascript', contenido: this._contractIntegrationTest(contract) }] : []),
      { ruta: 'tests/e2e/navigation.spec.js', lenguaje: 'javascript', contenido: this._e2eTest(routes) },
      ...(functional ? [{ ruta: 'tests/e2e/contract-interaction.spec.js', lenguaje: 'javascript', contenido: this._contractE2eTest(routes) }] : []),
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

  _e2eTest(routes) {
    return `import { test, expect } from '@playwright/test';\n\nconst routes = ${JSON.stringify(routes)};\nfor (const route of routes) {\n  test(\`renderiza \${route}\`, async ({ page }) => {\n    const response = await page.goto(route);\n    expect(response?.ok()).toBeTruthy();\n    await expect(page.locator('[data-screen]')).toBeVisible();\n  });\n}\n`;
  }

  _contractIntegrationTest(contract) {
    return `import test from 'node:test';
import assert from 'node:assert/strict';

const base = process.env.BASE_API_URL || 'http://localhost:3000';
async function api(path, method = 'GET', body, token) {
  const response = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const data = await response.json().catch(() => ({}));
  return { status: response.status, data };
}

const operations = ${JSON.stringify(contract.operations || [])};
test('cada RF admite crear, consultar, modificar y eliminar datos persistidos', async () => {
  assert.ok(operations.length > 0, 'El contrato no contiene operaciones');
  for (const operation of operations) {
    const marker = operation.id + '-' + Date.now() + '-' + Math.random();
    const created = await api(operation.collectionPath, 'POST', { marker, estado: 'creado' });
    assert.equal(created.status, 201, operation.id + ': ' + JSON.stringify(created.data));
    const id = created.data.id || created.data._id;
    assert.ok(id, operation.id + ' no devolvió identificador');
    const listed = await api(operation.collectionPath);
    assert.equal(listed.status, 200);
    assert.ok(listed.data.some((item) => String(item.id || item._id) === String(id)));
    const updated = await api(operation.collectionPath + '/' + id, 'PATCH', { estado: 'actualizado' });
    assert.equal(updated.status, 200);
    assert.equal(updated.data.data.estado, 'actualizado');
    const removed = await api(operation.collectionPath + '/' + id, 'DELETE');
    assert.equal(removed.status, 200);
  }
});
`;
  }

  _contractE2eTest(routes) {
    const firstRoute = routes[0] || '/';
    return `import { test, expect } from '@playwright/test';

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

  _readme(backendVersion, frontendVersion) {
    return `# Pruebas generadas\n\nDependencias: backend v${backendVersion} y frontend v${frontendVersion}.\n\n1. Levanta backend y frontend.\n2. Copia \`.env.example\` a \`.env\` si necesitas otras URLs.\n3. Ejecuta \`npm install\`, \`npx playwright install\` y \`npm test\`.\n4. Ejecuta \`npm run test:e2e\` para las pruebas de navegador.\n`;
  }

  _slug(value) {
    return String(value || 'proyecto').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  }
}

module.exports = TestSuiteGenerator;
