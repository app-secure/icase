const DeliveryPackageGenerator = require('../src/infrastructure/services/DeliveryPackageGenerator');
const ZipArchiveService = require('../src/infrastructure/services/ZipArchiveService');

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
    const result = await new DeliveryPackageGenerator().generar({ proyecto: { nombre: 'Demo' }, insumos: { artefactos: artifacts }, versionesOrigen: {} });
    expect(result.archivos.map((item) => item.ruta)).toEqual(expect.arrayContaining(['DELIVERY.md', 'delivery-manifest.json', 'backend/app.js']));
    expect(result.dependencias).toHaveLength(5);
    const manifest = JSON.parse(result.archivos.find((item) => item.ruta === 'delivery-manifest.json').contenido);
    expect(manifest.artefactos.find((item) => item.tipo === 'pipeline_ci_cd').version).toBe(5);
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
});
