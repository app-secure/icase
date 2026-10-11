const DiagramSemanticValidatorService = require('../src/infrastructure/services/DiagramSemanticValidatorService');
const PlantUMLValidatorService = require('../src/infrastructure/services/PlantUMLValidatorService');
const AprobarFase = require('../src/core/use-cases/AprobarFase');

describe('validación semántica de diagramas', () => {
  const semanticValidator = new DiagramSemanticValidatorService();

  const requisitos = [
    { identificador: 'RF-01', tipo: 'RF', nombre: 'Consultar menú digital', prioridad: 'Alta', aprobado: true },
    { identificador: 'RF-02', tipo: 'RF', nombre: 'Reservar mesas y sillas', prioridad: 'Alta', aprobado: true },
    { identificador: 'RF-03', tipo: 'RF', nombre: 'Procesar cobros y pagos', prioridad: 'Media', aprobado: true }
  ];

  test('detecta un RF de prioridad alta omitido en casos de uso', () => {
    const codigo = `@startuml
actor Cliente
rectangle Sistema {
  usecase "Consultar menú" as UC1
  usecase "Procesar pago" as UC2
}
Cliente --> UC1
Cliente --> UC2
@enduml`;

    const resultado = semanticValidator.validar({ tipo: 'casos_de_uso', codigo, requisitos });

    expect(resultado.valido).toBe(false);
    expect(resultado.errores.join(' ')).toContain('RF-02');
    expect(resultado.metricas.cobertura_rf_porcentaje).toBe(67);
  });

  test('acepta cobertura semántica aunque las etiquetas no sean idénticas', () => {
    const codigo = `@startuml
actor Cliente
rectangle Sistema {
  usecase "Ver menú disponible" as UC1
  usecase "Crear reserva de mesa" as UC2
  usecase "Registrar pago" as UC3
}
Cliente --> UC1
Cliente --> UC2
Cliente --> UC3
@enduml`;

    const resultado = semanticValidator.validar({ tipo: 'casos_de_uso', codigo, requisitos });

    expect(resultado.valido).toBe(true);
    expect(resultado.metricas.rf_cubiertos).toBe(3);
  });

  test('rechaza clases técnicas dentro del modelo de dominio', () => {
    const codigo = `@startuml
class Menu
class ReservaController
class PagoRepository
Menu -- ReservaController
ReservaController -- PagoRepository
@enduml`;

    const resultado = semanticValidator.validar({ tipo: 'clases_dominio', codigo, requisitos });

    expect(resultado.valido).toBe(false);
    expect(resultado.errores.join(' ')).toContain('ReservaController');
    expect(resultado.errores.join(' ')).toContain('PagoRepository');
  });

  test('mide la cobertura real de conceptos en clases de dominio', () => {
    const codigo = `@startuml
class Menu
class Reserva
class Mesa
class Pago
Menu -- Reserva
Reserva -- Mesa
Reserva -- Pago
@enduml`;

    const resultado = semanticValidator.validar({ tipo: 'clases_dominio', codigo, requisitos });

    expect(resultado.valido).toBe(true);
    expect(resultado.metricas.cobertura_conceptos_porcentaje).toBe(100);
  });

  test('PlantUMLValidator integra la validación semántica en el control de calidad', () => {
    const validator = new PlantUMLValidatorService();
    const codigo = `@startuml
actor Cliente
rectangle Sistema {
  usecase "Consultar menú" as UC1
  usecase "Ver detalle" as UC2
}
Cliente --> UC1
Cliente --> UC2
@enduml`;

    const resultado = validator.validar(codigo, { tipo: 'casos_de_uso', requisitos });

    expect(resultado.valido).toBe(false);
    expect(resultado.metricas.rf_evaluados).toBe(3);
    expect(resultado.detalles.semantica.errores.join(' ')).toContain('RF-02');
  });

  test('impide aprobar un diagrama que omite un RF de prioridad alta', async () => {
    const codigo = `@startuml
actor Cliente
rectangle Sistema {
  usecase "Consultar menú" as UC1
  usecase "Ver detalle" as UC2
}
Cliente --> UC1
Cliente --> UC2
@enduml`;
    const actualizar = jest.fn().mockResolvedValue(true);
    const useCase = new AprobarFase({
      proyectoRepository: { obtenerPorId: jest.fn().mockResolvedValue({ id: 'p1', estado_fase: 'analisis_aprobado' }) },
      requerimientoRepository: { listarPorProyecto: jest.fn().mockResolvedValue(requisitos) },
      diagramaRepository: {
        listarPorProyecto: jest.fn().mockResolvedValue([{
          id: 'd1', tipo: 'casos_de_uso', version: 1, estado: 'pendiente_revision',
          aprobado: false, codigo_plantuml: codigo, requisitos_relacionados: ['RF-01']
        }]),
        actualizar
      },
      disenoRepository: {},
      plantumlValidatorService: new PlantUMLValidatorService()
    });

    await expect(useCase.ejecutar({ proyectoId: 'p1', fase: 'diagrama', tipoDiagrama: 'casos_de_uso' }))
      .rejects.toThrow('RF-02');
    expect(actualizar).toHaveBeenCalledWith('d1', expect.objectContaining({ estado_calidad: 'invalido' }));
    expect(actualizar).not.toHaveBeenCalledWith('d1', expect.objectContaining({ aprobado: true }));
  });
});
