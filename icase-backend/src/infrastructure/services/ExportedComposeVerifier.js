const fs = require('node:fs/promises');
const path = require('node:path');
const { randomBytes, randomUUID } = require('node:crypto');
const DependencyAudit = require('../../core/constants/DependencyAudit');

/** Ejecuta los Dockerfiles, comandos y configuración del paquete; solo aísla red, puertos y secretos. */
class ExportedComposeVerifier {
  constructor({ run }) { this.run = run; }

  validate(config, root, project) {
    const within = (target) => {
      const resolved = path.resolve(target);
      return resolved === root || resolved.startsWith(root + path.sep);
    };
    for (const [name, service] of Object.entries(config.services || {})) {
      if (!['backend', 'frontend', 'database', 'smoke', 'tests', 'mailpit','redis','backend_peer','provider'].includes(name)) throw new Error('Servicio no permitido en verificación de entrega: ' + name);
      if(name==='redis'&&(service.image!=='redis:7.4-alpine'||service.build||service.volumes?.length))throw new Error('Redis de prueba no permitido');
      if(name==='backend_peer'&&service.image!==project+'-backend')throw new Error('Réplica de prueba no permitida');
      if(name==='provider'&&(!service.build||path.basename(service.build.dockerfile)!=='provider.verify.Dockerfile'||service.volumes?.length))throw new Error('Proveedor de prueba no permitido');
      if(name==='mailpit'&&(service.image!=='axllent/mailpit:v1.27'||service.build||service.volumes?.length)) throw new Error('Servicio de correo de prueba no permitido');
      if (service.privileged || service.network_mode || service.pid || service.ipc || service.userns_mode || service.cap_add?.length || service.container_name || service.devices?.length || service.ports?.length || service.volumes_from?.length) throw new Error('La entrega solicita acceso no aislado: ' + name);
      if (service.build && (!within(service.build.context) || !within(path.resolve(service.build.context, service.build.dockerfile || 'Dockerfile')) || service.build.network === 'host' || service.build.ssh?.length || service.build.entitlements?.length)) throw new Error('Build fuera del directorio temporal o con permisos ampliados.');
      if (service.build && (service.build.tags?.length || service.image && !service.image.startsWith(project + '-'))) throw new Error('El build no puede sobrescribir imágenes ajenas al proyecto temporal.');
      for (const volume of service.volumes || []) {
        if (volume.type === 'bind' && !within(volume.source)) throw new Error('Montaje fuera del directorio temporal.');
        if (volume.type === 'volume' && volume.source && !config.volumes?.[volume.source]) throw new Error('Volumen no declarado en el proyecto temporal.');
        if (!['bind', 'volume', 'tmpfs'].includes(volume.type)) throw new Error('Montaje no permitido.');
      }
      if (service.secrets?.length || service.configs?.length) throw new Error('No se permiten secretos/configs externos en la prueba.');
    }
    for (const volume of Object.values(config.volumes || {})) {
      if (volume.external || volume.driver_opts || volume.driver && volume.driver !== 'local' || !volume.name?.startsWith(project + '_')) throw new Error('Volumen no exclusivo del proyecto temporal.');
    }
    for (const network of Object.values(config.networks || {})) {
      if (network.external || !network.internal || !network.name?.startsWith(project + '_')) throw new Error('Red de entrega no aislada.');
    }
    if (!config.services?.backend || !config.services?.frontend || !config.services?.database) throw new Error('El paquete no declara backend, frontend y base de datos verificables.');
  }

