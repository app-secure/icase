#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const compose = path.join(root, 'ops/docker-compose.yml');
const example = path.join(root, 'ops/.env.example');
const env = path.join(root, 'ops/.env');
const action = process.argv[2] || 'start';

if (!['start', 'stop'].includes(action)) {
  console.error('Uso: node tools/preview-local.cjs [start|stop]');
  process.exit(2);
}
if (!fs.existsSync(compose) || !fs.existsSync(example)) {
  console.error('Faltan ops/docker-compose.yml u ops/.env.example en este paquete.');
  process.exit(1);
}

let created = false;
if (action === 'start' && !fs.existsSync(env)) {
  const password = crypto.randomBytes(18).toString('base64url');
  const replacements = {
    JWT_SECRET: crypto.randomBytes(48).toString('hex'),
    ADMIN_PASSWORD: password,
    DB_PASSWORD: crypto.randomBytes(24).toString('base64url'),
    DB_ROOT_PASSWORD: crypto.randomBytes(24).toString('base64url')
  };
  const content = fs.readFileSync(example, 'utf8').replace(/^([A-Z_]+)=(.*)$/gm, (line, key) =>
    Object.hasOwn(replacements, key) ? `${key}=${replacements[key]}` : line);
  fs.writeFileSync(env, content, { flag: 'wx', mode: 0o600 });
  created = true;
}
if (action === 'stop' && !fs.existsSync(env)) {
  console.error('No existe ops/.env; esta vista previa no se ha iniciado.');
  process.exit(1);
}

const args = ['compose', '--env-file', env, '-f', compose,
  ...(action === 'start' ? ['up', '-d', '--build', '--wait'] : ['down', '--remove-orphans'])];
const result = spawnSync('docker', args, { cwd: root, stdio: 'inherit', timeout: 900000 });
if (result.error || result.status !== 0) {
  console.error(result.error?.message || `Docker terminó con código ${result.status}.`);
  process.exit(1);
}
if (action === 'stop') {
  console.log('Vista previa detenida. Los datos se conservaron.');
} else {
  const settings = Object.fromEntries(fs.readFileSync(env, 'utf8').split(/\r?\n/).map((line) => line.match(/^([A-Z_]+)=(.*)$/)).filter(Boolean).map((match) => [match[1], match[2]]));
  const web = fs.existsSync(path.join(root, 'frontend/package.json'));
  console.log(`Vista previa disponible en http://localhost:${web ? settings.WEB_PORT || '8080' : settings.API_PORT || '3000'}`);
  if (created) console.log(`Administrador local: ${settings.ADMIN_EMAIL || 'admin@example.com'} / ${settings.ADMIN_PASSWORD}`);
  console.log('Para detenerla: node tools/preview-local.cjs stop');
}
