const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { configureBrowserCache } = require('./lib/playwright-runtime.cjs');

const cache = configureBrowserCache();
let cli;
try { cli = path.join(path.dirname(require.resolve('playwright/package.json')), 'cli.js'); }
catch { console.error('Falta Playwright. Ejecuta npm ci antes de instalar Chromium.'); process.exit(1); }
console.log(`[Navegador de pruebas] Caché: ${cache}`);
const result = spawnSync(process.execPath, [cli, 'install', 'chromium'], {
  stdio: 'inherit', windowsHide: true,
  env: { ...process.env, PLAYWRIGHT_DOWNLOAD_CONNECTION_TIMEOUT: process.env.PLAYWRIGHT_DOWNLOAD_CONNECTION_TIMEOUT || '120000' }
});
if (result.error) console.error('No se pudo iniciar la instalación del navegador de pruebas.');
process.exitCode = result.status ?? 1;
