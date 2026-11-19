// Credenciales solo en memoria: no se imprimen ni se guardan.
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '../verification-results/extended');
(async () => {
  const revision = process.argv[2];
  if (revision && !/^[a-f0-9]{7,40}$/.test(revision)) throw new Error('Revisión no válida');
  const ci = JSON.parse(fs.readFileSync(path.join(root, revision ? 'ci-' + revision + '.json' : 'ci-github.json'), 'utf8'));
  const job = ci.trabajos.find(j => j.conclusion === 'failure');
  if (!job) throw new Error('No hay trabajo fallido para diagnosticar');
  const credential = execFileSync('git', ['credential', 'fill'], { input: 'protocol=https\nhost=github.com\nusername=ManuelNKI\n\n', encoding: 'utf8', env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'Never' }, stdio: ['pipe', 'pipe', 'ignore'] });
  const token = credential.split(/\r?\n/).find(line => line.startsWith('password='))?.slice(9);
  if (!token) throw new Error('No hay credencial para leer el diagnóstico');
  const response = await fetch('https://api.github.com/repos/ManuelNKI/icase-test/actions/jobs/' + job.id + '/logs', { headers: { 'User-Agent': 'icase-test-audit', Authorization: 'Bearer ' + token }, signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error('No se pudieron consultar los logs: HTTP ' + response.status);
  const text = (await response.text()).split(token).join('[REDACTADO]');
  fs.writeFileSync(path.join(root, revision ? 'ci-' + revision + '-failure.log' : 'ci-failure.log'), text);
  const audit = text.indexOf('Audit Node dependencies');
  const relevant = text.slice(audit >= 0 ? audit : -12000).split(/\r?\n/).filter(line => /Severity:|vulnerabilit|GHSA-|node_modules\/|fix available|npm error|code 1/i.test(line));
  console.log((relevant.length ? relevant.slice(-45).join('\n') : text.slice(-16000)));
})().catch(error => { console.error(error.message); process.exitCode = 1; });
