const express = require('express');
const http = require('node:http');
const configure = require('../src/infrastructure/templates/auth/http-security');
const Generator = require('../src/infrastructure/services/GenericBackendGenerator');

describe('seguridad HTTP de las aplicaciones Node generadas', () => {
  let server;
  afterEach(async () => { if (server) { await new Promise((r) => server.close(r)); server = null; } });
  async function start(env = {}) {
    const app = express(); configure(app, env);
    app.get('/health', (_req, res) => res.json({ status: 'ok' }));
    app.get('/api/data', (_req, res) => res.json([]));
    app.post('/api/auth/login', (_req, res) => res.json({ ok: true }));
    server = http.createServer(app);
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    return `http://127.0.0.1:${server.address().port}`;
  }
  test('cabeceras defensivas y CORS restringido', async () => {
    const base = await start({ NODE_ENV: 'production', CORS_ORIGINS: 'https://app.example.test' });
    const allowed = await fetch(base + '/api/data', { headers: { Origin: 'https://app.example.test' } });
    expect(allowed.headers.get('x-powered-by')).toBeNull();
    expect(allowed.headers.get('x-content-type-options')).toBe('nosniff');
    expect(allowed.headers.get('strict-transport-security')).toBeTruthy();
    expect(allowed.headers.get('access-control-allow-origin')).toBe('https://app.example.test');
    const denied = await fetch(base + '/api/data', { headers: { Origin: 'https://intruso.test' } });
    expect(denied.headers.get('access-control-allow-origin')).toBeNull();
  });
  test('límite general devuelve 429 y Retry-After sin bloquear health', async () => {
    const base = await start({ HTTP_RATE_MAX: '1' });
    expect((await fetch(base + '/api/data')).status).toBe(200);
    const limited = await fetch(base + '/api/data');
    expect(limited.status).toBe(429);
    expect(Number(limited.headers.get('retry-after'))).toBeGreaterThan(0);
    expect((await fetch(base + '/health')).status).toBe(200);
  });
  test('login tiene un límite adicional independiente del CRUD', async () => {
    const base = await start({ AUTH_RATE_MAX: '1' });
    expect((await fetch(base + '/api/auth/login', { method: 'POST' })).status).toBe(200);
    expect((await fetch(base + '/api/auth/login', { method: 'POST' })).status).toBe(429);
    expect((await fetch(base + '/api/data')).status).toBe(200);
  });
  test('producción no acepta orígenes externos por defecto', async () => {
    const base = await start({ NODE_ENV: 'production' });
    const response = await fetch(base + '/api/data', { headers: { Origin: 'http://localhost:5173' } });
    expect(response.headers.get('access-control-allow-origin')).toBeNull();
  });
  test.each([{ HTTP_RATE_MAX: '-1' }, { HTTP_RATE_MAX: '0' }, { TRUST_PROXY_HOPS: 'true' }, { CORS_ORIGINS: '*' }])('rechaza configuración insegura %j', (env) => {
    expect(() => configure(express(), env)).toThrow();
  });
  test.each(['Express', 'NestJS'])('genera controles y dependencias para %s', (backend) => {
    const files = new Generator().generate({ proyecto: { nombre: 'Proyecto genérico' }, requirements: [], stack: { backend, base_datos: 'PostgreSQL' } });
    const pkg = JSON.parse(files.find((f) => f.ruta === 'backend/package.json').contenido);
    expect(pkg.dependencies.helmet).toBeTruthy();
    expect(pkg.dependencies['express-rate-limit']).toBeTruthy();
    if (backend === 'NestJS') expect(pkg.devDependencies['@types/express']).toBe('^5.0.0');
    expect(files.some((f) => f.ruta === 'backend/src/security/http-security.js')).toBe(true);
    const entry = files.find((f) => f.ruta === (backend === 'Express' ? 'backend/src/app.js' : 'backend/src/main.ts'));
    expect(entry.contenido).toContain('configureHttpSecurity(');
    expect(entry.contenido).not.toContain('enableCors()');
  });
  test('CI audita dependencias Node y no intenta npm audit en un backend Java', () => {
    const Pipeline = require('../src/infrastructure/services/CiCdPipelineGenerator');
    expect(new Pipeline()._workflow(false, false)).toContain('for directory in backend frontend tests;');
    expect(new Pipeline()._workflow(true, true)).toContain('for directory in frontend tests mobile;');
    expect(new Pipeline()._workflow()).toContain('npm audit --audit-level=high');
  });
});
