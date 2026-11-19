const { startPlatform, token, ids } = require('./helpers/platform-fixture');
const SessionRevocationService = require('../src/core/services/SessionRevocationService');

describe('sesiones revocables y registro configurable', () => {
  let platform;
  afterEach(async () => { if (platform) await platform.close(); });

  test('logout invalida el token copiado sin afectar otras sesiones y persiste solo su hash', async () => {
    platform = await startPlatform();
    const auth = token(ids.userA, { jwtid: 'sesion-uno' });
    const other = token(ids.userA, { jwtid: 'sesion-dos' });
    expect((await platform.request('POST', '/auth/logout', { auth })).status).toBe(200);
    expect((await platform.request('GET', '/proyectos', { auth })).status).toBe(401);
    expect((await platform.request('GET', '/proyectos', { auth: other })).status).toBe(200);
    expect(platform.data.sesionRevocada).toHaveLength(1);
    expect(platform.data.sesionRevocada[0].id).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(platform.data.sesionRevocada)).not.toContain(auth);
    // Otra instancia del servicio con el mismo repositorio conserva la revocación.
    expect(await new SessionRevocationService(platform.repositories.sesionRevocada).estaRevocada(auth)).toBe(true);
  });

  test('si falla el registro de revocaciones, no concede acceso ni filtra el error', async () => {
    platform = await startPlatform();
    platform.repositories.sesionRevocada.obtenerPorId = async () => { throw new Error('secreto-de-base'); };
    const log = jest.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const response = await platform.request('GET', '/proyectos', { auth: token(ids.userA) });
      expect(response.status).toBe(503);
      expect(response.text).not.toContain('secreto-de-base');
      expect(response.json.request_id).toBe(response.headers.get('x-request-id'));
    } finally { log.mockRestore(); }
  });

  test('el registro cerrado informa su configuración y rechaza altas sin consultar usuarios', async () => {
    platform = await startPlatform({ env: { AUTH_REGISTRATION_ENABLED: 'false' } });
    expect((await platform.request('GET', '/auth/config')).json).toEqual({ registro_publico: false });
    expect((await platform.request('POST', '/auth/registro', { body: {} })).status).toBe(403);
    expect(platform.calls).toHaveLength(0);
  });

  test('producción cierra el registro por defecto', async () => {
    platform = await startPlatform({ env: { NODE_ENV: 'production', JWT_SECRET: 'k3J9xV7qLw2PzR8mN5tY1uB6cD4fH0aS', AUTH_REGISTRATION_ENABLED: undefined } });
    expect((await platform.request('GET', '/auth/config')).json.registro_publico).toBe(false);
  });

  test('también sanea respuestas 500 de controladores existentes', () => {
    const middleware = require('../src/infrastructure/security/responseErrors');
    const send = jest.fn();
    const headers = {};
    const res = { statusCode: 500, json: send, setHeader: (key, value) => { headers[key] = value; } };
    const log = jest.spyOn(console, 'error').mockImplementation(() => {});
    try {
      middleware({ method: 'GET', path: '/prueba' }, res, jest.fn());
      res.json({ error: 'password=secreto', stack: 'ruta privada' });
      expect(send).toHaveBeenCalledWith({ error: 'Error interno del servidor.', request_id: headers['X-Request-ID'] });
      expect(JSON.stringify(send.mock.calls)).not.toContain('secreto');
    } finally { log.mockRestore(); }
  });
});
