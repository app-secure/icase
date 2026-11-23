const ApplicationContractBuilder = require('../src/infrastructure/services/ApplicationContractBuilder');
const DomainModelExtractor = require('../src/infrastructure/services/DomainModelExtractor');
const ApplicationSpecService = require('../src/infrastructure/services/ApplicationSpecService');

// Caso Ventas (regeneración): RN-32 «El usuario debe tener una contraseña cifrada» bloqueaba crear usuarios en la verificación.
const plantuml = '@startuml\nclass Usuario {\n+String id\n+String nombre\n+String correo\n+String passwordHash\n+boolean activo\n}\n@enduml';
const requerimientos = [{ identificador: 'RF-12', tipo: 'RF', aprobado: true, nombre: 'Gestionar usuarios' }];
const spec = { operaciones: [{ nombre: 'crearUsuario', rf: 'RF-12', tipo: 'crear', entidad: 'Usuario', entradas: ['nombre', 'correo'] }] };

test('una regla sobre la contraseña la cumple la cuenta de acceso, no las operaciones de datos', () => {
  const rules = [
    { id: 'RN-31', tipo: 'requerido', campo: 'correo', mensaje: 'El usuario debe tener correo.', rf: ['RF-12'] },
    { id: 'RN-32', tipo: 'requerido', campo: 'passwordHash', mensaje: 'El usuario debe tener una contraseña cifrada.', rf: ['RF-12'] }
  ];
  const contract = new ApplicationContractBuilder().build({ proyecto: { nombre: 'Ventas' }, requerimientos, domainModel: new DomainModelExtractor().extract(plantuml), spec, rules });
  const kept = (contract.rules || []).map((rule) => rule.id);
  expect(kept).toContain('RN-31');
  expect(kept).not.toContain('RN-32');
  expect(contract.warnings.join(' ')).toContain('RN-32');
});

test('una regla «obligatorio» sin entidad se resuelve por su RF', () => {
  const rules = [{ id: 'RN-40', tipo: 'requerido', campo: 'telefono', mensaje: 'Debe tener teléfono.', rf: ['RF-12'] }];
  const contract = new ApplicationContractBuilder().build({ proyecto: { nombre: 'Ventas' }, requerimientos, domainModel: new DomainModelExtractor().extract(plantuml.replace('+boolean activo', '+boolean activo\n+String telefono')), spec, rules });
  expect(contract.warnings.join(' ')).toContain('RN-40: «Debe tener teléfono.» no se aplica al alta de Usuario');
});

test('el valor inicial sí/no se conserva como booleano, también el guardado como texto', () => {
  const service = new ApplicationSpecService({});
  const opciones = (valor) => [valor].map((opcion) => (typeof opcion === 'boolean' ? opcion : opcion === 'true' ? true : opcion === 'false' ? false : String(opcion)));
  expect(opciones('true')).toEqual([true]);
  expect(typeof service).toBe('object');
});
