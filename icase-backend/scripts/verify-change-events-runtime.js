// Generación y ejecución aislada; no usa la base ni las claves de la plataforma.
const { promisify } = require('node:util');
const { execFile } = require('node:child_process');
const fs = require('node:fs/promises');
const path = require('node:path');
const Backend = require('../src/infrastructure/services/BackendScaffoldGenerator');
const Frontend = require('../src/infrastructure/services/FrontendScaffoldGenerator');
const Tests = require('../src/infrastructure/services/TestSuiteGenerator');
const Infrastructure = require('../src/infrastructure/services/InfrastructureGenerator');
const Sandbox = require('../src/infrastructure/services/SandboxRuntimeVerifier');

async function main() {
  const backend = process.argv[2] || 'Express';
  const proyecto = { nombre: 'Biblioteca canal de cambios' };
  const requerimientos = [{ identificador: 'RF-01', tipo: 'RF', aprobado: true, nombre: 'Gestionar libros' }];
  const decisiones = {
    stack_tecnologico: { backend, base_datos: 'PostgreSQL' },
    alcance_plataforma: { plataformas: ['web', 'android'] },
    modulos: { modo: 'personalizado', modulos: [{ id: 'eventos_cambios', activo: true }] },
    control_acceso: { autenticacion: { metodo: 'jwt', expiracion: '1h' }, roles: [{ nombre: 'Editor', incluir: true }], permisos: [{ operacion: 'RF-01', rol: 'editor', metodos: ['GET', 'POST', 'PATCH', 'DELETE'] }] }
  };
  const base = { proyecto, versionesOrigen: {} };
  const generated = await new Backend().generar({ ...base, insumos: { decisiones, requerimientos, diagramaDominio: { codigo_plantuml: '@startuml\nclass Libro {\n String titulo\n}\n@enduml' } } });
  const frontend = await new Frontend().generar({ ...base, insumos: { decisiones, diseno: { manifiesto_navegacion: [{ pantalla_id: 'libros', nombre: 'Libros', ruta: '/libros', rf_trazabilidad: ['RF-01'] }], mockups: [] } } });
  const common = { decisiones, requerimientos, backend: { ...generated, version: 1 }, frontend: { ...frontend, version: 1 } };
  const tests = await new Tests().generar({ ...base, insumos: common });
  if (!tests.archivos.some(file => file.ruta.endsWith('change-events.spec.js'))) throw new Error('Falta prueba generada del canal de cambios');
  const infrastructure = await new Infrastructure().generar({ ...base, insumos: { ...common, diagramas: [] } });
  const artifact = { tipo: 'paquete_entrega', archivos: [...generated.archivos, ...frontend.archivos, ...tests.archivos, ...infrastructure.archivos] };
  const runFile = promisify(execFile);
  const result = await new Sandbox({ run: async (command, args, options) => {
    console.log('[Docker]', args.join(' '));
    return runFile(command, args, options);
  } }).verificar(artifact);
  const directory = path.resolve(__dirname, '../verification-results/change-events');
  await fs.mkdir(directory, { recursive: true });
  const report = path.join(directory, backend + '-' + Date.now() + '.json');
  await fs.writeFile(report, JSON.stringify({ backend, fecha: new Date().toISOString(), ...result }, null, 2));
  console.log(JSON.stringify({ estado: result.estado, errores: result.errores, informe: report, pruebas: result.pruebas.map(({ paso, resultado }) => ({ paso, resultado })) }, null, 2));
  if (result.estado !== 'apta') process.exitCode = 1;
}
main().catch(error => { console.error(error); process.exitCode = 1; });
