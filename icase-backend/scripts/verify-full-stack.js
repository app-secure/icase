// Verificación completa en contenedores aislados: backend + frontend + pruebas (incluido el navegador).
// Genera un proyecto de ejemplo con modelo de dominio, reglas de negocio y control de acceso, y lo ejecuta.
//
//   node scripts/verify-full-stack.js [Express|NestJS] [PostgreSQL|MySQL|MongoDB] [--mobile] [--no-auth] [--log archivo]
//
// --mobile   incluye la app Expo y compila su paquete Android
// --no-auth  genera la API sin autenticación
// --backend-only  verifica solo el backend (sin frontend ni navegador): mucho más rápido
// --log      guarda la salida completa de Docker (la del verificador se recorta a los últimos caracteres)
// --spec     añade una especificación de aplicación (operaciones de negocio) y comprueba, además, las pruebas generadas
//            por operación y las pantallas construidas desde la spec
// --mobile-container  construye el contenedor móvil (Expo exportada como web) del paquete de infraestructura
// --sabotage archivo::buscar::reemplazar  altera el código generado para comprobar que la verificación lo detecta
//            (debe terminar en «fallida»; se puede repetir)
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
const valueOf = new Set(args.flatMap((item, index) => (['--log', '--sabotage'].includes(item) ? [index + 1] : [])));
const [backendName = 'Express', database = 'PostgreSQL'] = args.filter((item, index) => !item.startsWith('--') && !valueOf.has(index));

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
  +DateTime creadaEn
  +Time hora
  +int comensales
  +float anticipo
  +UUID referencia
  +List<String> etiquetas
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

