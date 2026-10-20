// Verificación completa en contenedores aislados: backend + frontend + pruebas (incluido el navegador).
// Genera un proyecto de ejemplo con modelo de dominio, reglas de negocio y control de acceso, y lo ejecuta.
//
//   node scripts/verify-full-stack.js [Express|NestJS] [PostgreSQL|MySQL|MongoDB] [--mobile] [--no-auth] [--log archivo]
//
// --mobile   incluye la app Expo y compila su paquete Android
// --no-auth  genera la API sin autenticación
// --backend-only  verifica solo el backend (sin frontend ni navegador): mucho más rápido
// --log      guarda la salida completa de Docker (la del verificador se recorta a los últimos caracteres)
const fs = require('node:fs');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const BackendScaffoldGenerator = require('../src/infrastructure/services/BackendScaffoldGenerator');
const FrontendScaffoldGenerator = require('../src/infrastructure/services/FrontendScaffoldGenerator');
const TestSuiteGenerator = require('../src/infrastructure/services/TestSuiteGenerator');
const SandboxRuntimeVerifier = require('../src/infrastructure/services/SandboxRuntimeVerifier');

const run = promisify(execFile);
const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const logIndex = args.indexOf('--log');
const logFile = logIndex >= 0 ? args[logIndex + 1] : null;
const [backendName = 'Express', database = 'PostgreSQL'] = args.filter((item, index) => !item.startsWith('--') && (logIndex < 0 || index !== logIndex + 1));

const PLANTUML = `@startuml
enum EstadoReserva {
  PENDIENTE
  CONFIRMADA
  CANCELADA
}
class Cliente {
  +String id
  +String nombre
  +String email
  +boolean activo
}
class Reserva {
  +String id
  +String codigo
  +Date fechaInicio
  +Date fechaFin
  +int comensales
  +EstadoReserva estado
}
Cliente "1" --> "0..*" Reserva
@enduml`;

const requirements = [
  { aprobado: true, tipo: 'RF', identificador: 'RF-01', nombre: 'Gestionar clientes', descripcion: 'El sistema DEBE validar el correo electrónico del cliente.', actores: ['Cliente', 'Administrador'] },
  { aprobado: true, tipo: 'RF', identificador: 'RF-02', nombre: 'Registrar reservas', descripcion: 'El sistema DEBE aceptar reservas de 1 a 20 comensales.', actores: ['Mesero', 'Cliente'] },
  { aprobado: true, tipo: 'RF', identificador: 'RF-03', nombre: 'Consultar reportes globales', actores: ['Administrador'] }
];

const base = { entidad: 'Reserva', rf: ['RF-02'], origen: 'inferido', estado_decision: 'confirmado' };
const reglas = [
  { ...base, id: 'RN-01', tipo: 'requerido', campo: 'cliente_id', mensaje: 'Toda reserva debe tener un cliente.' },
  { ...base, id: 'RN-02', tipo: 'rango', campo: 'comensales', min: 1, max: 20, mensaje: 'Las reservas admiten de 1 a 20 comensales.' },
  { ...base, id: 'RN-03', tipo: 'comparacion', campo: 'fechaFin', operador: '>=', con_campo: 'fechaInicio', mensaje: 'La fecha de fin no puede ser anterior a la de inicio.' },
  { ...base, id: 'RN-04', tipo: 'maquina_estados', campo: 'estado', inicial: 'PENDIENTE', mensaje: 'Transición de estado no permitida.',
    transiciones: [{ de: 'PENDIENTE', a: 'CONFIRMADA' }, { de: 'PENDIENTE', a: 'CANCELADA' }, { de: 'CONFIRMADA', a: 'CANCELADA' }] },
  { ...base, id: 'RN-05', tipo: 'unico', campos: ['codigo'], mensaje: 'El código debe ser único.' },
  { ...base, id: 'RN-06', tipo: 'inmutable', campo: 'codigo', mensaje: 'El código no puede modificarse.' },
  { ...base, entidad: 'Cliente', rf: ['RF-01'], id: 'RN-07', tipo: 'formato', campo: 'email', formato: 'email', mensaje: 'El correo electrónico no es válido.' },
  { ...base, entidad: 'Cliente', rf: ['RF-01'], id: 'RN-08', tipo: 'valor_por_defecto', campo: 'activo', valor: true, mensaje: 'Los clientes nuevos están activos.' }
];

