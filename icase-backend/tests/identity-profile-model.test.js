const BackendDataLayerGenerator = require('../src/infrastructure/services/BackendDataLayerGenerator');

const contract = {
  entities: [
    { name: 'Usuario', key: 'usuario', schema: { properties: { id: { type: 'string' }, correo: { type: 'string' }, rol: { type: 'string' }, nombre: { type: 'string' } } } },
    { name: 'Mesa', key: 'mesa', schema: { properties: { id: { type: 'string' }, numero: { type: 'string' }, usuario_id: { type: 'string', 'x-references': 'Usuario' } } } }
  ],
  operations: [
    { id: 'rf-14', key: 'rf-14', entity: 'usuario', identity: 'usuarios' },
    { id: 'rf-04', key: 'rf-04', entity: 'mesa' }
  ],
  rules: []
};

describe('perfil de la cuenta en la tabla de usuarios del dominio', () => {
  test('el modelo marca la tabla y las columnas que sincroniza el almacén', () => {
    const { model } = new BackendDataLayerGenerator().build({ contract, database: 'postgres', policy: { habilitada: true } });
    expect(model.identity).toEqual({ table: 'usuario', email: 'correo', rol: 'rol', nombre: 'nombre' });
  });

  test('sin entidad de cuentas en el dominio no hay perfil que sincronizar', () => {
    const { model } = new BackendDataLayerGenerator().build({ contract: { ...contract, operations: [{ id: 'rf-04', key: 'rf-04', entity: 'mesa' }] }, database: 'postgres', policy: { habilitada: true } });
    expect(model.identity).toBeUndefined();
  });

  test('el almacén de Postgres crea el perfil con el mismo identificador de la cuenta', () => {
    const { files } = new BackendDataLayerGenerator().build({ contract, database: 'postgres', policy: { habilitada: true } });
    expect(files.store).toContain('_mirrorProfile');
    expect(files.store).toContain('ON CONFLICT (id) DO UPDATE');
  });
});