// Especificación de ejemplo: operaciones de negocio con filtros, transición de estado y alta, y su pantalla.
const especificacion = {
  version: 1,
  operaciones: [
    { nombre: 'listarReservasPendientes', rf: 'RF-02', tipo: 'consulta', entidad: 'Reserva', estado_decision: 'confirmado', origen: 'ia', descripcion: 'Reservas por confirmar',
      filtros: [{ campo: 'estado', operador: '==', origen: 'constante', valor: 'PENDIENTE' }], entradas: [], salida: ['codigo', 'comensales', 'estado'] },
    { nombre: 'confirmarReserva', rf: 'RF-02', tipo: 'transicion', entidad: 'Reserva', estado_decision: 'confirmado', origen: 'ia', descripcion: 'Confirma una reserva pendiente',
      filtros: [], entradas: [], salida: [], transicion: { campo: 'estado', de: ['PENDIENTE'], a: 'CONFIRMADA' } },
    { nombre: 'registrarCliente', rf: 'RF-01', tipo: 'crear', entidad: 'Cliente', estado_decision: 'confirmado', origen: 'ia', descripcion: 'Alta de cliente',
      filtros: [], entradas: ['nombre', 'email'], salida: [] }
  ],
  pantallas: [
    { id: 'screen-1', componentes: [{ tipo: 'tarjetas', operacion: 'listarReservasPendientes', campos: ['codigo', 'comensales', 'estado'], acciones: [{ etiqueta: 'Confirmar', operacion: 'confirmarReserva' }] }] },
    { id: 'screen-0', componentes: [{ tipo: 'formulario', operacion: 'registrarCliente', campos: ['nombre', 'email'], acciones: [] }] }
  ]
};

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
    ...(flag('--spec') ? { especificacion_aplicacion: especificacion } : {}),
    ...(flag('--mobile') ? { alcance_plataforma: { plataformas: ['web', 'móvil'] } } : {})
  };
  const proyecto = { nombre: 'Reservas' };
  const backend = await new BackendScaffoldGenerator().generar({ proyecto, insumos: { decisiones, requerimientos: requirements, diagramaDominio: { codigo_plantuml: PLANTUML } }, versionesOrigen: {} });
  const backendOnly = flag('--backend-only');
  args.forEach((item, index) => {
    if (item !== '--sabotage') return;
    const [file, search, replacement] = String(args[index + 1]).split('::');
    const target = backend.archivos.find((candidate) => candidate.ruta.endsWith(file));
    if (!target || !target.contenido.includes(search)) throw new Error(`Sabotaje inaplicable: «${search}» no está en ${file}`);
    target.contenido = target.contenido.replace(search, replacement);
    console.log(`Sabotaje aplicado en ${target.ruta}`);
  });
  const screens = requirements.map((item, index) => ({ pantalla_id: `screen-${index}`, nombre: item.nombre, slug: `screen-${index}`, ruta: `/screen-${index}`, rf_trazabilidad: [item.identificador] }));
  // Con especificación, el frontend recibe las operaciones ya enlazadas a su almacén, igual que en la herramienta.
  const manifest = JSON.parse(backend.archivos.find((file) => file.ruta === 'backend/icase.manifest.json').contenido);
  const acciones = (manifest.operations || []).flatMap((operation) => operation.actions || []);
  const ApplicationSpecService = require('../src/infrastructure/services/ApplicationSpecService');
  const confirmada = flag('--spec') ? ApplicationSpecService.confirmada(especificacion) : null;
  if (flag('--spec') && !acciones.length) throw new Error('La especificación no produjo operaciones en el backend.');
  const frontend = backendOnly ? null : await new FrontendScaffoldGenerator().generar({ proyecto, insumos: { decisiones, diseno: { manifiesto_navegacion: screens, mockups: [] }, ...(confirmada ? { especificacion: confirmada, acciones } : {}) }, versionesOrigen: {} });
  if (frontend && flag('--spec')) {
    const page = frontend.archivos.find((file) => file.ruta === 'frontend/src/pages/screen-1.jsx')?.contenido || '';
    if (!page.includes('/api/actions/listar-reservas-pendientes')) throw new Error('La pantalla de la especificación no usa la operación de negocio.');
    console.log('Frontend: pantallas construidas desde la especificación.');
  }
  if (flag('--mobile-container-only')) { process.exitCode = (await buildMobileContainer(proyecto, decisiones, backend, frontend)) ? 0 : 1; return; }
  const tests = backendOnly ? null : await new TestSuiteGenerator().generar({ proyecto, insumos: { requerimientos: requirements, backend: { ...backend, version: 1 }, frontend: { ...frontend, version: 1 } }, versionesOrigen: {} });

  const verifier = new SandboxRuntimeVerifier({
    run: async (command, commandArgs, options) => {
      try { return await run(command, commandArgs, { ...options, maxBuffer: 64 * 1024 * 1024 }); } catch (error) {
        if (logFile) fs.appendFileSync(logFile, `\n##### ${command} ${commandArgs.join(' ')}\n${error.stdout || ''}\n${error.stderr || ''}\n`);
        // Si falla el arranque, el motivo está en los logs de los servicios, que se destruyen justo después.
        if (commandArgs.includes('up')) {
          try {
            const logs = await run(command, [...commandArgs.slice(0, commandArgs.indexOf('up')), 'logs', '--no-color', '--tail', '60', 'backend'], { ...options, maxBuffer: 8 * 1024 * 1024 });
            const causes = `${logs.stdout}${logs.stderr}`.split('\n').filter((line) => /Caused by|ERROR|Exception:|FAILED|Error:|APPLICATION/.test(line)).slice(-12);
            console.log(`\n--- logs del backend (causas; el detalle completo va a --log) ---\n${(causes.length ? causes : `${logs.stdout}${logs.stderr}`.split('\n').slice(-15)).join('\n')}`);
            if (logFile) fs.appendFileSync(logFile, `\n##### logs del backend\n${logs.stdout}${logs.stderr}\n`);
          } catch { /* sin logs que mostrar */ }
        }
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
    for (const line of String(step.salida || '').split('\n').filter((item) => /OpenAPI|Permisos|Autenticaci|Integridad|Operación de negocio/.test(item))) console.log(`       ${line.trim()}`);
  }
  if (result.errores.length) console.log(result.errores.join('\n').slice(-2500));
  let mobileOk = true;
  if (flag('--mobile-container')) mobileOk = await buildMobileContainer(proyecto, decisiones, backend, frontend);
  process.exitCode = result.estado === 'apta' && mobileOk ? 0 : 1;
}

/** Construye de verdad la imagen del contenedor móvil: escribe el paquete en una carpeta temporal y ejecuta docker compose build. */
async function buildMobileContainer(proyecto, decisiones, backend, frontend) {
  const os = require('node:os');
  const path = require('node:path');
  const InfrastructureGenerator = require('../src/infrastructure/services/InfrastructureGenerator');
  if (!frontend?.archivos.some((file) => file.ruta === 'mobile/package.json')) { console.log('   - Contenedor móvil: omitido (usa --mobile y no --backend-only).'); return true; }
  const infra = await new InfrastructureGenerator().generar({ proyecto, versionesOrigen: {}, insumos: { decisiones, requerimientos: requirements, diagramas: [], backend: { ...backend, version: 1 }, frontend: { ...frontend, version: 1 } } });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'icase-mobile-build-'));
  try {
    for (const file of [...backend.archivos, ...frontend.archivos, ...infra.archivos]) {
      const target = path.join(dir, file.ruta);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, file.contenido);
    }
    fs.writeFileSync(path.join(dir, 'ops/.env'), `${fs.readFileSync(path.join(dir, 'ops/.env.example'), 'utf8')}\n`);
    const compose = ['compose', '--env-file', path.join(dir, 'ops/.env'), '-p', `icasemobile${Date.now().toString(36)}`, '-f', path.join(dir, 'ops/docker-compose.yml'), '-f', path.join(dir, 'ops/docker-compose.mobile.yml')];
    await run('docker', [...compose, 'config', '--quiet'], { cwd: dir });
    console.log('   - Contenedor móvil: docker-compose.mobile.yml es válido.');
    await run('docker', [...compose, 'build', '--progress=plain', 'mobile'], { cwd: dir, maxBuffer: 64 * 1024 * 1024, timeout: 20 * 60 * 1000 });
    console.log('   - Contenedor móvil: la imagen (Expo exportada como web) se construyó.');
    // Se levanta de verdad: base de datos, backend y contenedor móvil; se comprueba la página y el CORS hacia la API.
    const settings = fs.readFileSync(path.join(dir, 'ops/.env'), 'utf8')
      .replace(/^API_PORT=.*$/m, 'API_PORT=3987').replace(/^WEB_PORT=.*$/m, 'WEB_PORT=8986').replace(/^MOBILE_PORT=.*$/m, 'MOBILE_PORT=8987')
      .replace(/^JWT_SECRET=.*$/m, 'JWT_SECRET=' + 'x'.repeat(48)).replace(/^ADMIN_PASSWORD=.*$/m, 'ADMIN_PASSWORD=verificacion-local-1').replace(/^DB_PASSWORD=.*$/m, 'DB_PASSWORD=verificacion-db-1').replace(/^DB_ROOT_PASSWORD=.*$/m, 'DB_ROOT_PASSWORD=verificacion-db-1');
    fs.writeFileSync(path.join(dir, 'ops/.env'), settings);
    try {
      await run('docker', [...compose, 'up', '-d', '--wait', 'database', 'backend', 'mobile'], { cwd: dir, maxBuffer: 64 * 1024 * 1024, timeout: 10 * 60 * 1000 });
      const page = await fetch('http://localhost:8987/');
      const html = await page.text();
      if (!page.ok || !/<div id="root"|<script/.test(html)) throw new Error('La página móvil no responde con la aplicación exportada (HTTP ' + page.status + ').');
      console.log('   - Contenedor móvil: sirve la aplicación en http://localhost:8987');
      const cors = await fetch('http://localhost:3987/health', { headers: { Origin: 'http://localhost:8987' } });
      if (cors.headers.get('access-control-allow-origin') !== 'http://localhost:8987') throw new Error('El backend no permite el origen del contenedor móvil (CORS).');
      console.log('   - Contenedor móvil: el backend permite su origen (CORS).');
    } finally {
      await run('docker', [...compose, 'down', '-v', '--remove-orphans'], { cwd: dir, timeout: 5 * 60 * 1000 }).catch(() => undefined);
    }
    return true;
  } catch (error) {
    console.log(`   - Contenedor móvil: FALLÓ\n${String(`${error.stdout || ''}${error.stderr || ''}` || error.message).slice(-3500)}`);
    return false;
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
