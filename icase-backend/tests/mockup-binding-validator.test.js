const MockupBindingValidator = require('../src/infrastructure/services/MockupBindingValidator');

const requerimientos = [
  { identificador: 'RF-01', tipo: 'RF', nombre: 'Consultar reservas' },
  { identificador: 'RF-03', tipo: 'RF', nombre: 'Reservar sala' },
  { identificador: 'RNF-01', tipo: 'RNF', nombre: 'Rendimiento' }
];
const contrato = {
  operations: [
    { id: 'RF-01', key: 'rf-01', methods: ['GET'], schema: { type: 'object', properties: { sala: {}, fecha: {} } } },
    { id: 'RF-03', key: 'rf-03', methods: ['GET', 'POST', 'PATCH', 'DELETE'], schema: { type: 'object', properties: { id: { readOnly: true }, sala: {}, fecha: {} } } }
  ]
};
const page = (body) => `<!DOCTYPE html><html><body><main>${body}</main></body></html>`;
const check = (body, options = {}) => new MockupBindingValidator().validar({ html: page(body), requerimientos, contrato, ...options });

describe('MockupBindingValidator', () => {
  test('un formulario con enlace válido y campos del esquema no genera advertencias', () => {
    const result = check('<form><input name="sala"><input name="fecha"><button data-accion="RF-03.crear">Confirmar reserva</button></form>');
    expect(result.advertencias).toEqual([]);
    expect(result.enlaces).toEqual([expect.objectContaining({ rf: 'RF-03', verbo: 'crear', estado: 'valido', campos: ['sala', 'fecha'], campos_desconocidos: [] })]);
  });

  test('un botón sin enlace se marca "sin enlace" y no se le inventa operación', () => {
    const result = check('<button>Confirmar reserva</button>');
    expect(result.advertencias).toEqual(['sin enlace: Confirmar reserva']);
    expect(result.enlaces).toEqual([]);
  });

  test('data-accion="ui" declara un control visual sin operación y no advierte', () => {
    const result = check('<button data-accion="ui">Cerrar panel</button>');
    expect(result.advertencias).toEqual([]);
    expect(result.enlaces).toEqual([expect.objectContaining({ estado: 'ui', rf: null, verbo: null })]);
  });

  test.each([
    ['RF inexistente', 'RF-99.crear', 'RF-99'],
    ['un RNF no es operación', 'RNF-01.consultar', 'RNF-01'],
    ['verbo inválido', 'RF-03.reservar', 'verbo'],
    ['formato inválido', 'crear-reserva', 'formato']
  ])('enlace inválido (%s): no se cablea y se reporta', (_name, value, reason) => {
    const result = check(`<button data-accion="${value}">Enviar</button>`);
    expect(result.enlaces[0].estado).toBe('invalido');
    expect(result.advertencias.join(' ')).toContain(reason);
  });

  test('un verbo que la operación no admite queda inválido', () => {
    const result = check('<button data-accion="RF-01.crear">Crear</button>');
    expect(result.enlaces[0].estado).toBe('invalido');
    expect(result.advertencias.join(' ')).toContain('POST');
  });

  test('un campo que no existe en la operación se avisa pero no invalida el enlace', () => {
    const result = check('<form><input name="sala"><input name="buscar"><button data-accion="RF-03.crear">Crear</button></form>');
    expect(result.enlaces[0]).toEqual(expect.objectContaining({ estado: 'valido', campos_desconocidos: ['buscar'] }));
    expect(result.advertencias.join(' ')).toContain('buscar');
  });

  test('solo se revisan los campos del formulario del propio botón', () => {
    const result = check('<form><input name="otro"></form><form><input name="sala"><button data-accion="RF-03.crear">Crear</button></form>');
    expect(result.enlaces[0].campos).toEqual(['sala']);
    expect(result.enlaces[0].campos_desconocidos).toEqual([]);
  });

  test('sin contrato o con esquema genérico se omite la comprobación de campos', () => {
    const body = '<form><input name="cualquiera"><button data-accion="RF-03.crear">Crear</button></form>';
    expect(check(body, { contrato: null }).advertencias).toEqual([]);
    const generic = { operations: [{ id: 'RF-03', key: 'rf-03', methods: ['POST'], schema: { type: 'object', additionalProperties: true } }] };
    expect(check(body, { contrato: generic }).advertencias).toEqual([]);
  });

  test('consultar y eliminar no exigen campos de formulario', () => {
    const result = check('<button data-accion="RF-03.eliminar">Eliminar</button><button data-accion="RF-01.consultar">Buscar</button>');
    expect(result.advertencias).toEqual([]);
    expect(result.enlaces.map((item) => item.verbo)).toEqual(['eliminar', 'consultar']);
  });

  test('ignora enlaces de navegación, controles ocultos y la barra lateral', () => {
    const result = check('<nav><button>Menú</button></nav><aside><button>Ayuda</button></aside><button hidden>Oculto</button><a href="/x">Ir</a>');
    expect(result.advertencias).toEqual([]);
  });

  test('un RF explícitamente no aprobado no es un destino válido', () => {
    const result = check('<button data-accion="RF-05.crear">Crear</button>', { requerimientos: [...requerimientos, { identificador: 'RF-05', tipo: 'RF', aprobado: false }] });
    expect(result.enlaces[0].estado).toBe('invalido');
    expect(result.advertencias.join(' ')).toContain('RF-05');
  });

  test('el type de un input no distingue mayúsculas: SUBMIT es botón y HIDDEN no es campo', () => {
    expect(check('<input type="SUBMIT" value="Enviar">').advertencias).toEqual(['sin enlace: Enviar']);
    const result = check('<form><input type="HIDDEN" name="token"><input name="sala"><button data-accion="RF-03.crear">Crear</button></form>');
    expect(result.enlaces[0].campos).toEqual(['sala']);
  });

  test('HTML vacío no produce enlaces ni advertencias', () => {
    expect(new MockupBindingValidator().validar({ html: '', requerimientos, contrato })).toEqual({ enlaces: [], advertencias: [] });
  });
});
