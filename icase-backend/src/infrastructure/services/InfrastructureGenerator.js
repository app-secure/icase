const crypto = require('crypto');
const IGeneradorArtefacto = require('../../core/services/IGeneradorArtefacto');

class InfrastructureGenerator extends IGeneradorArtefacto {
  async generar({ proyecto, insumos, versionesOrigen }) {
    const { decisiones, requerimientos, diagramas, backend, frontend } = insumos;
    const stack = decisiones.stack_tecnologico || {};
    const evidence = this._evidence(requerimientos, diagramas);
    const database = this._database(stack.base_datos, evidence);
    const highAvailability = /alta disponibilidad|high availability|failover|balanceador|load balanc|r[eé]plica/i.test(evidence);
    const files = [
      { ruta: 'ops/docker/backend.Dockerfile', lenguaje: 'dockerfile', contenido: this._backendDockerfile(stack.backend) },
      { ruta: 'ops/docker/frontend.Dockerfile', lenguaje: 'dockerfile', contenido: this._frontendDockerfile() },
      { ruta: 'ops/docker/nginx.conf', lenguaje: 'nginx', contenido: this._nginxConfig(highAvailability) },
      { ruta: 'ops/docker-compose.yml', lenguaje: 'yaml', contenido: this._compose(database, highAvailability) },
      { ruta: 'ops/.env.example', lenguaje: 'dotenv', contenido: this._env(database) },
      { ruta: 'ops/deployment-manifest.json', lenguaje: 'json', contenido: JSON.stringify({ proyecto: proyecto.nombre, backend: backend.version, frontend: frontend.version, base_datos: database?.label || null, alta_disponibilidad: highAvailability, evidencia_arquitectura: diagramas.map((item) => ({ tipo: item.tipo, version: item.version })) }, null, 2) },
      { ruta: 'ops/README.md', lenguaje: 'markdown', contenido: this._readme(database, highAvailability) }
    ];
    if (highAvailability) files.push({ ruta: 'ops/docker-compose.ha.yml', lenguaje: 'yaml', contenido: this._haOverride() });
    const warnings = [];
    if (!diagramas.some((item) => item.tipo === 'arquitectura_sistema')) warnings.push('No existe un diagrama de arquitectura del sistema aprobado y vigente; revisa manualmente el despliegue propuesto.');
    if (!database) warnings.push('No se identificó una base de datos aprobada; el compose no creará un servicio de persistencia.');
    return {
      archivos: files.map((file) => ({ ...file, huella: crypto.createHash('sha256').update(file.contenido).digest('hex') })),
      dependencias: [{ tipo: 'codigo_backend', version: backend.version }, { tipo: 'codigo_frontend', version: frontend.version }],
      trazabilidad_rf: [...new Set([...(backend.trazabilidad_rf || []), ...(frontend.trazabilidad_rf || [])])],
      advertencias: warnings,
      versiones_origen: versionesOrigen,
      generado_por: 'generador_infraestructura_determinista_v1'
    };
  }

  _evidence(requirements, diagrams) {
    return [...requirements.flatMap((item) => [item.nombre, item.descripcion, item.metrica_medible]), ...diagrams.flatMap((item) => [item.descripcion, item.codigo_plantuml, item.codigo_mermaid])].join('\n');
  }

  _database(selected, evidence) {
    const text = `${selected || ''}\n${evidence}`;
    if (/postgres(?:ql)?/i.test(text)) return { label: 'PostgreSQL', image: 'postgres:16-alpine', env: ['POSTGRES_DB=${DB_NAME}', 'POSTGRES_USER=${DB_USER}', 'POSTGRES_PASSWORD=${DB_PASSWORD}'], url: 'postgresql://${DB_USER}:${DB_PASSWORD}@database:5432/${DB_NAME}', volume: '/var/lib/postgresql/data', health: 'pg_isready -U ${DB_USER} -d ${DB_NAME}' };
    if (/mongodb|mongo\b/i.test(text)) return { label: 'MongoDB', image: 'mongo:7', env: ['MONGO_INITDB_ROOT_USERNAME=${DB_USER}', 'MONGO_INITDB_ROOT_PASSWORD=${DB_PASSWORD}'], url: 'mongodb://${DB_USER}:${DB_PASSWORD}@database:27017/${DB_NAME}?authSource=admin', volume: '/data/db', health: 'mongosh --quiet --eval "db.adminCommand(\'ping\')"' };
    if (/mysql/i.test(text)) return { label: 'MySQL', image: 'mysql:8', env: ['MYSQL_DATABASE=${DB_NAME}', 'MYSQL_USER=${DB_USER}', 'MYSQL_PASSWORD=${DB_PASSWORD}', 'MYSQL_ROOT_PASSWORD=${DB_ROOT_PASSWORD}'], url: 'mysql://${DB_USER}:${DB_PASSWORD}@database:3306/${DB_NAME}', volume: '/var/lib/mysql', health: 'mysqladmin ping -h localhost -u root -p${DB_ROOT_PASSWORD}' };
    return null;
  }

