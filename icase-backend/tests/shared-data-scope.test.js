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

  test('un rol que crea registros de una entidad (la solicitud de préstamo de un estudiante) conserva «propios» y POST sin apuntar a un usuario', () => {
    const prestamos = {
      entities: [
        { key: 'herramienta', name: 'Herramienta', references: [] },
        { key: 'solicitudprestamo', name: 'SolicitudPrestamo', references: [{ entity: 'Herramienta' }, { entity: 'Estudiante' }] }
      ],
      operations: [
        { key: 'rf-01', entity: 'herramienta' },
        { key: 'rf-03', entity: 'solicitudprestamo' },
        { key: 'rf-07', entity: 'solicitudprestamo' }
      ]
    };
    const value = {
      habilitada: true,
      operaciones: {
        'rf-01': { encargado: { metodos: ['GET', 'POST'], alcance: 'todos' }, estudiante: { metodos: ['GET'], alcance: 'propios' } },
        'rf-03': { estudiante: { metodos: ['GET', 'POST'], alcance: 'propios' }, auditor: { metodos: ['GET'], alcance: 'propios' } },
        'rf-07': { estudiante: { metodos: ['GET'], alcance: 'propios' } }
      }
    };
    new GenericBackendGenerator()._limitScopes(prestamos, value);
    // El estudiante crea solicitudes: sigue pudiendo crear y solo ve las suyas, también en la consulta (otra operación, misma entidad).
    expect(value.operaciones['rf-03'].estudiante).toEqual({ metodos: ['GET', 'POST'], alcance: 'propios' });
    expect(value.operaciones['rf-07'].estudiante).toEqual({ metodos: ['GET'], alcance: 'propios' });
    // Quien no crea esa entidad no puede ser su dueño: se le degrada a consulta completa.
    expect(value.operaciones['rf-03'].auditor).toEqual({ metodos: ['GET'], alcance: 'todos' });
    // El catálogo (herramientas) sigue sin ser de nadie: el estudiante lo consulta completo.
    expect(value.operaciones['rf-01'].estudiante).toEqual({ metodos: ['GET'], alcance: 'todos' });
  });

  test('sin autenticación no hace nada', () => {
    const value = { habilitada: false, operaciones: policy().operaciones };
    new GenericBackendGenerator()._limitScopes(contract, value);
    expect(value.operaciones['rf-01'].cliente.alcance).toBe('propios');
  });
});
