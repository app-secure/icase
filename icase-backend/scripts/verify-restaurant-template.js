const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const BackendScaffoldGenerator = require('../src/infrastructure/services/BackendScaffoldGenerator');

const names = [
  'Consulta de menú y disponibilidad', 'Reserva de mesas y sillas', 'Compra de paquetes semanales prepagados',
  'Acumulación de puntos por compras', 'Gestión de mesas asignadas para meseros', 'Toma de pedidos en sala',
  'Validación de reserva mediante código QR', 'Visualización de comandas en cocina KDS',
  'Actualización de disponibilidad de platos desde cocina', 'Procesamiento de cobros y cierre de caja',
  'Gestión de reportes globales y precios del menú', 'Control de acceso basado en roles y autenticación JWT'
];

async function main() {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'icase-restaurant-compile-'));
  try {
    const artifact = await new BackendScaffoldGenerator().generar({ proyecto: { nombre: 'Restaurante' },
      insumos: { decisiones: { stack_tecnologico: { backend: 'NestJS', base_datos: 'PostgreSQL' } },
        requerimientos: names.map((nombre, index) => ({ aprobado: true, tipo: 'RF', nombre, identificador: `RF-${index + 1}` })) }, versionesOrigen: {} });
    for (const file of artifact.archivos) {
      const target = path.join(temp, file.ruta);
      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.writeFile(target, file.contenido, 'utf8');
    }
    const cwd = path.join(temp, 'backend');
    execFileSync('npm', ['install', ...(process.env.ICASE_NPM_OFFLINE === '1' ? ['--offline'] : []), '--ignore-scripts', '--no-audit', '--no-fund'], { cwd, stdio: 'inherit', timeout: 180000, shell: process.platform === 'win32' });
    execFileSync('npm', ['run', 'build'], { cwd, stdio: 'inherit', timeout: 60000, shell: process.platform === 'win32' });
    console.log('Plantilla genérica NestJS: compilación correcta.');
  } finally {
    await fs.rm(temp, { recursive: true, force: true });
  }
}

main().catch((error) => { console.error(error.message); process.exitCode = 1; });
