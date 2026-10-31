const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');

const samplePayload = require('./SamplePayload');
const renderTemplate = require('./renderTemplate');

const runFile = promisify(execFile);

class SandboxRuntimeVerifier {
  constructor({ run = runFile } = {}) { this.run = run; }

  async verificar(artefacto) {
    if (!['codigo_backend', 'codigo_frontend', 'pruebas', 'paquete_entrega'].includes(artefacto.tipo)) {
      return { estado: 'no_aplica', nivel: 'estatico', pruebas: [], errores: [] };
    }
    const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'icase-runtime-'));
    const project = `icasev${path.basename(temporary).replace(/[^a-z0-9]/gi, '').toLowerCase()}`;
    const checks = [];
    try {
      await this._stage(temporary, artefacto.archivos || []);
      await this._helpers(temporary, artefacto.tipo);
      const docker = async (args, label, timeout = 360000) => {
        const { stdout, stderr } = await this.run('docker', args, { cwd: temporary, timeout, maxBuffer: 2 * 1024 * 1024 });
        checks.push({ paso: label, resultado: 'correcto', salida: `${stdout || ''}${stderr || ''}`.slice(-2000) });
      };
      if (artefacto.tipo === 'codigo_frontend') {
        await docker(['build', '--tag', `${project}-frontend`, '--file', 'frontend.verify.Dockerfile', '.'], 'Compilación React/Vite en Docker', 900000);
        if ((artefacto.archivos || []).some((file) => file.ruta === 'mobile/package.json')) {
          await docker(['build', '--tag', `${project}-mobile`, '--file', 'mobile.verify.Dockerfile', '.'], 'Bundle Android Expo en Docker', 900000);
        }
      } else {
        if (artefacto.tipo === 'paquete_entrega') {
          await docker(['compose', '--env-file', 'ops/.env.example', '-f', 'ops/docker-compose.yml', 'config', '--quiet'], 'Validación de Compose exportado');
        }
        const compose = ['compose', '-p', project, '-f', 'verify.compose.yml'];
        try {
          const integrated = ['pruebas', 'paquete_entrega'].includes(artefacto.tipo);
          await docker([...compose, 'build', 'backend', ...(integrated ? ['frontend', 'tests'] : ['smoke'])], integrated ? 'Compilación de backend, frontend y pruebas en Docker' : 'Compilación backend en Docker', 900000);
          if (integrated && (artefacto.archivos || []).some((file) => file.ruta === 'mobile/package.json')) {
            await docker(['build', '--tag', `${project}-mobile`, '--file', 'mobile.verify.Dockerfile', '.'], 'Bundle Android Expo en Docker', 900000);
          }
          await docker([...compose, 'up', '-d', '--wait', 'database', 'backend', ...(integrated ? ['frontend'] : [])], integrated ? 'Arranque de base de datos, backend y frontend con health checks' : 'Arranque de base de datos y backend con health checks', 240000);
          await docker([...compose, 'run', '--rm', integrated ? 'tests' : 'smoke'],
            integrated ? 'Pruebas de integración del paquete' : 'Prueba CRUD HTTP derivada del contrato', 240000);
        } finally {
          try { await this.run('docker', [...compose, 'down', '-v', '--rmi', 'local', '--remove-orphans'], { cwd: temporary, timeout: 120000 }); }
          catch { /* El directorio temporal y el nombre de proyecto son exclusivos de esta verificación. */ }
        }
      }
      return { estado: 'apta', nivel: 'ejecucion_aislada', pruebas: checks, errores: [] };
    } catch (error) {
      const diagnostic = `${error.stdout || ''}\n${error.stderr || ''}\n${error.message || ''}`.trim();
      return { estado: 'fallida', nivel: 'ejecucion_aislada', pruebas: checks,
        errores: [`No pasó la ejecución aislada: ${diagnostic.slice(-4000)}`] };
    } finally {
      try { await this.run('docker', ['image', 'rm', `${project}-frontend`], { cwd: temporary, timeout: 30000 }); }
      catch { /* Imagen de esta verificación inexistente o ya eliminada. */ }
      try { await this.run('docker', ['image', 'rm', `${project}-mobile`], { cwd: temporary, timeout: 30000 }); }
      catch { /* Imagen de esta verificación inexistente o ya eliminada. */ }
      try { await fs.rm(temporary, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 }); }
      catch { /* Un proceso de Docker cancelado puede liberar archivos unos segundos después; no ocultar el resultado. */ }
    }
  }

  async _stage(root, files) {
    for (const file of files) {
      const normalized = String(file.ruta || '').replace(/\\/g, '/');
      if (!normalized || normalized.startsWith('/') || normalized.split('/').some((part) => part === '..' || part === '.')) {
        throw new Error(`Ruta no segura en artefacto: ${file.ruta}`);
      }
      const destination = path.resolve(root, ...normalized.split('/'));
      if (!destination.startsWith(root + path.sep)) throw new Error(`Ruta fuera del entorno temporal: ${file.ruta}`);
      await fs.mkdir(path.dirname(destination), { recursive: true });
      await fs.writeFile(destination, String(file.contenido || ''), 'utf8');
    }
  }

  async _helpers(root, type) {
    let manifest = {};
    try { manifest = JSON.parse(await fs.readFile(path.join(root, 'backend', 'icase.manifest.json'), 'utf8')); }
    catch { /* El frontend puede verificarse sin disponer todavía del backend. */ }
    const operations = Array.isArray(manifest.operations) ? manifest.operations : [];
    const databaseKind = manifest.database || 'postgres';
    const database = databaseKind === 'mongodb'
      ? { image: 'mongo:7', environment: '{ MONGO_INITDB_DATABASE: app }', health: '["CMD", "mongosh", "--quiet", "--eval", "db.adminCommand({ping:1})"]', url: 'mongodb://database:27017/app' }
      : databaseKind === 'mysql'
        ? { image: 'mysql:8', environment: '{ MYSQL_DATABASE: app, MYSQL_USER: app, MYSQL_PASSWORD: test-password, MYSQL_ROOT_PASSWORD: root-test-password }', health: '["CMD-SHELL", "mysqladmin ping -h 127.0.0.1 -uapp -ptest-password"]', url: 'mysql://app:test-password@database:3306/app' }
        : { image: 'postgres:16-alpine', environment: '{ POSTGRES_DB: app, POSTGRES_USER: app, POSTGRES_PASSWORD: test-password }', health: '["CMD-SHELL", "pg_isready -U app -d app"]', url: 'postgresql://app:test-password@database:5432/app' };
    const java = manifest.stack?.lenguaje === 'java';
    const backendDocker = java
      ? 'FROM maven:3.9-eclipse-temurin-21 AS build\nWORKDIR /build\nCOPY backend/pom.xml ./\nRUN mvn -B -q -DskipTests dependency:go-offline\nCOPY backend/src ./src\nRUN mvn -B -q -DskipTests package\nFROM eclipse-temurin:21-jre-alpine\nWORKDIR /app\nCOPY --from=build /build/target/app.jar /app/app.jar\nENV JAVA_TOOL_OPTIONS="-XX:MaxRAMPercentage=70 -XX:+UseSerialGC"\nCMD ["java","-jar","/app/app.jar"]\n'
      : `FROM node:22-alpine\nWORKDIR /app\nCOPY backend/package*.json ./\nRUN npm install --ignore-scripts\nCOPY backend/ ./\nRUN npm run build --if-present\nCOPY smoke.mjs /app/smoke.mjs\nCMD ["npm","start"]\n`;
    const smokeDocker = 'FROM node:22-alpine\nWORKDIR /app\nCOPY smoke.mjs /app/smoke.mjs\n';
    const frontendDocker = `FROM node:22-alpine AS build\nWORKDIR /app\nCOPY frontend/package*.json ./\nRUN npm install --ignore-scripts\nCOPY frontend/ ./\nRUN npm run build\nFROM nginxinc/nginx-unprivileged:1.27-alpine\nCOPY verify.nginx.conf /etc/nginx/conf.d/default.conf\nCOPY --from=build /app/dist /usr/share/nginx/html\n`;
    const mobileDocker = `FROM node:22-alpine\nWORKDIR /app\nCOPY mobile/package*.json ./\nRUN npm install --ignore-scripts\nCOPY mobile/ ./\nENV EXPO_PUBLIC_API_URL=http://backend:3000\nRUN npm run export:android\n`;
    const testDocker = `FROM mcr.microsoft.com/playwright:v1.50.0-noble\nWORKDIR /app/tests\nCOPY tests/package*.json ./\nRUN npm install --ignore-scripts\nCOPY tests/ ./\nCOPY backend/icase.manifest.json /app/backend/icase.manifest.json\nCOPY frontend/icase.manifest.json /app/frontend/icase.manifest.json\nCMD ["sh","-c","npm test && npm run test:e2e"]\n`;
    const nginx = `server { listen 8080; root /usr/share/nginx/html; index index.html; location / { try_files $uri /index.html; } location /api/ { proxy_pass http://backend:3000; proxy_set_header Host $host; } location = /health { proxy_pass http://backend:3000/health; } }\n`;
    const compose = `services:
  database:
    image: ${database.image}
    environment: ${database.environment}
    networks: [verification]
    mem_limit: 512m
    pids_limit: 128
    healthcheck: { test: ${database.health}, interval: 2s, timeout: 2s, retries: 30 }
  backend:
    build: { context: ., dockerfile: backend.verify.Dockerfile }
    environment: { PORT: "3000", DATABASE_URL: "${database.url}", DB_NAME: "app", JWT_SECRET: "isolated-test-secret", ADMIN_EMAIL: "admin@example.test", ADMIN_PASSWORD: "test-admin-password" }
    networks: [verification]
    mem_limit: ${java ? '768m' : '512m'}
    pids_limit: ${java ? 512 : 128}
    cap_drop: [ALL]
    security_opt: ["no-new-privileges:true"]
    depends_on: { database: { condition: service_healthy } }
    healthcheck: { test: ["CMD-SHELL", "wget -qO- http://127.0.0.1:3000/health >/dev/null"], interval: 2s, timeout: 3s, retries: 60 }
  frontend:
    build: { context: ., dockerfile: frontend.verify.Dockerfile }
    networks: [verification]
    mem_limit: 256m
    pids_limit: 128
    cap_drop: [ALL]
    security_opt: ["no-new-privileges:true"]
    depends_on: { backend: { condition: service_healthy } }
    healthcheck: { test: ["CMD-SHELL", "wget -qO- http://127.0.0.1:8080/ >/dev/null"], interval: 2s, timeout: 3s, retries: 30 }
  smoke:
    build: { context: ., dockerfile: smoke.verify.Dockerfile }
    environment: { BASE_API_URL: "http://backend:3000", ADMIN_EMAIL: "admin@example.test", ADMIN_PASSWORD: "test-admin-password" }
    networks: [verification]
    mem_limit: 256m
    pids_limit: 64
    cap_drop: [ALL]
    security_opt: ["no-new-privileges:true"]
    command: ["node", "/app/smoke.mjs"]
    depends_on: { backend: { condition: service_healthy } }
  tests:
    build: { context: ., dockerfile: tests.verify.Dockerfile }
    environment: { BASE_API_URL: "http://backend:3000", BASE_WEB_URL: "http://frontend:8080", ADMIN_EMAIL: "admin@example.test", ADMIN_PASSWORD: "test-admin-password" }
    networks: [verification]
    mem_limit: 512m
    pids_limit: 512
    cap_drop: [ALL]
    security_opt: ["no-new-privileges:true"]
    depends_on: { backend: { condition: service_healthy }, frontend: { condition: service_healthy } }
networks:
  verification: { internal: true }
`;
    const config = {
      database: databaseKind,
      auth: manifest.auth || { habilitada: false },
      map: manifest.storage?.operations || {},
      tables: (manifest.storage?.tables || []).map((table) => ({ name: table.name, references: table.references || [] })),
      operations: operations.map((item) => ({ id: item.id, key: item.key, collectionPath: item.collectionPath, schema: item.schema, rules: item.rules || [] }))
    };
    const smoke = renderTemplate(await fs.readFile(path.join(__dirname, '..', 'templates', 'verification', 'smoke.mjs'), 'utf8'), { CONFIG: JSON.stringify(config), SAMPLE: samplePayload.runtimeSource() });
    await Promise.all([
      fs.writeFile(path.join(root, 'backend.verify.Dockerfile'), backendDocker),
      fs.writeFile(path.join(root, 'smoke.verify.Dockerfile'), smokeDocker),
      fs.writeFile(path.join(root, 'frontend.verify.Dockerfile'), frontendDocker),
      fs.writeFile(path.join(root, 'mobile.verify.Dockerfile'), mobileDocker),
      fs.writeFile(path.join(root, 'tests.verify.Dockerfile'), testDocker),
      fs.writeFile(path.join(root, 'verify.nginx.conf'), nginx),
      fs.writeFile(path.join(root, 'verify.compose.yml'), compose),
      fs.writeFile(path.join(root, 'smoke.mjs'), smoke)
    ]);
    if (['pruebas', 'paquete_entrega'].includes(type)) {
      await fs.access(path.join(root, 'tests', 'package.json'));
    }
  }
}

module.exports = SandboxRuntimeVerifier;
