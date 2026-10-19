const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const FrontendScaffoldGenerator = require('../src/infrastructure/services/FrontendScaffoldGenerator');

const names = ['Inicio de sesión', 'Vista de menú y disponibilidad', 'Formulario de reserva de mesa o silla',
  'Consulta de reservas activas', 'Listado de paquetes semanales prepagados', 'Detalle de saldo y puntos',
  'Formulario de toma de comanda', 'Pantalla KDS de comandas pendientes', 'Módulo de procesamiento de cobros'];

async function main() {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'icase-restaurant-frontend-'));
  try {
    const artifact = await new FrontendScaffoldGenerator().generar({ proyecto: { nombre: 'Restaurante' },
      insumos: { decisiones: { stack_tecnologico: { frontend: 'React + Vite' }, alcance_plataforma: { plataformas: ['web', 'móvil'] } },
        diseno: { manifiesto_navegacion: names.map((nombre, index) => ({ pantalla_id: String(index), nombre, slug: `pantalla-${index}`, ruta: `/pantalla-${index}` })), mockups: [] } }, versionesOrigen: {} });
    for (const file of artifact.archivos) {
      const target = path.join(temp, file.ruta);
      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.writeFile(target, file.contenido, 'utf8');
    }
    for (const directory of ['frontend', 'mobile']) {
      const cwd = path.join(temp, directory);
      execFileSync('npm', ['install', ...(process.env.ICASE_NPM_OFFLINE === '1' ? ['--offline'] : []), '--ignore-scripts', '--no-audit', '--no-fund'], { cwd, stdio: 'inherit', timeout: 300000, shell: process.platform === 'win32' });
      execFileSync('npm', ['run', directory === 'frontend' ? 'build' : 'export:android'], { cwd, stdio: 'inherit', timeout: 180000, shell: process.platform === 'win32', env: { ...process.env, EXPO_PUBLIC_API_URL: 'http://localhost:3000' } });
    }
    console.log('Plantillas genéricas React y Expo: compilación correcta.');
  } finally {
    await fs.rm(temp, { recursive: true, force: true });
  }
}

main().catch((error) => { console.error(error.message); process.exitCode = 1; });
