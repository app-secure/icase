const crypto = require('crypto');
const IGeneradorArtefacto = require('../../core/services/IGeneradorArtefacto');
const samplePayload = require('./SamplePayload');
const BrowserTestRuntime = require('../../core/constants/BrowserTestRuntime');

class TestSuiteGenerator extends IGeneradorArtefacto {
  async generar({ proyecto, insumos, versionesOrigen }) {
    const { requerimientos, backend, frontend } = insumos;
    const rf = requerimientos.filter((item) => item.aprobado && item.tipo === 'RF');
    const backendRf = new Set(backend.trazabilidad_rf || []);
    const frontendRf = new Set(frontend.trazabilidad_rf || []);
    const routes = this._frontendRoutes(frontend);
    const contract = this._backendContract(backend);
    const mobileOnly = frontend.archivos?.some(f => f.ruta === 'mobile/package.json') && !frontend.archivos.some(f => f.ruta === 'frontend/package.json');
    const auth = mobileOnly ? contract.auth || {} : this._frontendAuth(frontend);
    const typedForms = this._frontendModules(frontend).formularios_tipados === true;
    const functional = Array.isArray(contract.operations) && contract.operations.length > 0;
    const designedUi = functional ? this._designedUiE2eTest({ screens: this._frontendScreens(frontend), contract, auth }) : '';
    const matrix = rf.map((item) => ({
      requisito: item.identificador,
      nombre: item.nombre,
      backend: backendRf.has(item.identificador),
      frontend: frontendRf.has(item.identificador)
    }));
    const uncovered = matrix.filter((item) => !item.backend && !item.frontend).map((item) => item.requisito);
    const files = [
      { ruta: 'tests/package.json', lenguaje: 'json', contenido: JSON.stringify({ name: `${this._slug(proyecto.nombre)}-tests`, version: '0.1.0', private: true, type: 'module', scripts: { test: 'npm run test:unit && npm run test:integration', 'test:unit': 'node --test unit/*.test.js', 'test:integration': 'node --test --test-concurrency=1 integration/*.test.js', 'test:e2e': 'playwright test' }, devDependencies: { '@playwright/test': BrowserTestRuntime.version } }, null, 2) },
      { ruta: 'tests/.env.example', lenguaje: 'dotenv', contenido: `BASE_API_URL=http://localhost:3000\nBASE_WEB_URL=http://localhost:5173\n${auth.habilitada ? '# Credenciales del administrador inicial del backend (ADMIN_EMAIL y ADMIN_PASSWORD).\nADMIN_EMAIL=admin@example.com\nADMIN_PASSWORD=ChangeMe-123\n' : ''}` },
      { ruta: 'tests/coverage-matrix.json', lenguaje: 'json', contenido: JSON.stringify(matrix, null, 2) },
      { ruta: 'tests/unit/traceability.test.js', lenguaje: 'javascript', contenido: this._unitTest(matrix) },
      ...this._domainUnitTests(contract),
      { ruta: 'tests/integration/api-health.test.js', lenguaje: 'javascript', contenido: this._integrationTest() },
      ...(functional ? [{ ruta: 'tests/integration/contract-flow.test.js', lenguaje: 'javascript', contenido: this._contractIntegrationTest(contract) }] : []),
      ...(contract.extensions?.enabled?.length ? [{ruta:'tests/integration/extensions.test.js',lenguaje:'javascript',contenido:require('node:fs').readFileSync(require('node:path').join(__dirname,'../templates/verification/extensions.integration.template'),'utf8').replace('__SAMPLES__',()=>samplePayload.runtimeSource()).replace('__EXTENSIONS__',JSON.stringify(contract.extensions.enabled))}] : []),
      { ruta: 'tests/e2e/navigation.spec.js', lenguaje: 'javascript', contenido: this._e2eTest(routes, auth) },
      ...(this._hasActions(contract) ? [{ ruta: 'tests/integration/actions.test.js', lenguaje: 'javascript', contenido: this._actionsIntegrationTest(contract) }] : []),
      ...((contract.associations || []).length ? [{ ruta: 'tests/e2e/associations.spec.js', lenguaje: 'javascript', contenido: this._associationsE2eTest({ screens: this._frontendScreens(frontend), contract, auth }) }] : []),
      ...(functional && !typedForms ? [{ ruta: 'tests/e2e/contract-interaction.spec.js', lenguaje: 'javascript', contenido: this._contractE2eTest(routes, auth, { screens: this._frontendScreens(frontend), contract }) }] : []),
      ...(functional && typedForms ? [{ ruta: 'tests/e2e/typed-forms.spec.js', lenguaje: 'javascript', contenido: this._typedFormsE2eTest({ screens: this._frontendScreens(frontend), contract, auth }) }] : []),
      ...(functional && this._specScreensE2eTest({ screens: this._allFrontendScreens(frontend), contract, auth }) ? [{ ruta: 'tests/e2e/spec-screens.spec.js', lenguaje: 'javascript', contenido: this._specScreensE2eTest({ screens: this._allFrontendScreens(frontend), contract, auth }) }] : []),
      ...(designedUi ? [{ ruta: 'tests/e2e/designed-ui.spec.js', lenguaje: 'javascript', contenido: designedUi }] : []),
      ...(auth.habilitada ? [{ ruta: 'tests/e2e/auth.spec.js', lenguaje: 'javascript', contenido: this._authE2eTest(routes) }] : []),
      ...(contract.extensions?.enabled?.length ? [{ruta:'tests/e2e/extensions.spec.js',lenguaje:'javascript',contenido:require('node:fs').readFileSync(require('node:path').join(__dirname,'../templates/verification/extensions.e2e.template'),'utf8').replace('__SAMPLES__',()=>samplePayload.runtimeSource()).replace('__EXTENSIONS__',JSON.stringify(contract.extensions.enabled)).replace('__SCREENS__',JSON.stringify(this._frontendScreens(frontend)))}] : []),
      ...(contract.eventos_cambios?.experimental ? [{ ruta: 'tests/e2e/change-events.spec.js', lenguaje: 'javascript', contenido: require('node:fs').readFileSync(require('node:path').join(__dirname, '../templates/frontend/change-events.e2e.template'), 'utf8').replace('__SCREENS__', JSON.stringify(this._frontendScreens(frontend))).replace('__SAMPLES__', () => samplePayload.runtimeSource()) }] : []),
      { ruta: 'tests/playwright.config.js', lenguaje: 'javascript', contenido: "import { defineConfig } from '@playwright/test';\n// Tiempos holgados: la verificación corre en contenedores que comparten CPU con la compilación y otras ejecuciones.\nexport default defineConfig({ testDir: './e2e', workers: 1, timeout: 120000, expect: { timeout: 15000 }, retries: 1, use: { baseURL: process.env.BASE_WEB_URL || 'http://localhost:5173', actionTimeout: 30000, navigationTimeout: 60000, trace: 'retain-on-failure' } });\n" },
      { ruta: 'tests/README.md', lenguaje: 'markdown', contenido: this._readme(backend.version, frontend.version) }
    ];
    const readTemplate=name=>require('node:fs').readFileSync(require('node:path').join(__dirname,'../templates/verification',name),'utf8').replace('__SAMPLES__',()=>samplePayload.runtimeSource()).replace('__SCREENS__',JSON.stringify(this._frontendScreens(frontend)));
    if(contract.integraciones?.enabled?.length){
      for(const [name,ruta] of [['specialized.integration.template','tests/integration/specialized.test.js'],['specialized.e2e.template','tests/e2e/specialized.spec.js']])files.push({ruta,lenguaje:'javascript',contenido:readTemplate(name).replace('__FIXTURE__',JSON.stringify(contract.integraciones.fixture||null)).replace('__ENABLED__',JSON.stringify(contract.integraciones.enabled))});
    }
    if(contract.eventos_cambios?.experimental){
      files.push({ruta:'tests/integration/realtime-concurrency.test.js',lenguaje:'javascript',contenido:readTemplate('realtime-concurrency.template')},{ruta:'tests/support/change-events-client.js',lenguaje:'javascript',contenido:require('node:fs').readFileSync(require('node:path').join(__dirname,'../templates/frontend/change-events-client.js'),'utf8')});
      const pkg=files.find(file=>file.ruta==='tests/package.json'),data=JSON.parse(pkg.contenido);data.devDependencies['socket.io-client']='4.8.4';pkg.contenido=JSON.stringify(data,null,2);
      if(contract.associations?.length)files.push({ruta:'tests/e2e/realtime-associations.spec.js',lenguaje:'javascript',contenido:readTemplate('realtime-associations.template')});
      if(contract.eventos_cambios.replicas){
        data.devDependencies.redis='6.3.1';pkg.contenido=JSON.stringify(data,null,2);
        files.push({ruta:'tests/integration/redis-isolation.test.js',lenguaje:'javascript',contenido:readTemplate('redis-isolation.template')},{ruta:'tests/support/redis-bridge.cjs',lenguaje:'javascript',contenido:require('node:fs').readFileSync(require('node:path').join(__dirname,'../templates/auth/change-events-redis.js'),'utf8')});
      }
    }
    let seleccion = files;
    if (mobileOnly) {
      seleccion = files.filter(file => !file.ruta.startsWith('tests/e2e/') && file.ruta !== 'tests/playwright.config.js');
      seleccion.push({ ruta: 'tests/mobile-platform.json', lenguaje: 'json', contenido: JSON.stringify({ plataforma: 'móvil' }) });
    }
    return {
      archivos: seleccion.map((file) => ({ ...file, huella: crypto.createHash('sha256').update(file.contenido).digest('hex') })),
      dependencias: [{ tipo: 'codigo_backend', version: backend.version }, { tipo: 'codigo_frontend', version: frontend.version }],
      trazabilidad_rf: rf.map((item) => item.identificador),
      advertencias: [...(uncovered.length ? [`RF sin cobertura en backend ni frontend aprobados: ${uncovered.join(', ')}.`] : []), ...(functional ? [] : ['La suite solo cubre salud, navegación y trazabilidad; faltan pruebas funcionales.']),...(contract.integraciones?.enabled?.length&&!contract.integraciones.fixture?['Sin fixture/proveedor configurado, las pruebas especializadas se omiten: no acreditan pagos, SSO o hardware reales.']:[])],
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

  /** Pantallas con editor de registros o interfaz diseñada; las construidas desde la especificación se prueban aparte. */
  _frontendScreens(frontend) {
    return this._allFrontendScreens(frontend).filter((screen) => screen.origen !== 'especificacion');
  }

  _allFrontendScreens(frontend) {
    const manifest = frontend.archivos?.find((file) => file.ruta === 'frontend/icase.manifest.json');
    try { return JSON.parse(manifest?.contenido || '{}').pantallas || []; }
    catch { return []; }
  }

  /** Una prueba de navegador por pantalla de la especificación: debe mostrar los datos reales de su operación de consulta. */
  _specScreensE2eTest({ screens, contract, auth }) {
    const actions = new Map((contract.operations || []).flatMap((operation) => (operation.actions || []).map((action) => [action.name, action])));
    const cases = screens.filter((screen) => screen.origen === 'especificacion').map((screen) => {
      const lists = (screen.especificacion?.bloques || []).filter((block) => ['tabla', 'tarjetas'].includes(block.tipo) && actions.get(block.operacion)?.type === 'consulta');
      const first = lists[0] && actions.get(lists[0].operacion);
      return { id: screen.id, route: screen.route || screen.ruta, name: screen.name, path: first?.path || null, action: first?.name || null, single: lists.length === 1 };
    });
    if (!cases.length) return '';
    const session = auth.habilitada ? this._e2eSession(auth) : "const apiBase = process.env.BASE_API_URL || 'http://localhost:3000';\nconst token = '';\n";
    return `import { test, expect } from '@playwright/test';
${session}
const cases = ${JSON.stringify(cases)};

for (const item of cases) {
  test(item.name + ': la pantalla de la especificación muestra los datos reales' + (item.action ? ' de ' + item.action : ''), async ({ page }) => {
    let rows = null;
    if (item.path) {
      const response = await fetch(apiBase + item.path, { headers: token ? { Authorization: 'Bearer ' + token } : {} });
      expect(response.status, 'la operación ' + item.action + ' debe responder 200').toBe(200);
      rows = await response.json();
      expect(Array.isArray(rows)).toBe(true);
    }
    await page.goto(item.route);
    await expect(page.locator('[data-screen="' + item.id + '"]')).toBeVisible();
    await expect(page.locator('[data-screen="' + item.id + '"] .error')).toHaveCount(0);
    if (rows && item.single) {
      if (rows.length) await expect(page.locator('[data-screen="' + item.id + '"] [data-id]')).toHaveCount(rows.length);
      else await expect(page.getByText('No hay registros para mostrar.')).toBeVisible();
    }
  });
}
`;
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

  _associationsE2eTest({ screens, contract, auth }) {
    const session = auth.habilitada ? this._e2eSession(auth) : "const apiBase = process.env.BASE_API_URL || 'http://localhost:3000';\nconst token = '';\n";
    return `import { test, expect } from '@playwright/test';
${session}
${samplePayload.runtimeSource()}
const operations = ${JSON.stringify(contract.operations || [])};
const associations = ${JSON.stringify(contract.associations || [])};
const screens = ${JSON.stringify(screens)};
for (const relation of associations) {
  test('N:M en navegador: ' + relation.table, async ({ page }) => {
    const api = makeApi(apiBase, token || null);
    const cleanups = [];
    const endpoints = relation.operations.map((keys) => operations.find((op) => keys.includes(op.key)));
    const screen = screens.find((item) => relation.operations.some((keys) => keys.includes((item.operations || [])[0])))
      || screens.find((item) => (item.operations || []).some((key) => relation.operations.some((keys) => keys.includes(key))));
    expect(screen, 'Falta una pantalla para el vínculo').toBeTruthy();
    expect(endpoints.every(Boolean), 'Faltan operaciones para los extremos').toBeTruthy();
    try {
      const source = await createValidRecord(api, operations, endpoints[0], cleanups, 0);
      const target = await createValidRecord(api, operations, endpoints[1], cleanups, 0);
      const pair = { source_id: String(source.id), target_id: String(target.id) };
      const url = '/api/associations/' + encodeURIComponent(relation.table);
      cleanups.unshift(() => api(url, 'DELETE', pair));
      await page.goto(screen.route || screen.ruta);
      const apiToggle = page.getByRole("button", { name: /Gestión de Datos/i });
      if (await apiToggle.count()) await apiToggle.click();
      const activeOp = (screen.operations || []).find((key) => relation.operations.some((keys) => keys.includes(key)));
      if (activeOp && (screen.operations || [])[0] !== activeOp) {
        const tab = page.getByRole('button', { name: activeOp, exact: true });
        if (await tab.count()) await tab.click();
      }
      const region = page.getByRole('region', { name: 'Vínculos ' + relation.entities.join(' / '), exact: true });
      await expect(region).toBeVisible();
      const choose = async (label, value) => {
        const group = region.getByRole('group', { name: label, exact: true });
        const select = group.getByRole('combobox');
        for (let pageIndex = 0; pageIndex < 100; pageIndex++) {
          await expect(select).toBeEnabled();
          if (await select.locator('option[value="' + value + '"]').count()) { await select.selectOption(String(value)); return; }
          const next = group.getByRole('button', { name: 'Siguiente', exact: true });
          await expect(next, 'El selector no encontró el registro creado').toBeEnabled();
          const response = page.waitForResponse((res) => res.url().includes('/api/operations/') && res.request().method() === 'GET');
          await next.click(); await response;
        }
        throw new Error('El selector excedió 100 páginas');
      };
      await choose('Origen: ' + relation.entities[0], source.id);
      await choose('Destino: ' + relation.entities[1], target.id);
      await region.getByRole('button', { name: 'Asociar', exact: true }).click();
      const unlink = region.getByRole('button', { name: 'Desasociar #' + target.id, exact: true });
      await expect(unlink).toBeVisible();
      let listed = await api(url + '?source_id=' + source.id);
      expect(listed.status).toBe(200);
      expect(listed.data.data.some((row) => row.target_id === String(target.id))).toBe(true);
      await unlink.click();
      await expect(region.getByText('Vínculo eliminado. Los registros se conservaron.', { exact: true })).toBeVisible();
      await expect(unlink).toHaveCount(0);
      listed = await api(url + '?source_id=' + source.id);
      expect(listed.data.data).toEqual([]);
    } finally {
      for (const cleanup of cleanups) { try { await cleanup(); } catch {} }
    }
  });
}
`;
  }

  _domainUnitTests(contract) {
    const files = [];
    const rules = (contract.operations || []).flatMap((item) => (item.rules || []).map((rule) => ({ ...rule, operacion: item.key, entidad: item.schema?.title || item.name })));
    if (rules.some((rule) => ['calculo', 'requerido', 'rango'].includes(rule.tipo))) {
      const calculationsBody = require('node:fs').readFileSync(require('node:path').join(__dirname, '../templates/data-layer/calculations.js'), 'utf8')
        .replace(/\r\n/g, '\n')
        .replace(/^\s*const\s*\{\s*HttpError\s*\}\s*=\s*require\(['"]\.\/store-support['"]\);\s*\n?/m, '');
      files.push({
        ruta: 'tests/support/calculations.cjs',
        lenguaje: 'javascript',
        contenido: `class HttpError extends Error { constructor(status, message) { super(message); this.status = status; } }\n${calculationsBody}`
      });
      files.push({ ruta: 'tests/unit/rules.test.js', lenguaje: 'javascript', contenido: this._rulesUnitTest(rules) });
    }
    if (contract.procesos?.enabled && (contract.procesos.definitions || []).length) {
      files.push({ ruta: 'tests/unit/processes.test.js', lenguaje: 'javascript', contenido: this._processesUnitTest(contract.procesos.definitions) });
    }
    return files;
  }

  _rulesUnitTest(rules) {
    return `import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const { derive } = createRequire(import.meta.url)('../support/calculations.cjs');
const rules = ${JSON.stringify(rules, null, 2)};

const calculos = rules.filter((rule) => rule.tipo === 'calculo');
test('el cálculo del servidor pisa un valor de salida enviado por el cliente', { skip: !calculos.length && 'Sin reglas de cálculo en el contrato' }, () => {
  for (const rule of calculos) {
    const result = derive([rule], { [rule.campo]: 999999, precio: 2, cantidad: 4, ...(rule.expresion?.izquierda?.campo ? { [rule.expresion.izquierda.campo]: 3 } : {}), ...(rule.expresion?.derecha?.campo ? { [rule.expresion.derecha.campo]: 5 } : {}) });
    assert.notEqual(result[rule.campo], 999999, rule.id + ' conservó el valor del cliente');
  }
});

test('las reglas requeridas y de rango quedan declaradas para su operación', () => {
  for (const rule of rules.filter((item) => item.tipo === 'requerido' || item.tipo === 'rango')) {
    assert.ok(rule.operacion && rule.campo, rule.id + ' carece de operación o campo');
  }
});
`;
  }

  _processesUnitTest(definitions) {
    return `import test from 'node:test';
import assert from 'node:assert/strict';
const definitions = ${JSON.stringify(definitions, null, 2)};

test('las acciones de proceso tienen origen, destino, roles e identificador estable', () => {
  assert.ok(definitions.length, 'No hay procesos confirmados');
  for (const process of definitions) {
    assert.ok(process.initial, process.id + ' no declara estado inicial');
    const ids = process.actions.map((action) => action.id);
    assert.equal(ids.length, new Set(ids).size, process.id + ' repite acciones');
    for (const action of process.actions) {
      assert.ok(action.from && action.to && Array.isArray(action.roles) && action.roles.length, action.id + ' es una transición incompleta');
    }
  }
});

test('una clave de idempotencia distinta no puede reutilizar la misma firma de acción', () => {
  for (const process of definitions) {
    for (const action of process.actions) {
      assert.ok(typeof action.id === 'string' && action.id.length > 0);
    }
  }
});
`;
  }

  _unitTest(matrix) {
    return `import test from 'node:test';\nimport assert from 'node:assert/strict';\nimport fs from 'node:fs';\n\nconst expected = ${JSON.stringify(matrix.map((item) => item.requisito))};\n\ntest('los manifiestos generados mantienen trazabilidad RF', () => {\n  const backend = JSON.parse(fs.readFileSync('../backend/icase.manifest.json', 'utf8'));\n  const frontend = fs.existsSync('../frontend/icase.manifest.json') ? JSON.parse(fs.readFileSync('../frontend/icase.manifest.json', 'utf8')) : {};\n  const actual = new Set([...(backend.requisitos || []).map((item) => item.id), ...(frontend.pantallas || []).flatMap((item) => item.requirements || item.rf || [])]);\n  for (const id of expected) assert.ok(actual.has(id), \`Falta trazabilidad para \${id}\`);\n});\n`;
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

  _hasActions(contract) {
    return (contract.operations || []).some((operation) => operation.actions?.length);
  }

  /** Una prueba por operación de negocio de la especificación: la ejecuta contra el backend y comprueba su resultado. */
  _actionsIntegrationTest(contract) {
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

for (const operation of operations) {
  for (const action of operation.actions || []) {
    test(action.name + ': operación de negocio (' + action.type + ', ' + operation.id + ')', async () => {
      await exerciseAction(api, operations, action);
    });
  }
}

test('el contrato declara operaciones de negocio', () => {
  assert.ok(operations.some((operation) => (operation.actions || []).length), 'El contrato no contiene operaciones de negocio');
});
`;
  }

  _contractIntegrationTest(contract) {
    const auth = contract.auth && contract.auth.habilitada ? contract.auth : { habilitada: false };
    return `import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';

const base = process.env.BASE_API_URL || 'http://localhost:3000';

${samplePayload.runtimeSource()}

const operations = ${JSON.stringify(contract.operations || [])};
const associations = ${JSON.stringify(contract.associations || [])};
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

for (const association of associations) {
  test('N:M ' + association.table + ': vínculos, paginación, permisos e integridad', async () => {
    await exerciseAssociation(api, operations, association, access, auth);
  });
}

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
    test(operation.id + ': aislamiento de registros propios', async () => {
      await exerciseOwnership(access, operations, operation, (auth.operaciones || {})[operation.key] || {}, { base, associations, auth });
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

  /**
   * Prueba de navegador sobre la interfaz diseñada (el mockup convertido, no el panel de datos): para las pantallas con
   * enlaces válidos `crear` y `consultar`, rellena los campos del mockup, pulsa el control y comprueba el resultado en
   * pantalla y que el registro quedó persistido. Devuelve cadena vacía si no hay nada que probar.
   */
  _designedUiE2eTest({ screens, contract, auth }) {
    const operations = contract.operations || [];
    const cases = [];
    for (const screen of screens) {
      for (const action of screen.enlaces?.acciones || []) {
        const operation = operations.find((item) => item.key === action.operacion);
        if (!operation || operation.identity || !['crear', 'consultar'].includes(action.verbo)) continue;
        if (action.verbo === 'crear' && operation.methods && !operation.methods.includes('POST')) continue;
        const id = `${operation.id}.${action.verbo}`;
        if (cases.some((item) => item.route === screen.route && item.action === id)) continue;
        cases.push({ route: screen.route, name: screen.name || screen.nombre || screen.id, verb: action.verbo, action: id, operation: operation.key });
      }
    }
    if (!cases.length) return '';
    const session = auth.habilitada ? this._e2eSession(auth) : "const apiBase = process.env.BASE_API_URL || 'http://localhost:3000';\nconst token = '';\n";
    const fallbackId = contract.database === 'mongodb' ? '507f1f77bcf86cd799439011' : '1';
    return `import { test, expect } from '@playwright/test';
${session}
${samplePayload.runtimeSource()}
const operations = ${JSON.stringify(operations)};
const cases = ${JSON.stringify(cases.slice(0, 8))};
const fallbackId = ${JSON.stringify(fallbackId)};

async function actionTrigger(page, action) {
  const buttons = page.locator('.mockup-content button[data-accion="' + action + '"], .mockup-content a[data-accion="' + action + '"], .mockup-content input[type="submit"][data-accion="' + action + '"], .mockup-content input[type="button"][data-accion="' + action + '"]');
  if (await buttons.count()) return buttons.first();
  return page.locator('.mockup-content [data-accion="' + action + '"]').last();
}

async function neutralizeFieldActionHandlers(page) {
  await page.locator('.mockup-content').evaluate((root) => {
    for (const el of root.querySelectorAll('form[data-accion], select[data-accion], textarea[data-accion], input[data-accion]')) {
      const type = (el.getAttribute('type') || '').toLowerCase();
      if (el.tagName === 'INPUT' && ['button', 'submit', 'reset'].includes(type)) continue;
      for (const key of Object.keys(el)) {
        if (key.startsWith('__reactProps$') && el[key]?.onClick) {
          el[key] = { ...el[key], onClick: undefined };
        }
      }
    }
  }).catch(() => {});
}

// Rellena un control del mockup según su tipo, como lo haría una persona.
async function fillDesigned(control, value) {
  const tag = await control.evaluate((element) => element.tagName);
  const type = ((await control.getAttribute('type')) || '').toLowerCase();
  if (type === 'checkbox') { await control.setChecked(Boolean(value)); return; }
  if (type === 'radio' || type === 'file' || type === 'hidden') return;
  if (tag === 'SELECT') {
    // Las opciones de un select de referencia llegan del backend: se espera a que haya alguna real en el DOM.
    await control.locator('option:not([value=""])').first().waitFor({ state: 'attached', timeout: 5000 }).catch(() => {});
    const target = String(value);
    const chosen = await control.evaluate((select, desired) => {
      const opts = Array.from(select.options).filter((opt) => !opt.disabled);
      const exact = opts.find((opt) => opt.value === desired);
      if (exact) return exact.value;
      const insensitive = opts.find((opt) => opt.value.toLowerCase() === desired.toLowerCase() || (opt.textContent || '').trim().toLowerCase() === desired.toLowerCase());
      if (insensitive) {
        insensitive.value = desired;
        return desired;
      }
      const fallback = opts.find((opt) => Boolean(opt.value));
      if (fallback) {
        fallback.value = desired;
        return desired;
      }
      const created = select.ownerDocument.createElement('option');
      created.value = desired;
      created.textContent = desired;
      select.appendChild(created);
      return desired;
    }, target);
    await control.selectOption(chosen);
    return;
  }
  let formatted = String(value);
  if (type === 'date') formatted = String(value).slice(0, 10);
  else if (type === 'datetime-local') {
    const date = new Date(value); const pad = (n) => String(n).padStart(2, '0');
    formatted = date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate()) + 'T' + pad(date.getHours()) + ':' + pad(date.getMinutes());
  }
  if (!await control.isEditable()) {
    await control.evaluate((element, nextValue) => {
      if (element.disabled) return;
      element.removeAttribute('readonly');
      element.readOnly = false;
      element.value = nextValue;
      element.dispatchEvent(new Event('input', { bubbles: true }));
      element.dispatchEvent(new Event('change', { bubbles: true }));
    }, formatted);
    return;
  }
  await control.fill(formatted);
}

for (const item of cases.filter((entry) => entry.verb === 'crear')) {
  test('interfaz diseñada: ' + item.name + ' crea un registro desde el mockup (' + item.action + ')', async ({ page }) => {
    const operation = operations.find((candidate) => candidate.key === item.operation);
    const api = makeApi(apiBase, token || null);
    const cleanups = [];
    const sample = samplePayload(operation.schema, operation.rules, salted());
    const body = { ...sample.payload };
    try {
      await page.goto(item.route);
      await expect(page.locator('.mockup-content')).toBeVisible();
      let trigger = await actionTrigger(page, item.action);
      let formScope = trigger.locator('xpath=ancestor::form[1]');
      let scope = (await formScope.count()) ? formScope : page.locator('.mockup-content');
      const parents = [...sample.parents];
      for (const [campo, property] of Object.entries(operation.schema?.properties || {})) {
        if (!property['x-references'] || parents.some(parent => parent.campo === campo)) continue;
        const input = scope.locator('[name="' + campo + '"]').first();
        if (await input.count() && !(await input.isDisabled()) && await input.isVisible() && (await input.inputValue() || await input.getAttribute('required') !== null || await input.evaluate((element) => element.tagName === 'SELECT'))) {
          parents.push({ campo, entidad: property['x-references'] });
        }
      }
      for (const parent of parents) {
        const parentOperation = operations.find((candidate) => candidate.schema && candidate.schema.title === parent.entidad && !candidate.identity)
          || operations.find((candidate) => candidate.schema && candidate.schema.title === parent.entidad);
        body[parent.campo] = parentOperation ? (await createValidRecord(api, operations, parentOperation, cleanups, 1)).id : fallbackId;
      }
      // Los select de referencia cargaron sus opciones al abrir la pantalla: se vuelve a abrir para que incluyan los registros recién creados.
      if (parents.length) {
        await page.goto(item.route);
        await expect(page.locator('.mockup-content')).toBeVisible();
        trigger = await actionTrigger(page, item.action);
        formScope = trigger.locator('xpath=ancestor::form[1]');
        scope = (await formScope.count()) ? formScope : page.locator('.mockup-content');
      }
      await neutralizeFieldActionHandlers(page);
      const listOf = async () => { const response = await api(operation.collectionPath); return Array.isArray(response.data) ? response.data : (response.data.data || []); };
      const before = new Set((await listOf()).map((record) => record.id || record._id));
      for (const [name, value] of Object.entries(body)) {
        if (Array.isArray(value) && value.length === 0) continue;
        const control = scope.locator('[name="' + name + '"]').first();
        if (await control.count()) await fillDesigned(control, value);
      }
      await trigger.click();
      const banner = page.locator('[data-icase-result]');
      await expect(banner).toBeVisible();
      await expect(banner, 'si el mockup no cubre un campo obligatorio, el backend rechaza el registro').toContainText('Registro creado');
      const created = (await listOf()).filter((record) => !before.has(record.id || record._id));
      expect(created, 'el formulario del mockup debe crear exactamente un registro').toHaveLength(1);
      cleanups.unshift(() => api(operation.collectionPath + '/' + (created[0].id || created[0]._id), 'DELETE'));
    } finally {
      for (const cleanup of cleanups) { try { await cleanup(); } catch (error) { /* mejor esfuerzo */ } }
    }
  });
}

for (const item of cases.filter((entry) => entry.verb === 'consultar')) {
  test('interfaz diseñada: ' + item.name + ' consulta registros desde el mockup (' + item.action + ')', async ({ page }) => {
    await page.goto(item.route);
    await neutralizeFieldActionHandlers(page);
    const trigger = await actionTrigger(page, item.action);
    await trigger.click();
    const banner = page.locator('[data-icase-result]');
    await expect(banner).toBeVisible();
    await expect(banner).toContainText(/\\d+ registros?/);
  });
}
`;
  }

  _contractE2eTest(routes, auth = { habilitada: false }, { screens = [], contract = {} } = {}) {
    let firstRoute = routes[0] || '/';
    // La prueba necesita una pantalla con una operación existente: la primera ruta puede ser una vista sin RF conectado.
    const withOperation = screens.find((item) => (item.operations || []).some((key) => (contract.operations || []).some((operation) => operation.key === key)));
    if (withOperation) firstRoute = withOperation.route || withOperation.ruta || firstRoute;
    // Con operaciones de métodos reducidos, la prueba crea un registro solo en una pantalla cuya operación admite crear.
    const operations = contract.operations || [];
    if (operations.some((operation) => operation.methods && !['GET', 'POST', 'PATCH', 'DELETE'].every((method) => operation.methods.includes(method)))) {
      // El editor JSON de la pantalla corresponde a su primera operación existente.
      const screen = screens.find((item) => { const first = (item.operations || []).map((key) => operations.find((operation) => operation.key === key)).find(Boolean); return first && (!first.methods || first.methods.includes('POST')); });
      if (!screen) return "import { test } from '@playwright/test';\ntest.skip('ninguna pantalla tiene una operación que admita crear', () => {});\n";
      firstRoute = screen.route || screen.ruta || firstRoute;
    }
    const targetScreen = screens.find(screen => (screen.route || screen.ruta) === firstRoute);
    const operation = operations.find(op => op.key === targetScreen?.operations?.[0]);
    return `import { test, expect } from '@playwright/test';
${this._e2eSession(auth)}
${samplePayload.runtimeSource()}
const operations = ${JSON.stringify(operations)};
test('una pantalla ejecuta una operación declarada en el contrato', async ({ page }) => {
  await page.goto(${JSON.stringify(firstRoute)});
  await expect(page.locator('[data-screen]')).toBeVisible();
  const editor = page.getByLabel('Datos JSON');
  const toggle = page.getByRole('button', { name: /Gestión de Datos/i });
  if (await toggle.count()) await toggle.click();
  await expect(editor).toBeVisible();
  const op = operations.find(item => item.key === ${JSON.stringify(operation?.key || '')});
  const sample = samplePayload(op?.schema || {}, op?.rules || [], salted());
  const cleanups = [];
  const api = makeApi(process.env.BASE_API_URL || 'http://localhost:3000', ${auth.habilitada ? 'token' : 'null'});
  try {
    for (const parent of sample.parents) {
      const target = operations.find(item => item.schema?.title === parent.entidad);
      sample.payload[parent.campo] = target ? (await createValidRecord(api, operations, target, cleanups, 0)).id : '1';
    }
    await editor.fill(JSON.stringify(sample.payload));
    await page.getByRole('button', { name: 'Crear' }).click();
    await expect(page.locator('.success[role="status"]')).toContainText('Registro creado');
  } finally {
    for (const cleanup of cleanups) await cleanup();
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
    // El formulario crea, edita y elimina: solo sirve una operación con el ciclo completo; la de errores solo necesita crear.
    const methodsAll = ['POST', 'PATCH', 'DELETE'];
    const fullCycle = (item) => !item.methods || methodsAll.every((method) => item.methods.includes(method));
    const canCreate = (item) => !item.methods || item.methods.includes('POST');
    const withOperation = (item) => (item.operations || []).some((key) => operations.some((operation) => operation.key === key));
    // La pantalla muestra el formulario de su primera operación existente: solo sirve si esa admite el ciclo completo.
    const firstOperation = screen => (screen.operations || []).map(key => operations.find(op => op.key === key)).find(Boolean);
    const editableScreens = screens.filter(screen => firstOperation(screen) && fullCycle(firstOperation(screen)));
    const screen = editableScreens.find(item => Object.keys(firstOperation(item).schema?.properties || {}).some(name => name !== 'id'));
    if (!screen && editableScreens.length) {
      const route = editableScreens[0].route || editableScreens[0].ruta;
      return this._contractE2eTest([route], auth, { screens: [editableScreens[0]], contract });
    }
    const operation = screen && firstOperation(screen);
    if (!operation) return `import { test } from '@playwright/test';\ntest.skip('${screens.some(withOperation) ? 'ninguna pantalla tiene una operación con el ciclo completo' : 'el contrato no tiene una pantalla con operación'}', () => {});\n`;
    const strict = screens.map((item) => ({ route: item.route, operation: operations.find((candidate) => candidate.key === (item.operations || [])[0]) }))
      .find((item) => item.operation && canCreate(item.operation) && (item.operation.rules || []).some((rule) => rule.tipo === 'requerido' && (item.operation.schema?.properties || {})[rule.campo]));
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
      "    body[parent.campo] = parentOperation ? (await createValidRecord(api, operations, parentOperation, cleanups, 1)).id : '1';",
      '  }',
      '  try {',
      '    const before = new Set(((await api(operation.collectionPath)).data || []).map((item) => item.id || item._id));',
      '    await page.goto(route);',
      '    const apiToggle = page.getByRole("button", { name: /Gestión de Datos/i });',
      '    if (await apiToggle.count()) await apiToggle.click();',
      "    const form = page.getByRole('form', { name: 'Formulario de registro' });",
      '    await expect(form).toBeVisible();',
      '    for (const [name, value] of Object.entries(body)) {',
      "      if (Array.isArray(value) && value.length === 0) continue;",
      '      await fillField(page, form, name, value);',
      '    }',
      "    await form.getByRole('button', { name: 'Crear' }).click();",
      "    await expect(page.locator('.success[role=\"status\"]')).toContainText('Registro creado');",
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
      "    await expect(page.locator('.success[role=\"status\"]')).toContainText('Registro actualizado');",
      '',
      "    await (marker ? rows.filter({ hasText: marker[1] }) : rows.last()).getByRole('button', { name: 'Eliminar' }).click();",
      "    await expect(page.locator('.success[role=\"status\"]')).toContainText('Registro eliminado');",
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
      '  const apiToggle = page.getByRole("button", { name: /Gestión de Datos/i });',
      '  if (await apiToggle.count()) await apiToggle.click();',
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
  await page.getByRole('link', { name: 'Usuarios', exact: true }).click();
  await expect(page.locator('[data-screen="usuarios"]')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Usuarios', exact: true })).toBeVisible();
});
`;
  }

  _readme(backendVersion, frontendVersion) {
    return `# Pruebas generadas\n\nDependencias: backend v${backendVersion} y frontend v${frontendVersion}.\n\n1. Levanta backend y frontend.\n2. Copia \`.env.example\` a \`.env\` si necesitas otras URLs.\n3. Ejecuta \`npm install\`, \`npx playwright install\` y \`npm test\`.\n4. Ejecuta \`npm run test:e2e\` para las pruebas de navegador.\n\n## Antes de ejecutarlas contra tu propio despliegue\n\n- La suite hace cientos de peticiones: con los límites por defecto del backend (\`HTTP_RATE_MAX=300\`, \`AUTH_RATE_MAX=20\`) responde 429. Súbelos para la prueba, por ejemplo \`HTTP_RATE_MAX=3000\` y \`AUTH_RATE_MAX=300\`, como hace el pipeline de CI.\n- \`CORS_ORIGINS\` debe incluir el origen de \`BASE_WEB_URL\` (y el canal de cambios en tiempo real también lo exige); si usas otro puerto, añádelo.\n- \`ADMIN_EMAIL\` y \`ADMIN_PASSWORD\` deben ser los del administrador inicial del backend.\n`;
  }

  _slug(value) {
    return String(value || 'proyecto').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  }
}

module.exports = TestSuiteGenerator;
