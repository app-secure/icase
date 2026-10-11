const fs = require('fs');
const path = require('path');
const { DiagramTypes, TIPOS_VALIDOS, TIPOS_PRINCIPALES } = require('../src/core/constants/DiagramTypes');
const ArquitecturaSoftwareGeneratorService = require('../src/infrastructure/services/ArquitecturaSoftwareGeneratorService');
const ArquitecturaSistemaGeneratorService = require('../src/infrastructure/services/ArquitecturaSistemaGeneratorService');
const ArquitecturaSoftwareValidatorService = require('../src/infrastructure/services/ArquitecturaSoftwareValidatorService');
const ArquitecturaSistemaValidatorService = require('../src/infrastructure/services/ArquitecturaSistemaValidatorService');
const PlantUMLValidatorService = require('../src/infrastructure/services/PlantUMLValidatorService');
const PlantUMLSynthesizer = require('../src/infrastructure/services/PlantUMLSynthesizer');
const ModelosIaService = require('../src/infrastructure/services/ModelosIaService');
const AprobarFase = require('../src/core/use-cases/AprobarFase');

describe('Feature / Architecture Diagrams Unit Tests', () => {
  const fixtureSinHAPath = path.join(__dirname, 'fixtures/requisitos_sin_alta_disponibilidad.json');
  const fixtureConHAPath = path.join(__dirname, 'fixtures/requisitos_con_alta_disponibilidad.json');

  const fixtureSinHA = JSON.parse(fs.readFileSync(fixtureSinHAPath, 'utf8'));
  const fixtureConHA = JSON.parse(fs.readFileSync(fixtureConHAPath, 'utf8'));

  let softwareGenerator;
  let sistemaGenerator;
  let softwareValidator;
  let sistemaValidator;
  let plantumlValidator;

  beforeEach(() => {
    softwareGenerator = new ArquitecturaSoftwareGeneratorService();
    sistemaGenerator = new ArquitecturaSistemaGeneratorService();
    softwareValidator = new ArquitecturaSoftwareValidatorService();
    sistemaValidator = new ArquitecturaSistemaValidatorService();
    plantumlValidator = new PlantUMLValidatorService();
  });

  describe('1. Constantes y Definición en DiagramTypes.js', () => {
    test('DiagramTypes define arquitectura_software y arquitectura_sistema', () => {
      expect(DiagramTypes.ARQUITECTURA_SOFTWARE).toBe('arquitectura_software');
      expect(DiagramTypes.ARQUITECTURA_SISTEMA).toBe('arquitectura_sistema');
      expect(DiagramTypes.CASOS_DE_USO).toBe('casos_de_uso');
      expect(DiagramTypes.CLASES).toBe('clases');
      expect(DiagramTypes.ARBOL_NAVEGACION).toBe('arbol_navegacion');
    });

    test('DiagramTypes es inmutable', () => {
      expect(Object.isFrozen(DiagramTypes)).toBe(true);
      expect(() => {
        'use strict';
        DiagramTypes.NUEVO_TIPO = 'invalido';
      }).toThrow();
    });

    test('TIPOS_VALIDOS y TIPOS_PRINCIPALES contienen los nuevos diagramas', () => {
      expect(TIPOS_VALIDOS).toContain(DiagramTypes.ARQUITECTURA_SOFTWARE);
      expect(TIPOS_VALIDOS).toContain(DiagramTypes.ARQUITECTURA_SISTEMA);
      expect(TIPOS_PRINCIPALES).toContain(DiagramTypes.ARQUITECTURA_SOFTWARE);
      expect(TIPOS_PRINCIPALES).toContain(DiagramTypes.ARQUITECTURA_SISTEMA);
    });
  });

  describe('2. Generador y Validador de Arquitectura de Software', () => {
    test('Genera diagrama C4 Container con componentes de software y trazabilidad RNF', () => {
      const diagSoftware = softwareGenerator.generar({
        nombreProyecto: fixtureSinHA.nombre_proyecto,
        requerimientos: fixtureSinHA.requerimientos
      });

      expect(diagSoftware.tipo).toBe(DiagramTypes.ARQUITECTURA_SOFTWARE);
      expect(diagSoftware.titulo).toContain('Arquitectura de Software');
      expect(diagSoftware.codigo_plantuml).toMatch(/@startuml/);
      expect(diagSoftware.codigo_plantuml).toMatch(/!include <C4\/C4_Container>/);
      expect(diagSoftware.codigo_plantuml).toMatch(/@enduml/);

      // Los RNF se trazan hacia responsabilidades; no prescriben productos.
      expect(diagSoftware.codigo_plantuml).not.toMatch(/Redis|API Gateway|Nginx|RabbitMQ/i);
      expect(diagSoftware.codigo_plantuml).toMatch(/Servicio de Aplicación/i);

      // Trazabilidad RNF -> elemento arquitectónico
      expect(Array.isArray(diagSoftware.trazabilidad_rnf)).toBe(true);
      expect(diagSoftware.trazabilidad_rnf.length).toBeGreaterThanOrEqual(2);

      const itemRendimiento = diagSoftware.trazabilidad_rnf.find(t => t.rnf_id === 'RNF-01');
      expect(itemRendimiento).toBeDefined();
      expect(itemRendimiento.elemento).toMatch(/Servicio de Aplicación/i);

      // Validación con ArquitecturaSoftwareValidatorService
      const validacion = softwareValidator.validar({
        codigo: diagSoftware.codigo_plantuml,
        rnfList: fixtureSinHA.requerimientos.filter(r => r.tipo === 'RNF'),
        trazabilidad_rnf: diagSoftware.trazabilidad_rnf
      });

      expect(validacion.valido).toBe(true);
      expect(validacion.errores).toHaveLength(0);
      expect(validacion.componentes_detectados).toContain('base_de_datos');
      expect(validacion.componentes_detectados).toContain('servicios_api');
      expect(validacion.componentes_detectados).not.toContain('cache');
    });

    test('Validador de Software rechaza código inválido o sin componentes', () => {
      const resVacio = softwareValidator.validar({ codigo: '' });
      expect(resVacio.valido).toBe(false);
      expect(resVacio.errores[0]).toContain('está vacío');

      const resSinC4 = softwareValidator.validar({ codigo: '@startuml\nactor Usuario\n@enduml' });
      expect(resSinC4.valido).toBe(false);
      expect(resSinC4.errores.some(e => e.includes('contenedores o componentes'))).toBe(true);
    });
  });

  describe('3. Generador y Validador de Arquitectura de Sistema (Sin Alta Disponibilidad)', () => {
    test('NO agrega alta disponibilidad cuando los requisitos no la solicitan (mononodo standalone)', () => {
      const diagSistema = sistemaGenerator.generar({
        nombreProyecto: fixtureSinHA.nombre_proyecto,
        requerimientos: fixtureSinHA.requerimientos
      });

      expect(diagSistema.tipo).toBe(DiagramTypes.ARQUITECTURA_SISTEMA);
      expect(diagSistema.codigo_plantuml).toMatch(/@startuml/);
      expect(diagSistema.codigo_plantuml).toMatch(/@enduml/);

      // Debe ser una topología mínima sin productos, failover ni réplicas.
      expect(diagSistema.codigo_plantuml).toMatch(/Nodo de Aplicación/i);
      expect(diagSistema.codigo_plantuml).not.toMatch(/failover/i);
      expect(diagSistema.codigo_plantuml).not.toMatch(/hot standby/i);
      expect(diagSistema.codigo_plantuml).not.toMatch(/nodo replica/i);
      expect(diagSistema.codigo_plantuml).not.toMatch(/Prometheus|Grafana|Docker|Ubuntu/i);

      // Trazabilidad RNF
      expect(Array.isArray(diagSistema.trazabilidad_rnf)).toBe(true);
      expect(diagSistema.trazabilidad_rnf).toHaveLength(0);

      // Sin una plataforma aprobada conserva un dispositivo genérico por definir.
      expect(diagSistema.codigo_plantuml).toMatch(/Dispositivo de Usuario/i);

      // Validación con ArquitecturaSistemaValidatorService
      const validacion = sistemaValidator.validar({
        codigo: diagSistema.codigo_plantuml,
        rnfList: fixtureSinHA.requerimientos.filter(r => r.tipo === 'RNF'),
        trazabilidad_rnf: diagSistema.trazabilidad_rnf
      });

      expect(validacion.valido).toBe(true);
      expect(validacion.errores).toHaveLength(0);
      expect(validacion.alta_disponibilidad_solicitada).toBe(false);
      expect(validacion.alta_disponibilidad_detectada).toBe(false);
    });

    test('Validador de Sistema RECHAZA alta disponibilidad si no fue solicitada', () => {
      const codigoConHAInjustificada = `@startuml
!include <C4/C4_Deployment>
Deployment_Node(cloud, "Cloud") {
  Deployment_Node(lb, "Balanceador") {
    Container(lbNode, "NGINX Failover con conmutación")
  }
  Deployment_Node(replicaNode, "Servidor Réplica Esclavo") {
    Container(rep, "Hot Standby")
  }
}
@enduml`;

      // Los requerimientos NO piden HA
      const rnfsSimples = fixtureSinHA.requerimientos.filter(r => r.tipo === 'RNF');

      const validacion = sistemaValidator.validar({
        codigo: codigoConHAInjustificada,
        rnfList: rnfsSimples
      });

      expect(validacion.valido).toBe(false);
      expect(validacion.alta_disponibilidad_solicitada).toBe(false);
      expect(validacion.alta_disponibilidad_detectada).toBe(true);
      expect(validacion.errores[0]).toContain('Regla de arquitectura incumplida: Se incluyó alta disponibilidad');
    });
  });

  describe('4. Generador y Validador de Arquitectura de Sistema (Con Alta Disponibilidad)', () => {
    test('SÍ incluye balanceador, nodos réplica y failover cuando los requisitos lo solicitan', () => {
      const diagSistema = sistemaGenerator.generar({
        nombreProyecto: fixtureConHA.nombre_proyecto,
        requerimientos: fixtureConHA.requerimientos
      });

      expect(diagSistema.tipo).toBe(DiagramTypes.ARQUITECTURA_SISTEMA);
      expect(diagSistema.codigo_plantuml).toMatch(/Mecanismo de Distribución y Failover/i);
      expect(diagSistema.codigo_plantuml).toMatch(/Hot Standby|Réplica|Replica/i);
      expect(diagSistema.codigo_plantuml).toMatch(/Failover/i);

      // Trazabilidad RNF -> elemento
      const traceHA = diagSistema.trazabilidad_rnf.find(t => t.rnf_id === 'RNF-01');
      expect(traceHA).toBeDefined();
      expect(traceHA.elemento).toMatch(/Failover|Cluster|Réplica/i);

      // Validación con ArquitecturaSistemaValidatorService
      const rnfsHA = fixtureConHA.requerimientos.filter(r => r.tipo === 'RNF');
      const validacion = sistemaValidator.validar({
        codigo: diagSistema.codigo_plantuml,
        rnfList: rnfsHA,
        trazabilidad_rnf: diagSistema.trazabilidad_rnf
      });

      expect(validacion.valido).toBe(true);
      expect(validacion.errores).toHaveLength(0);
      expect(validacion.alta_disponibilidad_solicitada).toBe(true);
      expect(validacion.alta_disponibilidad_detectada).toBe(true);
    });
  });

  describe('5. Integración con PlantUMLValidatorService y PlantUMLSynthesizer', () => {
    test('PlantUMLValidatorService delega a los validadores según el tipo', () => {
      const diagSoftware = softwareGenerator.generar({
        nombreProyecto: 'Test',
        requerimientos: fixtureSinHA.requerimientos
      });

      const resSoft = plantumlValidator.validar(diagSoftware.codigo_plantuml, {
        tipo: DiagramTypes.ARQUITECTURA_SOFTWARE,
        rnfList: fixtureSinHA.requerimientos.filter(r => r.tipo === 'RNF')
      });
      expect(resSoft.valido).toBe(true);

      const resSys = plantumlValidator.validar(
        '@startuml\nnode "Servidor" {\n  artifact "App"\n}\n@enduml',
        { tipo: DiagramTypes.ARQUITECTURA_SISTEMA, rnfList: [] }
      );
      expect(resSys.valido).toBe(true);
    });

    test('PlantUMLSynthesizer normaliza correctamente los 6 diagramas usando DiagramTypes', () => {
      const normalizados = PlantUMLSynthesizer.normalizar([
        { tipo: DiagramTypes.CASOS_DE_USO, codigo_plantuml: '@startuml\nusecase A\n@enduml' },
        { tipo: DiagramTypes.ARQUITECTURA_SOFTWARE, codigo_plantuml: '@startuml\nContainer(a, "A")\n@enduml' },
        { tipo: DiagramTypes.ARQUITECTURA_SISTEMA, codigo_plantuml: '@startuml\nnode S\n@enduml' }
      ]);

      expect(normalizados).toHaveLength(6);
      const tipos = normalizados.map(d => d.tipo);
      expect(tipos).toContain(DiagramTypes.CASOS_DE_USO);
      expect(tipos).toContain(DiagramTypes.ARQUITECTURA_SOFTWARE);
      expect(tipos).toContain(DiagramTypes.ARQUITECTURA_SISTEMA);
      expect(tipos).toContain(DiagramTypes.CLASES_DOMINIO);
      expect(tipos).toContain(DiagramTypes.CLASES_DISENO);
      expect(tipos).toContain(DiagramTypes.ARBOL_NAVEGACION);
    });

    test('corrige HA inventada por la IA cuando ningún RNF aprobado la solicita', () => {
      const codigoConHAInjustificada = `@startuml
node "Balanceador Failover" as lb
node "Servidor primario" as app1
node "Servidor réplica Hot Standby" as app2
lb --> app1
lb --> app2
@enduml`;

      const [normalizado] = PlantUMLSynthesizer.normalizar([{
        tipo: DiagramTypes.ARQUITECTURA_SISTEMA,
        codigo_plantuml: codigoConHAInjustificada
      }], {
        nombreProyecto: fixtureSinHA.nombre_proyecto,
        requerimientos: fixtureSinHA.requerimientos
      }).filter((diagrama) => diagrama.tipo === DiagramTypes.ARQUITECTURA_SISTEMA);

      expect(normalizado.codigo_plantuml).toMatch(/Nodo de Aplicación/i);
      expect(normalizado.codigo_plantuml).not.toMatch(/failover|hot standby/i);
      const validacion = sistemaValidator.validar({
        codigo: normalizado.codigo_plantuml,
        rnfList: fixtureSinHA.requerimientos.filter((r) => r.tipo === 'RNF')
      });
      expect(validacion.valido).toBe(true);
      expect(validacion.alta_disponibilidad_detectada).toBe(false);
    });

    test('aplica la corrección también en la generación secuencial de un solo diagrama', () => {
      const service = new ModelosIaService();
      const resultado = service.normalizarResultado({
        nombre_proyecto: fixtureSinHA.nombre_proyecto,
        diagramas: [{
          tipo: DiagramTypes.ARQUITECTURA_SISTEMA,
          codigo_plantuml: '@startuml\nnode "Failover" as f\nnode "Hot Standby" as r\nf --> r\n@enduml'
        }]
      }, 'diagramas', DiagramTypes.ARQUITECTURA_SISTEMA, {
        nombreProyecto: fixtureSinHA.nombre_proyecto,
        requerimientos: fixtureSinHA.requerimientos
      });

      expect(resultado.diagramas).toHaveLength(1);
      expect(resultado.diagramas[0].codigo_plantuml).toMatch(/Nodo de Aplicación/i);
      expect(resultado.diagramas[0].codigo_plantuml).not.toMatch(/failover|hot standby/i);
    });
  });

  describe('6. Flujo de aprobación y estados del proyecto no alterados', () => {
    test('AprobarFase no modifica estados preexistentes y aprueba diagramas nuevos sin alterar flujo', async () => {
      const mockProjRepo = {
        obtenerPorId: jest.fn().mockResolvedValue({ id: 'p1', estado_fase: 'diseno_pendiente' }),
        actualizarEstadoFase: jest.fn().mockImplementation((id, estado) => Promise.resolve({ id, estado_fase: estado }))
      };
      const mockDiagRepo = {
        listarPorProyecto: jest.fn().mockResolvedValue([
          { id: 'd1', tipo: DiagramTypes.CASOS_DE_USO, aprobado: false },
          { id: 'd2', tipo: DiagramTypes.ARQUITECTURA_SOFTWARE, aprobado: false },
          { id: 'd3', tipo: DiagramTypes.CLASES, aprobado: false },
          { id: 'd4', tipo: DiagramTypes.ARBOL_NAVEGACION, aprobado: false }
        ]),
        actualizar: jest.fn().mockResolvedValue(true)
      };

      const aprobarFaseUseCase = new AprobarFase({
        proyectoRepository: mockProjRepo,
        requerimientoRepository: {},
        diagramaRepository: mockDiagRepo
      });

      const resultado = await aprobarFaseUseCase.ejecutar({
        proyectoId: 'p1',
        fase: 'diseno',
        aprobarTodosLosElementos: true
      });

      expect(resultado.nuevoEstado).toBe('mockups_pendientes');
      expect(mockDiagRepo.actualizar).toHaveBeenCalledTimes(4);
      expect(mockDiagRepo.actualizar).toHaveBeenCalledWith('d2', { aprobado: true });
    });
  });
});
