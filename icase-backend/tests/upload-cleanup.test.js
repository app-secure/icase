const fs = require('node:fs/promises');
const path = require('node:path');
const { UploadCleanupService, activeUploads } = require('../src/infrastructure/services/UploadCleanupService');

describe('limpieza conservadora de uploads', () => {
  let root, references, service;
  const now = 1800000000000, day = 86400000;
  const name = '1700000000000-123-notas.txt';
  async function file(filename = name, age = 10 * day) {
    const target = path.join(root, filename);
    await fs.writeFile(target, 'fuente de prueba');
    await fs.utimes(target, new Date(now - age), new Date(now - age));
    return target;
  }
  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(__dirname, '.generated-upload-cleanup-'));
    references = [];
    service = new UploadCleanupService({ root, now: () => now, dryRun: false, repository: { listarRutasArchivos: async () => references } });
  });
  afterEach(async () => {
    activeUploads.clear();
    if (path.dirname(root) !== __dirname || !path.basename(root).startsWith('.generated-upload-cleanup-')) throw new Error('Ruta de prueba no segura');
    await fs.rm(root, { recursive: true, force: true });
  });
  test('conserva fuentes, archivos recientes, activos y nombres no administrados', async () => {
    references = [await file()];
    await file('1700000000000-124-reciente.pdf', day);
    activeUploads.add(await file('1700000000000-125-activo.txt'));
    await file('documento-manual.txt');
    expect((await service.run()).candidatos).toBe(0);
    expect(await fs.readdir(root)).toHaveLength(4);
  });
  test('cuarentena recuperable y purga después de siete días adicionales', async () => {
    await file();
    expect((await service.run()).puestos_en_cuarentena).toBe(1);
    expect(await fs.readFile(path.join(root, '.quarantine', `${now}--${name}`), 'utf8')).toContain('fuente');
    expect((await service.run()).eliminados).toBe(0);
    service.now = () => now + 8 * day;
    expect((await service.run()).eliminados).toBe(1);
  });
  test('simula sin mover ni eliminar', async () => {
    await file(); service.dryRun = true;
    expect(await service.run()).toMatchObject({ candidatos: 1, puestos_en_cuarentena: 0, eliminados: 0, simulacion: true });
    expect(await fs.readdir(root)).toEqual([name]);
  });
  test('fallo de Mongo aborta sin tocar archivos', async () => {
    await file(); service.repository.listarRutasArchivos = async () => { throw new Error('DB caída'); };
    await expect(service.run()).rejects.toThrow('DB caída');
    expect(await fs.readdir(root)).toEqual([name]);
    expect(service.running).toBe(false);
  });
  test('reconsulta referencias antes de mover', async () => {
    const target = await file(); let reads = 0;
    service.repository.listarRutasArchivos = async () => ++reads > 1 ? [target] : [];
    expect((await service.run()).puestos_en_cuarentena).toBe(0);
  });
  test('protege cuarentena cuyo original vuelve a estar referenciado', async () => {
    const target = await file(); await service.run();
    references = [target]; service.now = () => now + 8 * day;
    expect((await service.run()).eliminados).toBe(0);
  });
  test('rechaza una cuarentena junction antes de mover', async () => {
    await fs.mkdir(path.join(root, 'conservar'));
    await fs.symlink(path.join(root, 'conservar'), path.join(root, '.quarantine'), 'junction');
    await file();
    await expect(service.run()).rejects.toThrow('Cuarentena no segura');
    expect(await fs.readFile(path.join(root, name), 'utf8')).toContain('fuente');
  });
  test('omite barridos simultáneos', async () => {
    service.running = true;
    expect(await service.run()).toEqual({ omitido: true });
  });
  test('ignora subdirectorios y enlaces a archivos aunque el nombre parezca administrado', async () => {
    await fs.mkdir(path.join(root, 'subdirectorio'));
    const target = path.join(root, 'subdirectorio', name);
    await fs.writeFile(target, 'conservar');
    // Junction no necesita privilegios especiales en Windows.
    await fs.symlink(path.join(root, 'subdirectorio'), path.join(root, '1700000000000-123-link.txt'), 'junction');
    expect((await service.run()).candidatos).toBe(0);
    expect(await fs.readFile(target, 'utf8')).toBe('conservar');
  });
  test('una raíz que sea junction se rechaza y la configuración predeterminada solo simula', async () => {
    const link = path.join(root, 'link');
    await fs.mkdir(path.join(root, 'real'));
    await fs.symlink(path.join(root, 'real'), link, 'junction');
    const unsafe = new UploadCleanupService({ root: link, repository: service.repository });
    expect(unsafe.dryRun).toBe(true);
    await expect(unsafe.run()).rejects.toThrow('Directorio de uploads no seguro');
  });
});
