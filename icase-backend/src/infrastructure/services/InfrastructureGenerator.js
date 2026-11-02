const crypto = require('crypto');
const IGeneradorArtefacto = require('../../core/services/IGeneradorArtefacto');
const StackCatalog = require('../../core/services/StackCatalog');
const fs = require('node:fs');
const path = require('node:path');
const DependencyAudit = require('../../core/constants/DependencyAudit');

class InfrastructureGenerator extends IGeneradorArtefacto {
  async generar({ proyecto, insumos, versionesOrigen }) {
    const { decisiones, requerimientos, diagramas, backend, frontend } = insumos;
    const stack = decisiones.stack_tecnologico || {};
    const evidence = this._evidence(requerimientos, diagramas);
    const database = this._database(stack.base_datos, evidence);
    let backendManifest = {};
    try { backendManifest = JSON.parse(backend.archivos?.find((f) => f.ruta === 'backend/icase.manifest.json')?.contenido || '{}'); } catch { throw new Error('El manifiesto backend no es JSON válido.'); }
    if (database?.label === 'MongoDB' && (backendManifest.associations || []).length) {
      database.transactions = true;
      database.url += '&replicaSet=rs0';
      database.health = 'mongosh --quiet --file /opt/icase/mongo-health.js';
    }
    const highAvailability = /alta disponibilidad|high availability|failover|balanceador|load balanc|r[eé]plica/i.test(evidence);
    const files = [
      ...(database?.transactions ? ['mongo-start.sh', 'mongo-health.js'].map((name) => ({ ruta: 'ops/docker/' + name, lenguaje: name.endsWith('.sh') ? 'shell' : 'javascript', contenido: fs.readFileSync(path.join(__dirname, '../templates/data-layer', name), 'utf8').replace(/\r\n/g, '\n') })) : []),
      { ruta: 'ops/docker/backend.Dockerfile', lenguaje: 'dockerfile', contenido: this._backendDockerfile(stack.backend) },
      { ruta: 'ops/docker/frontend.Dockerfile', lenguaje: 'dockerfile', contenido: this._frontendDockerfile() },
      { ruta: 'ops/docker/nginx.conf', lenguaje: 'nginx', contenido: this._nginxConfig(highAvailability) },
      { ruta: 'ops/docker-compose.yml', lenguaje: 'yaml', contenido: this._compose(database, highAvailability) },
      { ruta: 'ops/.env.example', lenguaje: 'dotenv', contenido: this._env(database) },
      { ruta: 'ops/deployment-manifest.json', lenguaje: 'json', contenido: JSON.stringify({ proyecto: proyecto.nombre, backend: backend.version, frontend: frontend.version, base_datos: database?.label || null, alta_disponibilidad: highAvailability, evidencia_arquitectura: diagramas.map((item) => ({ tipo: item.tipo, version: item.version })) }, null, 2) },
      { ruta: 'ops/README.md', lenguaje: 'markdown', contenido: this._readme(database, highAvailability) }
    ];
    if (highAvailability) files.push({ ruta: 'ops/docker-compose.ha.yml', lenguaje: 'yaml', contenido: this._haOverride() });
    const privateModules=[...(backendManifest.extensions?.enabled||[]),...(backendManifest.integraciones?.enabled||[])];
    if(backend.archivos?.some(file=>file.ruta==='backend/tools/check-integrations.cjs')){
      const dockerfile=files.find(file=>file.ruta==='ops/docker/backend.Dockerfile');
      dockerfile.contenido=dockerfile.contenido.replace('COPY --from=build /app/dist ./dist','COPY --from=build /app/dist ./dist\nCOPY backend/tools/ ./tools/');
    }
    if(privateModules.some(id=>['archivos_imagenes','recuperacion_cuentas','pagos_prueba','sso_oidc'].includes(id))) {
      if(highAvailability) throw new Error('Archivos locales y recuperación de un solo proceso no admiten el perfil HA; requiere almacenamiento compartido y revisión.');
      const compose=files.find(file=>file.ruta==='ops/docker-compose.yml');
      compose.contenido=compose.contenido.replace('      PORT: 3000','      APP_DATA_DIR: /app/app-data\n      SMTP_HOST: ${SMTP_HOST:-}\n      SMTP_PORT: ${SMTP_PORT:-587}\n      SMTP_FROM: ${SMTP_FROM:-}\n      SMTP_USER: ${SMTP_USER:-}\n      SMTP_PASSWORD: ${SMTP_PASSWORD:-}\n      SMTP_SECURE: ${SMTP_SECURE:-false}\n      SMTP_ALLOW_INSECURE: ${SMTP_ALLOW_INSECURE:-false}\n      RESET_PUBLIC_URL: ${RESET_PUBLIC_URL:-}\n      PORT: 3000')
        .replace('  frontend:\n','    volumes:\n      - app-data:/app/app-data\n  frontend:\n');
      if(compose.contenido.includes('\nvolumes:\n'))compose.contenido=compose.contenido.replace('\nvolumes:\n','\nvolumes:\n  app-data:\n');else compose.contenido+='\nvolumes:\n  app-data:\n';
      files.find(file=>file.ruta==='ops/.env.example').contenido+='\n# SMTP y recuperación: completar antes de habilitar el envío.\nSMTP_HOST=\nSMTP_PORT=587\nSMTP_FROM=\nSMTP_USER=\nSMTP_PASSWORD=\nSMTP_SECURE=false\nSMTP_ALLOW_INSECURE=false\nRESET_PUBLIC_URL=https://your-app.example/\n';
      if(backendManifest.extensions?.enabled?.includes('recuperacion_cuentas'))files.push({ruta:'ops/docker-compose.test-mail.yml',lenguaje:'yaml',contenido:'services:\n  backend:\n    environment:\n      NODE_ENV: test\n      SMTP_HOST: mailpit\n      SMTP_PORT: 1025\n      SMTP_FROM: no-reply@example.test\n      SMTP_ALLOW_INSECURE: "true"\n      RESET_PUBLIC_URL: http://localhost:8080/\n    depends_on:\n      mailpit: {condition: service_started}\n  mailpit:\n    image: axllent/mailpit:v1.27\n    ports: ["127.0.0.1:8025:8025"]\n    mem_limit: 128m\n# Solo pruebas: nunca usar este override en producción.\n'});
    }
    if(backendManifest.integraciones?.enabled?.length){
      const names=['STRIPE_SECRET_KEY','STRIPE_WEBHOOK_SECRET','PAYMENT_NAMESPACE','PAYMENT_RETURN_URL','PAYMENT_BINDINGS','OIDC_ISSUER','OIDC_CLIENT_ID','OIDC_CLIENT_SECRET','OIDC_REDIRECT_URI','OIDC_APP_URL','OIDC_SUBJECTS','MAP_FIELDS','MAP_TILE_URL','MAP_ATTRIBUTION'];
      files.find(file=>file.ruta==='ops/docker-compose.yml').contenido=files.find(file=>file.ruta==='ops/docker-compose.yml').contenido.replace('      PORT: 3000',names.map(name=>'      '+name+': "${'+name+':-}"').join('\n')+'\n      PORT: 3000');
      files.find(file=>file.ruta==='ops/.env.example').contenido+='\n# Completar solo las integraciones aprobadas. Nunca usar claves live.\n'+names.map(name=>name+'=').join('\n')+'\n';
    }
    if(new (require('../../core/services/ModuleService'))().activos(decisiones.modulos).includes('eventos_replicas')) {
      if(privateModules.some(id=>['archivos_imagenes','recuperacion_cuentas','pagos_prueba','sso_oidc'].includes(id)))throw new Error('Las réplicas requieren sustituir el estado local de archivos/recuperación/pagos/SSO por persistencia compartida; combinación no soportada.');
      const compose=files.find(file=>file.ruta==='ops/docker-compose.yml');
      compose.contenido=compose.contenido.replace('      PORT: 3000','      EVENTS_REDIS_URL: ${EVENTS_REDIS_URL:-redis://redis:6379}\n      EVENTS_NAMESPACE: ${EVENTS_NAMESPACE:?Define un namespace único por aplicación y entorno}\n      PORT: 3000');
      compose.contenido=compose.contenido.replace('  frontend:\n','  redis:\n    image: redis:7.4-alpine\n    restart: unless-stopped\n    healthcheck: {test: ["CMD", "redis-cli", "ping"], interval: 2s, timeout: 2s, retries: 30}\n  frontend:\n');
      const namespace='icase-'+crypto.createHash('sha256').update(String(proyecto.id||proyecto._id||proyecto.nombre)).digest('hex').slice(0,24)+'-development';
      files.find(file=>file.ruta==='ops/.env.example').contenido+='\n# Cambiar por entorno; no reutilizar en Redis compartido. Redis no publica puertos.\nEVENTS_NAMESPACE='+namespace+'\n';
      compose.contenido=compose.contenido.replace('    depends_on:\n','    depends_on:\n      redis:\n        condition: service_healthy\n');
      const nginx=files.find(file=>file.ruta==='ops/docker/nginx.conf');nginx.contenido=nginx.contenido.replace(/upstream api \{[^}]+\}/,'resolver 127.0.0.11 valid=5s; upstream api { zone api 64k; least_conn; server backend:3000 resolve; }');
      files.push({ruta:'ops/docker-compose.events-replicas.yml',lenguaje:'yaml',contenido:'services:\n  backend:\n    ports: !reset []\n    deploy: {replicas: 2}\n    depends_on:\n      redis: {condition: service_healthy}\n# Usar la API a través del frontend; transporte WebSocket sin polling.\n'});
    }
    const warnings = [];
    if(backendManifest.integraciones?.enabled?.length)warnings.push('Completa las credenciales y campos de las integraciones aprobadas. Un proveedor local simulado no acredita cuentas Stripe/SSO reales, TLS ni hardware de producción.');
    if(backendManifest.eventos_cambios?.replicas)warnings.push('Redis Pub/Sub coordina invalidaciones sin replay ni SLA. Aísla namespaces, configura seguridad de Redis y no combines estado local con varias réplicas.');
    if (!diagramas.some((item) => item.tipo === 'arquitectura_sistema')) warnings.push('No existe un diagrama de arquitectura del sistema aprobado y vigente; revisa manualmente el despliegue propuesto.');
    if (!database) warnings.push('No se identificó una base de datos aprobada; el compose no creará un servicio de persistencia.');
    if (database?.transactions) warnings.push('MongoDB N:M usa un replica set autenticado de un solo nodo para transacciones. No proporciona alta disponibilidad; valida el arranque y configura usuarios de mínimo privilegio antes de producción.');
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
    if (/mysql/i.test(text)) return { label: 'MySQL', image: 'mysql:8', env: ['MYSQL_DATABASE=${DB_NAME}', 'MYSQL_USER=${DB_USER}', 'MYSQL_PASSWORD=${DB_PASSWORD}', 'MYSQL_ROOT_PASSWORD=${DB_ROOT_PASSWORD}'], url: 'mysql://${DB_USER}:${DB_PASSWORD}@database:3306/${DB_NAME}', volume: '/var/lib/mysql', health: 'mysqladmin ping -h 127.0.0.1 -u root -p${DB_ROOT_PASSWORD}' };
    return null;
  }

  _backendDockerfile(stack) {
    const resolved = StackCatalog.resolveBackend(stack);
    if (resolved.backend === 'spring') {
      return 'FROM maven:3.9-eclipse-temurin-21 AS build\nWORKDIR /build\nCOPY backend/pom.xml ./\nRUN mvn -B -q -DskipTests dependency:go-offline\nCOPY backend/src ./src\nRUN mvn -B -q -DskipTests package\n\nFROM eclipse-temurin:21-jre-alpine\nWORKDIR /app\nENV APP_ENV=production\nENV JAVA_TOOL_OPTIONS="-XX:MaxRAMPercentage=70"\nRUN addgroup -S app && adduser -S app -G app\nCOPY --from=build /build/target/app.jar /app/app.jar\nUSER app\nEXPOSE 3000\nCMD ["java","-jar","/app/app.jar"]\n';
    }
    const dockerfile = resolved.backend === 'nest'
      ? 'FROM node:22-alpine AS build\nWORKDIR /app\nCOPY backend/package*.json ./\nRUN npm install\nCOPY backend/ ./\nRUN npm run build\n\nFROM node:22-alpine\nWORKDIR /app\nENV NODE_ENV=production\nCOPY backend/package*.json ./\nRUN npm install --omit=dev\nCOPY --from=build /app/dist ./dist\nEXPOSE 3000\nCMD ["npm","start"]\n'
      : 'FROM node:22-alpine\nWORKDIR /app\nENV NODE_ENV=production\nCOPY backend/package*.json ./\nRUN npm install --omit=dev\nCOPY backend/ ./\nEXPOSE 3000\nCMD ["npm","start"]\n';
    const audit = `ARG ICASE_AUDIT_NONCE=manual\n${DependencyAudit.dockerRun}\n`;
    return dockerfile.replace('RUN npm install\n', `RUN npm install\n${audit}`).replace('RUN npm install --omit=dev\n', `RUN npm install --omit=dev\n${audit}`);
  }

  _frontendDockerfile() {
    return 'FROM node:22-alpine AS build\nWORKDIR /app\nCOPY frontend/package*.json ./\nRUN npm install\nCOPY frontend/ ./\nRUN npm run build\n\nFROM nginx:1.27-alpine\nCOPY ops/docker/nginx.conf /etc/nginx/conf.d/default.conf\nCOPY --from=build /app/dist /usr/share/nginx/html\nEXPOSE 80\n';
  }

  _nginxConfig(highAvailability) {
    const upstream = highAvailability ? 'upstream api { least_conn; server backend:3000; }\n' : 'upstream api { server backend:3000; }\n';
    return `${upstream}server { listen 80; root /usr/share/nginx/html; index index.html; location / { try_files $uri /index.html; } location /api/ { proxy_pass http://api; proxy_http_version 1.1; proxy_set_header Upgrade $http_upgrade; proxy_set_header Connection "upgrade"; proxy_set_header Host $host; } location /socket.io/ { proxy_pass http://api; proxy_http_version 1.1; proxy_set_header Upgrade $http_upgrade; proxy_set_header Connection "upgrade"; proxy_set_header Host $host; proxy_read_timeout 75s; proxy_send_timeout 75s; proxy_buffering off; } }\n`;
  }

  _compose(database, highAvailability) {
    const mongo = database?.transactions;
    const db = database ? `\n  database:\n    image: ${database.image}\n    restart: unless-stopped\n${mongo ? '    entrypoint: ["/bin/sh", "/opt/icase/mongo-start.sh"]\n' : ''}    environment:\n${database.env.map((item) => `      - ${item}`).join('\n')}\n    volumes:\n      - database-data:${database.volume}\n${mongo ? '      - database-key:/data/icase-key\n      - ./docker/mongo-start.sh:/opt/icase/mongo-start.sh:ro\n      - ./docker/mongo-health.js:/opt/icase/mongo-health.js:ro\n' : ''}    healthcheck:\n      test: ["CMD-SHELL", "${database.health}"]\n      interval: 10s\n      timeout: 5s\n      retries: ${mongo ? 15 : 5}\n` : '';
    const depends = database ? '\n    depends_on:\n      database:\n        condition: service_healthy' : '';
    const dbEnv = (database ? `\n      DATABASE_URL: "${database.url}"` : '') + '\n      DB_NAME: "${DB_NAME:-app}"\n      CORS_ORIGINS: "${CORS_ORIGINS:-http://localhost:8080}"\n      HTTP_RATE_MAX: "${HTTP_RATE_MAX:-300}"\n      AUTH_RATE_MAX: "${AUTH_RATE_MAX:-20}"';
    return `services:\n  backend:\n    build:\n      context: ..\n      dockerfile: ops/docker/backend.Dockerfile\n    restart: unless-stopped\n    ports:\n      - "\${API_PORT:-3000}:3000"\n    environment:\n      PORT: 3000${dbEnv}\n      JWT_SECRET: \${JWT_SECRET}\n      ADMIN_EMAIL: \${ADMIN_EMAIL:-}\n      ADMIN_PASSWORD: \${ADMIN_PASSWORD:-}${depends}\n  frontend:\n    build:\n      context: ..\n      dockerfile: ops/docker/frontend.Dockerfile\n    restart: unless-stopped\n    ports:\n      - "\${WEB_PORT:-8080}:80"\n    depends_on:\n      - backend${db}\n${database ? 'volumes:\n  database-data:\n' : ''}${mongo ? '  database-key:\n' : ''}# Alta disponibilidad solicitada: ${highAvailability ? 'sí; usa también docker-compose.ha.yml' : 'no'}\n`;
  }

  _env(database) {
    return `API_PORT=3000\nWEB_PORT=8080\nJWT_SECRET=replace-with-a-long-random-secret\nADMIN_EMAIL=admin@example.com\nADMIN_PASSWORD=replace-with-a-strong-password\n${database ? 'DB_NAME=app\nDB_USER=app\nDB_PASSWORD=replace-me\nDB_ROOT_PASSWORD=replace-me-root\n' : ''}`;
  }

  _haOverride() {
    return 'services:\n  backend:\n    deploy:\n      replicas: 2\n      update_config:\n        order: start-first\n      restart_policy:\n        condition: on-failure\n';
  }

  _readme(database, ha) {
    return `# Puesta en marcha\n\nInfraestructura derivada de artefactos aprobados. Base de datos: ${database?.label || 'externa/por definir'}. Alta disponibilidad: ${ha ? 'solicitada' : 'no solicitada'}.\n\n1. Copia \`.env.example\` a \`.env\`.\n2. Completa los secretos.\n3. Ejecuta \`docker compose up --build\`.\n${ha ? '4. Para el perfil HA, despliega también `docker-compose.ha.yml` en un orquestador compatible con réplicas.\n' : ''}${database?.transactions ? '\n## MongoDB N:M\n\nSe inicializa un replica set autenticado de un nodo para transacciones; NO es alta disponibilidad. Espera a que database esté healthy. La clave interna se guarda en database-key y los datos en database-data. Conserva ambos volúmenes y sus backups. No uses down -v para actualizar. Antes de producción configura mínimo privilegio y valida el arranque y concurrencia con MongoDB real. Si usas un servicio externo, DATABASE_URL debe apuntar a un replica set o clúster transaccional.\n' : ''}`;
  }
}

module.exports = InfrastructureGenerator;
