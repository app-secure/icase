const ClasesDisenoValidatorService = require('../src/infrastructure/services/ClasesDisenoValidatorService');
const ClasesDisenoSynthesizer = require('../src/infrastructure/services/ClasesDisenoSynthesizer');
const PlantUMLValidatorService = require('../src/infrastructure/services/PlantUMLValidatorService');
const { DIAGRAM_TYPES } = require('../src/core/constants/DiagramTypes');

describe('Módulo de Clases de Diseño (clases_diseno)', () => {
  let validator;
  let plantUmlValidator;

  beforeEach(() => {
    validator = new ClasesDisenoValidatorService();
    plantUmlValidator = new PlantUMLValidatorService();
  });

  describe('Validador de Clases de Diseño (ClasesDisenoValidatorService)', () => {
    test('acepta un diagrama de clases de diseño completo y bien estructurado', () => {
      const codigoValido = `
@startuml
package "Módulo Usuarios" {
  class UsuarioController <<Controller>> {
    +registrar(dto: CrearUsuarioDTO): UsuarioResponseDTO
  }
  class RegistrarUsuarioUseCase <<UseCase>> {
    +ejecutar(dto: CrearUsuarioDTO): UsuarioResponseDTO
  }
  interface IUsuarioRepository <<Repository>> {
    +guardar(u: Usuario): void
  }
  class MongoUsuarioRepository <<Repository>> {
    +guardar(u: Usuario): void
  }
  class Usuario <<Entity>> {
    -id: String
  }
  class CrearUsuarioDTO <<DTO>> {
    +email: String
  }
}
UsuarioController ..> RegistrarUsuarioUseCase : usa
RegistrarUsuarioUseCase ..> IUsuarioRepository : requiere
MongoUsuarioRepository --|> IUsuarioRepository : implementa
note top of UsuarioController : Trazabilidad Requisito: RF-01 | Origen: casos_de_uso, clases_dominio
@enduml
      `.trim();

      const resultado = validator.validar(codigoValido, 'clases_diseno');
      expect(resultado.valido).toBe(true);
      expect(resultado.error).toBeNull();
    });

    test('rechaza diagramas vacíos o sin inicio/fin PlantUML', () => {
      expect(validator.validar('', 'clases_diseno').valido).toBe(false);
      expect(validator.validar('class Test {}', 'clases_diseno').valido).toBe(false);
      expect(validator.validar('@startuml\nclass Test {}', 'clases_diseno').valido).toBe(false);
    });

    test('rechaza si faltan controladores o adaptadores', () => {
      const sinController = `
@startuml
package "Módulo" {
  class RegistrarUsuarioUseCase <<UseCase>> {}
  interface IUsuarioRepository <<Repository>> {}
  class MongoUsuarioRepository <<Repository>> {}
  class Usuario <<Entity>> {}
  class CrearUsuarioDTO <<DTO>> {}
}
RegistrarUsuarioUseCase ..> IUsuarioRepository
note top of RegistrarUsuarioUseCase : Trazabilidad RF-01
@enduml
      `.trim();
      const resultado = validator.validar(sinController, 'clases_diseno');
      expect(resultado.valido).toBe(false);
      expect(resultado.error).toContain('controladores');
    });

    test('rechaza si faltan casos de uso o servicios', () => {
      const sinUseCase = `
@startuml
package "Módulo" {
  class UsuarioController <<Controller>> {}
  interface IUsuarioRepository <<Repository>> {}
  class MongoUsuarioRepository <<Repository>> {}
  class Usuario <<Entity>> {}
  class CrearUsuarioDTO <<DTO>> {}
}
UsuarioController ..> IUsuarioRepository
note top of UsuarioController : Trazabilidad RF-01
@enduml
      `.trim();
      const resultado = validator.validar(sinUseCase, 'clases_diseno');
      expect(resultado.valido).toBe(false);
      expect(resultado.error).toContain('casos de uso');
    });

    test('rechaza si faltan repositorios (interfaz o implementación)', () => {
      const sinRepos = `
@startuml
package "Módulo" {
  class UsuarioController <<Controller>> {}
  class RegistrarUsuarioUseCase <<UseCase>> {}
  class Usuario <<Entity>> {}
  class CrearUsuarioDTO <<DTO>> {}
}
UsuarioController ..> RegistrarUsuarioUseCase
note top of UsuarioController : Trazabilidad RF-01
@enduml
      `.trim();
      const resultado = validator.validar(sinRepos, 'clases_diseno');
      expect(resultado.valido).toBe(false);
      expect(resultado.error).toContain('repositorios');
    });

    test('rechaza si faltan entidades de dominio', () => {
      const sinEntidad = `
@startuml
package "Módulo" {
  class UsuarioController <<Controller>> {}
  class RegistrarUsuarioUseCase <<UseCase>> {}
  interface IUsuarioRepository <<Repository>> {}
  class MongoUsuarioRepository <<Repository>> {}
  class CrearUsuarioDTO <<DTO>> {}
}
UsuarioController ..> RegistrarUsuarioUseCase
note top of UsuarioController : Trazabilidad RF-01
@enduml
      `.trim();
      const resultado = validator.validar(sinEntidad, 'clases_diseno');
      expect(resultado.valido).toBe(false);
      expect(resultado.error).toContain('entidades');
    });

    test('rechaza si faltan DTOs', () => {
      const sinDTO = `
@startuml
package "Módulo" {
  class UsuarioController <<Controller>> {}
  class RegistrarUsuarioUseCase <<UseCase>> {}
  interface IUsuarioRepository <<Repository>> {}
  class MongoUsuarioRepository <<Repository>> {}
  class Usuario <<Entity>> {}
}
UsuarioController ..> RegistrarUsuarioUseCase
note top of UsuarioController : Trazabilidad RF-01
@enduml
      `.trim();
      const resultado = validator.validar(sinDTO, 'clases_diseno');
      expect(resultado.valido).toBe(false);
      expect(resultado.error).toContain('DTO');
    });

    test('rechaza si faltan relaciones y dependencias entre capas', () => {
      const sinDependencias = `
@startuml
package "Módulo" {
  class UsuarioController <<Controller>> {}
  class RegistrarUsuarioUseCase <<UseCase>> {}
  interface IUsuarioRepository <<Repository>> {}
  class MongoUsuarioRepository <<Repository>> {}
  class Usuario <<Entity>> {}
  class CrearUsuarioDTO <<DTO>> {}
}
note top of UsuarioController : Trazabilidad RF-01
@enduml
      `.trim();
      const resultado = validator.validar(sinDependencias, 'clases_diseno');
      expect(resultado.valido).toBe(false);
      expect(resultado.error).toContain('dependencias');
    });

    test('exige paquetes (package) cuando el diagrama contiene más de 6 clases', () => {
      const diagramaGrandeSinPackages = `
@startuml
class UsuarioController <<Controller>> {}
class RegistrarUsuarioUseCase <<UseCase>> {}
interface IUsuarioRepository <<Repository>> {}
class MongoUsuarioRepository <<Repository>> {}
class Usuario <<Entity>> {}
class CrearUsuarioDTO <<DTO>> {}

class PedidoController <<Controller>> {}
class CrearPedidoUseCase <<UseCase>> {}
interface IPedidoRepository <<Repository>> {}
class MongoPedidoRepository <<Repository>> {}
class Pedido <<Entity>> {}
class CrearPedidoDTO <<DTO>> {}

UsuarioController ..> RegistrarUsuarioUseCase
MongoUsuarioRepository --|> IUsuarioRepository
note top of UsuarioController : Trazabilidad RF-01
@enduml
      `.trim();
      const resultado = validator.validar(diagramaGrandeSinPackages, 'clases_diseno');
      expect(resultado.valido).toBe(false);
      expect(resultado.error).toContain('dividirse por módulos');
    });

    test('rechaza si no incluye trazabilidad a requisitos o fuentes de origen', () => {
      const sinTrazabilidad = `
@startuml
package "Módulo" {
  class UsuarioController <<Controller>> {}
  class RegistrarUsuarioUseCase <<UseCase>> {}
  interface IUsuarioRepository <<Repository>> {}
  class MongoUsuarioRepository <<Repository>> {}
  class Usuario <<Entity>> {}
  class CrearUsuarioDTO <<DTO>> {}
}
UsuarioController ..> RegistrarUsuarioUseCase
MongoUsuarioRepository --|> IUsuarioRepository
@enduml
      `.trim();
      const resultado = validator.validar(sinTrazabilidad, 'clases_diseno');
      expect(resultado.valido).toBe(false);
      expect(resultado.error).toContain('trazabilidad');
    });
  });

  describe('Sintetizador de Clases de Diseño (ClasesDisenoSynthesizer)', () => {
    test('sintetiza un artefacto clases_diseno válido a partir de fixtures', () => {
      const casosDeUsoAprobados = [
        { identificador: 'RF-01', nombre: 'Registrar Usuario', actores: ['Usuario'] },
        { identificador: 'RF-02', nombre: 'Crear Pedido', actores: ['Cliente'] }
      ];
      const clasesDominio = [
        { nombre: 'Usuario' },
        { nombre: 'Pedido' }
      ];
      const arquitecturaSoftware = {
        tecnologia_backend: 'Node.js/Express',
        capas: ['Controllers', 'UseCases', 'Repositories', 'Entities']
      };
      const tecnologiasSeleccionadas = {
        backend: 'Express',
        database: 'MongoDB'
      };
      const versionesOrigen = {
        casos_de_uso: 2,
        clases_dominio: 1,
        arquitectura_software: 1
      };

      const resultado = ClasesDisenoSynthesizer.sintetizar({
        casosDeUsoAprobados,
        clasesDominio,
        arquitecturaSoftware,
        tecnologiasSeleccionadas,
        versionesOrigen
      });

      expect(resultado.tipo).toBe(DIAGRAM_TYPES.DESIGN_CLASSES);
      expect(resultado.tipo).toBe('clases_diseno');
      expect(resultado.titulo).toContain('Clases de Diseño');
      expect(resultado.requisitos_relacionados).toEqual(['RF-01', 'RF-02']);
      expect(resultado.versiones_origen).toEqual({
        casos_de_uso: 2,
        clases_dominio: 1,
        arquitectura_software: 1
      });

      // Validar el código PlantUML generado con los validadores
      const validacionPropia = validator.validar(resultado.codigo_plantuml, 'clases_diseno');
      expect(validacionPropia.valido).toBe(true);

      const validacionGeneral = plantUmlValidator.validar(resultado.codigo_plantuml, 'clases_diseno');
      expect(validacionGeneral.valido).toBe(true);
    });

    test('incluye componentes de todas las capas y modularización por packages', () => {
      const resultado = ClasesDisenoSynthesizer.sintetizar({
        casosDeUsoAprobados: [{ identificador: 'RF-01', nombre: 'Gestión General' }],
        clasesDominio: [{ nombre: 'Usuario' }, { nombre: 'Factura' }],
        tecnologiasSeleccionadas: { database: 'PostgreSQL' }
      });

      const puml = resultado.codigo_plantuml;
      expect(puml).toContain('package "Módulo Usuario"');
      expect(puml).toContain('package "Módulo Factura"');
      expect(puml).toContain('class UsuarioController <<Controller>>');
      expect(puml).toContain('class GestionarUsuarioUseCase <<UseCase>>');
      expect(puml).toContain('interface IUsuarioRepository <<Repository>>');
      expect(puml).toContain('class SqlUsuarioRepository <<Repository>>');
      expect(puml).toContain('class Usuario <<Entity>>');
      expect(puml).toContain('class CrearUsuarioDTO <<DTO>>');
      expect(puml).toContain('SqlUsuarioRepository --|> IUsuarioRepository');
      expect(puml).toContain('Trazabilidad Requisito: RF-01');
      expect(puml).toContain('Artefactos Origen: casos_de_uso, clases_dominio, arquitectura_software');
    });
  });

  describe('Integración con PlantUMLValidatorService', () => {
    test('PlantUMLValidatorService delega la validación de clases_diseno a ClasesDisenoValidatorService', () => {
      const codigoValido = `
@startuml
package "Módulo Usuarios" {
  class UsuarioController <<Controller>> {}
  class RegistrarUsuarioUseCase <<UseCase>> {}
  interface IUsuarioRepository <<Repository>> {}
  class MongoUsuarioRepository <<Repository>> {}
  class Usuario <<Entity>> {}
  class CrearUsuarioDTO <<DTO>> {}
}
UsuarioController ..> RegistrarUsuarioUseCase
MongoUsuarioRepository --|> IUsuarioRepository
note top of UsuarioController : Trazabilidad RF-01 | Origen: casos_de_uso
@enduml
      `.trim();

      const res = plantUmlValidator.validar(codigoValido, 'clases_diseno');
      expect(res.valido).toBe(true);
    });
  });
});