  _backendDockerfile(stack) {
    const nest = /nestjs/i.test(stack || '');
    return nest
      ? 'FROM node:22-alpine AS build\nWORKDIR /app\nCOPY backend/package*.json ./\nRUN npm install\nCOPY backend/ ./\nRUN npm run build\n\nFROM node:22-alpine\nWORKDIR /app\nENV NODE_ENV=production\nCOPY backend/package*.json ./\nRUN npm install --omit=dev\nCOPY --from=build /app/dist ./dist\nEXPOSE 3000\nCMD ["npm","start"]\n'
      : 'FROM node:22-alpine\nWORKDIR /app\nENV NODE_ENV=production\nCOPY backend/package*.json ./\nRUN npm install --omit=dev\nCOPY backend/ ./\nEXPOSE 3000\nCMD ["npm","start"]\n';
  }

  _frontendDockerfile() {
    return 'FROM node:22-alpine AS build\nWORKDIR /app\nCOPY frontend/package*.json ./\nRUN npm install\nCOPY frontend/ ./\nRUN npm run build\n\nFROM nginx:1.27-alpine\nCOPY ops/docker/nginx.conf /etc/nginx/conf.d/default.conf\nCOPY --from=build /app/dist /usr/share/nginx/html\nEXPOSE 80\n';
  }

  _nginxConfig(highAvailability) {
    const upstream = highAvailability ? 'upstream api { least_conn; server backend:3000; }\n' : 'upstream api { server backend:3000; }\n';
    return `${upstream}server { listen 80; root /usr/share/nginx/html; index index.html; location / { try_files $uri /index.html; } location /api/ { proxy_pass http://api; proxy_http_version 1.1; proxy_set_header Upgrade $http_upgrade; proxy_set_header Connection "upgrade"; proxy_set_header Host $host; } location /socket.io/ { proxy_pass http://api; proxy_http_version 1.1; proxy_set_header Upgrade $http_upgrade; proxy_set_header Connection "upgrade"; proxy_set_header Host $host; } }\n`;
  }

  _compose(database, highAvailability) {
    const db = database ? `\n  database:\n    image: ${database.image}\n    restart: unless-stopped\n    environment:\n${database.env.map((item) => `      - ${item}`).join('\n')}\n    volumes:\n      - database-data:${database.volume}\n    healthcheck:\n      test: ["CMD-SHELL", "${database.health}"]\n      interval: 10s\n      timeout: 5s\n      retries: 5\n` : '';
    const depends = database ? '\n    depends_on:\n      database:\n        condition: service_healthy' : '';
    const dbEnv = database ? `\n      DATABASE_URL: "${database.url}"` : '';
    return `services:\n  backend:\n    build:\n      context: ..\n      dockerfile: ops/docker/backend.Dockerfile\n    restart: unless-stopped\n    ports:\n      - "\${API_PORT:-3000}:3000"\n    environment:\n      PORT: 3000${dbEnv}\n      JWT_SECRET: \${JWT_SECRET}\n      ADMIN_EMAIL: \${ADMIN_EMAIL:-}\n      ADMIN_PASSWORD: \${ADMIN_PASSWORD:-}${depends}\n  frontend:\n    build:\n      context: ..\n      dockerfile: ops/docker/frontend.Dockerfile\n    restart: unless-stopped\n    ports:\n      - "\${WEB_PORT:-8080}:80"\n    depends_on:\n      - backend${db}\n${database ? 'volumes:\n  database-data:\n' : ''}# Alta disponibilidad solicitada: ${highAvailability ? 'sí; usa también docker-compose.ha.yml' : 'no'}\n`;
  }

  _env(database) {
    return `API_PORT=3000\nWEB_PORT=8080\nJWT_SECRET=replace-with-a-long-random-secret\nADMIN_EMAIL=admin@example.com\nADMIN_PASSWORD=replace-with-a-strong-password\n${database ? 'DB_NAME=app\nDB_USER=app\nDB_PASSWORD=replace-me\nDB_ROOT_PASSWORD=replace-me-root\n' : ''}`;
  }

  _haOverride() {
    return 'services:\n  backend:\n    deploy:\n      replicas: 2\n      update_config:\n        order: start-first\n      restart_policy:\n        condition: on-failure\n';
  }

  _readme(database, ha) {
    return `# Puesta en marcha\n\nInfraestructura derivada de artefactos aprobados. Base de datos: ${database?.label || 'externa/por definir'}. Alta disponibilidad: ${ha ? 'solicitada' : 'no solicitada'}.\n\n1. Copia \`.env.example\` a \`.env\`.\n2. Completa los secretos.\n3. Ejecuta \`docker compose up --build\`.\n${ha ? '4. Para el perfil HA, despliega también `docker-compose.ha.yml` en un orquestador compatible con réplicas.\n' : ''}`;
  }
}

module.exports = InfrastructureGenerator;
