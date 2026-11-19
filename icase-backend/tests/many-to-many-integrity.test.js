const Extractor = require('../src/infrastructure/services/DomainModelExtractor');
const Builder = require('../src/infrastructure/services/ApplicationContractBuilder');
const Backend = require('../src/infrastructure/services/GenericBackendGenerator');

const model = () => new Extractor().extract(`@startuml
class Libro
class Autor
class Perfil
Autor "0..*" -- "0..*" Libro : escribe
Autor "1" -- "1" Perfil : tiene
@enduml`);

const requerimientos = [
  { identificador: 'RF-01', nombre: 'Gestionar libros', aprobado: true, tipo: 'RF' },
  { identificador: 'RF-02', nombre: 'Gestionar perfiles', aprobado: true, tipo: 'RF' }
];

const endpoints = (relations) => relations.map((rel) => [rel.from, rel.to].sort().join('<->') + ':' + rel.cardinalidad);

describe('relaciones N:M aprobadas', () => {
  test('el contrato conserva los extremos del modelo aunque una entidad no tenga operación propia', () => {
    const contract = new Builder().build({ proyecto: { nombre: 'Biblioteca' }, domainModel: model(), requerimientos });
    expect(endpoints(contract.relations)).toContain('Autor<->Libro:muchos_a_muchos');
    expect(endpoints(contract.relations).join(' ')).not.toContain('Libro<->Perfil');
  });

  test('el backend crea una operación de soporte para la entidad sin RF en lugar de cambiar la relación', () => {
    const files = new Backend().generate({ proyecto: { nombre: 'Biblioteca' }, requirements: requerimientos, stack: { backend: 'Express', base_datos: 'PostgreSQL' }, domainModel: model() });
    const manifest = JSON.parse(files.find((file) => file.ruta === 'backend/icase.manifest.json').contenido);
    expect(endpoints(manifest.relations)).toContain('Autor<->Libro:muchos_a_muchos');
    const support = manifest.operations.find((operation) => operation.support && operation.entity === 'autor');
    expect(support).toBeTruthy();
  });

  test('comportamiento previo: una N:M cuyos extremos ya tienen operación no cambia', () => {
    const both = [...requerimientos, { identificador: 'RF-03', nombre: 'Gestionar autores', aprobado: true, tipo: 'RF' }];
    const contract = new Builder().build({ proyecto: { nombre: 'Biblioteca' }, domainModel: model(), requerimientos: both });
    expect(endpoints(contract.relations)).toContain('Autor<->Libro:muchos_a_muchos');
  });
});

describe('permisos de operaciones de soporte', () => {
  const contract = () => ({
    entities: [{ name: 'Autor', key: 'autor' }, { name: 'Libro', key: 'libro' }],
    relations: [{ from: 'Autor', to: 'Libro', cardinalidad: 'muchos_a_muchos' }],
    operations: [
      { key: 'rf-01', entity: 'libro' },
      { key: 'op-autor', entity: 'autor', support: true }
    ]
  });
  const generator = new Backend();

  test('sin permisos del par ningún rol recibe acceso por defecto', () => {
    const policy = { habilitada: true, roles: { admin: {}, lector: {} }, operaciones: {} };
    generator._syncSupportPermissions(contract(), policy);
    expect(policy.operaciones['op-autor']).toEqual({});
  });

  test('comportamiento previo: hereda exactamente los permisos de la operación del par', () => {
    const policy = { habilitada: true, roles: { admin: {}, lector: {} }, operaciones: { 'rf-01': { lector: { metodos: ['GET'], alcance: 'todos' } } } };
    generator._syncSupportPermissions(contract(), policy);
    expect(policy.operaciones['op-autor']).toEqual({ lector: { metodos: ['GET'], alcance: 'todos' } });
  });
});
