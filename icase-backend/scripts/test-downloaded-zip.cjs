// Arranca exclusivamente el ZIP descargado; no reconstruye artefactos desde MongoDB.
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { promisify } = require('node:util');
const { execFile } = require('node:child_process');
const Sandbox = require('../src/infrastructure/services/SandboxRuntimeVerifier');
const Exported = require('../src/infrastructure/services/ExportedComposeVerifier');
const evidenceName = process.env.ZIP_EVIDENCE_NAME || 'zip-delivery';
if (!/^[a-z0-9-]+$/.test(evidenceName)) throw new Error('Nombre de evidencias inválido');
const evidenceRoot = path.resolve(__dirname, '../verification-results/' + evidenceName);
const root = path.resolve(process.argv[2] || '');
const report = { inicio: new Date().toISOString(), origen: 'ZIP descargado desde iCase y extraído sin cambios; no se reconstruye desde MongoDB', pruebas: [], estado: 'en_ejecucion' };
const execute = promisify(execFile);
async function save() { await fs.writeFile(path.join(evidenceRoot, 'arranque.json'), JSON.stringify(report, null, 2)); }
async function verifyHashes() {
  const manifest = JSON.parse(await fs.readFile(path.join(root, 'delivery-manifest.json'), 'utf8'));
  for (const file of manifest.archivos) {
    const target = path.resolve(root, file.ruta);
    if (!target.startsWith(root + path.sep)) throw new Error('Ruta insegura en manifiesto');
    const digest = crypto.createHash('sha256').update(await fs.readFile(target)).digest('hex');
    if (digest !== file.huella) throw new Error('Huella incorrecta: ' + file.ruta);
  }
  return manifest;
}
(async () => {
  try {
    if (!root.startsWith(evidenceRoot + path.sep + 'extracted-')) throw new Error('Usa un directorio extraído exclusivo de esta prueba.');
    const platform = await Promise.all((evidenceName === 'zip-current' ? ['http://localhost:18301/auth/config'] : ['http://localhost:5000/auth/config', 'http://localhost:18080/']).map(async url => {
      try { await fetch(url, { signal: AbortSignal.timeout(1500) }); return true; } catch { return false; }
    }));
    report.plataformaDetenida = platform.every(available => !available);
    const manifest = await verifyHashes();
    report.archivosVerificados = manifest.archivos.length;
    report.alcance = manifest.alcance;
    report.pruebas.push({ paso: 'Integridad SHA-256 del ZIP frente al manifiesto', resultado: 'correcto' }); await save();
    const run = async (file, args, options) => {
      console.log('[Docker] ' + args.slice(-1)[0]);
      const result = await execute(file, args, options);
      console.log('[OK] ' + args.slice(-1)[0]); return result;
    };
    // Solo se añaden auxiliares de prueba; se preservan los Dockerfiles y fuentes del ZIP.
    await new Sandbox({ run })._helpers(root, 'paquete_entrega');
    await verifyHashes();
    const result = await new Exported({ run }).verificar(root, 'icasevzip' + crypto.randomBytes(6).toString('hex'));
    report.pruebas.push(...result.pruebas); report.protocolo = result.protocolo_despliegue;
    await verifyHashes(); report.estado = 'apta';
  } catch (error) {
    report.estado = 'fallida'; report.error = String(error.message).slice(-4000);
    report.pruebas.push(...(error.pruebas_despliegue || [])); process.exitCode = 1;
  } finally { report.fin = new Date().toISOString(); await save(); console.log(JSON.stringify({ estado: report.estado, archivos: report.archivosVerificados, pruebas: report.pruebas.map(p => ({ paso: p.paso, resultado: p.resultado })), error: report.error })); }
})();
