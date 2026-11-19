const Extractor = require('../src/infrastructure/services/DomainModelExtractor');
const Builder = require('../src/infrastructure/services/ApplicationContractBuilder');
const Backend = require('../src/infrastructure/services/GenericBackendGenerator');

const ALL = ['GET', 'POST', 'PATCH', 'DELETE'];
const model = () => new Extractor().extract(`@startuml
class Libro
class Autor
class Pedido
class Cliente
class Reporte
Autor "0..*" -- "0..*" Libro : escribe
Pedido "0..*" --> "1" Cliente : de
@enduml`);
const rf = (identificador, nombre) => ({ identificador, nombre, tipo: 'RF', aprobado: true });
const requerimientos = [
  rf('RF-01', 'Gestionar libros'), rf('RF-02', 'Gestionar autores'), rf('RF-03', 'Gestionar clientes'),
  rf('RF-04', 'Gestionar pedidos'), rf('RF-05', 'Consultar reportes')
];
const methodsOf = (contract) => Object.fromEntries(contract.operations.map((operation) => [operation.id, operation.methods]));
const build = (verbosPorRf, domainModel = model()) => new Builder().build({ proyecto: { nombre: 'Tienda' }, domainModel, requerimientos, verbosPorRf });

describe('métodos de la operación derivados de los verbos de los mockups', () => {
  test('una operación solo de consulta expone únicamente GET', () => {
    expect(methodsOf(build({ 'RF-05': ['consultar'] }))['RF-05']).toEqual(['GET']);
  });

  test('GET siempre está y el orden es canónico sin importar el orden declarado', () => {
    const methods = methodsOf(build({ 'RF-05': ['eliminar', 'editar'], 'RF-04': ['crear'] }));
    expect(methods['RF-05']).toEqual(['GET', 'PATCH', 'DELETE']);
    expect(methods['RF-04']).toEqual(['GET', 'POST']);
  });

  test.each([
    ['sin mapa', undefined],
    ['RF ausente del mapa', { 'RF-99': ['consultar'] }],
    ['lista vacía', { 'RF-05': [] }],
    ['verbos que no son de operación', { 'RF-05': ['ui', 'inventado'] }]
  ])('comportamiento previo: %s mantiene el CRUD completo', (_name, verbos) => {
    const contract = build(verbos);
    expect(contract.operations.every((operation) => operation.methods.join() === ALL.join())).toBe(true);
  });

  test('mantienen CRUD completo los extremos de una N:M y las entidades padre de otra operación', () => {
    const everything = Object.fromEntries(requerimientos.map((item) => [item.identificador, ['consultar']]));
    const methods = methodsOf(build(everything));
    expect(methods['RF-01']).toEqual(ALL); // Libro, extremo N:M
    expect(methods['RF-02']).toEqual(ALL); // Autor, extremo N:M
    expect(methods['RF-03']).toEqual(ALL); // Cliente, padre de Pedido
    expect(methods['RF-04']).toEqual(['GET']);
    expect(methods['RF-05']).toEqual(['GET']);
  });

  test('sin modelo de dominio también se estrechan las operaciones', () => {
    expect(methodsOf(build({ 'RF-05': ['consultar'] }, null))['RF-05']).toEqual(['GET']);
  });
});

describe('generador de backend', () => {
  const generate = (extra = {}) => {
    const files = new Backend().generate({ proyecto: { nombre: 'Tienda' }, requirements: requerimientos, stack: { backend: 'Express', base_datos: 'PostgreSQL' }, domainModel: model(), ...extra });
    return JSON.parse(files.find((file) => file.ruta === 'backend/icase.manifest.json').contenido);
  };

  test('el manifiesto declara los métodos derivados y las operaciones de soporte siguen completas', () => {
    const manifest = generate({ verbosPorRf: { 'RF-05': ['consultar'], 'RF-04': ['consultar'] } });
    const byId = Object.fromEntries(manifest.operations.map((operation) => [operation.id, operation]));
    expect(byId['RF-05'].methods).toEqual(['GET']);
    expect(byId['RF-04'].methods).toEqual(['GET']);
    expect(manifest.operations.filter((operation) => operation.support).every((operation) => operation.methods.join() === ALL.join())).toBe(true);
  });

  test('un módulo que necesita PATCH (archivos, pagos, procesos) impide estrechar los métodos', () => {
    const ModuleService = require('../src/core/services/ModuleService');
    const generator = new Backend();
    const spy = jest.spyOn(ModuleService.prototype, 'activos');
    try {
      for (const id of ['archivos_imagenes', 'pagos_prueba', 'procesos_negocio']) {
        spy.mockReturnValue(['formularios_tipados', id]);
        expect(generator._moduleNeedsFullCrud({})).toBe(true);
      }
      spy.mockReturnValue(['formularios_tipados', 'mapas']);
      expect(generator._moduleNeedsFullCrud({})).toBe(false);
    } finally { spy.mockRestore(); }
  });

  test('comportamiento previo: sin verbosPorRf todo es CRUD completo', () => {
    expect(generate().operations.every((operation) => operation.methods.join() === ALL.join())).toBe(true);
  });
});
