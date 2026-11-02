// Comprobar interpolación de las instrucciones, sin levantar servicios ni registrar secretos.
const fs = require('node:fs/promises');
const path = require('node:path');
const { promisify } = require('node:util');
const { execFile } = require('node:child_process');
const evidenceName = process.env.ZIP_EVIDENCE_NAME || 'zip-delivery';
if (!/^[a-z0-9-]+$/.test(evidenceName)) throw new Error('Nombre de evidencias inválido');
const base = path.resolve(__dirname, '../verification-results/' + evidenceName);
const root = path.resolve(process.argv[2] || '');
(async () => {
  if (!root.startsWith(base + path.sep + 'extracted-')) throw new Error('Destino fuera de la prueba');
  const content = await fs.readFile(path.join(root, 'verify.exported.env'), 'utf8');
  const expected = Object.fromEntries(content.trim().split('\n').map(line => { const i = line.indexOf('='); return [line.slice(0, i), line.slice(i + 1)]; }));
  await fs.writeFile(path.join(root, 'ops/.env'), content, { flag: 'wx', mode: 0o600 });
  const env = { ...process.env }; for (const key of Object.keys(expected)) delete env[key];
  const results = [];
  for (const [label, cwd, args] of [
    ['DELIVERY.md: comando desde la raíz', root, ['-f', 'ops/docker-compose.yml']],
    ['ops/README.md: comando desde ops', path.join(root, 'ops'), []],
    ['Comando explícito con --env-file', root, ['--env-file', 'ops/.env', '-f', 'ops/docker-compose.yml']]
  ]) {
    try {
      const { stdout } = await promisify(execFile)('docker', ['compose', ...args, 'config', '--format', 'json'], { cwd, env, timeout: 30000, maxBuffer: 1024000 });
      const config = JSON.parse(stdout); const actual = config.services.backend.environment;
      results.push({ instruccion: label, configuracionValida: true, secretosDePruebaCargados: actual.JWT_SECRET === expected.JWT_SECRET && actual.DB_NAME === expected.DB_NAME });
    } catch { results.push({ instruccion: label, configuracionValida: false, secretosDePruebaCargados: false }); }
  }
  await fs.writeFile(path.join(base, 'instrucciones.json'), JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results));
})().catch(error => { console.error(error.message); process.exitCode = 1; });
