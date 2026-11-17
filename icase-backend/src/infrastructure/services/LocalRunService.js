const fs = require('node:fs');
const path = require('node:path');
const { spawn, execFile } = require('node:child_process');

const MAX_LOG_LINES = 400;
const START_TIMEOUT_MS = 15 * 60 * 1000;
const PROJECT_ID = /^[A-Za-z0-9_-]{1,64}$/;

const parseEnv = (text) => Object.fromEntries(String(text || '').split(/\r?\n/).map((line) => line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)).filter(Boolean).map((match) => [match[1], match[2]]));

/**
 * Ejecuta localmente el paquete de entrega aprobado con Docker Compose: lo materializa en una carpeta propia del
 * proyecto, levanta los contenedores, informa los accesos (web, móvil, documentación) y permite volver a levantarlos
 * si se detuvieron o eliminaron. Usa el `tools/preview-local.cjs` del propio paquete, que genera los secretos una sola
 * vez y nunca borra los datos al detener.
 */
class LocalRunService {
  constructor({ root = process.env.ICASE_RUNS_DIR || path.join(process.cwd(), '.icase-runs'), spawnProcess = spawn, docker = null } = {}) {
    this.root = root;
    this.spawnProcess = spawnProcess;
    this.docker = docker || ((args, options = {}) => new Promise((resolve) => {
      execFile('docker', args, { timeout: 15000, windowsHide: true, ...options }, (error, stdout, stderr) => resolve({ error, stdout: String(stdout || ''), stderr: String(stderr || '') }));
    }));
    this.runs = new Map(); // proyectoId -> { estado, log, version, error, proceso }
  }

  directorio(proyectoId) {
    if (!PROJECT_ID.test(String(proyectoId))) throw new Error('Identificador de proyecto no válido.');
    return path.join(this.root, String(proyectoId));
  }

  /** Escribe los archivos del paquete; conserva `ops/.env` para que los secretos coincidan con los datos ya creados. */
  materializar(proyectoId, archivos = []) {
    const base = this.directorio(proyectoId);
    fs.mkdirSync(base, { recursive: true });
    for (const archivo of archivos) {
      const destino = path.resolve(base, archivo.ruta);
      if (!destino.startsWith(base + path.sep) || path.isAbsolute(archivo.ruta)) throw new Error(`Ruta no permitida en el paquete: ${archivo.ruta}`);
      if (archivo.ruta === 'ops/.env') continue;
      fs.mkdirSync(path.dirname(destino), { recursive: true });
      fs.writeFileSync(destino, archivo.contenido ?? '');
    }
    return base;
  }

  _state(proyectoId) {
    if (!this.runs.has(proyectoId)) this.runs.set(proyectoId, { estado: 'inactivo', log: [], version: null, error: '', proceso: null });
    return this.runs.get(proyectoId);
  }

  _push(state, chunk) {
    for (const line of String(chunk).split(/\r?\n/).filter((item) => item.trim())) state.log.push(line.slice(0, 500));
    if (state.log.length > MAX_LOG_LINES) state.log.splice(0, state.log.length - MAX_LOG_LINES);
  }

  async dockerDisponible() {
    const { error } = await this.docker(['version', '--format', '{{.Server.Version}}']);
    return !error;
  }

  /** Levanta (o vuelve a levantar) los contenedores del paquete. Es idempotente: recrea los que falten sin borrar datos. */
  async iniciar({ proyectoId, archivos, version = null }) {
    const state = this._state(proyectoId);
    if (['iniciando', 'deteniendo'].includes(state.estado)) throw new Error('Ya hay una operación en curso para este proyecto.');
    if (!(await this.dockerDisponible())) {
      Object.assign(state, { estado: 'error', error: 'Docker no está disponible en esta máquina. Instala Docker Desktop e inícialo antes de ejecutar el proyecto.' });
      throw new Error(state.error);
    }
    const base = this.materializar(proyectoId, archivos);
    Object.assign(state, { estado: 'iniciando', error: '', version, log: [] });
    this._launch(state, base, 'start');
    return this.estado(proyectoId);
  }