  async verificar(root, project) {
    if (!/^icasev[a-z0-9]+$/.test(project)) throw new Error('Identificador temporal inválido.');
    project += 'delivery';
    const nodeBackend = await fs.access(path.join(root, 'backend/package.json')).then(() => true, () => false);
    if (nodeBackend) {
      const dockerfile = await fs.readFile(path.join(root, 'ops/docker/backend.Dockerfile'), 'utf8');
      if (!dockerfile.split(/\r?\n/).some((line) => line.trim() === DependencyAudit.dockerRun)) throw new Error('Regenera la infraestructura: el Dockerfile Node exportado no contiene la auditoría obligatoria de dependencias.');
    }
    const checks = [];
    const secret = randomBytes(32).toString('hex');
    const password = randomBytes(20).toString('hex');
    const env = `DB_NAME=icase_test\nDB_USER=icase_test\nDB_PASSWORD=${password}\nDB_ROOT_PASSWORD=${password}\nJWT_SECRET=${secret}\nADMIN_EMAIL=admin@example.test\nADMIN_PASSWORD=test-admin-password\nCORS_ORIGINS=http://frontend\nHTTP_RATE_MAX=3000\nAUTH_RATE_MAX=300\n`;
    let overlay = `services:
  backend:
    ports: !reset []
  frontend:
    ports: !reset []
  database:
    ports: !reset []
  smoke:
    build: { context: .., dockerfile: smoke.verify.Dockerfile }
    environment: { BASE_API_URL: "http://backend:3000", ADMIN_EMAIL: "admin@example.test", ADMIN_PASSWORD: "test-admin-password" }
    command: ["node", "/app/smoke.mjs"]
  tests:
    build: { context: .., dockerfile: tests.verify.Dockerfile }
    environment: { BASE_API_URL: "http://backend:3000", BASE_WEB_URL: "http://frontend", ADMIN_EMAIL: "admin@example.test", ADMIN_PASSWORD: "test-admin-password" }
networks:
  default:
    internal: true
`;
    let backendManifest={};try{backendManifest=JSON.parse(await fs.readFile(path.join(root,'backend/icase.manifest.json'),'utf8'));}catch(error){if(error.code!=='ENOENT')throw error;}
    if(backendManifest.extensions?.enabled?.includes('recuperacion_cuentas')) {
      overlay=overlay.replace('  backend:\n','  backend:\n    environment:\n      NODE_ENV: test\n      SMTP_HOST: mailpit\n      SMTP_PORT: 1025\n      SMTP_FROM: no-reply@example.test\n      SMTP_ALLOW_INSECURE: "true"\n      RESET_PUBLIC_URL: http://frontend\n    depends_on:\n      mailpit: {condition: service_started}\n')
        .replace('BASE_WEB_URL: "http://frontend",','TEST_SMTP_URL: "http://mailpit:8025", BASE_WEB_URL: "http://frontend",')
        .replace('networks:\n','  mailpit:\n    image: axllent/mailpit:v1.27\n    mem_limit: 128m\n    cap_drop: [ALL]\n    security_opt: ["no-new-privileges:true"]\nnetworks:\n');
    }
    const profiles=require('./VerificationComposeProfiles');
    const integrations=await require('./IntegrationVerificationProfile').profile(root,backendManifest,'http://frontend',project,true);
    if(integrations){
      overlay=profiles.exportedEnvironment(overlay,integrations.environment).replace('networks:\n',integrations.service+'networks:\n');
      overlay=overlay.replace('BASE_WEB_URL: "http://frontend",','TEST_PROVIDER_URL: "http://provider:8090", BASE_WEB_URL: "http://frontend",');
      if(!overlay.slice(overlay.indexOf('  backend:'),overlay.indexOf('  frontend:')).includes('    depends_on:'))overlay=overlay.replace('  backend:\n','  backend:\n    depends_on:\n      provider: {condition: service_started}\n');else overlay=overlay.replace('    depends_on:\n','    depends_on:\n      provider: {condition: service_started}\n');
    }
    if(backendManifest.eventos_cambios?.replicas){
      overlay=overlay.replace('networks:\n',`  backend_peer:\n    extends: {file: docker-compose.yml, service: backend}\n    ports: !reset []\n    image: ${project}-backend\nnetworks:\n`).replaceAll('BASE_API_URL: "http://backend:3000"','TEST_REDIS_URL: "redis://redis:6379", BASE_API_URL: "http://backend_peer:3000"');
    }
    await fs.writeFile(path.join(root, 'verify.exported.env'), env+(backendManifest.eventos_cambios?.replicas?'\nEVENTS_NAMESPACE='+project+'\n':''), { mode: 0o600 });
    await fs.writeFile(path.join(root, 'verify.exported.yml'), overlay);
    const compose = ['compose', '-p', project, '--env-file', 'verify.exported.env', '-f', 'ops/docker-compose.yml', '-f', 'verify.exported.yml'];
    const redact = (value) => String(value || '').split(secret).join('[secreto temporal]').split(password).join('[clave temporal]');
    const execute = async (args, label, timeout = 240000, quiet = false) => {
      const result = await this.run('docker', [...compose, ...args], { cwd: root, timeout, maxBuffer: 2 * 1024 * 1024 });
      checks.push({ paso: label, resultado: 'correcto', salida: quiet ? 'Configuración resuelta y validada, sin registrar credenciales.' : redact(`${result.stdout || ''}${result.stderr || ''}`).slice(-2000) });
      return result;
    };
    let safe = false;
    try {
      const resolved = await execute(['config', '--format', 'json'], 'Aislamiento del Compose exportado', 60000, true);
      this.validate(JSON.parse(resolved.stdout), root, project);
      safe = true;
      await execute(['build', ...(nodeBackend ? ['--build-arg', 'ICASE_AUDIT_NONCE=' + randomUUID()] : []), 'backend', 'frontend', 'smoke', 'tests',...(integrations?['provider']:[])], 'Compilación de los Dockerfiles exportados', 900000);
      await execute(['up', '-d', '--wait', 'database', 'backend',...(backendManifest.eventos_cambios?.replicas?['backend_peer']:[]), 'frontend'], 'Arranque del Compose exportado', 240000);
      const targets = ['http://backend:3000/health', ...(backendManifest.eventos_cambios?.replicas ? ['http://backend_peer:3000/health'] : []), 'http://frontend'];
      const probe = `const targets=${JSON.stringify(targets)};let last='';for(let i=0;i<90;i++){try{for(const url of targets){const response=await fetch(url,{signal:AbortSignal.timeout(2000)});if(!response.ok||(url.endsWith('/health')&&(await response.json()).status!=='ok'))throw new Error('Servicio no listo: '+url)}console.log('Backend, réplicas y frontend exportados listos');process.exit(0)}catch(e){last=e.message}await new Promise(r=>setTimeout(r,1000))}throw new Error('La entrega no está lista: '+last)`;
      await execute(['run', '--rm', '--no-deps', 'smoke', 'node', '--input-type=module', '-e', probe], 'Disponibilidad HTTP de la entrega', 150000);
      await execute(['run', '--rm', '--no-deps', 'smoke'], 'CRUD, permisos y N:M sobre el despliegue exportado');
      await execute(['run', '--rm', '--no-deps', 'tests'], 'Integración y navegador sobre el despliegue exportado');
      return { protocolo_despliegue: 'compose-exportado-v1', pruebas: checks };
    } catch (error) {
      if (safe) {
        try {
          const logs = await this.run('docker', [...compose, 'logs', '--no-color', '--tail', '40', 'backend', ...(backendManifest.eventos_cambios?.replicas ? ['backend_peer','redis'] : []), 'database'], { cwd: root, timeout: 30000, maxBuffer: 512000 });
          checks.push({ paso: 'Diagnóstico del despliegue exportado', resultado: 'informacion', salida: redact(logs.stdout).slice(-3000) });
        } catch { /* No ocultar la causa original. */ }
      }
      error.stdout = redact(error.stdout); error.stderr = redact(error.stderr); error.message = redact(error.message);
      error.pruebas_despliegue = checks;
      throw error;
    } finally {
      // Solo tras resolver y validar nombres, volúmenes y montajes de este proyecto exclusivo.
      if (safe) {
        try { await this.run('docker', [...compose, 'down', '-v', '--rmi', 'local', '--remove-orphans'], { cwd: root, timeout: 120000, maxBuffer: 512000 }); }
        catch { checks.push({ paso: 'Limpieza de la entrega', resultado: 'advertencia', salida: 'No se pudo confirmar la limpieza del proyecto ' + project }); }
      }
    }
  }
}

module.exports = ExportedComposeVerifier;
