const fs = require('node:fs/promises');
const path = require('node:path');

// Único directorio permitido: el mismo que utiliza Multer, nunca un valor de entorno.
const UPLOAD_ROOT = path.resolve(__dirname, '../../../uploads');
const activeUploads = new Set();
const managedName = /^\d{13}-\d+-[^/\\]+\.[a-z0-9]+$/i;

class UploadCleanupService {
  constructor({ repository, root = UPLOAD_ROOT, now = Date.now, retentionMs = 7 * 86400000, quarantineMs = 7 * 86400000, dryRun = true }) {
    this.repository = repository;
    this.root = path.resolve(root);
    this.now = now;
    this.retentionMs = retentionMs;
    this.quarantineMs = quarantineMs;
    this.dryRun = dryRun;
    this.running = false;
  }

  async references() {
    // Si Mongo falla, abortar sin tocar archivos. Conservar también referencias relativas antiguas.
    const rows = await this.repository.listarRutasArchivos();
    if (!Array.isArray(rows)) throw new Error('No se pudo comprobar el inventario de fuentes.');
    return new Set(rows.filter(Boolean).map((value) => path.basename(value)));
  }

  async run() {
    if (this.running) return { omitido: true };
    this.running = true;
    const result = { candidatos: 0, puestos_en_cuarentena: 0, eliminados: 0, simulacion: this.dryRun };
    try {
      // No seguir junctions/symlinks en la raíz ni en la cuarentena.
      const rootStat = await fs.lstat(this.root).catch((error) => { if (error.code !== 'ENOENT') throw error; });
      if (!rootStat) return result;
      if (rootStat.isSymbolicLink() || !rootStat.isDirectory()) throw new Error('Directorio de uploads no seguro.');
      const refs = await this.references();
      const quarantine = path.join(this.root, '.quarantine');
      const qstat = await fs.lstat(quarantine).catch((error) => { if (error.code !== 'ENOENT') throw error; });
      if (qstat && (qstat.isSymbolicLink() || !qstat.isDirectory())) throw new Error('Cuarentena no segura.');
      for (const entry of await fs.readdir(this.root, { withFileTypes: true })) {
        if (!entry.isFile() || !managedName.test(entry.name) || refs.has(entry.name)) continue;
        const target = path.join(this.root, entry.name);
        const stat = await fs.lstat(target);
        if (!stat.isFile() || this.now() - stat.mtimeMs < this.retentionMs || activeUploads.has(target)) continue;
        if ((await this.references()).has(entry.name)) continue;
        result.candidatos++;
        if (!this.dryRun) {
          await fs.mkdir(quarantine, { recursive: true });
          // Timestamp propio de cuarentena; no reutilizar mtime del archivo original.
          await fs.rename(target, path.join(quarantine, `${this.now()}--${entry.name}`));
          result.puestos_en_cuarentena++;
        }
      }
      if (qstat) for (const entry of await fs.readdir(quarantine, { withFileTypes: true })) {
        const match = /^(\d{13})--(.+)$/.exec(entry.name);
        if (!entry.isFile() || !match || !managedName.test(match[2]) || this.now() - Number(match[1]) < this.quarantineMs) continue;
        if ((await this.references()).has(match[2]) || activeUploads.has(path.join(this.root, match[2]))) continue;
        const target = path.join(quarantine, entry.name);
        if (!(await fs.lstat(target)).isFile()) continue;
        if (!this.dryRun) { await fs.unlink(target); result.eliminados++; }
      }
      return result;
    } finally { this.running = false; }
  }
}

module.exports = { UploadCleanupService, UPLOAD_ROOT, activeUploads };
