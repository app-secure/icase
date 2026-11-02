jest.mock('../src/infrastructure/database/schemas/TrabajoGeneracionSchema', () => ({ updateMany: jest.fn(), updateOne: jest.fn() }));
const Job = require('../src/infrastructure/database/schemas/TrabajoGeneracionSchema');
const Jobs = require('../src/interface-adapters/repositories/MongoTrabajoGeneracionRepository');
const Update = require('../src/core/use-cases/ActualizarDiagramaManual');
const Controller = require('../src/interface-adapters/controllers/DiagramaController');
const Browser = require('../src/core/constants/BrowserTestRuntime');
const Generator = require('../src/infrastructure/services/TestSuiteGenerator');
const Frontend = require('../src/infrastructure/services/GenericFrontendGenerator');
const fs = require('node:fs');
const path = require('node:path');
const moduleForRecovery = { exports: {} };
new Function('module', 'exports', require('esbuild').transformSync(fs.readFileSync(path.resolve(__dirname, '../../icase-frontend/src/utils/diagramJobRecovery.js'), 'utf8'), { format: 'cjs' }).code)(moduleForRecovery, moduleForRecovery.exports);
const alreadyLoaded = moduleForRecovery.exports.completedDiagramAlreadyLoaded;
describe('regresiones detectadas en las pruebas reales', () => {
  test('una escritura concurrente rechazada no invalida dependencias ni pierde el conflicto', async () => {
    const repo = { obtenerPorId: async () => ({ id: 'd', version: 2, descripcion: 'actual' }), actualizar: jest.fn().mockResolvedValue(null) };
    const service = new Update({ diagramaRepository: repo });
    await expect(service.ejecutar({ id: 'd', datos: { descripcion: 'nueva' } })).rejects.toMatchObject({ status: 409 });
    expect(repo.actualizar).toHaveBeenCalledWith('d', expect.objectContaining({ version: 3 }), { versionEsperada: 2 });
  });
  test('una versión esperada antigua se rechaza antes de escribir', async () => {
    const repo = { obtenerPorId: async () => ({ version: 2 }), actualizar: jest.fn() };
    await expect(new Update({ diagramaRepository: repo }).ejecutar({ id: 'd', datos: { descripcion: 'antigua', version_esperada: 1 } })).rejects.toMatchObject({ status: 409 });
    expect(repo.actualizar).not.toHaveBeenCalled();
  });
  test('el controlador propaga HTTP 409 y mantiene el contrato de error', async () => {
    const service = { ejecutar: jest.fn().mockRejectedValue(Object.assign(new Error('Conflicto'), { status: 409 })) };
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    await new Controller({ actualizarDiagramaManualUseCase: service }).actualizar({ params: { id: 'd' }, body: { codigo_plantuml: 'x', version_esperada: 2, proyecto_id: 'intruso' } }, res);
    expect(res.status).toHaveBeenCalledWith(409);
    expect(service.ejecutar).toHaveBeenCalledWith({ id: 'd', datos: { codigo_plantuml: 'x', version_esperada: 2 } });
  });
  test('la limpieza solo cierra verificaciones activas expiradas y libera su clave', async () => {
    await new Jobs().finalizarVerificacionesExpiradas();
    expect(Job.updateMany).toHaveBeenCalledWith(expect.objectContaining({ tipo: 'verificacion', estado: { $in: ['encolado', 'procesando'] } }), expect.objectContaining({ $unset: { clave_activa: 1 } }));
  });
  test('un ejecutor que perdió la concesión no puede renovarla', async () => {
    Job.updateOne.mockResolvedValue({ matchedCount: 0 });
    expect(await new Jobs().renovarLeaseVerificacion('job')).toBe(false);
    expect(Job.updateOne).toHaveBeenCalledWith(expect.objectContaining({ lease_expires_at: { $gt: expect.any(Date) } }), expect.any(Object));
  });
  test('paquete y navegador Playwright utilizan la misma versión corregida', async () => {
    const generated = await new Generator().generar({ proyecto: { nombre: 'Prueba' }, versionesOrigen: {}, insumos: { requerimientos: [], backend: { version: 1, archivos: [] }, frontend: { version: 1, archivos: [] } } });
    const pkg = JSON.parse(generated.archivos.find(f => f.ruta === 'tests/package.json').contenido);
    expect(pkg.devDependencies['@playwright/test']).toBe('1.56.1');
    expect(Browser.image).toContain('v' + Browser.version + '-noble');
  });
  test('la base móvil validada se refleja en el manifiesto generado', () => {
    const files = new Frontend()._mobile('Prueba');
    const pkg = JSON.parse(files.find(f => f.ruta === 'mobile/package.json').contenido);
    expect(pkg.dependencies).toEqual({ expo: '58.0.22', react: '19.3.0', 'react-native': '0.88.1' });
    expect(pkg.engines.node).toContain('22.13');
  });
  test('un trabajo antiguo ya cargado no debe sustituir el estado aprobado ni la fase', () => {
    expect(alreadyLoaded({ tipo_diagrama: 'clases_diseno' }, { diagramas: [{ tipo: 'clases_diseno', id: 'd1', version: 1 }] }, { designClassDiagram: { id: 'd1', version: 2, approved: true } }, { clases_diseno: 'designClassDiagram' })).toBe(true);
  });
  test('un trabajo que entrega una versión nueva sí debe aplicarse', () => {
    expect(alreadyLoaded({ tipo_diagrama: 'clases_diseno' }, { diagramas: [{ tipo: 'clases_diseno', id: 'd2', version: 2 }] }, { designClassDiagram: { id: 'd1', version: 1 } }, { clases_diseno: 'designClassDiagram' })).toBe(false);
  });
});
