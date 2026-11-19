const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { HttpError } = require('../data/store-support');

// Almacenamiento privado local. No hay static serving ni rutas elegidas por el cliente.
function createFiles({ root, maxBytes = 512 * 1024, quotaBytes = 50 * 1024 * 1024 }) {
  const directory = path.resolve(root);
  let queue = Promise.resolve();
  const locked = work => { const next = queue.then(work); queue = next.catch(() => {}); return next; };
  const idPattern = /^[a-f0-9]{32}$/;
  const invalid = message => { throw new HttpError(400, message); };
  function inspect(bytes, declared) {
    let type;
    if (bytes.length >= 24 && bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) && bytes.toString('ascii',12,16) === 'IHDR') {
      if (bytes.readUInt32BE(16) > 8192 || bytes.readUInt32BE(20) > 8192) invalid('Dimensiones de imagen excesivas');
      type = 'image/png';
    } else if (bytes.length > 4 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255 && bytes[bytes.length-2] === 255 && bytes[bytes.length-1] === 217) type = 'image/jpeg';
    else if (bytes.subarray(0,5).toString() === '%PDF-' && bytes.subarray(-1024).includes(Buffer.from('%%EOF'))) type = 'application/pdf';
    else invalid('Solo se admiten PNG, JPEG y PDF con firma válida');
    if (declared !== type) invalid('El formato declarado no coincide con el contenido');
    return type;
  }
  return {
    async save({ operation, record, owner, name, bytes, type }) {
      if (!Buffer.isBuffer(bytes) || !bytes.length) invalid('Archivo vacío');
      if (bytes.length > maxBytes) throw new HttpError(413, 'Archivo demasiado grande');
      const mime = inspect(bytes, type);
      return locked(async () => {
        await fs.mkdir(directory, { recursive: true, mode: 0o700 });
        const names = (await fs.readdir(directory)).filter(name => idPattern.test(name));
        if(names.length>=5000) throw new HttpError(413,'Límite de archivos alcanzado');
        let used = 0;
        for (const name of names) used += (await fs.stat(path.join(directory, name))).size;
        if (used + bytes.length > quotaBytes) throw new HttpError(413, 'Cuota de almacenamiento agotada');
        const id = crypto.randomBytes(16).toString('hex');
        const meta = { id, operation, record: String(record), owner: String(owner), name: String(name || 'archivo').replace(/[\r\n\x00-\x1f/\\]/g, '_').slice(0,120), type: mime, size: bytes.length };
        await fs.writeFile(path.join(directory,id), bytes, { flag: 'wx', mode: 0o600 });
        try { await fs.writeFile(path.join(directory,id+'.json'), JSON.stringify(meta), { flag: 'wx', mode: 0o600 }); }
        catch (error) { await fs.unlink(path.join(directory,id)); throw error; }
        return meta;
      });
    },
    async get(id) {
      if (!idPattern.test(id)) throw new HttpError(404, 'Archivo inexistente');
      try { return JSON.parse(await fs.readFile(path.join(directory,id+'.json'), 'utf8')); }
      catch (error) { if (error.code === 'ENOENT') throw new HttpError(404, 'Archivo inexistente'); throw error; }
    },
    async list(operation, record) {
      await fs.mkdir(directory, { recursive: true, mode: 0o700 });
      const result = [];
      for (const name of await fs.readdir(directory)) if (/^[a-f0-9]{32}\.json$/.test(name)) {
        const meta = await this.get(name.slice(0,-5));
        if (meta.operation === operation && meta.record === String(record)) result.push(meta);
      }
      return result;
    },
    read(id) { return fs.readFile(path.join(directory,id)); },
    remove(id) { return locked(async () => { await this.get(id); await fs.unlink(path.join(directory,id+'.json')); await fs.unlink(path.join(directory,id)); }); }
  };
}
module.exports = { createFiles };