const controlAcceso = {
  autenticacion: { metodo: flag('--no-auth') ? 'ninguna' : 'jwt', expiracion: '1h' },
  roles: [{ id: 'mesero', nombre: 'Mesero', incluir: true, autoregistro: false }, { id: 'cliente', nombre: 'Cliente', incluir: true, autoregistro: true }],
  permisos: [
    { operacion: 'RF-01', rol: 'cliente', metodos: ['GET', 'POST'] },
    { operacion: 'RF-02', rol: 'mesero', metodos: ['GET', 'POST', 'PATCH', 'DELETE'] },
    { operacion: 'RF-02', rol: 'cliente', metodos: ['GET'] }
  ]
};

async function main() {
  const decisiones = {
    stack_tecnologico: { backend: backendName, base_datos: database, frontend: 'React + Vite' },
    reglas_negocio: { reglas },
    control_acceso: controlAcceso,
    ...(flag('--mobile') ? { alcance_plataforma: { plataformas: ['web', 'móvil'] } } : {})
  };
  const proyecto = { nombre: 'Reservas' };
  const backend = await new BackendScaffoldGenerator().generar({ proyecto, insumos: { decisiones, requerimientos: requirements, diagramaDominio: { codigo_plantuml: PLANTUML } }, versionesOrigen: {} });
  const backendOnly = flag('--backend-only');
  const screens = requirements.map((item, index) => ({ pantalla_id: `screen-${index}`, nombre: item.nombre, slug: `screen-${index}`, ruta: `/screen-${index}`, rf_trazabilidad: [item.identificador] }));
  const frontend = backendOnly ? null : await new FrontendScaffoldGenerator().generar({ proyecto, insumos: { decisiones, diseno: { manifiesto_navegacion: screens, mockups: [] } }, versionesOrigen: {} });
  const tests = backendOnly ? null : await new TestSuiteGenerator().generar({ proyecto, insumos: { requerimientos: requirements, backend: { ...backend, version: 1 }, frontend: { ...frontend, version: 1 } }, versionesOrigen: {} });

  const verifier = new SandboxRuntimeVerifier({
    run: async (command, commandArgs, options) => {
      try { return await run(command, commandArgs, { ...options, maxBuffer: 64 * 1024 * 1024 }); } catch (error) {
        if (logFile) fs.appendFileSync(logFile, `\n##### ${command} ${commandArgs.join(' ')}\n${error.stdout || ''}\n${error.stderr || ''}\n`);
        throw error;
      }
    }
  });
  const result = await verifier.verificar(backendOnly
    ? { tipo: 'codigo_backend', archivos: backend.archivos }
    : { tipo: 'pruebas', archivos: [...backend.archivos, ...frontend.archivos, ...tests.archivos] });

  console.log(`## ${backendName} + ${database}${flag('--mobile') ? ' + móvil' : ''}${flag('--no-auth') ? ' (sin autenticación)' : ''}${backendOnly ? ' [solo backend]' : ''}: ${result.estado}`);
  for (const step of result.pruebas) {
    console.log(`   - ${step.paso}: ${step.resultado}`);
    for (const line of String(step.salida || '').split('\n').filter((item) => /OpenAPI|Permisos|Autenticaci|Integridad/.test(item))) console.log(`       ${line.trim()}`);
  }
  if (result.errores.length) console.log(result.errores.join('\n').slice(-2500));
  process.exitCode = result.estado === 'apta' ? 0 : 1;
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
