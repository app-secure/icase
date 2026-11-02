// Consulta pública de la ejecución del proyecto sintético, sin credenciales ni mutaciones remotas.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../verification-results/extended');
async function get(route) {
  const response = await fetch('https://api.github.com/repos/ManuelNKI/icase-test/' + route, { headers: { 'User-Agent': 'icase-test-audit', Accept: 'application/vnd.github+json' }, signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw new Error('GitHub respondió HTTP ' + response.status);
  return response.json();
}
(async () => {
  const runs = await get('actions/runs?branch=main&per_page=5');
  const revision = process.argv[2] || 'e30d7c2';
  if (!/^[a-f0-9]{7,40}$/.test(revision)) throw new Error('Revisión no válida');
  const run = runs.workflow_runs.find(r => r.head_sha.startsWith(revision));
  if (!run) { console.log('Ejecución aún no visible'); return; }
  const jobs = await get('actions/runs/' + run.id + '/jobs');
  const report = { consulta: new Date().toISOString(), repositorio: 'ManuelNKI/icase-test', id: run.id, url: run.html_url, commit: run.head_sha, estado: run.status, conclusion: run.conclusion, trabajos: jobs.jobs.map(j => ({ id: j.id, nombre: j.name, estado: j.status, conclusion: j.conclusion, url: j.html_url, pasos: j.steps.map(s => ({ nombre: s.name, estado: s.status, conclusion: s.conclusion })) })) };
  fs.mkdirSync(root, { recursive: true }); fs.writeFileSync(path.join(root, revision === 'e30d7c2' ? 'ci-github.json' : 'ci-' + revision + '.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
})().catch(error => { console.error(error.message); process.exitCode = 1; });
