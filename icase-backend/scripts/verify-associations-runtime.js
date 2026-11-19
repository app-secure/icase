// Genera y verifica N:M contra motores reales, sin usar datos ni credenciales de I-CASE.
// node scripts/verify-associations-runtime.js Express PostgreSQL [--full] [--no-auth]
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const Backend = require('../src/infrastructure/services/BackendScaffoldGenerator');
const Frontend = require('../src/infrastructure/services/FrontendScaffoldGenerator');
const Tests = require('../src/infrastructure/services/TestSuiteGenerator');
const Sandbox = require('../src/infrastructure/services/SandboxRuntimeVerifier');
const Infrastructure = require('../src/infrastructure/services/InfrastructureGenerator');
const runFile = promisify(execFile);

async function main() {
  const args = process.argv.slice(2);
  const [backend = 'Express', database = 'PostgreSQL'] = args.filter((arg) => !arg.startsWith('--'));
  const exported = args.includes('--exported');
  const full = args.includes('--full') || exported;
  const auth = !args.includes('--no-auth');
  const requirements = ['Gestionar autores', 'Gestionar libros'].map((nombre, i) => ({ identificador: `RF-0${i + 1}`, tipo: 'RF', aprobado: true, nombre }));
  const decisiones = { stack_tecnologico: { backend, base_datos: database }, ...(auth ? { control_acceso: {
    autenticacion: { metodo: 'jwt', expiracion: '1h' }, roles: [{ nombre: 'Lector', incluir: true }, { nombre: 'Editor', incluir: true }],
    permisos: requirements.flatMap((rf) => [{ operacion: rf.identificador, rol: 'lector', metodos: ['GET'] }, { operacion: rf.identificador, rol: 'editor', metodos: ['GET', 'POST', 'PATCH', 'DELETE'] }])
  } } : {}) };
  const proyecto = { nombre: 'Biblioteca N:M de verificación' };
  const generated = await new Backend().generar({ proyecto, versionesOrigen: {}, insumos: { decisiones, requerimientos: requirements, diagramaDominio: { codigo_plantuml: '@startuml\nclass Autor {\n  String nombre\n}\nclass Libro {\n  String titulo\n}\nAutor "*" -- "*" Libro : publicaciones\n@enduml' } } });
  let artifact = { tipo: 'codigo_backend', archivos: generated.archivos };
  if (full) {
    const screens = requirements.map((rf, i) => ({ pantalla_id: `screen-${i}`, nombre: rf.nombre, slug: `screen-${i}`, ruta: `/screen-${i}`, rf_trazabilidad: [rf.identificador] }));
    const frontend = await new Frontend().generar({ proyecto, versionesOrigen: {}, insumos: { decisiones, diseno: { manifiesto_navegacion: screens, mockups: [] } } });
    const tests = await new Tests().generar({ proyecto, versionesOrigen: {}, insumos: { requerimientos: requirements, backend: { ...generated, version: 1 }, frontend: { ...frontend, version: 1 } } });
    artifact = { tipo: 'pruebas', archivos: [...generated.archivos, ...frontend.archivos, ...tests.archivos] };
    if (exported) {
      const infrastructure = await new Infrastructure().generar({ proyecto, versionesOrigen: {}, insumos: { decisiones, requerimientos: requirements, diagramas: [], backend: { ...generated, version: 1 }, frontend: { ...frontend, version: 1 } } });
      artifact = { tipo: 'paquete_entrega', archivos: [...artifact.archivos, ...infrastructure.archivos] };
    }
  }
  const run = async (command, argv, options) => {
    const label = argv.join(' ');
    console.log('[Docker] ' + label);
    try {
      const result = await runFile(command, argv, options);
      console.log('[OK] ' + label);
      return result;
    } catch (error) {
      if (argv[0] === 'image' && argv[1] === 'rm') console.log('[Limpieza] Imagen temporal ya ausente.');
      else {
        console.error('[FALLO] ' + label);
        const diagnostic = `${error.stdout || ''}\n${error.stderr || ''}`;
        console.error(diagnostic.split(/\r?\n/).filter((line) => /error TS|error:|failed to solve|ERROR|npm error|Caused by/i.test(line)).slice(0, 35).join('\n'));
      }
      throw error;
    }
  };
  const result = await new Sandbox({ run }).verificar(artifact);
  const evidence = { backend, database, auth, full, exported, fecha_utc: new Date().toISOString(), huella_archivos: crypto.createHash('sha256').update(JSON.stringify(artifact.archivos)).digest('hex'), ...result };
  const directory = path.resolve(__dirname, '../verification-results/nm');
  await fs.mkdir(directory, { recursive: true });
  const label = [backend, database, exported ? 'exported' : full ? 'full' : 'backend', auth ? 'auth' : 'open'].join('-').replace(/[^a-z0-9-]/gi, '_');
  const report = path.join(directory, label + '-' + Date.now() + '.json');
  await fs.writeFile(report, JSON.stringify(evidence, null, 2));
  console.log(JSON.stringify(args.includes('--verbose') ? evidence : { backend, database, auth, full, exported, estado: result.estado, protocolo: result.protocolo, protocolo_despliegue: result.protocolo_despliegue, protocolo_dependencias: result.protocolo_dependencias, pruebas: result.pruebas.map(({ paso, resultado }) => ({ paso, resultado })), errores: result.errores, informe: report }, null, 2));
  if (result.estado !== 'apta') process.exitCode = 1;
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
