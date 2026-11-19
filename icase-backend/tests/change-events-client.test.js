const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Frontend = require('../src/infrastructure/services/GenericFrontendGenerator');

describe('clientes generados opt-in', () => {
  const generate = (enabled, auth = true) => new Frontend().generate({ proyecto: { nombre: 'Biblioteca' }, screens: [{ nombre: 'Libros', rf_trazabilidad: ['RF-01'] }], decisiones: {
    alcance_plataforma: { plataformas: ['web', 'android'] }, control_acceso: { autenticacion: { metodo: auth ? 'jwt' : 'ninguna' } },
    ...(enabled ? { modulos: { modo: 'personalizado', modulos: [{ id: 'eventos_cambios', activo: true }] } } : {})
  } });
  test('incluye React/Expo, limpieza de sesión, AppState y proxy solo si se activa', () => {
    const files = generate(true);
    const content = name => files.find(file => file.ruta === name)?.contenido;
    for (const prefix of ['frontend', 'mobile']) expect(JSON.parse(content(prefix + '/package.json')).dependencies['socket.io-client']).toBe('4.8.4');
    expect(content('frontend/src/session.jsx')).toContain('[token]');
    expect(content('frontend/src/OperationScreen.jsx')).toContain('subscribeChanges(capability, refresh, setChangesStatus)');
    expect(content('frontend/src/OperationScreen.jsx')).toContain('<p aria-live="polite" data-testid="change-events-status">');
    expect(content('frontend/src/session.jsx')).toContain("window.removeEventListener('online', resume)");
    expect(content('frontend/src/JsonOperationScreen.jsx')).toContain('subscribeChanges(capability, refresh, setChangesStatus)');
    expect(content('frontend/vite.config.js')).toContain('ws:true');
    expect(content('mobile/App.js')).toContain("AppState.addEventListener('change'");
    expect(content('mobile/App.js')).toContain('listener.remove(); dispose();');
    expect(content('mobile/App.js')).toContain('onState:setChangesStatus');
    expect(content('mobile/App.js')).toContain('Canal de cambios: {changesStatus}');
    expect(generate(false).some(file => /change-events-client/.test(file.ruta))).toBe(false);
    expect(() => generate(true, false)).toThrow('JWT');
  });
});

describe('ciclo de vida y coalescencia del cliente', () => {
  let subscribe, socket, handlers, onChange, onState, ack;
  beforeEach(() => {
    jest.useFakeTimers();
    handlers = {};
    socket = { connected: true, on: jest.fn((event, handler) => { handlers[event] = handler; }), timeout: jest.fn(() => socket), emit: jest.fn((_event, _keys, callback) => { ack = callback; }), connect: jest.fn(), disconnect: jest.fn(), removeAllListeners: jest.fn() };
    const source = fs.readFileSync(path.join(__dirname, '../src/infrastructure/templates/frontend/change-events-client.js'), 'utf8').replace("import { io } from 'socket.io-client';", '').replace('export function', 'function');
    subscribe = vm.runInNewContext(source + '\nsubscribeChanges;', { io: () => socket, setTimeout, clearTimeout,setInterval,clearInterval });
    onChange = jest.fn(async () => {}); onState = jest.fn();
  });
  afterEach(() => jest.useRealTimers());
  const start = () => subscribe({ token: 'private', operations: ['rf-01'], onChange, onState });
  test('suscribe y reconsulta al conectar/reconectar; no acepta avisos ajenos', async () => {
    const dispose = start();
    handlers.connect(); ack(null, { ok: true });
    await jest.advanceTimersByTimeAsync(100);
    expect(onState).toHaveBeenCalledWith('activo');
    expect(onChange).toHaveBeenCalledTimes(1);
    handlers['records:changed']({ operation: 'rf-02', method: 'POST' });
    await jest.advanceTimersByTimeAsync(100);
    expect(onChange).toHaveBeenCalledTimes(1);
    for (let i = 0; i < 10; i++) handlers['records:changed']({ operation: 'rf-01', method: 'PATCH' });
    await jest.advanceTimersByTimeAsync(100);
    expect(onChange).toHaveBeenCalledTimes(2);
    handlers.connect(); ack(null, { ok: true });
    await jest.advanceTimersByTimeAsync(100);
    expect(onChange).toHaveBeenCalledTimes(3);
    dispose();
  });
  test('pausa en segundo plano y elimina listeners, token y trabajo al desmontar', async () => {
    const dispose = start();
    handlers.connect(); ack(null, { ok: true });
    dispose.pause();
    await jest.advanceTimersByTimeAsync(200);
    expect(onChange).not.toHaveBeenCalled();
    dispose.resume(); expect(socket.connect).toHaveBeenCalledTimes(2);
    handlers.connect(); ack(null, { ok: true }); dispose();
    await jest.advanceTimersByTimeAsync(200);
    expect(onChange).not.toHaveBeenCalled();
    expect(socket.removeAllListeners).toHaveBeenCalled();
    expect(socket.auth).toEqual({});
    dispose.resume(); expect(socket.connect).toHaveBeenCalledTimes(2);
  });
  test('un rechazo o timeout de suscripción no se presenta como canal activo', () => {
    const dispose = start(); handlers.connect(); ack(new Error('timeout'));
    expect(onState).toHaveBeenLastCalledWith('no disponible');
    expect(socket.disconnect).toHaveBeenCalled(); dispose();
  });
  test('no solapa consultas y recoge cambios recibidos mientras consulta', async () => {
    let resolve;
    onChange.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
    const dispose = start(); handlers.connect(); ack(null, { ok: true });
    await jest.advanceTimersByTimeAsync(100);
    handlers['records:changed']({ operation: 'rf-01', method: 'POST' });
    await jest.advanceTimersByTimeAsync(100);
    expect(onChange).toHaveBeenCalledTimes(1);
    resolve(); await Promise.resolve(); await jest.advanceTimersByTimeAsync(100);
    expect(onChange).toHaveBeenCalledTimes(2); dispose();
  });
});
