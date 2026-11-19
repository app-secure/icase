const { humanize } = require('../src/core/services/FieldLabel');

describe('nombres legibles de campos del dominio', () => {
  test('convierte identificadores técnicos en texto para personas', () => {
    expect(humanize('passwordHash')).toBe('Contraseña');
    expect(humanize('correo')).toBe('Correo electrónico');
    expect(humanize('cliente_id')).toBe('Cliente');
    expect(humanize('fechaHoraLlegadaPrevista')).toBe('Fecha y hora llegada prevista');
    expect(humanize('usosRestantes')).toBe('Usos restantes');
    expect(humanize('medioPago')).toBe('Medio pago');
    expect(humanize('')).toBe('');
  });
});
