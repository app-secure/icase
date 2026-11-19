const DomainModelQualityService = require('../src/infrastructure/services/DomainModelQualityService');
const ApplicationContractBuilder = require('../src/infrastructure/services/ApplicationContractBuilder');
const DomainModelExtractor = require('../src/infrastructure/services/DomainModelExtractor');

const service = new DomainModelQualityService();
const header = '@startuml\n';

describe('calidad del diagrama de clases: relaciones sospechosas', () => {
  const classes = `class Usuario {\n+String id\n+String correo\n+String passwordHash\n+String rol\n}
class Cliente {\n+String id\n+String nombre\n+String telefono\n}
class Mesa {\n+String id\n+int numero\n}
class Menu {\n+String id\n+String version\n}
class Comanda {\n+String id\n+String estado\n}
class Plato {\n+String id\n+String nombre\n+float precio\n}\n`;

  test('avisa cuando una entidad que no es una persona hereda de la entidad de cuentas', () => {
    const result = service.validar(`${header}${classes}Usuario <|-- Cliente\nUsuario <|-- Mesa\n@enduml`);
    const text = result.advertencias.join('\n');
    expect(text).toContain('Mesa hereda de Usuario');
    expect(text).not.toContain('Cliente hereda de Usuario');
  });

  test('avisa cuando una parte tiene dos dueños en composición (probable N:M)', () => {
    const result = service.validar(`${header}${classes}Menu "1" *-- "1..*" Plato : incluye\nComanda "1" *-- "1..*" Plato : solicita\n@enduml`);
    expect(result.advertencias.join('\n')).toContain('Plato es parte de Menu y de Comanda a la vez');
  });

  test('comportamiento previo: un modelo sano no genera avisos de relaciones', () => {
    const result = service.validar(`${header}${classes}Usuario <|-- Cliente\nMenu "1" *-- "1..*" Plato : incluye\n@enduml`);
    expect(result.advertencias.join('\n')).not.toContain('por verificar: Mesa');
    expect(result.advertencias.join('\n')).not.toContain('a la vez');
    expect(result.errores).toEqual([]);
  });
});

describe('emparejamiento RF-entidad con sinónimos', () => {
  const plantuml = `@startuml
class PaquetePrepagado {\n+String id\n+float saldo\n}
class TransaccionPago {\n+String id\n+float monto\n+String medioPago\n}
class ReporteVentas {\n+String id\n+float totalVentas\n}
@enduml`;
  const build = (requerimientos) => new ApplicationContractBuilder().build({ proyecto: { nombre: 'Demo' }, requerimientos, domainModel: new DomainModelExtractor().extract(plantuml) });
  const entityOf = (contract, id) => contract.operations.find((operation) => operation.id === id)?.schema?.title;

  test('"Registrar cobros" se asocia con TransaccionPago y no con un paquete mencionado en la descripción', () => {
    const contract = build([{ identificador: 'RF-05', tipo: 'RF', aprobado: true, nombre: 'Registrar cobros en efectivo o por transferencia', descripcion: 'El cajero debe comprobar si el cliente tiene un paquete prepagado vigente.' }]);
    expect(entityOf(contract, 'RF-05')).toBe('TransaccionPago');
  });

  test('"Informe de ventas" se asocia con ReporteVentas', () => {
    const contract = build([{ identificador: 'RF-08', tipo: 'RF', aprobado: true, nombre: 'Consultar el informe de ventas' }]);
    expect(entityOf(contract, 'RF-08')).toBe('ReporteVentas');
  });

  test('una asociación solo por la descripción genera un aviso para revisarla', () => {
    const contract = build([{ identificador: 'RF-03', tipo: 'RF', aprobado: true, nombre: 'Validar entrada', descripcion: 'Controla el saldo del paquete prepagado.' }]);
    expect(contract.warnings.join(' ')).toMatch(/RF-03 se asoció a PaquetePrepagado solo por su descripción/);
  });

  test('comportamiento previo: un RF con el nombre de la entidad sigue asociándose sin aviso', () => {
    const contract = build([{ identificador: 'RF-01', tipo: 'RF', aprobado: true, nombre: 'Comprar paquete prepagado' }]);
    expect(entityOf(contract, 'RF-01')).toBe('PaquetePrepagado');
    expect(contract.warnings.join(' ')).not.toContain('RF-01 se asoció');
  });
});
