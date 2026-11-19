const fs = require('node:fs/promises');
const path = require('node:path');
const Audit = require('../src/core/constants/DependencyAudit');
const Infrastructure = require('../src/infrastructure/services/InfrastructureGenerator');
const Sandbox = require('../src/infrastructure/services/SandboxRuntimeVerifier');
const Exported = require('../src/infrastructure/services/ExportedComposeVerifier');
const UseCase = require('../src/core/use-cases/GestionarArtefactosCodigo');

describe('auditoría obligatoria de dependencias generadas', () => {
  let root;
  beforeEach(async () => { root = await fs.mkdtemp(path.join(__dirname, '.generated-audit-')); });
  afterEach(async () => {
    if (path.dirname(root) !== __dirname || !path.basename(root).startsWith('.generated-audit-')) throw new Error('Ruta no segura');
    await fs.rm(root, { recursive: true, force: true });
  });
  test.each([['Express', 1], ['NestJS', 2], ['Spring Boot', 0]])('Dockerfiles de %s incluyen %s auditorías de producción', (backend, count) => {
    const file = new Infrastructure()._backendDockerfile(backend);
    expect(file.split(Audit.dockerRun).length - 1).toBe(count);
  });
  test('el verificador también audita la instalación real antes de arrancar Node', async () => {
    await fs.mkdir(path.join(root, 'backend'));
    await fs.writeFile(path.join(root, 'backend/icase.manifest.json'), JSON.stringify({ stack: { lenguaje: 'node' } }));
    await new Sandbox()._helpers(root, 'codigo_backend');
    const dockerfile = await fs.readFile(path.join(root, 'backend.verify.Dockerfile'), 'utf8');
    expect(dockerfile).toContain(Audit.dockerRun);
    expect(dockerfile).toContain('ARG ICASE_AUDIT_NONCE');
  });
  test('evidencia funcional antigua no sustituye la auditoría Node', () => {
    const useCase = new UseCase({});
    useCase.verifier.verificar = () => ({ estado: 'apta_estructuralmente', huella: 'actual' });
    const item = { tipo: 'codigo_backend', archivos: [{ ruta: 'backend/package.json', contenido: '{}' }], verificacion: { huella: 'actual', estado: 'apta', nivel: 'ejecucion_aislada' } };
    expect(() => useCase._exigirVerificacion(item)).toThrow('auditoría obligatoria');
    item.verificacion.protocolo_dependencias = Audit.protocol;
    expect(() => useCase._exigirVerificacion(item)).not.toThrow();
  });
  test('un Dockerfile exportado antiguo o con auditoría comentada exige regenerar infraestructura', async () => {
    await fs.mkdir(path.join(root, 'backend'));
    await fs.mkdir(path.join(root, 'ops/docker'), { recursive: true });
    await fs.writeFile(path.join(root, 'backend/package.json'), '{}');
    await fs.writeFile(path.join(root, 'ops/docker/backend.Dockerfile'), '# RUN ' + Audit.command);
    const run = jest.fn();
    await expect(new Exported({ run }).verificar(root, 'icasevaudit')).rejects.toThrow('auditoría obligatoria');
    expect(run).not.toHaveBeenCalled();
  });
  test('un fallo npm audit no produce evidencia apta', async () => {
    const run = jest.fn(async (_cmd, args) => {
      if (args.includes('build')) throw Object.assign(new Error('Audit failed'), { stdout: '3 high severity vulnerabilities', stderr: '' });
      return { stdout: '', stderr: '' };
    });
    const result = await new Sandbox({ run }).verificar({ tipo: 'codigo_backend', archivos: [] });
    expect(result.estado).toBe('fallida');
    expect(result.protocolo_dependencias).toBeUndefined();
    expect(result.errores.join(' ')).toContain('high severity');
  });
  test('cada verificación usa un nonce distinto para no reutilizar la auditoría en caché', async () => {
    const run = jest.fn(async () => ({ stdout: '', stderr: '' }));
    const verifier = new Sandbox({ run });
    await verifier.verificar({ tipo: 'codigo_backend', archivos: [] });
    await verifier.verificar({ tipo: 'codigo_backend', archivos: [] });
    const builds = run.mock.calls.map(([, args]) => args).filter((args) => args.includes('build'));
    const nonces = builds.map((args) => args.find((arg) => arg.startsWith('ICASE_AUDIT_NONCE=')));
    expect(nonces).toHaveLength(2);
    expect(nonces.every(Boolean)).toBe(true);
    expect(nonces[0]).not.toBe(nonces[1]);
  });
});
