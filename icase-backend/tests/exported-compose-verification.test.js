const fs = require('node:fs/promises');
const path = require('node:path');
const Verifier = require('../src/infrastructure/services/ExportedComposeVerifier');
const UseCase = require('../src/core/use-cases/GestionarArtefactosCodigo');

describe('validación del despliegue exportado', () => {
  let root;
  const project = 'icasevtest';
  const config = () => ({ services: { backend: { build: { context: root, dockerfile: 'ops/docker/backend.Dockerfile' } }, frontend: {}, database: {}, smoke: {}, tests: {} }, volumes: { data: { name: project + 'delivery_data' } }, networks: { default: { name: project + 'delivery_default', internal: true } } });
  beforeEach(async () => { root = await fs.mkdtemp(path.join(__dirname, '.generated-exported-')); });
  afterEach(async () => {
    if (path.dirname(root) !== __dirname || !path.basename(root).startsWith('.generated-exported-')) throw new Error('Ruta no segura');
    await fs.rm(root, { recursive: true, force: true });
  });
  test('ejecuta Compose y Dockerfiles originales, aislando únicamente puertos, red y credenciales', async () => {
    await fs.mkdir(path.join(root, 'ops'));
    const original = 'services:\n  backend:\n    image: fixture\n';
    await fs.writeFile(path.join(root, 'ops/docker-compose.yml'), original);
    const run = jest.fn(async (_command, args) => ({ stdout: args.includes('config') ? JSON.stringify(config()) : 'ok', stderr: '' }));
    const result = await new Verifier({ run }).verificar(root, project);
    expect(result.protocolo_despliegue).toBe('compose-exportado-v1');
    expect(result.pruebas).toHaveLength(6);
    expect(await fs.readFile(path.join(root, 'ops/docker-compose.yml'), 'utf8')).toBe(original);
    const overlay = await fs.readFile(path.join(root, 'verify.exported.yml'), 'utf8');
    expect(overlay).toContain('ports: !reset []');
    expect(overlay).toContain('internal: true');
    expect(overlay).not.toContain('backend.verify.Dockerfile');
    const calls = run.mock.calls.map(([, args]) => args);
    expect(calls.some((args) => args.includes('smoke') && args.includes('tests') && args.includes('build'))).toBe(true);
    expect(calls.at(-1)).toEqual(expect.arrayContaining(['-p', 'icasevtestdelivery', 'down', '-v']));
    expect(result.pruebas[0].salida).not.toContain('JWT_SECRET');
  });
  test('comprueba la disponibilidad de ambas réplicas antes de ejecutar escrituras', async () => {
    await fs.mkdir(path.join(root, 'backend'));
    await fs.writeFile(path.join(root, 'backend/icase.manifest.json'), JSON.stringify({eventos_cambios:{replicas:true}}));
    const run = jest.fn(async (_command,args) => ({stdout:args.includes('config')?JSON.stringify(config()):'ok',stderr:''}));
    await new Verifier({run}).verificar(root,project);
    const overlay=await fs.readFile(path.join(root,'verify.exported.yml'),'utf8');
    expect(overlay).toContain('extends: {file: docker-compose.yml, service: backend}');
    expect(overlay).toContain('backend_peer:\n    extends: {file: docker-compose.yml, service: backend}\n    ports: !reset []');
    const probe=run.mock.calls.find(([,args])=>args.includes('--input-type=module'))[1].at(-1);
    expect(probe).toContain('http://backend_peer:3000/health');
    expect(probe).toContain('http://backend:3000/health');
    expect(probe).toContain("throw new Error('Servicio no listo: '+url)");
  });
  test.each(['host-mount', 'external-volume', 'ports', 'privileged', 'network', 'build', 'image-tag'])('rechaza configuración peligrosa: %s', async (kind) => {
    const value = config();
    if (kind === 'host-mount') value.services.backend.volumes = [{ type: 'bind', source: path.dirname(root), target: '/host' }];
    if (kind === 'external-volume') value.volumes.data.external = true;
    if (kind === 'ports') value.services.backend.ports = [{ published: 3000 }];
    if (kind === 'privileged') value.services.backend.privileged = true;
    if (kind === 'network') value.networks.default.internal = false;
    if (kind === 'build') value.services.backend.build.context = path.dirname(root);
    if (kind === 'image-tag') value.services.backend.image = 'imagen-del-usuario:latest';
    const run = jest.fn(async () => ({ stdout: JSON.stringify(value), stderr: '' }));
    await expect(new Verifier({ run }).verificar(root, project)).rejects.toThrow();
    expect(run.mock.calls.some(([, args]) => args.includes('up') || args.includes('down'))).toBe(false);
  });
  test('recoge diagnósticos y elimina únicamente el proyecto temporal si falla el build', async () => {
    let credentials;
    const run = jest.fn(async (_command, args) => {
      if (args.includes('config')) return { stdout: JSON.stringify(config()) };
      if (args.includes('build')) {
        const env = await fs.readFile(path.join(root, 'verify.exported.env'), 'utf8');
        credentials = /JWT_SECRET=(.+)/.exec(env)[1];
        throw Object.assign(new Error('falló build ' + credentials), { stdout: credentials, stderr: '' });
      }
      return { stdout: 'diagnóstico' };
    });
    let failure;
    try { await new Verifier({ run }).verificar(root, project); } catch (error) { failure = error; }
    expect(failure.message).not.toContain(credentials);
    expect(failure.stdout).not.toContain(credentials);
    expect(failure.pruebas_despliegue.some((step) => step.paso.includes('Diagnóstico'))).toBe(true);
    expect(run.mock.calls.at(-1)[1]).toEqual(expect.arrayContaining(['icasevtestdelivery', 'down', '-v']));
  });
  test('no acepta una verificación antigua del paquete que solo validó sintaxis', () => {
    const useCase = new UseCase({});
    useCase.verifier.verificar = () => ({ estado: 'apta_estructuralmente', huella: 'actual' });
    expect(() => useCase._exigirVerificacion({ tipo: 'paquete_entrega', archivos: [], verificacion: { huella: 'actual', estado: 'apta', nivel: 'ejecucion_aislada' } })).toThrow('Compose exportado');
  });
});
