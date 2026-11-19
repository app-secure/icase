const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { EventEmitter } = require('node:events');
const LocalRunService = require('../src/infrastructure/services/LocalRunService');
const GestionarArtefactosCodigo = require('../src/core/use-cases/GestionarArtefactosCodigo');

const paquete = [
  { ruta: 'ops/docker-compose.yml', contenido: 'services: {}\n' },
  { ruta: 'ops/.env.example', contenido: 'API_PORT=3000\nWEB_PORT=8091\n' },
  { ruta: 'tools/preview-local.cjs', contenido: '// script' },
  { ruta: 'frontend/package.json', contenido: '{}' },
  { ruta: 'mobile/package.json', contenido: '{}' }
];

const carpetas = [];
afterAll(() => carpetas.forEach((dir) => fs.rmSync(dir, { recursive: true, force: true })));
const nueva = () => { const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'icase-run-test-')); carpetas.push(dir); return dir; };

/** Proceso simulado: emite una salida y cierra con el código indicado. */
const proceso = ({ salida = '', codigo = 0 } = {}) => (() => {
  const child = new EventEmitter();
  child.stdout = new EventEmitter(); child.stderr = new EventEmitter(); child.kill = jest.fn();
  setImmediate(() => { if (salida) child.stdout.emit('data', salida); child.emit('close', codigo); });
  return child;
});

const contenedores = (...estados) => estados.map(([Service, State]) => JSON.stringify({ Service, State })).join('\n');
const dockerFalso = ({ version = true, ps = '' } = {}) => jest.fn(async (args) => {
  if (args[0] === 'version') return version ? { error: null, stdout: '27', stderr: '' } : { error: new Error('sin docker'), stdout: '', stderr: '' };
  if (args.includes('ps')) return { error: null, stdout: ps, stderr: '' };
  return { error: null, stdout: '', stderr: '' };
});
const esperar = () => new Promise((resolve) => setImmediate(() => setImmediate(resolve)));

