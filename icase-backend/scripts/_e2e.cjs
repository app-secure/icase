// Conductor de pruebas de punta a punta por API. Uso: node scripts/_e2e.cjs <comando> [args]
// Guarda su estado (token, proyecto) en E2E_STATE (por defecto ./.e2e-state.json). Nunca imprime el token.
const fs = require('node:fs');
const path = require('node:path');
const BASE = process.env.E2E_BASE || 'http://localhost:5000';
const STATE_FILE = process.env.E2E_STATE || path.join(process.cwd(), '.e2e-state.json');
const state = fs.existsSync(STATE_FILE) ? JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')) : {};
const save = () => fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function call(method, url, body, { raw = false } = {}) {
  const res = await fetch(BASE + url, {
    method,
    headers: { 'Content-Type': 'application/json', ...(state.token ? { Authorization: `Bearer ${state.token}` } : {}) },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {})
  });
  if (raw) return res;
  const text = await res.text();
  let data; try { data = JSON.parse(text); } catch { data = text; }
  if (!res.ok) { const e = new Error(`${method} ${url} -> ${res.status}: ${typeof data === 'string' ? data.slice(0, 300) : JSON.stringify(data).slice(0, 600)}`); e.status = res.status; e.data = data; throw e; }
  return data;
}

async function poll(fn, { every = 4000, max = 900000, label = '' } = {}) {
  const start = Date.now();
  for (;;) {
    const r = await fn();
    if (r.done) return r.value;
    if (Date.now() - start > max) throw new Error(`Tiempo agotado esperando ${label}`);
    await sleep(every);
  }
}

async function waitJob(id) {
  const t0 = Date.now();
  const job = await poll(async () => {
    const j = await call('GET', `/proyectos/trabajos-requisitos/${id}`);
    process.stdout.write(`
  trabajo ${j.estado} ${j.progreso ?? ''} ${(j.mensaje || '').slice(0, 70)}        `);
    return ['completado', 'fallido', 'cancelado', 'interrumpido', 'esperando_proveedor'].includes(j.estado) ? { done: true, value: j } : { done: false };
  }, { label: 'trabajo de requisitos' });
  console.log(`
  -> ${job.estado} en ${Math.round((Date.now() - t0) / 1000)} s`, job.error || '');
  if (job.estado !== 'completado') throw new Error('El trabajo no completó: ' + (job.mensaje || job.estado));
  return job;
}

