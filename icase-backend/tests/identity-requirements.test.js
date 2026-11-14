const { isSensitiveField, isLoginRequirement, isUsersRequirement, hasCredentials, markSensitive } = require('../src/infrastructure/services/IdentityRequirements');

describe('IdentityRequirements', () => {
  test.each(['password', 'passwordHash', 'password_hash', 'contraseña', 'contrasenaHash', 'clave', 'secret', 'token', 'apiKey', 'hash'])('%s es un campo de secreto', (name) => {
    expect(isSensitiveField(name)).toBe(true);
  });

  test.each(['nombre', 'correo', 'rol', 'telefono', 'claveCatastral', 'passport', 'tokenCount', 'precio'])('%s no es un campo de secreto', (name) => {
    expect(isSensitiveField(name)).toBe(false);
  });

  test.each([
    'Autenticar usuarios en el sistema mediante tokens JWT',
    'Iniciar sesión',
    'Autenticación y control de acceso basado en roles',
    'Login con correo'
  ])('"%s" es un RF de autenticación', (nombre) => {
    expect(isLoginRequirement({ nombre })).toBe(true);
    expect(isUsersRequirement({ nombre })).toBe(false);
  });

  test.each(['Gestionar usuarios', 'Registrar usuarios del sistema', 'Alta de un usuario'])('"%s" gestiona cuentas', (nombre) => {
    expect(isUsersRequirement({ nombre })).toBe(true);
    expect(isLoginRequirement({ nombre })).toBe(false);
  });

  test.each(['Cerrar la caja', 'Visualizar las mesas asignadas', 'Registrar cobros en efectivo'])('"%s" no es de identidad', (nombre) => {
    expect(isLoginRequirement({ nombre })).toBe(false);
    expect(isUsersRequirement({ nombre })).toBe(false);
  });

  test('hasCredentials y markSensitive reconocen el campo de secreto de un esquema', () => {
    const schema = { properties: { id: { type: 'string' }, correo: { type: 'string' }, passwordHash: { type: 'string' } } };
    expect(hasCredentials(schema)).toBe(true);
    markSensitive(schema);
    expect(schema.properties.passwordHash).toMatchObject({ 'x-sensitive': true, writeOnly: true });
    expect(schema.properties.correo['x-sensitive']).toBeUndefined();
    expect(hasCredentials({ properties: { nombre: { type: 'string' } } })).toBe(false);
  });
});
