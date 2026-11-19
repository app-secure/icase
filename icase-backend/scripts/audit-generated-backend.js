// Audita exclusivamente dependencias del backend generado, sin instalar nada en I-CASE.
// node scripts/audit-generated-backend.js [NestJS|Express] [--nest-version=^10.4.0]
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const Generator = require('../src/infrastructure/services/GenericBackendGenerator');
const run = promisify(execFile);

async function main() {
  const backend = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : 'NestJS';
  const candidate = process.argv.find((arg) => arg.startsWith('--nest-version='))?.split('=')[1];
  if (candidate && !/^[~^]?\d+\.\d+\.\d+$/.test(candidate)) throw new Error('Versión candidata inválida.');
  const files = new Generator().generate({ proyecto: { nombre: 'Auditoría de dependencias' }, requirements: [], stack: { backend, base_datos: 'PostgreSQL' }, access: { autenticacion: { metodo: 'jwt' }, roles: [], permisos: [] } });
  const pkg = JSON.parse(files.find((file) => file.ruta === 'backend/package.json')?.contenido || 'null');
  if (!pkg) throw new Error('La auditoría npm solo corresponde a backends Node.');
  if (candidate && !pkg.dependencies['@nestjs/core']) throw new Error('La candidata de NestJS no se aplica a otros frameworks.');
  if (candidate) for (const key of ['@nestjs/common', '@nestjs/core', '@nestjs/platform-express']) pkg.dependencies[key] = candidate;
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'icase-audit-'));
  try {
    await fs.writeFile(path.join(root, 'package.json'), JSON.stringify(pkg, null, 2));
    let output;
    try {
      output = await run('docker', ['run', '--rm', '--mount', `type=bind,source=${root},target=/audit`, '--workdir', '/audit', 'node:22-alpine', 'sh', '-c', 'npm install --package-lock-only --ignore-scripts --no-audit --no-fund --silent && npm audit --json'], { timeout: 240000, maxBuffer: 2 * 1024 * 1024 });
    } catch (error) {
      if (!error.stdout?.includes('"auditReportVersion"')) throw error;
      output = error;
    }
    const report = JSON.parse(output.stdout.slice(output.stdout.indexOf('{')));
    const evidence = { backend, candidato: candidate || null, fecha_utc: new Date().toISOString(), paquete: pkg, auditoria: report };
    const directory = path.resolve(__dirname, '../verification-results/audit');
    await fs.mkdir(directory, { recursive: true });
    const target = path.join(directory, `${backend.replace(/[^a-z0-9]/gi, '_')}-${Date.now()}.json`);
    await fs.writeFile(target, JSON.stringify(evidence, null, 2));
    await fs.copyFile(path.join(root, 'package-lock.json'), target.replace(/\.json$/, '.lock.json'));
    console.log(JSON.stringify({ backend, candidato: candidate || null, resumen: report.metadata?.vulnerabilities, hallazgos: Object.values(report.vulnerabilities || {}).map((v) => ({ paquete: v.name, severidad: v.severity, directo: v.isDirect, rango: v.range, via: v.via, solucion: v.fixAvailable })), informe: target }, null, 2));
    if (report.error || report.metadata?.vulnerabilities?.high || report.metadata?.vulnerabilities?.critical) process.exitCode = 1;
  } finally {
    const resolved = path.resolve(root);
    if (path.dirname(resolved) !== path.resolve(os.tmpdir()) || !path.basename(resolved).startsWith('icase-audit-')) throw new Error('Directorio temporal no seguro.');
    await fs.rm(resolved, { recursive: true, force: true });
  }
}
main().catch((error) => { console.error(error.message); process.exitCode = 1; });