const commands = {
  async auth() {
    const correo = state.correo || `e2e-${Date.now()}@example.test`;
    const password = state.password || `E2e-${Math.random().toString(36).slice(2)}Aa1!`;
    if (!state.token) {
      try {
        await call('POST', '/auth/registro', { nombre: 'Prueba', apellido: 'Automatica', correo, celular: '0999999999', password });
      } catch (e) { console.log('registro:', e.message.slice(0, 200)); }
      const login = await call('POST', '/auth/login', { correo, password });
      state.token = login.token || login.accessToken || login.access_token;
      state.correo = correo; state.password = password;
      save();
    }
    console.log('sesión lista', Boolean(state.token));
  },
  async proyecto(insumoFile, nombre = 'Ventas simple E2E') {
    const insumo = fs.readFileSync(insumoFile, 'utf8');
    const p = await call('POST', '/proyectos', { nombre, descripcion: '', insumo_bruto: insumo });
    state.proyecto = p.id || p._id; state.insumo = insumo; save();
    console.log('proyecto', state.proyecto, 'flujo', p.version_flujo_analisis);
  },
  async analisis() {
    const job = await call('POST', `/proyectos/${state.proyecto}/trabajos-requisitos`, { operacion: 'analisis_inicial', regenerar: process.argv.includes('--regenerar') });
    await waitJob(job.id || job._id);
  },
  async 'aprobar-analisis'() {
    const a = await call('GET', `/proyectos/${state.proyecto}/analisis-inicial`);
    const r = await call('POST', `/proyectos/${state.proyecto}/analisis-inicial/aprobar`, { version_esperada: a.borrador?.id, aceptar_advertencias: true });
    console.log('aprobado', Boolean(r.aprobado), 'trabajo', r.trabajo?.id, r.mensaje || '');
    if (r.trabajo) await waitJob(r.trabajo.id);
  },
  async resumen() {
    const a = await call('GET', `/proyectos/${state.proyecto}/analisis-inicial`);
    const c = (a.borrador || a.aprobado)?.contenido || {};
    const por = {};
    for (const n of c.inventario || []) por[n.tipo] = (por[n.tipo] || 0) + 1;
    console.log('versión', (a.borrador || a.aprobado)?.version, JSON.stringify(por));
    console.log('actores', (c.actores || []).map((x) => x.nombre).join(', '));
    for (const n of (c.inventario || []).filter((x) => ['RF', 'RNF'].includes(x.tipo))) console.log(n.id, n.tipo, n.objetivo_id, (n.reglas_ids || []).join('+'), '|', n.necesidad.slice(0, 110));
    console.log('revisión', c.revision_inventario?.estado, (c.revision_inventario?.causas || []).join(' | ').slice(0, 300));
    console.log('métricas', JSON.stringify((c.auditoria_requisitos?.metricas_ejecucion?.etapas || []).map((e) => `${e.etapa}:${Math.round(e.duracion_ms / 1000)}s`)));
  },
  async fase(fase, tipo) {
    const r = await call('POST', `/proyectos/${state.proyecto}/aprobar-fase`, { fase, aprobar_todos: true, ...(tipo ? { tipo_diagrama: tipo } : {}) });
    console.log('fase', fase, tipo || '', '->', r.estado_fase || r.mensaje || 'ok');
  },
  async diagrama(tipo) {
    const job = await call('POST', `/proyectos/${state.proyecto}/trabajos-diagramas`, { tipo_diagrama: tipo, insumo_bruto: state.insumo });
    const id = job.trabajo?.id || job.id || job._id;
    const t0 = Date.now();
    const done = await poll(async () => {
      const r = await call('GET', `/proyectos/trabajos-diagramas/${id}`);
      const j = r.trabajo || r;
      process.stdout.write(`  ${tipo} ${j.estado} ${(j.mensaje || '').slice(0, 60)}  `);
      return ['completado', 'fallido', 'cancelado'].includes(j.estado) ? { done: true, value: j } : { done: false };
    }, { label: 'diagrama ' + tipo });
    console.log(`
  -> ${done.estado} en ${Math.round((Date.now() - t0) / 1000)} s`, done.error || '');
    if (done.estado !== 'completado') throw new Error(done.error || done.mensaje || 'diagrama fallido');
  },
  async diagramas(...tipos) {
    const todos = tipos.length ? tipos : ['casos_de_uso', 'clases_dominio', 'arquitectura_software', 'arquitectura_sistema', 'clases_diseno', 'arbol_navegacion'];
    for (const tipo of todos) { await commands.diagrama(tipo); await commands.fase('diagrama', tipo); }
  },
  async requisitos() {
    const list = await call('GET', `/requerimientos/proyecto/${state.proyecto}`).catch(() => null);
    const p = await call('GET', `/proyectos/${state.proyecto}`);
    const reqs = p.requerimientos || list || [];
    console.log(JSON.stringify(reqs.map((r) => ({ id: r.identificador, tipo: r.tipo, nombre: r.nombre, actores: r.actores, aprobado: r.aprobado, desc: String(r.descripcion || '').slice(0, 140) })), null, 1));
  },
  async raw(method, url, body) {
    const data = await call(method, url, body ? JSON.parse(body) : undefined);
    console.log(JSON.stringify(data, null, 2).slice(0, 4000));
  }
};

(async () => {
  const [cmd, ...args] = process.argv.slice(2);
  if (!commands[cmd]) { console.log('Comandos:', Object.keys(commands).join(', ')); process.exit(1); }
  try { await commands[cmd](...args); } catch (e) { console.error('ERROR', e.message); process.exit(1); }
})();
module.exports = { call, poll, state, save, sleep };
