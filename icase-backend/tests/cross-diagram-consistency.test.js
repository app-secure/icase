const CrossDiagramConsistencyValidatorService = require('../src/infrastructure/services/CrossDiagramConsistencyValidatorService');
const PlantUMLValidatorService = require('../src/infrastructure/services/PlantUMLValidatorService');

describe('consistencia entre diagramas dependientes', () => {
  const validator = new CrossDiagramConsistencyValidatorService();
  const software = {
    tipo: 'arquitectura_software', aprobado: true, version: 2,
    codigo_plantuml: `@startuml
!include <C4/C4_Container>
Container(mobile, "Aplicación Móvil", "React Native", "Cliente")
Container(api, "API de Negocio", "NestJS", "Servicios")
ContainerDb(db, "Base de Datos", "PostgreSQL", "Datos")
@enduml`
  };
  const domain = {
    tipo: 'clases_dominio', aprobado: true, version: 1,
    codigo_plantuml: '@startuml\nclass Cliente\nclass Reserva\nclass Pedido\nclass Pago\n@enduml'
  };
  const useCases = {
    tipo: 'casos_de_uso', aprobado: true, version: 1,
    codigo_plantuml: '@startuml\nusecase "Consultar menú" as UC1\nusecase "Crear reserva" as UC2\nusecase "Procesar pago" as UC3\n@enduml'
  };

  test('bloquea despliegues que omiten la mayoría de contenedores aprobados', () => {
    const result = validator.validar({
      tipo: 'arquitectura_sistema',
      codigo: '@startuml\nnode "API de Negocio"\n@enduml',
      diagramasDependencia: [software]
    });

    expect(result.valido).toBe(false);
    expect(result.metricas.contenedores_software_desplegados_porcentaje).toBe(33);
    expect(result.errores.join(' ')).toContain('Aplicación Móvil');
  });

  test('permite una omisión minoritaria pero la deja como advertencia', () => {
    const result = validator.validar({
      tipo: 'arquitectura_sistema',
      codigo: '@startuml\nnode "Aplicación Móvil"\nnode "API de Negocio"\n@enduml',
      diagramasDependencia: [software]
    });

    expect(result.valido).toBe(true);
    expect(result.advertencias.join(' ')).toContain('Base de Datos');
  });

  test('comprueba que clases de diseño realice las entidades del dominio', () => {
    const result = validator.validar({
      tipo: 'clases_diseno',
      codigo: '@startuml\nclass ClienteEntity\nclass ReservaEntity\nclass PedidoEntity\nclass PagoEntity\n@enduml',
      diagramasDependencia: [domain]
    });

    expect(result.valido).toBe(true);
    expect(result.metricas.clases_dominio_realizadas_porcentaje).toBe(100);
  });

  test('detecta árboles sin rutas relacionadas con los casos de uso', () => {
    const result = validator.validar({
      tipo: 'arbol_navegacion',
      codigo: '@startwbs\n* Sistema\n** Configuración\n*** Preferencias\n*** Tema visual\n@endwbs',
      diagramasDependencia: [useCases]
    });

    expect(result.valido).toBe(false);
    expect(result.metricas.casos_uso_con_ruta_navegable).toBe(0);
  });

  test('PlantUMLValidator incorpora la consistencia del despliegue', () => {
    const integrated = new PlantUMLValidatorService();
    const code = '@startuml\nnode "Servidor" {\n  rectangle "API de Negocio"\n}\nnode "Red Interna"\n"API de Negocio" --> "Red Interna"\n@enduml';
    const result = integrated.validar(code, {
      tipo: 'arquitectura_sistema',
      diagramasDependencia: [software]
    });

    expect(result.valido).toBe(false);
    expect(result.detalles.consistencia.metricas.contenedores_software_desplegados).toBe(1);
  });

  test('bloquea arquitectura de software que omite módulos funcionales aprobados', () => {
    const result = validator.validar({
      tipo: 'arquitectura_software',
      codigo: '@startuml\nContainer(api, "API genérica", "NestJS", "Acceso")\n@enduml',
      diagramasDependencia: [useCases]
    });
    expect(result.valido).toBe(false);
    expect(result.metricas.casos_uso_representados_arquitectura).toBe(0);
  });

  test('acepta arquitectura de software que asigna todos los módulos principales', () => {
    const result = validator.validar({
      tipo: 'arquitectura_software',
      codigo: '@startuml\nContainer(menu, "Catálogo de menú", "NestJS", "Consulta")\nContainer(reserva, "Reservas", "NestJS", "Crear reserva")\nContainer(pago, "Pagos", "NestJS", "Procesar pago")\n@enduml',
      diagramasDependencia: [useCases]
    });
    expect(result.valido).toBe(true);
    expect(result.metricas.casos_uso_representados_arquitectura_porcentaje).toBe(100);
  });
});
