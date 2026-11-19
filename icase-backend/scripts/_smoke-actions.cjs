// Ejecuta contra una aplicación generada en marcha las mismas comprobaciones de la verificación aislada (operaciones, acciones, propiedad).
const samplePayload = require('../src/infrastructure/services/SamplePayload');
const base = process.argv[2] || 'http://localhost:3300';

(async () => {
  const [email, password] = [process.env.ADMIN_EMAIL || 'admin@example.com', process.env.ADMIN_PASSWORD || 'Admin-Prueba-2026'];
  const login = await (await fetch(base + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) })).json();
  const token = login.token;
  const contract = await (await fetch(base + '/api/contract', { headers: { Authorization: 'Bearer ' + token } })).json();
  const source = samplePayload.runtimeSource();
  const run = new Function('fetch', 'base', 'token', 'contract', `${source}
    return (async () => {
      const api = makeApi(base, token);
      const results = [];
      for (const operation of contract.operations) {
        try { await exerciseOperation(api, contract.operations, operation); results.push(['ok', 'operación ' + operation.key]); }
        catch (error) { results.push(['FALLA', 'operación ' + operation.key + ': ' + error.message.slice(0, 220)]); }
        for (const action of operation.actions || []) {
          try { await exerciseAction(api, contract.operations, action); results.push(['ok', 'acción ' + action.name]); }
          catch (error) { results.push(['FALLA', 'acción ' + action.name + ': ' + error.message.slice(0, 260)]); }
        }
      }
      return results;
    })();`);
  const results = await run(fetch, base, token, contract);
  for (const [status, text] of results) console.log(status === 'ok' ? '  ok   ' : 'FALLA  ', text);
  console.log(results.filter((item) => item[0] !== 'ok').length ? 'HAY FALLAS' : 'TODO OK');
})();
