const crypto = require('crypto');
const IGeneradorArtefacto = require('../../core/services/IGeneradorArtefacto');

class CiCdPipelineGenerator extends IGeneradorArtefacto {
  async generar({ proyecto, insumos, versionesOrigen }) {
    const { tests, infrastructure, decisiones } = insumos;
    const explicitGithub = /github/i.test(JSON.stringify(decisiones || {}));
    const platforms = decisiones.alcance_plataforma?.plataformas || decisiones.stack_tecnologico?.plataformas || [];
    const mobile = platforms.some((item) => /m[oó]vil|android|ios|react native/i.test(item));
    const files = [
      { ruta: '.github/workflows/ci-cd.yml', lenguaje: 'yaml', contenido: this._workflow(mobile) },
      { ruta: 'ops/ci/validate-artifacts.mjs', lenguaje: 'javascript', contenido: this._validator() },
      { ruta: 'ops/ci/README.md', lenguaje: 'markdown', contenido: this._readme(proyecto.nombre, tests.version, infrastructure.version) },
      { ruta: 'ops/ci/pipeline-manifest.json', lenguaje: 'json', contenido: JSON.stringify({ proyecto: proyecto.nombre, proveedor: 'GitHub Actions', pruebas_version: tests.version, infraestructura_version: infrastructure.version, movil_incluido: mobile, despliegue_automatico: false }, null, 2) }
    ];
    return {
      archivos: files.map((file) => ({ ...file, huella: crypto.createHash('sha256').update(file.contenido).digest('hex') })),
      dependencias: [{ tipo: 'pruebas', version: tests.version }, { tipo: 'infraestructura', version: infrastructure.version }],
      trazabilidad_rf: [...new Set([...(tests.trazabilidad_rf || []), ...(infrastructure.trazabilidad_rf || [])])],
      advertencias: explicitGithub ? [] : ['No se especificó proveedor CI/CD; se propone GitHub Actions para revisión.'],
      versiones_origen: versionesOrigen,
      generado_por: 'generador_ci_cd_determinista_v1'
    };
  }

  _workflow(mobile = false) {
    return `name: CI/CD

on:
  pull_request:
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read

concurrency:
  group: ci-\${{ github.ref }}
  cancel-in-progress: true

jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - name: Validate generated artifacts
        run: node ops/ci/validate-artifacts.mjs
      - name: Install and build backend
        working-directory: backend
        run: npm install && npm run build --if-present
      - name: Install and build frontend
        working-directory: frontend
        run: npm install && npm run build
${mobile ? `      - name: Bundle Android client
        working-directory: mobile
        env:
          EXPO_PUBLIC_API_URL: http://localhost:3000
        run: npm install && npm run export:android
` : ''}
      - name: Install test dependencies
        working-directory: tests
        run: npm install
      - name: Build deployment images
        run: docker compose -f ops/docker-compose.yml build

  test:
    needs: validate
    runs-on: ubuntu-latest
    env:
      DB_NAME: icase_test
      DB_USER: icase_test
      DB_PASSWORD: ci-test-only-password
      DB_ROOT_PASSWORD: ci-test-only-root-password
      JWT_SECRET: ci-only-secret-not-for-production
      ADMIN_EMAIL: admin@example.test
      ADMIN_PASSWORD: ci-admin-password-123
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - name: Start application
        run: docker compose -f ops/docker-compose.yml up -d --build
      - name: Wait for services
        run: timeout 90 sh -c 'until curl -fsS http://localhost:3000/health; do sleep 3; done'
      - name: Run unit and integration tests
        working-directory: tests
        env:
          BASE_API_URL: http://localhost:3000
        run: npm install && npm test
      - name: Install and run browser tests
        working-directory: tests
        env:
          BASE_WEB_URL: http://localhost:8080
        run: npx playwright install --with-deps chromium && npm run test:e2e
      - name: Upload Playwright report
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: playwright-report
          path: tests/playwright-report/
          if-no-files-found: ignore
      - name: Stop application
        if: always()
        run: docker compose -f ops/docker-compose.yml down -v

  package:
    if: github.ref == 'refs/heads/main'
    needs: test
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Build images
        run: docker compose -f ops/docker-compose.yml build
      - name: Export delivery bundle
        run: tar -czf delivery-bundle.tgz backend frontend tests ops
      - uses: actions/upload-artifact@v4
        with:
          name: delivery-bundle
          path: delivery-bundle.tgz
`;
  }

  _validator() {
    return `import fs from 'node:fs';

const required = ['backend/package.json','frontend/package.json','tests/package.json','ops/docker-compose.yml'];
const missing = required.filter((path) => !fs.existsSync(path));
if (missing.length) {
  console.error('Faltan artefactos aprobados:', missing.join(', '));
  process.exit(1);
}
for (const path of ['backend/icase.manifest.json','frontend/icase.manifest.json','tests/coverage-matrix.json']) JSON.parse(fs.readFileSync(path, 'utf8'));
console.log('Artefactos y manifiestos válidos.');
`;
  }

  _readme(projectName, testsVersion, infraVersion) {
    return `# CI/CD de ${projectName}\n\nPipeline vinculado a pruebas v${testsVersion} e infraestructura v${infraVersion}.\n\nEl flujo valida, compila, levanta contenedores, ejecuta pruebas y publica un paquete descargable. No despliega a producción: configura primero el destino, entorno protegido y secretos del repositorio.\n`;
  }
}

module.exports = CiCdPipelineGenerator;
