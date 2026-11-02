const fs = require('node:fs');
const { execFileSync } = require('node:child_process');
const work = '/tmp/icase-mobile'; fs.mkdirSync(work, { recursive: true });
for (const file of ['package.json', 'package-lock.json', 'App.js', 'app.json']) fs.copyFileSync('/candidate/' + file, work + '/' + file);
const report = { inicio: new Date().toISOString(), estado: 'en_ejecucion' };
try {
  console.log('Instalando candidata en almacenamiento interno del contenedor');
  const install = execFileSync('npm', ['ci', '--ignore-scripts', '--no-audit', '--no-fund'], { cwd: work, encoding: 'utf8', maxBuffer: 10000000 });
  fs.writeFileSync('/results/mobile-install.log', install);
  const bundle = execFileSync('npm', ['run', 'export:android'], { cwd: work, encoding: 'utf8', maxBuffer: 10000000 });
  fs.writeFileSync('/results/mobile-bundle.log', bundle); report.estado = 'apta'; console.log(bundle.slice(-1500));
} catch (error) {
  report.estado = 'fallida'; report.error = String(error.stderr || error.message).slice(-4000); process.exitCode = 1;
} finally { report.fin = new Date().toISOString(); fs.writeFileSync('/results/mobile-bundle.json', JSON.stringify(report, null, 2)); }
