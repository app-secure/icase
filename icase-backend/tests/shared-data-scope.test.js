const GenericBackendGenerator = require('../src/infrastructure/services/GenericBackendGenerator');

const contract = {
  entities: [
    { key: 'plato', name: 'Plato', references: [{ entity: 'MenuDigital' }] },
    { key: 'reserva', name: 'Reserva', references: [{ entity: 'Cliente' }, { entity: 'Mesa' }] },
    { key: 'cliente', name: 'Cliente', references: [] }
  ],
  operations: [{ key: 'rf-01', entity: 'plato' }, { key: 'rf-02', entity: 'reserva' }, { key: 'rf-11', entity: 'cliente' }]
};
const policy = () => ({
  habilitada: true,
  operaciones: {
    'rf-01': { cliente: { metodos: ['GET', 'PATCH'], alcance: 'propios' }, mesero: { metodos: ['GET'], alcance: 'todos' } },
    'rf-02': { cliente: { metodos: ['GET', 'POST', 'PATCH'], alcance: 'propios' } },
    'rf-11': { cliente: { metodos: ['GET', 'POST'], alcance: 'propios' } }
  }
});

describe('alcance «solo lo propio» sobre datos compartidos', () => {
  test('el menú (que no es de nadie) se consulta completo y el cliente no lo modifica', () => {
    const value = policy();
    new GenericBackendGenerator()._limitScopes(contract, value);
    expect(value.operaciones['rf-01'].cliente).toEqual({ metodos: ['GET'], alcance: 'todos' });
    expect(value.operaciones['rf-01'].mesero).toEqual({ metodos: ['GET'], alcance: 'todos' });
  });

  test('lo que sí es del cliente (su reserva, su perfil) conserva «propios» y sus métodos', () => {
    const value = policy();
    new GenericBackendGenerator()._limitScopes(contract, value);
    expect(value.operaciones['rf-02'].cliente).toEqual({ metodos: ['GET', 'POST', 'PATCH'], alcance: 'propios' });
    expect(value.operaciones['rf-11'].cliente.alcance).toBe('propios');
  });

  test('sin autenticación no hace nada', () => {
    const value = { habilitada: false, operaciones: policy().operaciones };
    new GenericBackendGenerator()._limitScopes(contract, value);
    expect(value.operaciones['rf-01'].cliente.alcance).toBe('propios');
  });
});