describe('ejecución local del paquete', () => {
  test('materializa los archivos, rechaza rutas fuera de la carpeta y conserva los secretos', () => {
    const servicio = new LocalRunService({ root: nueva() });
    const base = servicio.materializar('p1', paquete);
    expect(fs.existsSync(path.join(base, 'ops/docker-compose.yml'))).toBe(true);
    fs.writeFileSync(path.join(base, 'ops/.env'), 'ADMIN_PASSWORD=secreta\n');
    servicio.materializar('p1', [...paquete, { ruta: 'ops/.env', contenido: 'ADMIN_PASSWORD=otra\n' }]);
    expect(fs.readFileSync(path.join(base, 'ops/.env'), 'utf8')).toBe('ADMIN_PASSWORD=secreta\n');
    expect(() => servicio.materializar('p1', [{ ruta: '../fuera.txt', contenido: 'x' }])).toThrow(/Ruta no permitida/);
    expect(() => servicio.materializar('../otro', paquete)).toThrow(/Identificador/);
  });

  test('sin Docker explica qué hacer y no inicia nada', async () => {
    const spawnProcess = jest.fn();
    const servicio = new LocalRunService({ root: nueva(), spawnProcess, docker: dockerFalso({ version: false }) });
    await expect(servicio.iniciar({ proyectoId: 'p1', archivos: paquete })).rejects.toThrow(/Docker Desktop/);
    expect(spawnProcess).not.toHaveBeenCalled();
    expect((await servicio.estado('p1')).estado).toBe('error');
  });

  test('iniciar levanta los contenedores y publica los accesos por separado', async () => {
    const root = nueva();
    const servicio = new LocalRunService({ root, spawnProcess: proceso({ salida: 'Vista previa disponible en http://localhost:8091\n' }), docker: dockerFalso({ ps: contenedores(['backend', 'running'], ['web', 'running']) }) });
    expect((await servicio.iniciar({ proyectoId: 'p1', archivos: paquete, version: 3 })).estado).toBe('iniciando');
    await esperar();
    fs.writeFileSync(path.join(root, 'p1/ops/.env'), 'API_PORT=3000\nWEB_PORT=8091\nADMIN_EMAIL=a@x.com\nADMIN_PASSWORD=clave\nJWT_SECRET=nolomuestres\n');
    const estado = await servicio.estado('p1');
    expect(estado).toMatchObject({ estado: 'activo', version: 3, requiere_levantar: false });
    expect(estado.accesos.web).toEqual({ url: 'http://localhost:8091', disponible: true });
    expect(estado.accesos.documentacion).toEqual({ url: 'http://localhost:3000/api/docs', disponible: true });
    expect(estado.accesos.movil).toMatchObject({ disponible: false, api: 'http://localhost:3000' });
    expect(estado.accesos.movil.instrucciones).toMatch(/expo start/);
    expect(estado.credenciales_admin).toEqual({ email: 'a@x.com', password: 'clave' });
    expect(JSON.stringify(estado)).not.toContain('nolomuestres');
    expect(estado.contenedores.map((item) => item.servicio)).toEqual(['backend', 'web']);
    expect(estado.log.join(' ')).toContain('Vista previa disponible');
  });

  test('si los contenedores se detienen o se eliminan, lo indica y permite volver a levantarlos', async () => {
    const root = nueva();
    let ps = contenedores(['backend', 'running'], ['web', 'running']);
    const docker = jest.fn(async (args) => (args[0] === 'version' ? { error: null, stdout: '27', stderr: '' } : { error: null, stdout: ps, stderr: '' }));
    const servicio = new LocalRunService({ root, spawnProcess: proceso(), docker });
    await servicio.iniciar({ proyectoId: 'p1', archivos: paquete });
    await esperar();
    fs.writeFileSync(path.join(root, 'p1/ops/.env'), 'API_PORT=3000\n');
    expect((await servicio.estado('p1')).estado).toBe('activo');
    ps = contenedores(['backend', 'exited'], ['web', 'running']);
    const detenido = await servicio.estado('p1');
    expect(detenido).toMatchObject({ estado: 'detenido', requiere_levantar: true });
    expect(detenido.accesos.web.disponible).toBe(false);
    ps = ''; // eliminados
    expect((await servicio.estado('p1')).requiere_levantar).toBe(true);
    await servicio.iniciar({ proyectoId: 'p1', archivos: paquete }); // volver a levantar
    await esperar();
    ps = contenedores(['backend', 'running'], ['web', 'running']);
    expect((await servicio.estado('p1')).estado).toBe('activo');
  });

  test('un fallo del arranque deja el error visible con la salida del proceso', async () => {
    const servicio = new LocalRunService({ root: nueva(), spawnProcess: proceso({ salida: 'Docker terminó con código 1.\n', codigo: 1 }), docker: dockerFalso() });
    await servicio.iniciar({ proyectoId: 'p1', archivos: paquete });
    await esperar();
    const estado = await servicio.estado('p1');
    expect(estado.estado).toBe('error');
    expect(estado.error).toContain('Docker terminó con código 1');
  });

  test('detener usa el script del paquete y no se puede repetir mientras inicia', async () => {
    const spawnProcess = jest.fn(proceso());
    const servicio = new LocalRunService({ root: nueva(), spawnProcess, docker: dockerFalso() });
    await expect(servicio.detener('p1')).rejects.toThrow(/no se ha ejecutado/);
    await servicio.iniciar({ proyectoId: 'p1', archivos: paquete });
    await expect(servicio.iniciar({ proyectoId: 'p1', archivos: paquete })).rejects.toThrow(/en curso/);
    await esperar();
    await servicio.detener('p1');
    expect(spawnProcess.mock.calls[1][1][1]).toBe('stop');
    await esperar();
    expect((await servicio.estado('p1')).estado).toBe('inactivo');
  });
});

describe('casos de uso de ejecución', () => {
  const montar = (paqueteAprobado, servicio) => new GestionarArtefactosCodigo({
    proyectoRepository: {}, planCodificacionRepository: {},
    artefactoRepository: { obtenerUltimoAprobado: async () => paqueteAprobado },
    localRunService: servicio
  });

  test('exige un paquete aprobado y verificado antes de ejecutar', async () => {
    const servicio = { iniciar: jest.fn() };
    await expect(montar(null, servicio).iniciarEjecucion('p1')).rejects.toThrow(/Aprueba el paquete/);
    const useCase = montar({ tipo: 'paquete_entrega', archivos: [], version: 2 }, servicio);
    useCase.asegurarPaqueteEjecutable = jest.fn(() => { throw new Error('Repite la verificación'); });
    await expect(useCase.iniciarEjecucion('p1')).rejects.toThrow(/verificación/);
    expect(servicio.iniciar).not.toHaveBeenCalled();
  });

  test('con un paquete verificado delega en el servicio', async () => {
    const servicio = { iniciar: jest.fn(async () => ({ estado: 'iniciando' })), estado: jest.fn(async () => ({ estado: 'activo' })) };
    const useCase = montar({ tipo: 'paquete_entrega', archivos: paquete, version: 2 }, servicio);
    useCase.asegurarPaqueteEjecutable = jest.fn();
    expect(await useCase.iniciarEjecucion(7)).toEqual({ estado: 'iniciando' });
    expect(servicio.iniciar).toHaveBeenCalledWith({ proyectoId: '7', archivos: paquete, version: 2 });
    expect(await useCase.estadoEjecucion(7)).toEqual({ estado: 'activo' });
    await expect(montar(null, null).estadoEjecucion('p1')).rejects.toThrow(/no está configurada/);
  });
});
