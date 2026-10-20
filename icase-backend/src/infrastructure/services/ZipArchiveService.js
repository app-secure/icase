class ZipArchiveService {
  crear(archivos) {
    const locals = [];
    const centrals = [];
    let offset = 0;
    for (const archivo of archivos) {
      const name = this._safePath(archivo.ruta);
      const nameBuffer = Buffer.from(name, 'utf8');
      const data = Buffer.from(String(archivo.contenido || ''), 'utf8');
      const crc = this._crc32(data);
      const local = Buffer.alloc(30);
      local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0x0800, 6);
      local.writeUInt16LE(0, 8); local.writeUInt32LE(crc, 14); local.writeUInt32LE(data.length, 18);
      local.writeUInt32LE(data.length, 22); local.writeUInt16LE(nameBuffer.length, 26);
      locals.push(local, nameBuffer, data);
      const central = Buffer.alloc(46);
      central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6);
      central.writeUInt16LE(0x0800, 8); central.writeUInt16LE(0, 10); central.writeUInt32LE(crc, 16);
      central.writeUInt32LE(data.length, 20); central.writeUInt32LE(data.length, 24);
      central.writeUInt16LE(nameBuffer.length, 28); central.writeUInt32LE(offset, 42);
      centrals.push(central, nameBuffer);
      offset += local.length + nameBuffer.length + data.length;
    }
    const centralSize = centrals.reduce((sum, part) => sum + part.length, 0);
    const end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(archivos.length, 8); end.writeUInt16LE(archivos.length, 10);
    end.writeUInt32LE(centralSize, 12); end.writeUInt32LE(offset, 16);
    return Buffer.concat([...locals, ...centrals, end]);
  }

  _safePath(value) {
    const normalized = String(value || '').replace(/\\/g, '/').replace(/^\/+/, '');
    if (!normalized || normalized.split('/').includes('..')) throw new Error(`Ruta no válida para ZIP: ${value}`);
    return normalized;
  }

  _crc32(buffer) {
    let crc = 0xffffffff;
    for (const byte of buffer) {
      crc ^= byte;
      for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
    }
    return (crc ^ 0xffffffff) >>> 0;
  }
}

module.exports = ZipArchiveService;
