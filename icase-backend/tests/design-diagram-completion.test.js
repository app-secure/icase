const Completion = require('../src/infrastructure/services/DesignDiagramCompletion');
const Quality = require('../src/infrastructure/services/DomainModelQualityService');
const Validator = require('../src/infrastructure/services/PlantUMLValidatorService');

const domain = `@startuml
class Solicitud {
  +id: String
  +fecha: DateTime
}
class Expediente {
  +id: String
  +numero: String
}
class Archivo {
  +id: String
}
enum Estado {
  abierto
  cerrado
}
Solicitud "1" -- "0..*" Expediente : agrupa
Solicitud "1" -- "0..1" Archivo : adjunta
@enduml`;

const design = `@startuml
package "Solicitudes" {
  class SolicitudController <<Controller>> {
    +registrar(dto: SolicitudDTO): Promise<Solicitud>
  }
  class ConsultarExpedienteUseCase <<UseCase>> {
    +ejecutar(id: String): Promise<Expediente>
  }
  class GuardarNotaUseCase <<UseCase>> {
    +ejecutar(id: String): Promise<void>
  }
  interface IExpedienteRepository <<Repository>> {
    +buscar(id: String): Promise<Expediente>
  }
  class SqlExpedienteRepository <<Repository>> {
    +buscar(id: String): Promise<Expediente>
  }
  class Solicitud {
    +id: String
  }
  class SolicitudDTO <<DTO>> {
    +fecha: DateTime
  }
}
SolicitudController ..> ConsultarExpedienteUseCase
SqlExpedienteRepository ..|> IExpedienteRepository
note top of SolicitudController : Origen: RF-01
@enduml`;

test('conserva entidades, atributos, enumeraciones y asociaciones del dominio sin crear repositorios', () => {
  const result = new Completion().complete(design, domain);
  expect(result).toContain('class Expediente');
  expect(result).toContain('+numero: String');
  expect(result).toContain('class Archivo');
  expect(result).toContain('enum Estado');
  expect(result).toContain('+fecha: DateTime');
  expect(result).toContain('Solicitud "1" -- "0..*" Expediente : agrupa');
  expect(result).toContain('Solicitud "1" -- "0..1" Archivo : adjunta');
  expect(result).not.toMatch(/class\s+\w*ArchivoRepository/);
  expect((result.match(/package "Dominio"/g) || []).length).toBe(1);

  const warnings = new Quality().comparar(domain, result);
  expect(warnings.join(' ')).not.toContain('falta una realización');
  expect(warnings.join(' ')).not.toContain('relación aprobada');
  expect(warnings.join(' ')).not.toContain('perdió atributos');
});

test('enlaza el caso de uso con el puerto que ya menciona la entidad y explica el que no tiene', () => {
  const result = new Completion().complete(design, domain);
  expect(result).toContain('ConsultarExpedienteUseCase --> IExpedienteRepository : usa');
  expect(result).not.toContain('ConsultarExpedienteUseCase --> SqlExpedienteRepository');
  expect(result).toContain('note bottom of GuardarNotaUseCase : Sin puerto propio: la operación no declara persistencia adicional.');

  const checked = new Validator().validar(result, { tipo: 'clases_diseno', diagramasDependencia: [{ tipo: 'clases_dominio', codigo_plantuml: domain, aprobado: true, version: 1 }] });
  expect(checked.advertencias.join(' ')).not.toContain('no declara dependencias');
  expect(checked.advertencias.join(' ')).not.toContain('Diagrama extenso');
});

test('un diseño ya completo no se reescribe', () => {
  const once = new Completion().complete(design, domain);
  expect(new Completion().complete(once, domain)).toBe(once);
});

test('un diagrama ya empaquetado no se marca como extenso solo por la cantidad de clases', () => {
  const classes = Array.from({ length: 21 }, (_, index) => `class Extra${index} <<Entity>> {\n  +id: String\n}`).join('\n');
  const code = design.replace('package "Solicitudes" {', `package "Solicitudes" {\n${classes}`);
  const checked = new Validator().validar(code, { tipo: 'clases_diseno' });
  expect(checked.advertencias.join(' ')).not.toContain('Diagrama extenso');
});
