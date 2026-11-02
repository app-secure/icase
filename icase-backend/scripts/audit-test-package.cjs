const fs = require('node:fs');
const { execFileSync } = require('node:child_process');
execFileSync('npm', ['install', '--package-lock-only', '--ignore-scripts', '--no-audit', '--no-fund', '--silent'], { stdio: 'pipe' });
let output;
try { output = execFileSync('npm', ['audit', '--json'], { encoding: 'utf8' }); }
catch (error) { output = String(error.stdout || ''); }
const report = JSON.parse(output);
fs.writeFileSync('audit.json', JSON.stringify(report, null, 2));
console.log(JSON.stringify({ vulnerabilidades: report.metadata?.vulnerabilities, detalles: Object.values(report.vulnerabilities || {}).filter(v => ['high', 'critical'].includes(v.severity)).map(v => ({ nombre: v.name, rango: v.range, via: v.via, arreglo: v.fixAvailable })) }));
