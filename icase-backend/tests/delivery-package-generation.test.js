const DeliveryPackageGenerator = require('../src/infrastructure/services/DeliveryPackageGenerator');
const ZipArchiveService = require('../src/infrastructure/services/ZipArchiveService');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

describe('paquete final de entrega', () => {
  const artifact = (tipo, version, ruta, contenido) => ({
    tipo, version, huella_entrada: `${tipo}-input`, trazabilidad_rf: ['RF-01'],
    archivos: [{ ruta, contenido, lenguaje: 'text', huella: `${tipo}-file` }]
  });

  test('consolida artefactos y crea un manifiesto auditable', async () => {
    const artifacts = [
      artifact('codigo_backend', 1, 'backend/app.js', 'backend'),
      artifact('codigo_frontend', 2, 'frontend/app.jsx', 'frontend'),
      artifact('pruebas', 3, 'tests/test.js', 'tests'),
      artifact('infraestructura', 4, 'ops/compose.yml', 'ops'),
      artifact('pipeline_ci_cd', 5, '.github/workflows/ci.yml', 'ci')
    ];
    const contract = { entities: [], operations: [] };
    artifacts[0].archivos.push(
      { ruta: 'backend/icase.manifest.json', contenido: JSON.stringify(contract) },
      { ruta: 'backend/GENERATION-REPORT.json', contenido: JSON.stringify({
        fuente_cobertura: { requisitos: [], contrato: contract, declaracion: { modo_entrega: 'parcial', aceptar_pendientes: true } }
      }) }
    );
    const result = await new DeliveryPackageGenerator().generar({ proyecto: { nombre: 'Demo' }, insumos: { artefactos: artifacts }, versionesOrigen: {} });
    expect(result.archivos.map((item) => item.ruta)).toEqual(expect.arrayContaining(['DELIVERY.md', 'delivery-manifest.json', 'backend/app.js', 'tools/preview-local.cjs']));
    expect(result.dependencias).toHaveLength(5);
    const manifest = JSON.parse(result.archivos.find((item) => item.ruta === 'delivery-manifest.json').contenido);
    expect(manifest.artefactos.find((item) => item.tipo === 'pipeline_ci_cd').version).toBe(5);
    expect(manifest.alcance.modo_entrega).toBe('parcial');
    expect(result.archivos.find((item) => item.ruta === 'DELIVERY.md').contenido).toContain('Entrega **parcial**');
  });

  test('rechaza colisiones de rutas con contenidos diferentes', async () => {
    await expect(new DeliveryPackageGenerator().generar({
      proyecto: { nombre: 'Demo' }, versionesOrigen: {},
      insumos: { artefactos: [artifact('codigo_backend', 1, 'README.md', 'uno'), artifact('codigo_frontend', 1, 'README.md', 'dos')] }
    })).rejects.toThrow('Conflicto en el paquete final');
  });

  test('crea un ZIP válido con nombres UTF-8 y bloquea path traversal', () => {
    const service = new ZipArchiveService();
    const zip = service.crear([{ ruta: 'documentación/inicio.txt', contenido: 'hola' }]);
    expect(zip.readUInt32LE(0)).toBe(0x04034b50);
    expect(zip.includes(Buffer.from('documentación/inicio.txt'))).toBe(true);
    expect(zip.readUInt32LE(zip.length - 22)).toBe(0x06054b50);
    expect(() => service.crear([{ ruta: '../secreto.txt', contenido: 'x' }])).toThrow('Ruta no válida');
  });

  test('la vista previa local crea secretos una vez, muestra la URL y conserva datos al detener', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'icase-preview-'));
    try {
      const script = fs.readFileSync(path.join(__dirname, '../src/infrastructure/templates/verification/preview-local.cjs'), 'utf8');
      for (const folder of ['tools', 'ops', 'frontend', 'bin']) fs.mkdirSync(path.join(directory, folder));
      fs.writeFileSync(path.join(directory, 'tools/preview-local.cjs'), script);
      fs.writeFileSync(path.join(directory, 'ops/docker-compose.yml'), 'services: {}\n');
      fs.writeFileSync(path.join(directory, 'ops/.env.example'), 'WEB_PORT=8091\nJWT_SECRET=replace\nADMIN_EMAIL=admin@example.com\nADMIN_PASSWORD=replace\nDB_PASSWORD=replace\n');
      fs.writeFileSync(path.join(directory, 'frontend/package.json'), '{}');
      fs.writeFileSync(path.join(directory, 'bin/docker'), '#!/bin/sh\nprintf "%s\\n" "$*" >> "$ICASE_DOCKER_LOG"\n', { mode: 0o755 });
      const env = { ...process.env, PATH: `${path.join(directory, 'bin')}:${process.env.PATH}`, ICASE_DOCKER_LOG: path.join(directory, 'docker.log') };
      const output = execFileSync(process.execPath, [path.join(directory, 'tools/preview-local.cjs'), 'start'], { env, encoding: 'utf8' });
      expect(output).toContain('http://localhost:8091');
      const secrets = fs.readFileSync(path.join(directory, 'ops/.env'), 'utf8');
      expect(secrets).not.toContain('replace');
      expect(fs.statSync(path.join(directory, 'ops/.env')).mode & 0o777).toBe(0o600);
      execFileSync(process.execPath, [path.join(directory, 'tools/preview-local.cjs'), 'stop'], { env });
      expect(fs.readFileSync(path.join(directory, 'ops/.env'), 'utf8')).toBe(secrets);
      const calls = fs.readFileSync(path.join(directory, 'docker.log'), 'utf8');
      expect(calls).toContain('up -d --build --wait');
      expect(calls).toContain('down --remove-orphans');
      expect(calls).not.toContain('down -v');
    } finally { fs.rmSync(directory, { recursive: true, force: true }); }
  });
});