  async detener(proyectoId) {
    const state = this._state(proyectoId);
    const base = this.directorio(proyectoId);
    if (!fs.existsSync(path.join(base, 'tools/preview-local.cjs'))) throw new Error('Este proyecto no se ha ejecutado desde la herramienta.');
    if (state.estado === 'iniciando') throw new Error('Espera a que termine de iniciar.');
    Object.assign(state, { estado: 'deteniendo', error: '' });
    this._launch(state, base, 'stop');
    return this.estado(proyectoId);
  }

  _launch(state, base, action) {
    const child = this.spawnProcess(process.execPath, [path.join(base, 'tools/preview-local.cjs'), action], { cwd: base, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    state.proceso = child;
    const timer = setTimeout(() => child.kill(), START_TIMEOUT_MS);
    child.stdout?.on('data', (chunk) => this._push(state, chunk));
    child.stderr?.on('data', (chunk) => this._push(state, chunk));
    child.on('error', (error) => { clearTimeout(timer); Object.assign(state, { estado: 'error', error: error.message, proceso: null }); });
    child.on('close', (code) => {
      clearTimeout(timer);
      state.proceso = null;
      if (code === 0) { state.estado = action === 'start' ? 'activo' : 'inactivo'; state.error = ''; }
      else { state.estado = 'error'; state.error = state.log.slice(-3).join(' ') || `El proceso terminó con código ${code}.`; }
    });
  }

  /** Estado, accesos y contenedores (consulta a Docker en el momento, para detectar los detenidos o eliminados). */
  async estado(proyectoId) {
    const state = this._state(proyectoId);
    const base = this.directorio(proyectoId);
    const materializado = fs.existsSync(path.join(base, 'ops/docker-compose.yml'));
    const settings = parseEnv(materializado && fs.existsSync(path.join(base, 'ops/.env')) ? fs.readFileSync(path.join(base, 'ops/.env'), 'utf8') : '');
    const hasWeb = materializado && fs.existsSync(path.join(base, 'frontend/package.json'));
    const hasMobile = materializado && fs.existsSync(path.join(base, 'mobile/package.json'));
    const apiPort = settings.API_PORT || '3000';
    const webPort = settings.WEB_PORT || '8080';

    let contenedores = [];
    if (materializado && fs.existsSync(path.join(base, 'ops/.env')) && !['iniciando', 'deteniendo'].includes(state.estado)) {
      const { error, stdout } = await this.docker(['compose', '--env-file', path.join(base, 'ops/.env'), '-f', path.join(base, 'ops/docker-compose.yml'), 'ps', '-a', '--format', 'json'], { cwd: base });
      if (!error) {
        contenedores = stdout.split(/\r?\n/).filter(Boolean).map((line) => { try { return JSON.parse(line); } catch { return null; } }).filter(Boolean)
          .map((item) => ({ servicio: item.Service || item.Name, estado: item.State || 'desconocido', salud: item.Health || '' }));
      }
    }
    const enMarcha = contenedores.length > 0 && contenedores.every((item) => item.estado === 'running');
    // Si la herramienta cree que está activo pero algún contenedor ya no corre, se dice: es el caso de «volver a levantar».
    const efectivo = state.estado === 'activo' && !enMarcha ? 'detenido' : state.estado;

    return {
      estado: efectivo, version: state.version, error: state.error,
      requiere_levantar: materializado && !['iniciando', 'deteniendo', 'activo'].includes(efectivo),
      accesos: {
        web: hasWeb ? { url: `http://localhost:${webPort}`, disponible: efectivo === 'activo' } : null,
        movil: hasMobile ? { disponible: false, instrucciones: `Entra en la carpeta mobile del paquete, ejecuta «npm install» y «npx expo start». La app usa EXPO_PUBLIC_API_URL=http://TU_IP:${apiPort}.`, api: `http://localhost:${apiPort}` } : null,
        documentacion: materializado ? { url: `http://localhost:${apiPort}/api/docs`, disponible: efectivo === 'activo' } : null
      },
      credenciales_admin: efectivo === 'activo' && settings.ADMIN_PASSWORD ? { email: settings.ADMIN_EMAIL || 'admin@example.com', password: settings.ADMIN_PASSWORD } : null,
      contenedores,
      log: state.log.slice(-60),
      carpeta: materializado ? base : null
    };
  }
}

module.exports = LocalRunService;
