const http = require('node:http');
const { io } = require('socket.io-client');
const { attachChangeEvents } = require('../src/infrastructure/templates/auth/change-events');
const Backend = require('../src/infrastructure/services/GenericBackendGenerator');
const Access = require('../src/core/services/AccessControlService');
const ModuleService = require('../src/core/services/ModuleService');

const modules = { modo: 'personalizado', modulos: [{ id: 'eventos_cambios', activo: true }] };
const requirements = [{ identificador: 'RF-01', nombre: 'Gestionar libros', tipo: 'RF', aprobado: true, actores: ['Bibliotecario'] }];
describe('generación opt-in de eventos backend', () => {
  test.each(['Express', 'NestJS'])('genera Socket.IO solo con elección explícita y JWT: %s', backend => {
    const access = new Access().proponer({ requerimientos: requirements }).valor;
    const files = new Backend().generate({ proyecto: { nombre: 'Biblioteca' }, requirements, stack: { backend, base_datos: 'PostgreSQL' }, access, modules });
    expect(JSON.parse(files.find(f => f.ruta === 'backend/package.json').contenido).dependencies['socket.io']).toBe('4.8.4');
    expect(files.find(f => /src\/main\./.test(f.ruta)).contenido).toContain('attachChangeEvents');
    expect(JSON.parse(files.find(f => f.ruta === 'backend/icase.manifest.json').contenido).eventos_cambios.experimental).toBe(true);
  });
  test('no modifica el modo automático ni finge soporte sin JWT', () => {
    expect(new ModuleService().activos()).not.toContain('eventos_cambios');
    const plain = new Backend().generate({ proyecto: { nombre: 'Prueba' }, requirements, stack: { backend: 'Express', base_datos: 'PostgreSQL' } });
    expect(plain.some(f => f.ruta.endsWith('change-events.js'))).toBe(false);
    expect(() => new Backend().generate({ proyecto: { nombre: 'Prueba' }, requirements, stack: { backend: 'Express', base_datos: 'PostgreSQL' }, modules })).toThrow('JWT');
  });
  test('rechaza Spring en lugar de ignorar la selección experimental', () => {
    const access = new Access().proponer({ requerimientos: requirements }).valor;
    expect(() => new Backend().generate({ proyecto: { nombre: 'Prueba' }, requirements, stack: { backend: 'Spring', base_datos: 'PostgreSQL' }, access, modules })).toThrow('Spring');
  });
});

describe('servidor y clientes Socket.IO reales', () => {
  let channel, server, url, clients, revoked, denied, store;
  beforeEach(async () => {
    clients = []; revoked = false; denied = false;
    store = { create: jest.fn(async () => ({ id: 1, data: { secreto: 'no emitir' } })), update: jest.fn(async () => null), remove: jest.fn(async () => false) };
    const auth = {
      authenticate: async header => { if (header !== 'Bearer valid' || revoked) throw new Error('Sesión inválida'); return { rol: 'lector' }; },
      authorize: (_user, method, route) => { if (denied || method !== 'GET' || route !== '/api/operations/rf-01') throw new Error('Denegado'); }
    };
    server = http.createServer();
    channel = attachChangeEvents(server, { store, auth, operations: [{ key: 'rf-01', entity: 'libro' }, { key: 'rf-02', entity: 'cuenta' }], origins: ['https://allowed.test'] });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    url = 'http://127.0.0.1:' + server.address().port;
  });
  afterEach(async () => { for (const client of clients) client.close(); await channel.close(); });
  function connect(token = 'valid', extra = {}) {
    const client = io(url, { transports: ['websocket'], auth: { token }, reconnection: false, forceNew: true, timeout: 1500, ...extra });
    clients.push(client);
    return new Promise((resolve, reject) => { client.once('connect', () => resolve(client)); client.once('connect_error', reject); });
  }
  test('rechaza credenciales inválidas y origen no autorizado', async () => {
    await expect(connect('bad')).rejects.toThrow('No autorizado');
    await expect(connect('valid', { extraHeaders: { Origin: 'https://evil.test' } })).rejects.toThrow();
  });
  test('no permite suscribirse a una operación no autorizada o inexistente', async () => {
    const client = await connect();
    expect(await client.timeout(1500).emitWithAck('subscribe', ['rf-02'])).toEqual({ ok: false });
    expect(await client.timeout(1500).emitWithAck('subscribe', ['__all__'])).toEqual({ ok: false });
  });
  test('publica solo invalidación después de escritura exitosa, sin datos personales', async () => {
    const client = await connect();
    expect(await client.timeout(1500).emitWithAck('subscribe', ['rf-01'])).toEqual({ ok: true });
    const event = new Promise(resolve => client.once('records:changed', resolve));
    await store.create('rf-01', { secreto: 'no emitir' });
    expect(await event).toEqual({ operation: 'rf-01', method: 'POST' });
  });
  test('no emite por mutaciones fallidas ni registros inexistentes', async () => {
    const client = await connect();
    await client.timeout(1500).emitWithAck('subscribe', ['rf-01']);
    const received = jest.fn(); client.on('records:changed', received);
    await store.update('rf-01', 999, {}); await store.remove('rf-01', 999);
    await new Promise(resolve => setTimeout(resolve, 40));
    expect(received).not.toHaveBeenCalled();
  });
  test('avisos N:M requieren permisos sobre ambos extremos y no contienen datos',async()=>{
    const client=await connect();await client.timeout(1500).emitWithAck('subscribe',['rf-01']);
    const received=jest.fn();client.on('records:changed',received);
    await channel.receive({keys:['rf-01'],method:'PATCH',requires:[['rf-01'],['rf-02']]});
    await new Promise(resolve=>setTimeout(resolve,40));expect(received).not.toHaveBeenCalled();expect(client.connected).toBe(true);
    const event=new Promise(resolve=>client.once('records:changed',resolve));
    await channel.receive({keys:['rf-01'],method:'PATCH',requires:[['rf-01'],['rf-01']],record:{private:'ignore'}});
    expect(await event).toEqual({operation:'rf-01',method:'PATCH'});
  });
  test('rechaza mensajes de coordinación que no pertenecen al contrato',async()=>{
    const client=await connect();await client.timeout(1500).emitWithAck('subscribe',['rf-01']);const received=jest.fn();client.on('records:changed',received);
    await channel.receive({keys:['unknown'],method:'PATCH'});await channel.receive({keys:['rf-01'],method:'execute'});await channel.receive({keys:['rf-01'],method:'PATCH',requires:[['unknown']]});
    await new Promise(resolve=>setTimeout(resolve,40));expect(received).not.toHaveBeenCalled();
  });
  test.each(['sesión', 'permiso'])('revalida %s antes de emitir y corta el canal si dejó de ser válido', async reason => {
    const client = await connect();
    await client.timeout(1500).emitWithAck('subscribe', ['rf-01']);
    const received = jest.fn(); client.on('records:changed', received);
    const disconnected = new Promise(resolve => client.once('disconnect', resolve));
    if (reason === 'sesión') revoked = true; else denied = true;
    await store.create('rf-01', {});
    await disconnected;
    expect(received).not.toHaveBeenCalled();
  });
});
